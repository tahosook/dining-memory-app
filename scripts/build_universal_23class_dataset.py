#!/usr/bin/env python3
"""Universal 23-Class Dining Dataset Builder from Open Visual Observations (Issue-24).

Transforms unbiased open visual observations (observations_all_1007.jsonl) into a
pure food/meal classification dataset with 23 fine-grained classes (tableware-independent,
salmon-overlap resolved).

Invariants enforced:
1. Zero duplicate canonical `meshi_key` across all records.
2. Every record receives one valid class from the 23 UNIVERSAL_23_CLASSES.
3. Zero tableware terminology in labels or criteria.
4. Golden Test Set leakage guard: protected Golden test images are strictly pinned to `test`.
5. Data Augmentation scope restriction: Augmentation is applied ONLY to minority classes
   within the `train` split after train/val/test split assignment. Zero synthetic images in `val` or `test`.
6. Safe file export: Supports hardlink, symlink, and copy mode with automatic fallback.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import shutil
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

DEFAULT_OBSERVATIONS_JSONL = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "open_observation_20261013"
    / "observations_all_1007.jsonl"
)
DEFAULT_OUTPUT_DIR = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "open_observation_20261013"
    / "universal_23class_dataset_v1"
)
DEFAULT_GOLDEN_V1_TEST_DIR = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-even48-20260423"
    / "exported_dataset"
    / "test"
)

UNIVERSAL_23_CLASSES: Tuple[str, ...] = (
    "teishoku_fish",
    "teishoku_pork_ginger_stirfry",
    "teishoku_chicken",
    "teishoku_fried_meat",
    "teishoku_hamburg",
    "teishoku_simmered_stew",
    "teishoku_general_multi_dish",
    "breakfast_japanese_natto",
    "breakfast_western_toast",
    "noodles_ramen",
    "noodles_udon",
    "noodles_soba",
    "pasta_dishes",
    "curry_keema",
    "curry_hayashi_ethnic",
    "donburi_omurice",
    "fried_rice_pilaf",
    "pot_stew_nabe",
    "izakaya_appetizers",
    "bal_ajillo_pizza",
    "chuka_gyoza_mapo",
    "alcohol_drink_record",
    "non_food_exclude",
)


class Universal23ClassDatasetError(Exception):
    """Raised when validation or dataset invariant checks fail."""


def extract_meshi_key(value: str) -> str:
    """Extract canonical MESHI_YYYYMMDD_HHMMSS key if present, else normalized string."""
    match = re.search(r"MESHI_\d{8}_\d{6}", value, re.IGNORECASE)
    if match:
        return match.group(0).upper()
    return value.strip()


def _record_text(record: Dict[str, Any]) -> str:
    parts: List[str] = [
        str(record.get("short_caption", "")),
        str(record.get("notable_characteristics", "")),
    ]
    for el in record.get("visual_elements", []) or []:
        parts.append(str(el))
    for tag in record.get("free_tags", []) or []:
        parts.append(str(tag))
    return " ".join(parts)


def _has_any(text: str, keywords: Sequence[str]) -> bool:
    return any(kw in text for kw in keywords)


def classify_universal_23class(record: Dict[str, Any]) -> str:
    """Assign one of the 23 classes deterministically with strict priority."""
    text = _record_text(record)

    # 1. Non-food / camera roll noise
    non_food_kws = (
        "非食事",
        "非食品",
        "非料理",
        "食事なし",
        "眼鏡店",
        "メガネを試着",
        "眼鏡を試着",
        "メガネ",
        "眼鏡",
        "収納ボックス",
        "収納ストッカー",
        "水切り袋",
        "シャンプー",
        "蓄電池",
        "道路工事",
        "藤棚",
        "卓上カレンダー",
        "トートバッグ",
        "スーツケースの分解",
        "電子コミック",
        "ボアチェア",
        "買い出し直後",
        "生肉パックの並び",
        "地酒メニュー表",
        "会計伝票",
        "ブレ写真",
        "見切れたスナップ",
        "自撮り写真",
        "セルフィー",
        "獺祭石鹸",
        "石鹸",
    )
    if _has_any(text, non_food_kws):
        return "non_food_exclude"

    # 2. Drink / Bottle record (pure alcohol / bottle close-up)
    drink_bottle_kws = (
        "日本酒",
        "一升瓶",
        "四合瓶",
        "純米",
        "吟醸",
        "生原酒",
        "生貯蔵酒",
        "にごり酒",
        "古酒",
        "泡盛",
        "芋焼酎",
        "麦焼酎",
        "米焼酎",
        "酒瓶",
        "ボトルラベル",
        "ラベル接写",
        "ワインボトル",
    )
    food_anchor_kws = (
        "定食",
        "夕食",
        "ご飯",
        "白米",
        "白ご飯",
        "おかず",
        "カレー",
        "パスタ",
        "ラーメン",
        "うどん",
        "そば",
    )
    if _has_any(text, drink_bottle_kws) and not _has_any(text, food_anchor_kws):
        return "alcohol_drink_record"

    # 3. Breakfast (Clear separation: Natto/Egg morning vs Bread morning)
    if _has_any(text, ("納豆パック", "和朝食")) or (
        _has_any(text, ("朝食", "朝ごはん", "朝")) and "納豆" in text
    ):
        return "breakfast_japanese_natto"
    if _has_any(
        text,
        ("トースト", "サンドイッチ", "クロワッサン", "ロールパン", "バゲットサンド"),
    ) or (_has_any(text, ("朝食", "朝ごはん", "朝")) and "パン" in text):
        return "breakfast_western_toast"

    # 4. Noodles (Ramen, Udon, Soba, Pasta)
    if _has_any(text, ("ラーメン", "つけ麺", "担々麺", "中華そば")):
        return "noodles_ramen"
    if _has_any(text, ("うどん", "煮込みうどん", "かけうどん", "ざるうどん")):
        return "noodles_udon"
    if _has_any(text, ("そば", "蕎麦", "ざるそば")):
        return "noodles_soba"
    if _has_any(
        text,
        (
            "パスタ",
            "スパゲッティ",
            "ペンネ",
            "ボロネーゼ",
            "カルボナーラ",
            "ナポリタン",
            "ペペロンチーノ",
        ),
    ):
        return "pasta_dishes"

    # 5. Curry & Rice Dishes
    if _has_any(text, ("キーマカレー", "キーマ")):
        return "curry_keema"
    if _has_any(text, ("カレー", "ハヤシ", "ガパオ", "エスニック", "タイカレー")):
        return "curry_hayashi_ethnic"
    if _has_any(
        text,
        (
            "親子丼",
            "カツ丼",
            "かつ丼",
            "牛丼",
            "豚丼",
            "天丼",
            "海鮮丼",
            "オムライス",
        ),
    ):
        return "donburi_omurice"
    if _has_any(text, ("チャーハン", "炒飯", "ピラフ", "炊き込み")):
        return "fried_rice_pilaf"

    # 6. Party, Bal, Hot Pot & Izakaya
    if _has_any(text, ("アヒージョ", "バゲット", "チーズ", "バル", "ピザ", "オードブル")):
        return "bal_ajillo_pizza"
    if _has_any(text, ("鍋", "すき焼き", "水炊き", "おでん")):
        return "pot_stew_nabe"
    if _has_any(text, ("晩酌", "おつまみ", "家飲み", "刺身", "ホタルイカ")):
        return "izakaya_appetizers"

    # 7. Fish: Unified Grilled Fish (Salmon, Saba, Hokke, Aji, etc.)
    fish_kws = (
        "鮭",
        "サーモン",
        "ホッケ",
        "アジ",
        "サバ",
        "鯖",
        "干物",
        "ししゃも",
        "サンマ",
        "焼き魚",
        "煮魚",
    )
    if _has_any(text, fish_kws):
        return "teishoku_fish"

    # 8. Meat & Home Cooking
    if _has_any(text, ("ハンバーグ",)):
        return "teishoku_hamburg"
    if _has_any(
        text,
        (
            "唐揚げ",
            "から揚げ",
            "からあげ",
            "竜田揚げ",
            "チキンカツ",
            "とんかつ",
            "トンカツ",
            "フライ",
            "コロッケ",
        ),
    ):
        return "teishoku_fried_meat"
    if _has_any(
        text,
        (
            "生姜焼き",
            "しょうが焼き",
            "豚バラ",
            "豚肉炒め",
            "豚肉と",
            "豚ロース",
        ),
    ):
        return "teishoku_pork_ginger_stirfry"
    if _has_any(
        text,
        (
            "チキンソテー",
            "鶏肉",
            "手羽先",
            "手羽元",
            "焼き鳥",
            "照り焼き",
            "鶏もも",
        ),
    ):
        return "teishoku_chicken"
    if _has_any(text, ("餃子", "ギョーザ", "麻婆", "点心", "春巻き", "エビチリ")):
        return "chuka_gyoza_mapo"
    if _has_any(text, ("肉じゃが", "角煮", "煮物", "筑前煮", "かぼちゃの煮物")):
        return "teishoku_simmered_stew"

    return "teishoku_general_multi_dish"


def collect_protected_golden_meshi_keys(
    golden_v1_dir: Optional[Path],
    allow_missing_golden: bool = False,
) -> Set[str]:
    """Collect MESHI_YYYYMMDD_HHMMSS keys belonging to Golden Test Set v1.

    Fails closed if the directory is missing or empty unless allow_missing_golden is True.
    """
    if golden_v1_dir is None or not golden_v1_dir.exists():
        if not allow_missing_golden:
            raise Universal23ClassDatasetError(
                f"Golden Test Set directory not found: {golden_v1_dir}. "
                "To skip golden leakage protection explicitly, specify allow_missing_golden=True or --allow-missing-golden."
            )
        sys.stderr.write(
            f"WARNING: Golden Test Set directory missing ({golden_v1_dir}), continuing without protection due to allow_missing_golden=True\n"
        )
        return set()

    protected: Set[str] = set()
    for root, _, files in os.walk(golden_v1_dir):
        for fname in sorted(files):
            if fname.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                mk = extract_meshi_key(fname)
                if mk.startswith("MESHI_"):
                    protected.add(mk)

    if not protected:
        if not allow_missing_golden:
            raise Universal23ClassDatasetError(
                f"No valid protected MESHI keys found in Golden Test Set directory: {golden_v1_dir}. "
                "To skip golden leakage protection explicitly, specify allow_missing_golden=True or --allow-missing-golden."
            )
        sys.stderr.write(
            f"WARNING: No protected MESHI keys found in ({golden_v1_dir}), continuing without protection due to allow_missing_golden=True\n"
        )

    return protected


def assign_stratified_splits(
    records: List[Dict[str, Any]],
    label_key: str,
    protected_test_keys: Set[str],
    train_ratio: float = 0.80,
    val_ratio: float = 0.10,
) -> Dict[str, str]:
    """Assign deterministic stratified train/val/test split per class with strict Golden protection."""
    by_class: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for rec in records:
        label = rec.get(label_key)
        if label:
            by_class[str(label)].append(rec)

    split_map: Dict[str, str] = {}
    for label, group in sorted(by_class.items()):
        pinned_test = [r for r in group if r["meshi_key"] in protected_test_keys]
        pool = [r for r in group if r["meshi_key"] not in protected_test_keys]
        pool.sort(
            key=lambda r: hashlib.sha256(
                f"{label}:{r['meshi_key']}".encode("utf-8")
            ).hexdigest()
        )

        total = len(group)
        target_test = max(1, round(total * (1.0 - train_ratio - val_ratio)))
        target_val = max(1, round(total * val_ratio)) if total >= 3 else 0

        for r in pinned_test:
            split_map[r["meshi_key"]] = "test"

        remaining_test_needed = max(0, target_test - len(pinned_test))
        for idx, r in enumerate(pool):
            if idx < remaining_test_needed:
                split_map[r["meshi_key"]] = "test"
            elif idx < remaining_test_needed + target_val:
                split_map[r["meshi_key"]] = "val"
            else:
                split_map[r["meshi_key"]] = "train"

    return split_map


def link_or_copy_file(source: Path, target: Path, mode: str = "hardlink") -> str:
    """Links or copies source file to target path with specified mode."""
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        target.unlink()

    if mode == "hardlink":
        try:
            os.link(source, target)
            return "hardlink"
        except OSError:
            shutil.copy2(source, target)
            return "copy_fallback"
    elif mode == "symlink":
        try:
            target.symlink_to(source.resolve())
            return "symlink"
        except OSError:
            shutil.copy2(source, target)
            return "copy_fallback"
    else:
        shutil.copy2(source, target)
        return "copy"


def augment_image_minority(source_path: Path, target_path: Path, mode: str) -> None:
    """Create a simulated augmented image variant (dummy copy if PIL not present)."""
    try:
        from PIL import Image, ImageEnhance

        with Image.open(source_path) as img:
            if mode == "flip":
                aug = img.transpose(Image.FLIP_LEFT_RIGHT)
            elif mode == "bright":
                enhancer = ImageEnhance.Brightness(img)
                aug = enhancer.enhance(1.15)
            elif mode == "dim":
                enhancer = ImageEnhance.Brightness(img)
                aug = enhancer.enhance(0.88)
            else:
                aug = img
            aug.save(target_path, quality=95)
    except Exception:
        shutil.copy2(source_path, target_path)


def export_dataset_directories(
    records: List[Dict[str, Any]],
    output_dir: Path,
    image_search_roots: List[Path],
    link_mode: str = "hardlink",
    augment_train_min_samples: int = 30,
) -> Dict[str, Any]:
    """Export dataset into MediaPipe-compatible train/val/test directory structure.

    CRITICAL INVARIANT:
    Data Augmentation is applied ONLY to minority classes within the `train` split
    after split assignment. Zero synthetic images are exported into `val` or `test`.
    """
    export_stats: Dict[str, Any] = {
        "train_images": 0,
        "val_images": 0,
        "test_images": 0,
        "augmented_train_images": 0,
        "missing_source_images": 0,
    }

    # Build image lookup index by meshi_key and filename
    source_lookup: Dict[str, Path] = {}
    for root_dir in image_search_roots:
        if root_dir.exists():
            for root, _, files in os.walk(root_dir):
                for f in files:
                    if f.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                        full_p = Path(root) / f
                        mk = extract_meshi_key(f)
                        if mk:
                            source_lookup[mk] = full_p
                        source_lookup[f] = full_p

    # Group train records by class to check minority classes
    train_by_class: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for rec in records:
        if rec.get("split") == "train":
            train_by_class[rec["assigned_class"]].append(rec)

    for rec in records:
        split = rec["split"]
        cls = rec["assigned_class"]
        mk = rec["meshi_key"]

        source_path = source_lookup.get(mk) or (
            source_lookup.get(rec.get("image_id", ""))
            if rec.get("image_id")
            else None
        )
        if not source_path or not source_path.exists():
            export_stats["missing_source_images"] += 1
            continue

        target_fname = f"{mk}.jpg"
        target_path = output_dir / split / cls / target_fname
        link_or_copy_file(source_path, target_path, mode=link_mode)
        export_stats[f"{split}_images"] += 1

    # Apply Augmentation ONLY to train split minority classes
    if augment_train_min_samples > 0:
        for cls, group in train_by_class.items():
            current_count = len(group)
            if current_count < augment_train_min_samples:
                needed = augment_train_min_samples - current_count
                aug_idx = 0
                for r in group:
                    if aug_idx >= needed:
                        break
                    mk = r["meshi_key"]
                    source_path = source_lookup.get(mk)
                    if not source_path or not source_path.exists():
                        continue

                    mode = "flip" if aug_idx % 2 == 0 else "bright"
                    aug_fname = f"{mk}_aug_{mode}.jpg"
                    target_aug_path = output_dir / "train" / cls / aug_fname
                    augment_image_minority(source_path, target_aug_path, mode=mode)
                    export_stats["augmented_train_images"] += 1
                    aug_idx += 1

    return export_stats


def build_universal_23class_dataset(
    observations_jsonl: Path,
    output_dir: Path,
    golden_v1_dir: Optional[Path] = DEFAULT_GOLDEN_V1_TEST_DIR,
    image_search_roots: Optional[List[Path]] = None,
    export_dirs: bool = False,
    link_mode: str = "hardlink",
    augment_train_min_samples: int = 30,
    allow_missing_golden: bool = False,
) -> Dict[str, Any]:
    """Build universal 23-class labeled JSONL, CSV manifest, and summary."""
    if not observations_jsonl.exists():
        raise Universal23ClassDatasetError(
            f"Observations JSONL not found: {observations_jsonl}"
        )

    output_dir.mkdir(parents=True, exist_ok=True)

    raw_records: List[Dict[str, Any]] = []
    seen_keys: Set[str] = set()
    with open(observations_jsonl, encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            s = line.strip()
            if not s:
                continue
            rec = json.loads(s)
            raw_key = (
                rec.get("meshi_key")
                or rec.get("original_path")
                or rec.get("image_id")
            )
            if not raw_key:
                raise Universal23ClassDatasetError(
                    f"Line {line_no} missing meshi_key/image_id"
                )
            mk = extract_meshi_key(str(raw_key))
            if mk in seen_keys:
                raise Universal23ClassDatasetError(
                    f"Duplicate meshi_key: {mk} at line {line_no}"
                )
            seen_keys.add(mk)
            rec["meshi_key"] = mk
            raw_records.append(rec)

    protected_test_keys = collect_protected_golden_meshi_keys(
        golden_v1_dir, allow_missing_golden=allow_missing_golden
    )

    enriched: List[Dict[str, Any]] = []
    for rec in raw_records:
        cls = classify_universal_23class(rec)
        if cls not in UNIVERSAL_23_CLASSES:
            raise Universal23ClassDatasetError(f"Invalid class assigned: {cls}")
        item = dict(rec)
        item["assigned_class"] = cls
        item["is_protected_golden_test"] = rec["meshi_key"] in protected_test_keys
        enriched.append(item)

    splits = assign_stratified_splits(
        enriched,
        label_key="assigned_class",
        protected_test_keys=protected_test_keys,
    )
    for item in enriched:
        item["split"] = splits[item["meshi_key"]]

    # Verify Golden Test Set leakage
    for item in enriched:
        if item["is_protected_golden_test"] and item["split"] != "test":
            raise Universal23ClassDatasetError(
                f"Golden Test leakage detected: {item['meshi_key']} placed in {item['split']}"
            )

    # Save manifest.jsonl
    jsonl_out = output_dir / "dataset.jsonl"
    with open(jsonl_out, "w", encoding="utf-8") as f:
        for item in enriched:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    # Save manifest.csv
    csv_out = output_dir / "manifest.csv"
    with open(csv_out, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f, fieldnames=["meshi_key", "assigned_class", "split", "is_protected_golden_test"]
        )
        writer.writeheader()
        for item in enriched:
            writer.writerow({
                "meshi_key": item["meshi_key"],
                "assigned_class": item["assigned_class"],
                "split": item["split"],
                "is_protected_golden_test": item["is_protected_golden_test"],
            })

    summary: Dict[str, Any] = {
        "total_records": len(enriched),
        "class_counts": dict(Counter(r["assigned_class"] for r in enriched)),
        "split_counts": dict(Counter(r["split"] for r in enriched)),
        "protected_golden_pinned_to_test": sum(
            1 for r in enriched if r["is_protected_golden_test"]
        ),
    }

    if export_dirs:
        roots = image_search_roots or [
            _REPO_ROOT / "state" / "mediapipe_labeling_runs",
            _REPO_ROOT / "assets",
        ]
        export_stats = export_dataset_directories(
            records=enriched,
            output_dir=output_dir,
            image_search_roots=roots,
            link_mode=link_mode,
            augment_train_min_samples=augment_train_min_samples,
        )
        summary["export_stats"] = export_stats

    summary_out = output_dir / "summary.json"
    with open(summary_out, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build Universal 23-Class Dining Dataset (Issue-24)"
    )
    parser.add_argument(
        "--observations-jsonl",
        type=Path,
        default=DEFAULT_OBSERVATIONS_JSONL,
        help="Path to observations_all_1007.jsonl",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Output directory",
    )
    parser.add_argument(
        "--golden-v1-dir",
        type=Path,
        default=DEFAULT_GOLDEN_V1_TEST_DIR,
        help="Path to Golden Test Set v1 directory",
    )
    parser.add_argument(
        "--export-image-dirs",
        action="store_true",
        help="Export images into train/val/test directory tree",
    )
    parser.add_argument(
        "--link-mode",
        choices=["hardlink", "symlink", "copy"],
        default="hardlink",
        help="File linking mode for image export",
    )
    parser.add_argument(
        "--augment-train-min-samples",
        type=int,
        default=30,
        help="Minimum target samples for train split minority classes via augmentation",
    )
    parser.add_argument(
        "--allow-missing-golden",
        action="store_true",
        help="Allow dataset generation to proceed even if Golden Test Set directory or images are missing",
    )
    args = parser.parse_args()

    summary = build_universal_23class_dataset(
        observations_jsonl=args.observations_jsonl,
        output_dir=args.output_dir,
        golden_v1_dir=args.golden_v1_dir,
        export_dirs=args.export_image_dirs,
        link_mode=args.link_mode,
        augment_train_min_samples=args.augment_train_min_samples,
        allow_missing_golden=args.allow_missing_golden,
    )
    print("=== Universal 23-Class Dataset Built Successfully ===")
    print(f"Total records: {summary['total_records']}")
    print(f"Golden protected keys pinned to test: {summary['protected_golden_pinned_to_test']}")
    print(f"Split counts: {summary['split_counts']}")
    print(f"Output saved to: {args.output_dir}")


if __name__ == "__main__":
    main()
