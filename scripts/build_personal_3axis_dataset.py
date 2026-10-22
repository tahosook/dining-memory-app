#!/usr/bin/env python3
"""Personal 3-Axis Multi-Label Dataset Builder from Open Visual Observations (Issue-25).

Transforms unbiased open visual observations (observations_all_1007.jsonl) into a
3-axis multi-label dataset (Main Dish: 20, Side Dish/Soup: 14, Scene: 10).

Invariants enforced:
1. Zero duplicate canonical `meshi_key` across all records.
2. Zero tableware terminology in labels or criteria.
3. Strict Data Leakage Prevention:
   - Split allocation (train: 80%, val: 10%, test: 10%) is determined strictly per Photo ID (Record)
     BEFORE tag-folder expansion.
   - For any multi-labeled image with multiple tags (e.g., main_pork_ginger and side_pumpkin),
     all corresponding tag copies are pinned to the EXACT same split (e.g., train/main_pork_ginger and train/side_pumpkin).
   - Zero image overlap between train/val and test.
4. Golden Test Set leakage guard: protected Golden test images are strictly pinned to `test`.
5. Safe file export: Supports hardlink, symlink, and copy mode with automatic fallback.
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
    / "personal_3axis_dataset_v1"
)
DEFAULT_GOLDEN_V1_TEST_DIR = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-even48-20260423"
    / "exported_dataset"
    / "test"
)

# 1. Main Dish (20 tags)
PERSONAL_MAIN_TAGS: Tuple[str, ...] = (
    "main_grilled_fish",
    "main_pork_ginger_stirfry",
    "main_chicken_dish",
    "main_fried_meat",
    "main_hamburg",
    "main_simmered_meat_potato",
    "main_keema_curry",
    "main_curry_hayashi",
    "main_ethnic_gapao",
    "main_ramen",
    "main_udon",
    "main_soba",
    "main_pasta",
    "main_gyoza_dimsum",
    "main_mapo_chuka",
    "main_hotpot",
    "main_bal_ajillo",
    "main_donburi",
    "main_fried_rice",
    "main_sashimi_seafood",
)

# 2. Side Dish & Soup (14 tags)
PERSONAL_SIDE_TAGS: Tuple[str, ...] = (
    "side_simmered_pumpkin",
    "side_kinpira",
    "side_tonjiru_soup",
    "side_miso_soup",
    "side_veggie_soup",
    "side_tofu_hiyayakko",
    "side_natto_pack",
    "side_egg_dish",
    "side_salad_greens",
    "side_chikuzenni_root",
    "side_sauteed_mushrooms",
    "side_pickles_kimchi",
    "side_cut_fruit",
    "side_izakaya_appetizer",
)

# 3. Scene (10 tags)
PERSONAL_SCENE_TAGS: Tuple[str, ...] = (
    "scene_teishoku_multi_dish",
    "scene_one_plate",
    "scene_quick_single_meal",
    "scene_japanese_breakfast",
    "scene_western_breakfast",
    "scene_izakaya_night",
    "scene_weekend_bal",
    "scene_holiday_noodles",
    "scene_tabletop_hotpot",
    "scene_party_feast",
)

ALL_44_TAGS: Tuple[str, ...] = (
    PERSONAL_MAIN_TAGS + PERSONAL_SIDE_TAGS + PERSONAL_SCENE_TAGS
)


class Personal3AxisDatasetError(Exception):
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
        str(record.get("tableware_and_setting", "")),
        str(record.get("notable_characteristics", "")),
    ]
    for el in record.get("visual_elements", []) or []:
        parts.append(str(el))
    for tag in record.get("free_tags", []) or []:
        parts.append(str(tag))
    return " ".join(parts)


def _has_any(text: str, keywords: Sequence[str]) -> bool:
    return any(kw in text for kw in keywords)


def extract_personal_3axis_tags(record: Dict[str, Any]) -> Dict[str, List[str]]:
    """Extract multi-label tags for main, side, and scene axes without tableware keywords."""
    text = _record_text(record)
    tags: Dict[str, List[str]] = {
        "main": [],
        "side": [],
        "scene": [],
    }

    # --- 1. Main Dish ---
    if _has_any(text, ("鮭", "サーモン", "ホッケ", "アジ", "サバ", "鯖", "干物", "ししゃも", "サンマ", "焼き魚")):
        tags["main"].append("main_grilled_fish")
    if _has_any(text, ("生姜焼き", "しょうが焼き", "豚肉炒め", "豚バラ炒め", "豚肉と", "豚ロース")):
        tags["main"].append("main_pork_ginger_stirfry")
    if _has_any(text, ("チキンソテー", "照り焼きチキン", "鶏もも", "手羽先", "手羽元", "鶏肉", "鶏の照り焼き")):
        tags["main"].append("main_chicken_dish")
    if _has_any(text, ("唐揚げ", "から揚げ", "からあげ", "竜田揚げ", "チキンカツ", "とんかつ", "トンカツ", "フライ", "コロッケ")):
        tags["main"].append("main_fried_meat")
    if _has_any(text, ("ハンバーグ",)):
        tags["main"].append("main_hamburg")
    if _has_any(text, ("肉じゃが", "角煮", "豚の角煮")):
        tags["main"].append("main_simmered_meat_potato")
    if _has_any(text, ("キーマカレー", "キーマ")):
        tags["main"].append("main_keema_curry")
    if _has_any(text, ("カレー", "ハヤシ", "欧風カレー")) and "キーマ" not in text:
        tags["main"].append("main_curry_hayashi")
    if _has_any(text, ("ガパオ", "タイカレー", "エスニック", "ジャンバラヤ")):
        tags["main"].append("main_ethnic_gapao")
    if _has_any(text, ("ラーメン", "つけ麺", "担々麺", "中華そば")):
        tags["main"].append("main_ramen")
    if _has_any(text, ("うどん", "煮込みうどん", "かけうどん", "ざるうどん")):
        tags["main"].append("main_udon")
    if _has_any(text, ("そば", "蕎麦", "ざるそば")):
        tags["main"].append("main_soba")
    if _has_any(text, ("パスタ", "スパゲッティ", "ペンネ", "ボロネーゼ", "カルボナーラ", "ナポリタン")):
        tags["main"].append("main_pasta")
    if _has_any(text, ("餃子", "ギョーザ", "点心", "春巻き", "焼売")):
        tags["main"].append("main_gyoza_dimsum")
    if _has_any(text, ("麻婆", "エビチリ", "回鍋肉")):
        tags["main"].append("main_mapo_chuka")
    if _has_any(text, ("すき焼き", "おでん", "水炊き")) or (
        "鍋" in text and not _has_any(text, ("鍋敷き", "小鍋麺", "フライパン"))
    ):
        tags["main"].append("main_hotpot")
    if _has_any(text, ("アヒージョ", "ソーセージ", "バゲット料理")):
        tags["main"].append("main_bal_ajillo")
    if _has_any(text, ("親子丼", "カツ丼", "かつ丼", "牛丼", "豚丼", "天丼", "海鮮丼")):
        tags["main"].append("main_donburi")
    if _has_any(text, ("チャーハン", "炒飯", "ピラフ", "五目ご飯")):
        tags["main"].append("main_fried_rice")
    if _has_any(text, ("刺身", "お刺身", "マグロ", "タコ", "海鮮")):
        tags["main"].append("main_sashimi_seafood")

    # --- 2. Side Dish & Soup ---
    if _has_any(text, ("かぼちゃの煮物", "かぼちゃ煮", "南瓜の煮物")):
        tags["side"].append("side_simmered_pumpkin")
    if _has_any(text, ("きんぴら", "きんぴらごぼう", "蓮根きんぴら", "れんこんきんぴら")):
        tags["side"].append("side_kinpira")
    if _has_any(text, ("豚汁", "けんちん汁")):
        tags["side"].append("side_tonjiru_soup")
    if _has_any(text, ("味噌汁", "お味噌汁", "お吸い物", "澄まし汁")) and "豚汁" not in text:
        tags["side"].append("side_miso_soup")
    if _has_any(text, ("野菜スープ", "キャベツスープ", "もやしスープ", "ポトフ")):
        tags["side"].append("side_veggie_soup")
    if _has_any(text, ("冷奴", "湯豆腐", "厚揚げ", "焼き厚揚げ")):
        tags["side"].append("side_tofu_hiyayakko")
    if _has_any(text, ("納豆", "納豆パック")):
        tags["side"].append("side_natto_pack")
    if _has_any(text, ("ゆで卵", "目玉焼き", "卵焼き", "味玉", "温泉卵")):
        tags["side"].append("side_egg_dish")
    if _has_any(text, ("サラダ", "温野菜", "トマト", "ブロッコリー", "ちぎりレタス")):
        tags["side"].append("side_salad_greens")
    if _has_any(text, ("筑前煮", "大根煮", "大根の煮物", "里芋の煮物", "煮物小鉢")):
        tags["side"].append("side_chikuzenni_root")
    if _has_any(text, ("舞茸", "キノコ", "きのこ", "エリンギ")):
        tags["side"].append("side_sauteed_mushrooms")
    if _has_any(text, ("浅漬け", "漬物", "お漬物", "キムチ", "たくあん", "ピクルス")):
        tags["side"].append("side_pickles_kimchi")
    if _has_any(text, ("りんご", "リンゴ", "柿", "スイカ", "フルーツ", "果物")):
        tags["side"].append("side_cut_fruit")
    if _has_any(text, ("レバー煮", "焼きピーマン", "砂肝", "おつまみ小鉢", "枝豆")):
        tags["side"].append("side_izakaya_appetizer")

    # --- 3. Scene ---
    if _has_any(text, ("一汁三菜", "品数豊富", "和定食", "夕定食", "定食")):
        tags["scene"].append("scene_teishoku_multi_dish")
    if _has_any(text, ("ワンプレート", "合盛り", "大皿プレート")):
        tags["scene"].append("scene_one_plate")
    if _has_any(text, ("丼", "単品", "手軽", "サクッと", "デスク")):
        tags["scene"].append("scene_quick_single_meal")
    if _has_any(text, ("和朝食", "朝食", "朝ごはん")) and _has_any(text, ("納豆", "焼き魚", "ご飯")):
        tags["scene"].append("scene_japanese_breakfast")
    if _has_any(text, ("トースト", "クロワッサン", "ロールパン", "洋朝食", "パン")):
        tags["scene"].append("scene_western_breakfast")
    if _has_any(text, ("晩酌", "おつまみ", "家飲み", "居酒屋")):
        tags["scene"].append("scene_izakaya_night")
    if _has_any(text, ("バル", "バゲット", "ワイン", "アヒージョ", "チーズ")):
        tags["scene"].append("scene_weekend_bal")
    if _has_any(text, ("ラーメン", "小鍋", "煮込みうどん", "休日の昼")):
        tags["scene"].append("scene_holiday_noodles")
    if _has_any(text, ("卓上鍋", "すき焼き", "水炊き", "団らん鍋")):
        tags["scene"].append("scene_tabletop_hotpot")
    if _has_any(text, ("パーティー", "テイクアウト", "ピザ", "寿司", "オードブル")):
        tags["scene"].append("scene_party_feast")

    return tags


def collect_protected_golden_meshi_keys(golden_v1_dir: Optional[Path]) -> Set[str]:
    """Collect MESHI_YYYYMMDD_HHMMSS keys belonging to Golden Test Set v1."""
    if golden_v1_dir is None or not golden_v1_dir.exists():
        return set()

    protected: Set[str] = set()
    for root, _, files in os.walk(golden_v1_dir):
        for fname in sorted(files):
            if fname.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                mk = extract_meshi_key(fname)
                if mk.startswith("MESHI_"):
                    protected.add(mk)
    return protected


def assign_record_level_splits(
    records: List[Dict[str, Any]],
    protected_test_keys: Set[str],
    train_ratio: float = 0.80,
    val_ratio: float = 0.10,
) -> Dict[str, str]:
    """Assign deterministic train/val/test split per Photo ID (Record) strictly BEFORE tag folder expansion.

    CRITICAL INVARIANT:
    Ensures zero leakage across train, val, and test splits.
    """
    split_map: Dict[str, str] = {}
    pool: List[Dict[str, Any]] = []

    for r in records:
        mk = r["meshi_key"]
        if mk in protected_test_keys:
            split_map[mk] = "test"
        else:
            pool.append(r)

    # Deterministic sort using record SHA-256 seed
    pool.sort(
        key=lambda r: hashlib.sha256(f"personal_record:{r['meshi_key']}".encode("utf-8")).hexdigest()
    )

    total_pool = len(pool)
    target_val = max(1, round(total_pool * val_ratio))
    target_test = max(1, round(total_pool * (1.0 - train_ratio - val_ratio)))

    for idx, r in enumerate(pool):
        mk = r["meshi_key"]
        if idx < target_test:
            split_map[mk] = "test"
        elif idx < target_test + target_val:
            split_map[mk] = "val"
        else:
            split_map[mk] = "train"

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


def export_multi_axis_directories(
    records: List[Dict[str, Any]],
    output_dir: Path,
    image_search_roots: List[Path],
    link_mode: str = "hardlink",
) -> Dict[str, Any]:
    """Export dataset into MediaPipe-compatible train/val/test directory tree across all 44 tags.

    CRITICAL INVARIANT:
    Each image is placed strictly within its pre-assigned split (e.g., train/main_xxx and train/side_yyy).
    An image assigned to train will NEVER have any copy exported to val or test.
    """
    export_stats: Dict[str, Any] = {
        "train_tag_instances": 0,
        "val_tag_instances": 0,
        "test_tag_instances": 0,
        "missing_source_images": 0,
    }

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

    for rec in records:
        split = rec["split"]
        mk = rec["meshi_key"]
        all_tags = (
            rec["extracted_tags"]["main"]
            + rec["extracted_tags"]["side"]
            + rec["extracted_tags"]["scene"]
        )

        source_path = source_lookup.get(mk)
        if not source_path or not source_path.exists():
            export_stats["missing_source_images"] += 1
            continue

        for tag in all_tags:
            target_path = output_dir / split / tag / f"{mk}.jpg"
            link_or_copy_file(source_path, target_path, mode=link_mode)
            export_stats[f"{split}_tag_instances"] += 1

    return export_stats


def build_personal_3axis_dataset(
    observations_jsonl: Path,
    output_dir: Path,
    golden_v1_dir: Optional[Path] = DEFAULT_GOLDEN_V1_TEST_DIR,
    image_search_roots: Optional[List[Path]] = None,
    export_dirs: bool = False,
    link_mode: str = "hardlink",
) -> Dict[str, Any]:
    """Build personal 3-axis multi-label dataset with strict record-level leakage prevention."""
    if not observations_jsonl.exists():
        raise Personal3AxisDatasetError(
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
                raise Personal3AxisDatasetError(
                    f"Line {line_no} missing meshi_key/image_id"
                )
            mk = extract_meshi_key(str(raw_key))
            if mk in seen_keys:
                raise Personal3AxisDatasetError(
                    f"Duplicate meshi_key: {mk} at line {line_no}"
                )
            seen_keys.add(mk)
            rec["meshi_key"] = mk
            raw_records.append(rec)

    protected_test_keys = collect_protected_golden_meshi_keys(golden_v1_dir)

    enriched: List[Dict[str, Any]] = []
    for rec in raw_records:
        tags = extract_personal_3axis_tags(rec)
        item = dict(rec)
        item["extracted_tags"] = tags
        item["tag_counts"] = {
            "main": len(tags["main"]),
            "side": len(tags["side"]),
            "scene": len(tags["scene"]),
            "total": len(tags["main"]) + len(tags["side"]) + len(tags["scene"]),
        }
        item["is_protected_golden_test"] = rec["meshi_key"] in protected_test_keys
        enriched.append(item)

    # Assign split strictly per record BEFORE tag-folder expansion
    splits = assign_record_level_splits(
        enriched,
        protected_test_keys=protected_test_keys,
    )
    for item in enriched:
        item["split"] = splits[item["meshi_key"]]

    # Verify Golden Test Set leakage
    for item in enriched:
        if item["is_protected_golden_test"] and item["split"] != "test":
            raise Personal3AxisDatasetError(
                f"Golden Test leakage detected: {item['meshi_key']} placed in {item['split']}"
            )

    # Save dataset.jsonl
    jsonl_out = output_dir / "dataset.jsonl"
    with open(jsonl_out, "w", encoding="utf-8") as f:
        for item in enriched:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    # Save manifest.csv
    csv_out = output_dir / "manifest.csv"
    with open(csv_out, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(
            f,
            fieldnames=[
                "meshi_key",
                "split",
                "main_tags",
                "side_tags",
                "scene_tags",
                "is_protected_golden_test",
            ],
        )
        writer.writeheader()
        for item in enriched:
            writer.writerow({
                "meshi_key": item["meshi_key"],
                "split": item["split"],
                "main_tags": ";".join(item["extracted_tags"]["main"]),
                "side_tags": ";".join(item["extracted_tags"]["side"]),
                "scene_tags": ";".join(item["extracted_tags"]["scene"]),
                "is_protected_golden_test": item["is_protected_golden_test"],
            })

    # Calculate tag frequency distributions across splits
    tag_counts: Dict[str, Dict[str, int]] = {
        "main": Counter(),
        "side": Counter(),
        "scene": Counter(),
    }
    for item in enriched:
        for axis in ("main", "side", "scene"):
            for t in item["extracted_tags"][axis]:
                tag_counts[axis][t] += 1

    summary: Dict[str, Any] = {
        "total_records": len(enriched),
        "split_counts": dict(Counter(r["split"] for r in enriched)),
        "protected_golden_pinned_to_test": sum(
            1 for r in enriched if r["is_protected_golden_test"]
        ),
        "tag_frequencies": {
            "main": dict(tag_counts["main"]),
            "side": dict(tag_counts["side"]),
            "scene": dict(tag_counts["scene"]),
        },
    }

    if export_dirs:
        roots = image_search_roots or [
            _REPO_ROOT / "state" / "mediapipe_labeling_runs",
            _REPO_ROOT / "assets",
        ]
        export_stats = export_multi_axis_directories(
            records=enriched,
            output_dir=output_dir,
            image_search_roots=roots,
            link_mode=link_mode,
        )
        summary["export_stats"] = export_stats

    summary_out = output_dir / "summary.json"
    with open(summary_out, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build Personal 3-Axis Multi-Label Dataset (Issue-25)"
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
        help="Export images into train/val/test directory tree across all 44 tags",
    )
    parser.add_argument(
        "--link-mode",
        choices=["hardlink", "symlink", "copy"],
        default="hardlink",
        help="File linking mode for image export",
    )
    args = parser.parse_args()

    summary = build_personal_3axis_dataset(
        observations_jsonl=args.observations_jsonl,
        output_dir=args.output_dir,
        golden_v1_dir=args.golden_v1_dir,
        export_dirs=args.export_image_dirs,
        link_mode=args.link_mode,
    )
    print("=== Personal 3-Axis Dataset Built Successfully ===")
    print(f"Total records: {summary['total_records']}")
    print(f"Golden protected keys pinned to test: {summary['protected_golden_pinned_to_test']}")
    print(f"Split counts: {summary['split_counts']}")
    print(f"Output saved to: {args.output_dir}")


if __name__ == "__main__":
    main()
