#!/usr/bin/env python3
"""Dual-Taxonomy Dataset Builder from Open Visual Observations (Issue-23).

Transforms unbiased open visual observations (observations_all_1007.jsonl) into two
complementary classification datasets:

1. Model 1 — Universal Dining Scene Taxonomy (7 classes, general-purpose):
   - home_teishoku_set: Balanced multi-dish home meal (main + side bowls + soup + rice)
   - one_plate_or_curry: One-plate meals, curry, keema, hayashi, gapao, fried rice
   - izakaya_bistro_or_party: Evening drinks & small dishes, home bistro, pizza/sushi party
   - noodles_or_single_bowl: Ramen, udon, soba, pasta, mazesoba, yakisoba main
   - dining_out_or_tray_meal: Cafeteria trays, restaurant chains, office desk lunches
   - drink_or_bottle_record: Sake, shochu, awamori, wine bottle or label close-ups
   - non_food_or_exclude: Non-food camera roll noise (eyewear selfies, boxes, appliances)

2. Model 2 — Personal Household & Wife's Cooking Taxonomy (8 classes + 11 signature tags):
   Focused on home dining images (excluding dining_out_or_tray_meal, drink_or_bottle_record,
   and non_food_or_exclude):
   - wife_multi_dish_teishoku: Multi-dish home dinner set with staple side dishes & soup
   - wife_nordic_one_plate: One-plate combo on Nordic/patterned platters (stir-fry + rice + sides)
   - wife_curry_or_ethnic_plate: Homemade keema/curry (with whole boiled egg), gapao, hayashi
   - wife_morning_salmon_natto: Classic Japanese breakfast with grilled salmon/fish & natto pack
   - wife_bistro_baguette_bal: Western bistro / home bal (baguette, ajillo, fondue, ratatouille, cheese)
   - wife_izakaya_small_dishes: Home izakaya small dishes on sometsuke ware (peppers, liver, sashimi)
   - household_pot_noodles_or_ramen_rice: Stovetop pot/pan noodles on trivet or instant ramen + rice
   - special_takeout_party_feast: Delivery pizza boxes, large takeout sushi platters, hors d'oeuvres

Invariants enforced:
1. Zero duplicate canonical `meshi_key` across all records.
2. Every record receives a valid Universal 7-class label.
3. Every home dining record receives a valid Personal 8-class label (non-home records get None).
4. Deterministic stratified train/val/test split (80/10/10) seeded by SHA-256.
5. Golden Test Set leakage guard: any image matching protected golden test keys is never placed
   in `train` or `val` (strictly assigned to `test`).
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
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Set, Tuple

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
    / "dual_taxonomy_dataset_v1"
)
DEFAULT_GOLDEN_V1_TEST_DIR = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-even48-20260423"
    / "exported_dataset"
    / "test"
)
DEFAULT_GOLDEN_V2_MANIFEST: Optional[Path] = None


UNIVERSAL_CLASSES: Tuple[str, ...] = (
    "home_teishoku_set",
    "one_plate_or_curry",
    "izakaya_bistro_or_party",
    "noodles_or_single_bowl",
    "dining_out_or_tray_meal",
    "drink_or_bottle_record",
    "non_food_or_exclude",
)

PERSONAL_HOME_CLASSES: Tuple[str, ...] = (
    "wife_multi_dish_teishoku",
    "wife_nordic_one_plate",
    "wife_curry_or_ethnic_plate",
    "wife_morning_salmon_natto",
    "wife_bistro_baguette_bal",
    "wife_izakaya_small_dishes",
    "household_pot_noodles_or_ramen_rice",
    "special_takeout_party_feast",
)

PERSONAL_SIGNATURE_TAGS: Tuple[str, ...] = (
    "sig_nordic_tableware",
    "sig_sometsuke_ware",
    "sig_herb_rimmed_plate",
    "sig_whole_or_soft_egg",
    "sig_seasonal_fruit_side",
    "sig_staple_veggie_sides",
    "sig_thawed_block_rice",
    "sig_natto_pack_on_table",
    "sig_tupperware_or_deli_pack",
    "sig_cookware_on_table",
    "sig_cute_chopstick_rest_or_figure",
)


class DualTaxonomyError(Exception):
    """Raised when dataset validation or invariant checks fail."""


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


def classify_universal_scene(record: Dict[str, Any]) -> str:
    """Assign one of the 7 Universal Dining Scene classes from observation fields."""
    text = _record_text(record)
    caption_and_tags = " ".join(
        [str(record.get("short_caption", ""))]
        + [str(t) for t in (record.get("free_tags", []) or [])]
        + [str(e) for e in (record.get("visual_elements", []) or [])]
    )

    # 1. Non-food / camera roll noise
    non_food_kws = (
        "非食事",
        "非食品",
        "非料理",
        "食事なし",
        "眼鏡店",
        "メガネを試着",
        "眼鏡を試着",
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
    )
    if _has_any(text, non_food_kws):
        return "non_food_or_exclude"

    # 2. Drink / sake / wine bottle close-up record
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
        "薩摩焼酎",
        "焼酎ボトル",
        "ワインボトル",
        "シャンパンボトル",
        "エチケット",
        "酒瓶",
    )
    meal_presence_kws = (
        "白ご飯",
        "白米",
        "定食",
        "ワンプレート",
        "味噌汁",
        "おでん",
        "焼き魚",
        "焼き鳥",
        "豚肉",
        "カレー",
    )
    if _has_any(caption_and_tags, drink_bottle_kws) and not _has_any(
        caption_and_tags, meal_presence_kws
    ):
        return "drink_or_bottle_record"

    # 3. Dining out / cafeteria tray / office desk meal
    dining_out_kws = (
        "社食",
        "学食",
        "食堂トレイ",
        "食堂風",
        "カフェテリア",
        "黒いトレイ",
        "黒トレイ",
        "黒い長方形トレー",
        "黒いプラスチックトレイ",
        "プラスチック製トレイ",
        "定食トレイ",
        "トレイセット",
        "松屋",
        "シュクメルリ",
        "マクドナルド",
        "蕎麦屋",
        "外食",
        "飲食店",
        "カフェランチ",
        "キーボード",
        "PCデスク",
        "オフィスデスク",
    )
    if _has_any(text, dining_out_kws):
        return "dining_out_or_tray_meal"

    # 4. Izakaya small dishes, home bistro/bal, or party takeout spread (pizza / sushi platters)
    party_or_bal_kws = (
        "宅配ピザ",
        "デリバリーピザ",
        "ドミノ・ピザ",
        "ドミノピザ",
        "クワトロピザ",
        "スシロー",
        "寿司盛り合わせ",
        "にぎり寿司盛り合わせ",
        "握り寿司盛り合わせ",
        "パック寿司",
        "棒寿司",
        "助六寿司",
        "アヒージョ",
        "チーズフォンデュ",
        "すき焼き",
        "生ハムメロン",
        "ラムチョップ",
        "オードブル重",
        "9マス",
        "おうちバル",
        "おうち居酒屋",
        "晩酌膳",
        "晩酌の食卓",
        "酒の肴",
        "酒肴",
        "バゲット",
        "カマンベール",
        "ブルーチーズ",
    )
    if _has_any(text, party_or_bal_kws):
        return "izakaya_bistro_or_party"

    # 5. Noodles / single bowl main
    noodle_kws = (
        "ラーメン",
        "うどん",
        "蕎麦",
        "そば",
        "パスタ",
        "スパゲッティ",
        "ボロネーゼ",
        "カルボナーラ",
        "まぜそば",
        "焼きそば",
        "きしめん",
        "そうめん",
        "ジャージャー麺",
        "あんかけ麺",
        "和え麺",
    )
    if _has_any(caption_and_tags, noodle_kws) and not _has_any(
        caption_and_tags, ("焼き鮭", "アジの開き", "生姜焼き定食")
    ):
        return "noodles_or_single_bowl"

    # 6. One-plate, curry, rice bowl, fried rice, western/ethnic plate
    one_plate_kws = (
        "ワンプレート",
        "カレー",
        "キーマ",
        "ハヤシライス",
        "ガパオ",
        "タコライス",
        "オムライス",
        "チャーハン",
        "炒飯",
        "ピラフ",
        "ビリヤニ",
        "シチュー",
        "牛丼",
        "親子丼",
        "そぼろ丼",
        "麻婆丼",
        "麻婆豆腐をご飯に",
        "中華丼",
        "あんかけ丼",
        "合盛り",
        "合い盛り",
    )
    if _has_any(text, one_plate_kws):
        return "one_plate_or_curry"

    # 7. Default for structured multi-dish home meals
    return "home_teishoku_set"


def classify_personal_home_mode(
    record: Dict[str, Any], universal_class: str
) -> Optional[str]:
    """Assign one of the 8 Personal Household / Wife's Cooking classes for home meals."""
    if universal_class in (
        "non_food_or_exclude",
        "drink_or_bottle_record",
        "dining_out_or_tray_meal",
    ):
        return None

    text = _record_text(record)
    caption_and_tags = " ".join(
        [str(record.get("short_caption", ""))]
        + [str(t) for t in (record.get("free_tags", []) or [])]
        + [str(e) for e in (record.get("visual_elements", []) or [])]
    )

    # 1. Special takeout party feast (delivery pizza boxes, takeout sushi platters, hors d'oeuvres)
    takeout_party_kws = (
        "宅配ピザ",
        "デリバリーピザ",
        "ドミノ・ピザ",
        "ドミノピザ",
        "クワトロピザ",
        "スシロー",
        "寿司盛り合わせ",
        "にぎり寿司盛り合わせ",
        "握り寿司盛り合わせ",
        "パック寿司",
        "棒寿司",
        "助六寿司",
        "オードブル重",
        "9マス",
        "すき焼き鍋",
    )
    if _has_any(text, takeout_party_kws):
        return "special_takeout_party_feast"

    # 2. Wife's Western bistro / home bal (baguette, ajillo, fondue, ratatouille, cheese, roast/wine)
    bistro_bal_kws = (
        "アヒージョ",
        "チーズフォンデュ",
        "バゲット",
        "フランスパン",
        "ラタトゥイユ",
        "カマンベール",
        "ブルーチーズ",
        "フェタチーズ",
        "ギリシャチーズ",
        "生ハムメロン",
        "ラムチョップ",
        "おうちバル",
        "ビストロ風",
        "タパス",
        "ピンチョス",
    )
    if _has_any(text, bistro_bal_kws):
        return "wife_bistro_baguette_bal"

    # 3. Classic morning salmon/fish & natto breakfast
    if _has_any(text, ("納豆", "和朝食", "朝定食")) or (
        "焼き鮭" in caption_and_tags
        and not _has_any(text, ("刺身", "晩酌", "ビール", "日本酒", "徳利"))
    ):
        return "wife_morning_salmon_natto"

    # 4. Wife's signature curry / ethnic plate (keema + boiled egg, gapao + fried egg, hayashi, green curry)
    curry_ethnic_kws = (
        "カレー",
        "キーマ",
        "ハヤシライス",
        "ガパオ",
        "タコライス",
        "オムライス",
        "ビリヤニ",
    )
    if _has_any(caption_and_tags, curry_ethnic_kws):
        return "wife_curry_or_ethnic_plate"

    # 5. Household pot/pan noodles on trivet or instant ramen + rice
    noodle_kws = (
        "ラーメン",
        "うどん",
        "蕎麦",
        "そば",
        "パスタ",
        "スパゲッティ",
        "カルボナーラ",
        "ボロネーゼ",
        "まぜそば",
        "焼きそば",
        "そうめん",
        "ジャージャー麺",
        "あんかけ麺",
    )
    if _has_any(caption_and_tags, noodle_kws):
        return "household_pot_noodles_or_ramen_rice"

    # 6. Home izakaya small dishes on sometsuke ware
    izakaya_kws = (
        "晩酌",
        "おつまみ",
        "おうち居酒屋",
        "居酒屋風",
        "酒の肴",
        "酒肴",
        "徳利",
        "お猪口",
        "ぐい呑み",
        "ほたるいか",
        "きびなご",
        "梅水晶",
        "刺身",
        "しめ鯖",
        "しめさば",
        "湯豆腐",
    )
    if _has_any(text, izakaya_kws):
        return "wife_izakaya_small_dishes"

    # 7. Nordic / large platter one-plate combo
    if _has_any(
        text,
        (
            "ワンプレート",
            "合盛り",
            "合い盛り",
            "チャーハン",
            "炒飯",
            "ピラフ",
            "牛丼",
            "親子丼",
            "そぼろ丼",
            "麻婆",
        ),
    ):
        return "wife_nordic_one_plate"

    # 8. Multi-dish home dinner teishoku
    return "wife_multi_dish_teishoku"


def extract_personal_signature_tags(record: Dict[str, Any]) -> List[str]:
    """Extract multi-label household/wife's cooking signature tags from observation text."""
    text = _record_text(record)
    tags: List[str] = []

    if _has_any(
        text,
        (
            "北欧",
            "アラビア",
            "トゥオキオ",
            "Tuokio",
            "Avec",
            "アヴェック",
            "モナミ",
            "パラティッシ",
            "イッタラ",
            "カステヘルミ",
            "ドットガラス",
            "幾何学模様",
        ),
    ):
        tags.append("sig_nordic_tableware")

    if _has_any(text, ("染付", "唐草", "十草", "藍", "織部", "和食器", "漆器")):
        tags.append("sig_sometsuke_ware")

    if _has_any(text, ("ハーブ柄", "リーフ柄", "パセリ柄", "ボタニカル", "植物柄")):
        tags.append("sig_herb_rimmed_plate")

    if _has_any(text, ("ゆで卵", "目玉焼き", "温泉卵", "煮卵", "煮玉子", "味玉", "半熟")):
        tags.append("sig_whole_or_soft_egg")

    if _has_any(
        text,
        (
            "りんご",
            "リンゴ",
            "柿",
            "梨",
            "マスカット",
            "スイカ",
            "メロン",
            "みかん",
            "キウイ",
            "ブルーベリー",
            "バナナ",
        ),
    ):
        tags.append("sig_seasonal_fruit_side")

    if _has_any(
        text,
        (
            "しりしり",
            "きんぴら",
            "かぼちゃ",
            "れんこん",
            "レンコン",
            "舞茸",
            "焼きピーマン",
            "丸ごとピーマン",
            "焼き長ネギ",
            "焼きねぎ",
            "焼きネギ",
            "レバー煮",
            "鶏レバー",
            "ちくわきゅうり",
        ),
    ):
        tags.append("sig_staple_veggie_sides")

    if _has_any(
        text,
        ("四角", "解凍", "ブロック状", "ドーム型", "ラグビーボール型", "型抜き", "2山", "しゃもじ"),
    ):
        tags.append("sig_thawed_block_rice")

    if "納豆" in text:
        tags.append("sig_natto_pack_on_table")

    if _has_any(
        text,
        (
            "タッパー",
            "保存容器",
            "ジップロック",
            "パックのまま",
            "チルド焼売",
            "パック焼売",
            "値引きシール",
            "50%引き",
            "ツナ缶",
            "缶詰",
        ),
    ):
        tags.append("sig_tupperware_or_deli_pack")

    if _has_any(
        text,
        (
            "卓上IH",
            "IHヒーター",
            "フライパン",
            "オーブン天板",
            "天板",
            "小鍋ごと",
            "片手鍋",
            "ホーロー鍋",
            "ホーロー容器",
            "コルク敷き",
            "鍋敷き",
        ),
    ):
        tags.append("sig_cookware_on_table")

    if _has_any(text, ("箸置き", "トラ", "猫の箸置き", "シマウマ", "ミニチュア")):
        tags.append("sig_cute_chopstick_rest_or_figure")

    return tags


def collect_protected_golden_meshi_keys(
    golden_v1_dir: Optional[Path] = None,
    golden_v2_manifest: Optional[Path] = None,
) -> Set[str]:
    """Collect MESHI_YYYYMMDD_HHMMSS keys belonging to Golden Test Set v1 or v2.

    Fail-closed validation:
    1. At least one Golden source (golden_v1_dir or golden_v2_manifest) must be provided.
    2. If golden_v1_dir is provided, it must exist and be a directory.
    3. If golden_v2_manifest is provided, it must exist and be a readable CSV file.
    4. At least one valid MESHI_YYYYMMDD_HHMMSS key must be extracted.
    """
    if golden_v1_dir is None and golden_v2_manifest is None:
        raise DualTaxonomyError(
            "At least one Golden test set source (golden_v1_dir or golden_v2_manifest) "
            "must be provided. Fail-closed: cannot build dataset without Golden protection."
        )

    protected: Set[str] = set()

    if golden_v1_dir is not None:
        if not golden_v1_dir.exists():
            raise DualTaxonomyError(
                f"Golden Test Set v1 directory does not exist: {golden_v1_dir}"
            )
        if not golden_v1_dir.is_dir():
            raise DualTaxonomyError(
                f"Golden Test Set v1 path is not a directory: {golden_v1_dir}"
            )

        def _on_walk_error(err: OSError) -> None:
            target_path = err.filename or str(golden_v1_dir)
            raise DualTaxonomyError(
                f"Failed to traverse Golden Test Set v1 directory at '{target_path}': {err}"
            ) from err

        try:
            for root, _, files in os.walk(golden_v1_dir, onerror=_on_walk_error):
                for fname in sorted(files):
                    if fname.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
                        mk = extract_meshi_key(fname)
                        if mk.startswith("MESHI_"):
                            protected.add(mk)
        except DualTaxonomyError:
            raise
        except OSError as e:
            raise DualTaxonomyError(
                f"Failed to read Golden Test Set v1 directory at '{golden_v1_dir}': {e}"
            ) from e


    if golden_v2_manifest is not None:
        if not golden_v2_manifest.exists():
            raise DualTaxonomyError(
                f"Golden Test Set v2 manifest file does not exist: {golden_v2_manifest}"
            )
        if not golden_v2_manifest.is_file():
            raise DualTaxonomyError(
                f"Golden Test Set v2 manifest path is not a file: {golden_v2_manifest}"
            )
        try:
            with open(golden_v2_manifest, encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    for field in (
                        "image_id",
                        "source_path",
                        "file_name",
                        "filename",
                        "relative_path",
                        "rel_path_source",
                    ):
                        if field in row and row[field]:
                            mk = extract_meshi_key(str(row[field]))
                            if mk.startswith("MESHI_"):
                                protected.add(mk)
        except DualTaxonomyError:
            raise
        except Exception as e:
            raise DualTaxonomyError(
                f"Failed to read Golden Test Set v2 manifest at {golden_v2_manifest}: {e}"
            ) from e

    if not protected:
        raise DualTaxonomyError(
            f"No valid protected Golden MESHI keys could be extracted from sources "
            f"(v1: {golden_v1_dir}, v2: {golden_v2_manifest}). Fail-closed: protection "
            f"key set must not be empty."
        )

    return protected


def verify_golden_test_leakage(
    records: Sequence[Dict[str, Any]],
    protected_test_keys: Set[str],
) -> Dict[str, Any]:
    """Inspect records to strictly verify zero Golden Test Set images leak into train or val.

    Validates:
    1. Records matching protected Golden keys must have universal_split == 'test'
    2. Records matching protected Golden keys with personal_home_class must have personal_split == 'test'
    3. Distinguishes protected keys present in dataset vs absent from dataset
    4. Reports and raises DualTaxonomyError if any leakage is detected in either taxonomy.
    5. Fails closed if protected_test_keys is empty.
    """
    if not protected_test_keys:
        raise DualTaxonomyError(
            "Cannot verify Golden test leakage: protected_test_keys is empty. "
            "Fail-closed: verification requires at least one protected key."
        )
    normalized_protected = {extract_meshi_key(k) for k in protected_test_keys if k and extract_meshi_key(k)}
    if not normalized_protected:
        raise DualTaxonomyError(
            "Cannot verify Golden test leakage: no non-empty protected test keys provided. "
            "Fail-closed: verification requires at least one valid key."
        )

    present_keys: Set[str] = set()
    universal_leakages: List[Dict[str, Any]] = []
    personal_leakages: List[Dict[str, Any]] = []

    for rec in records:
        raw_key = rec.get("meshi_key") or rec.get("original_path") or rec.get("image_id") or ""
        mk = extract_meshi_key(str(raw_key))
        is_protected = mk in normalized_protected or bool(rec.get("is_protected_golden_test"))
        if not is_protected:
            continue

        present_keys.add(mk)
        u_split = rec.get("universal_split")
        if u_split != "test":
            universal_leakages.append({
                "meshi_key": mk,
                "split": u_split,
                "taxonomy": "universal",
                "universal_scene_class": rec.get("universal_scene_class"),
            })

        p_class = rec.get("personal_home_class")
        p_split = rec.get("personal_split")
        if p_class is not None and p_split != "test":
            personal_leakages.append({
                "meshi_key": mk,
                "split": p_split,
                "taxonomy": "personal",
                "personal_home_class": p_class,
            })

    absent_keys = sorted(normalized_protected - present_keys)
    all_leaked_keys = sorted(
        set(x["meshi_key"] for x in universal_leakages)
        | set(x["meshi_key"] for x in personal_leakages)
    )
    total_leakage_count = len(all_leaked_keys)

    verification_result = {
        "verified": True,
        "protected_keys_total": len(normalized_protected),
        "present_in_dataset_count": len(present_keys),
        "absent_from_dataset_count": len(absent_keys),
        "universal_leakage_count": len(universal_leakages),
        "personal_leakage_count": len(personal_leakages),
        "total_leakage_count": total_leakage_count,
        "universal_leakages": universal_leakages,
        "personal_leakages": personal_leakages,
        "absent_keys_sample": absent_keys[:5],
    }

    if total_leakage_count > 0:
        raise DualTaxonomyError(
            f"Golden test leakage detected! Total leaked keys: {total_leakage_count} "
            f"(Universal: {len(universal_leakages)}, Personal: {len(personal_leakages)}). "
            f"Leaked keys: {all_leaked_keys}. "
            f"Universal details: {universal_leakages}. "
            f"Personal details: {personal_leakages}."
        )

    return verification_result



def assign_stratified_splits(
    records: List[Dict[str, Any]],
    label_key: str,
    protected_test_keys: Set[str],
    train_ratio: float = 0.80,
    val_ratio: float = 0.10,
) -> Dict[str, str]:
    """Assign deterministic stratified train/val/test split per class.

    Any record whose `meshi_key` is in `protected_test_keys` is strictly pinned to `test`
    so that zero Golden Test Set images ever leak into `train` or `val`.
    """
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


def build_dual_taxonomy_dataset(
    observations_jsonl: Path,
    output_dir: Path,
    golden_v1_dir: Optional[Path] = DEFAULT_GOLDEN_V1_TEST_DIR,
    golden_v2_manifest: Optional[Path] = DEFAULT_GOLDEN_V2_MANIFEST,
    export_image_dirs: bool = False,
) -> Dict[str, Any]:
    """Build dual-taxonomy labeled JSONL, CSV manifest, and summary report."""
    if not observations_jsonl.exists():
        raise DualTaxonomyError(f"Observations JSONL not found: {observations_jsonl}")

    raw_records: List[Dict[str, Any]] = []
    seen_keys: Set[str] = set()
    with open(observations_jsonl, encoding="utf-8") as f:
        for line_no, line in enumerate(f, start=1):
            stripped = line.strip()
            if not stripped:
                continue
            rec = json.loads(stripped)
            raw_key = rec.get("meshi_key") or rec.get("original_path") or rec.get("image_id")
            if not raw_key:
                raise DualTaxonomyError(f"Line {line_no} missing meshi_key/image_id")
            mk = extract_meshi_key(str(raw_key))
            if mk in seen_keys:
                raise DualTaxonomyError(f"Duplicate meshi_key detected: {mk} at line {line_no}")
            seen_keys.add(mk)
            rec["meshi_key"] = mk
            raw_records.append(rec)

    if not raw_records:
        raise DualTaxonomyError("Observations file contains 0 records.")

    protected_test_keys = collect_protected_golden_meshi_keys(
        golden_v1_dir=golden_v1_dir,
        golden_v2_manifest=golden_v2_manifest,
    )

    enriched: List[Dict[str, Any]] = []
    for rec in raw_records:
        u_class = classify_universal_scene(rec)
        if u_class not in UNIVERSAL_CLASSES:
            raise DualTaxonomyError(f"Invalid universal class: {u_class}")

        p_class = classify_personal_home_mode(rec, u_class)
        if p_class is not None and p_class not in PERSONAL_HOME_CLASSES:
            raise DualTaxonomyError(f"Invalid personal class: {p_class}")

        sig_tags = extract_personal_signature_tags(rec)
        item = dict(rec)
        item["universal_scene_class"] = u_class
        item["personal_home_class"] = p_class
        item["personal_signature_tags"] = sig_tags
        item["is_protected_golden_test"] = rec["meshi_key"] in protected_test_keys
        enriched.append(item)

    univ_splits = assign_stratified_splits(
        enriched,
        label_key="universal_scene_class",
        protected_test_keys=protected_test_keys,
    )
    personal_candidates = [r for r in enriched if r["personal_home_class"] is not None]
    pers_splits = assign_stratified_splits(
        personal_candidates,
        label_key="personal_home_class",
        protected_test_keys=protected_test_keys,
    )

    for item in enriched:
        mk = item["meshi_key"]
        u_split = univ_splits[mk]
        p_split = pers_splits.get(mk)
        item["universal_split"] = u_split
        item["personal_split"] = p_split

    # Strictly verify zero Golden Test Set images leak into train or val in either model
    leakage_verification = verify_golden_test_leakage(enriched, protected_test_keys)

    # Deterministic order by meshi_key
    enriched.sort(key=lambda r: r["meshi_key"])

    output_dir.mkdir(parents=True, exist_ok=True)
    jsonl_path = output_dir / "dual_taxonomy_labeled_1007.jsonl"
    csv_path = output_dir / "dual_taxonomy_manifest_1007.csv"
    summary_path = output_dir / "dual_taxonomy_summary.json"

    with open(jsonl_path, "w", encoding="utf-8") as f:
        for item in enriched:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")

    csv_fields = [
        "meshi_key",
        "image_id",
        "source_set",
        "universal_scene_class",
        "universal_split",
        "personal_home_class",
        "personal_split",
        "personal_signature_tags",
        "is_protected_golden_test",
        "short_caption",
        "original_path",
    ]
    with open(csv_path, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=csv_fields)
        writer.writeheader()
        for item in enriched:
            writer.writerow(
                {
                    "meshi_key": item["meshi_key"],
                    "image_id": item.get("image_id", ""),
                    "source_set": item.get("source_set", ""),
                    "universal_scene_class": item["universal_scene_class"],
                    "universal_split": item["universal_split"],
                    "personal_home_class": item["personal_home_class"] or "",
                    "personal_split": item["personal_split"] or "",
                    "personal_signature_tags": "|".join(item["personal_signature_tags"]),
                    "is_protected_golden_test": str(item["is_protected_golden_test"]).lower(),
                    "short_caption": item.get("short_caption", ""),
                    "original_path": item.get("original_path", ""),
                }
            )

    if export_image_dirs:
        _materialize_split_trees(enriched, output_dir)

    univ_counter = Counter(r["universal_scene_class"] for r in enriched)
    univ_split_counter = Counter(r["universal_split"] for r in enriched)
    pers_counter = Counter(
        r["personal_home_class"] for r in enriched if r["personal_home_class"]
    )
    pers_split_counter = Counter(
        r["personal_split"] for r in enriched if r["personal_split"]
    )
    sig_counter: Counter[str] = Counter()
    for r in enriched:
        for t in r["personal_signature_tags"]:
            sig_counter[t] += 1

    summary = {
        "schema_version": "1.0.0",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "total_records": len(enriched),
        "protected_golden_overlap_count": leakage_verification["present_in_dataset_count"],
        "golden_train_val_leakage_count": leakage_verification["total_leakage_count"],
        "golden_leakage_verification": leakage_verification,
        "universal_scene_7class": {
            "total": len(enriched),
            "by_class": {cls: univ_counter.get(cls, 0) for cls in UNIVERSAL_CLASSES},
            "by_split": dict(univ_split_counter),
        },
        "personal_household_8class": {
            "total": len(personal_candidates),
            "by_class": {cls: pers_counter.get(cls, 0) for cls in PERSONAL_HOME_CLASSES},
            "by_split": dict(pers_split_counter),
        },
        "personal_signature_tags": {
            tag: sig_counter.get(tag, 0) for tag in PERSONAL_SIGNATURE_TAGS
        },
        "artifacts": {
            "labeled_jsonl": str(jsonl_path),
            "manifest_csv": str(csv_path),
        },
    }

    with open(summary_path, "w", encoding="utf-8") as f:
        json.dump(summary, f, indent=2, ensure_ascii=False)

    return summary


def _resolve_existing_image_path(record: Dict[str, Any]) -> Optional[Path]:
    for key in ("image_path", "original_path"):
        val = record.get(key)
        if not val:
            continue
        p = Path(str(val))
        if not p.is_absolute():
            p = _REPO_ROOT / p
        if p.exists():
            return p
    return None


def _materialize_split_trees(
    records: List[Dict[str, Any]], output_dir: Path
) -> None:
    univ_root = output_dir / "universal_scene_7class_images"
    pers_root = output_dir / "personal_household_8class_images"
    for root in (univ_root, pers_root):
        if root.exists():
            shutil.rmtree(root)

    for rec in records:
        src = _resolve_existing_image_path(rec)
        if src is None:
            continue
        mk = rec["meshi_key"]
        u_dst = (
            univ_root
            / rec["universal_split"]
            / rec["universal_scene_class"]
            / f"{mk}.jpg"
        )
        u_dst.parent.mkdir(parents=True, exist_ok=True)
        try:
            os.link(src, u_dst)
        except OSError:
            shutil.copy2(src, u_dst)

        if rec["personal_home_class"] and rec["personal_split"]:
            p_dst = (
                pers_root
                / rec["personal_split"]
                / rec["personal_home_class"]
                / f"{mk}.jpg"
            )
            p_dst.parent.mkdir(parents=True, exist_ok=True)
            try:
                os.link(src, p_dst)
            except OSError:
                shutil.copy2(src, p_dst)


def parse_args(argv: Optional[Sequence[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build dual-taxonomy (Universal 7-class & Personal 8-class) dataset from open observations."
    )
    parser.add_argument(
        "--observations-jsonl",
        type=Path,
        default=DEFAULT_OBSERVATIONS_JSONL,
        help="Path to input open observations JSONL file.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Directory to write dual taxonomy dataset artifacts.",
    )
    parser.add_argument(
        "--golden-v1-dir",
        type=Path,
        default=DEFAULT_GOLDEN_V1_TEST_DIR,
        help="Path to Golden Test Set v1 directory for leakage prevention.",
    )
    parser.add_argument(
        "--golden-v2-manifest",
        type=Path,
        default=DEFAULT_GOLDEN_V2_MANIFEST,
        help="Optional path to Golden Test Set v2 manifest CSV for leakage prevention (default: None).",
    )
    parser.add_argument(
        "--export-image-dirs",
        action="store_true",
        help="Also materialize train/val/test class directory trees using hardlinks/copies.",
    )
    return parser.parse_args(argv)


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = parse_args(argv)
    summary = build_dual_taxonomy_dataset(
        observations_jsonl=args.observations_jsonl,
        output_dir=args.output_dir,
        golden_v1_dir=args.golden_v1_dir,
        golden_v2_manifest=args.golden_v2_manifest,
        export_image_dirs=args.export_image_dirs,
    )
    print("=== Dual-Taxonomy Dataset Build Complete ===")
    print(f"Total records: {summary['total_records']}")
    print(
        f"Protected Golden Test overlap pinned to test: {summary['protected_golden_overlap_count']}"
    )
    print("\n[Model 1: Universal Dining Scene (7 classes)]")
    for cls, cnt in summary["universal_scene_7class"]["by_class"].items():
        print(f"  - {cls}: {cnt}")
    print(f"  Splits: {summary['universal_scene_7class']['by_split']}")
    print("\n[Model 2: Personal Household & Wife's Cooking (8 classes)]")
    for cls, cnt in summary["personal_household_8class"]["by_class"].items():
        print(f"  - {cls}: {cnt}")
    print(f"  Splits: {summary['personal_household_8class']['by_split']}")
    print("\n[Personal Signature Multi-Label Tags]")
    for tag, cnt in summary["personal_signature_tags"].items():
        print(f"  - {tag}: {cnt}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
