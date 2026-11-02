#!/usr/bin/env python3
"""Personal & Universal Dual Dataset Builder for MediaPipe Food Classification (Step 2).

Generates training, validation, and test dataset directories for three models:
1. universal_dining_23class (23 classes)
2. personal_main_dish (16 classes, meal-only, learning targets)
3. personal_side_dish (14 classes + side_none, meal-only)

Invariants enforced:
1. `session_splits_manifest.json` (v2.0.0) is the ground-truth split definition.
2. Strict isolation: auxiliary_holdout (344 photos) is NEVER touched or exported.
3. Unresolved paths (25 photos) and evaluation excluded (400 photos) are omitted from train/val/test datasets.
4. Accurate path resolution: resolves paths from `observations_all_3391.jsonl`, `blind_ext_mapping.json`,
   or repo root fallbacks.
5. Safe file export: Supports hardlink with automatic fallback to symlink and copy.
"""
from __future__ import annotations

import argparse
import csv
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

# Default paths
DEFAULT_OBSERVATIONS_JSONL = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "open_observation_20261013"
    / "observations_all_3391.jsonl"
)
DEFAULT_SPLITS_MANIFEST = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "open_observation_20261013"
    / "session_splits_manifest.json"
)
DEFAULT_BLIND_EXT_MAPPING = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "open_observation_20261013"
    / "blind_ext_mapping.json"
)
DEFAULT_OUTPUT_DIR = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "open_observation_20261013"
    / "dataset_v2"
)

# Canonical class definitions
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

PERSONAL_MAIN_16_CLASSES: Tuple[str, ...] = (
    "main_grilled_fish",
    "main_pork_ginger_stirfry",
    "main_curry_hayashi",
    "main_chicken_dish",
    "main_fried_meat",
    "main_gyoza_dimsum",
    "main_keema_curry",
    "main_mapo_chuka",
    "main_hamburg",
    "main_donburi",
    "main_ramen",
    "main_japanese_noodles",
    "main_ethnic_gapao",
    "main_hotpot",
    "main_fried_rice",
    "main_sashimi_seafood",
)

PERSONAL_SIDE_15_CLASSES: Tuple[str, ...] = (
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
    "side_none",
)


class DualDatasetBuilderError(Exception):
    """Raised when validation or dataset invariant checks fail."""


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


def link_or_copy_file(source: Path, target: Path, mode: str = "hardlink") -> str:
    """Links or copies source file to target path with specified mode."""
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        target.unlink()

    if mode == "hardlink":
        try:
            os.link(source, target)
            return "hardlink"
        except (OSError, NotImplementedError):
            pass

    if mode in ("hardlink", "symlink"):
        try:
            os.symlink(source, target)
            return "symlink"
        except (OSError, NotImplementedError):
            pass

    shutil.copy2(source, target)
    return "copy"


def load_blind_ext_lookup(path: Path) -> Dict[str, str]:
    """Loads blind_id / blind_file -> original_path mapping."""
    lookup: Dict[str, str] = {}
    if not path.exists():
        return lookup
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
        for r in data.get("records", []):
            sp = r.get("original_path", "")
            if r.get("blind_id"):
                lookup[r["blind_id"]] = sp
            if r.get("blind_file"):
                lookup[r["blind_file"]] = sp
    return lookup


def resolve_image_path(
    record: Dict[str, Any],
    ext_lookup: Dict[str, str],
    repo_root: Path,
) -> Optional[Path]:
    """Resolves actual image file path for an observation record."""
    image_id = record.get("image_id", "")
    img_path = record.get("image_path")

    # 1. Try directly given image_path
    if img_path:
        cand1 = repo_root / img_path
        if cand1.exists():
            return cand1
        # Try ext_lookup with given path string
        if img_path in ext_lookup:
            cand_ext = repo_root / ext_lookup[img_path]
            if cand_ext.exists():
                return cand_ext

    # 2. Try ext_lookup with image_id
    if image_id and image_id in ext_lookup:
        cand2 = repo_root / ext_lookup[image_id]
        if cand2.exists():
            return cand2

    # 3. Try original_path if present
    orig_path = record.get("original_path")
    if orig_path:
        cand3 = repo_root / orig_path
        if cand3.exists():
            return cand3

    return None


def build_dual_datasets(
    observations_jsonl: Path,
    splits_manifest_path: Path,
    blind_ext_path: Path,
    output_dir: Path,
    link_mode: str = "hardlink",
) -> Dict[str, Any]:
    """Builds the 3 datasets: universal_dining_23class, personal_main_dish, personal_side_dish."""
    repo_root = _REPO_ROOT

    # 1. Load manifest
    if not splits_manifest_path.exists():
        raise DualDatasetBuilderError(f"Splits manifest missing: {splits_manifest_path}")
    with open(splits_manifest_path, "r", encoding="utf-8") as f:
        manifest_data = json.load(f)

    splits_by_id: Dict[str, Dict[str, Any]] = {
        item["image_id"]: item for item in manifest_data.get("splits", [])
    }

    # 2. Load observations
    if not observations_jsonl.exists():
        raise DualDatasetBuilderError(f"Observations JSONL missing: {observations_jsonl}")
    observations: Dict[str, Dict[str, Any]] = {}
    with open(observations_jsonl, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            r = json.loads(line)
            iid = r.get("image_id")
            if iid:
                observations[iid] = r

    # 3. Load blind_ext mapping
    ext_lookup = load_blind_ext_lookup(blind_ext_path)

    # Allowed splits for training pipeline
    TARGET_SPLITS = {"train", "val", "test"}

    # Output directory layout
    universal_dir = output_dir / "universal_dining_23class"
    main_dir = output_dir / "personal_main_dish"
    side_dir = output_dir / "personal_side_dish"

    for d in (universal_dir, main_dir, side_dir):
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True, exist_ok=True)

    stats = {
        "universal": defaultdict(lambda: Counter()),  # split -> class -> count
        "main": defaultdict(lambda: Counter()),       # split -> class -> count
        "side": defaultdict(lambda: Counter()),       # split -> class -> count
        "missing_images": 0,
        "skipped_holdout": 0,
        "skipped_eval_excluded": 0,
        "skipped_unresolved": 0,
    }

    # Iterate over splits_by_id to enforce manifest invariants
    for image_id, meta in sorted(splits_by_id.items()):
        split = meta.get("split")

        if split == "auxiliary_holdout":
            stats["skipped_holdout"] += 1
            continue
        if split == "eval_excluded":
            stats["skipped_eval_excluded"] += 1
            continue
        if split == "unresolved_path_excluded":
            stats["skipped_unresolved"] += 1
            continue
        if split not in TARGET_SPLITS:
            continue

        obs = observations.get(image_id)
        if not obs:
            raise DualDatasetBuilderError(f"Image {image_id} present in manifest but missing in observations!")

        img_file = resolve_image_path(obs, ext_lookup, repo_root)
        if not img_file or not img_file.exists():
            stats["missing_images"] += 1
            raise DualDatasetBuilderError(f"Image file for {image_id} could not be resolved or does not exist!")

        fname = img_file.name
        # Use unique target filename to prevent any collision
        target_fname = f"{image_id}__{fname}"

        # ----------------------------------------------------
        # 1. Universal 23-Class
        # ----------------------------------------------------
        u_class = classify_universal_23class(obs)
        if u_class not in UNIVERSAL_23_CLASSES:
            raise DualDatasetBuilderError(f"Invalid universal class assigned: {u_class}")
        u_target = universal_dir / split / u_class / target_fname
        link_or_copy_file(img_file, u_target, mode=link_mode)
        stats["universal"][split][u_class] += 1

        # ----------------------------------------------------
        # 2. Personal Main Dish (16 Classes, meal-only, learning targets)
        # ----------------------------------------------------
        is_main_target = meta.get("is_main_learning_target", False)
        main_class = meta.get("main_class")
        if is_main_target and main_class in PERSONAL_MAIN_16_CLASSES:
            m_target = main_dir / split / main_class / target_fname
            link_or_copy_file(img_file, m_target, mode=link_mode)
            stats["main"][split][main_class] += 1

        # ----------------------------------------------------
        # 3. Personal Side Dish (14 Classes + side_none, meal-only)
        # ----------------------------------------------------
        meal_type = meta.get("meal_type")
        if meal_type == "meal":
            raw_sides = meta.get("side_classes", [])
            valid_sides = [s for s in raw_sides if s in PERSONAL_SIDE_15_CLASSES and s != "side_none"]

            if not valid_sides:
                # Assign side_none
                s_target = side_dir / split / "side_none" / target_fname
                link_or_copy_file(img_file, s_target, mode=link_mode)
                stats["side"][split]["side_none"] += 1
            else:
                for s_class in valid_sides:
                    s_target = side_dir / split / s_class / target_fname
                    link_or_copy_file(img_file, s_target, mode=link_mode)
                    stats["side"][split][s_class] += 1

    # Convert defaultdicts to regular dicts for JSON serialization
    serialized_stats = {
        "universal": {sp: dict(cls_cnt) for sp, cls_cnt in stats["universal"].items()},
        "main": {sp: dict(cls_cnt) for sp, cls_cnt in stats["main"].items()},
        "side": {sp: dict(cls_cnt) for sp, cls_cnt in stats["side"].items()},
        "skipped_holdout": stats["skipped_holdout"],
        "skipped_eval_excluded": stats["skipped_eval_excluded"],
        "skipped_unresolved": stats["skipped_unresolved"],
        "missing_images": stats["missing_images"],
    }

    # Write labels.txt for each dataset
    with open(universal_dir / "labels.txt", "w", encoding="utf-8") as f:
        for c in sorted(UNIVERSAL_23_CLASSES):
            f.write(f"{c}\n")
    with open(main_dir / "labels.txt", "w", encoding="utf-8") as f:
        for c in sorted(PERSONAL_MAIN_16_CLASSES):
            f.write(f"{c}\n")
    with open(side_dir / "labels.txt", "w", encoding="utf-8") as f:
        for c in sorted(PERSONAL_SIDE_15_CLASSES):
            f.write(f"{c}\n")

    return serialized_stats


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Build Universal 23-Class, Personal Main, and Personal Side datasets (Step 2)."
    )
    parser.add_argument("--observations-jsonl", type=Path, default=DEFAULT_OBSERVATIONS_JSONL)
    parser.add_argument("--splits-manifest", type=Path, default=DEFAULT_SPLITS_MANIFEST)
    parser.add_argument("--blind-ext-mapping", type=Path, default=DEFAULT_BLIND_EXT_MAPPING)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT_DIR)
    parser.add_argument("--link-mode", type=str, default="hardlink", choices=["hardlink", "symlink", "copy"])
    parser.add_argument("--report-json", type=Path, default=None)

    args = parser.parse_args()

    print(f"Building dual datasets into: {args.output_dir}")
    stats = build_dual_datasets(
        observations_jsonl=args.observations_jsonl,
        splits_manifest_path=args.splits_manifest,
        blind_ext_path=args.blind_ext_mapping,
        output_dir=args.output_dir,
        link_mode=args.link_mode,
    )

    print("\n=== Dataset Build Summary ===")
    print(f"Skipped Auxiliary Holdout: {stats['skipped_holdout']} (strictly protected)")
    print(f"Skipped Eval Excluded:     {stats['skipped_eval_excluded']}")
    print(f"Skipped Unresolved 25:     {stats['skipped_unresolved']}")
    print(f"Missing Images:            {stats['missing_images']}")

    for name in ("universal", "main", "side"):
        print(f"\n--- Model: {name} ---")
        for sp in ("train", "val", "test"):
            total_sp = sum(stats[name].get(sp, {}).values())
            classes_sp = len(stats[name].get(sp, {}))
            print(f"  {sp:5s}: {total_sp:5d} items across {classes_sp} classes")

    if args.report_json:
        args.report_json.parent.mkdir(parents=True, exist_ok=True)
        with open(args.report_json, "w", encoding="utf-8") as f:
            json.dump(stats, f, indent=2, ensure_ascii=False)
        print(f"\nReport written to: {args.report_json}")


if __name__ == "__main__":
    main()
