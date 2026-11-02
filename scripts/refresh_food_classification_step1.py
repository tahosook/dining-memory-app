#!/usr/bin/env python3
"""Food Classification Refresh - Step 1 Pipeline (Owner Final Decision Applied).

Handles:
1. Integration and re-verification of open visual observation records (3,391 lines).
2. Separation of human-confirmed evaluation sets (batch250, even48, Golden Test Set v2).
3. Session clustering (30-minute threshold) and exclusion of evaluation sessions.
4. Mapping dictionary generation (free text -> personal dish classes, incorporating
   owner final decisions: Japanese noodles unified, reference-only evaluation for 4 classes,
   low-sample exclusions for 3 tags).
5. Inventory aggregation and final class definitions (16 main dish classes, 14 side dish classes,
   distinct tracking of undetermined vs excluded-tag non-learning targets).
6. Session-level split allocation with explicit exclusion of 25 path-unresolved records.
"""

from __future__ import annotations

import argparse
import csv
import datetime
import json
import os
import random
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

# Base repository root
_REPO_ROOT = Path(__file__).resolve().parent.parent

# Input observation files
DEFAULT_OBSERVATION_DIR = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "open_observation_20261013"
)
INTEGRATED_OBSERVATIONS_JSONL = (
    DEFAULT_OBSERVATION_DIR / "observations_all_3391.jsonl"
)
W2_MAPPING_JSON = DEFAULT_OBSERVATION_DIR / "blind_w2_mapping.json"

# Evaluation set paths
EVAL_BATCH250_CSV = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-batch250"
    / "review_ground_truth.csv"
)
EVAL_EVEN48_CSV = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-even48-20260423"
    / "review_ground_truth.csv"
)
EVAL_GOLDEN_V2_CSV = (
    _REPO_ROOT
    / "state"
    / "mediapipe-dataset"
    / "golden_eval_v2"
    / "manifest.csv"
)

# Audit private mappings for resolving blind IDs
AUDIT_SAMPLE_70_MAPPING = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-audit-manifest-20261009"
    / "gemini_audit_sample_70"
    / "blind_id_mapping.private.json"
)
AUDIT_SAMPLE_A_MAPPING = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-audit-manifest-20261009"
    / "gemini_audit_sample_A_pkg"
    / "private_reconciliation"
    / "blind_id_mapping.private.json"
)

TZ_JST = datetime.timezone(datetime.timedelta(hours=9))

# 25 records with missing paths / 6 keys
UNRESOLVED_25_IDS: Set[str] = {f"blind_w2_{i:04d}" for i in range(2720, 2745)}

# Final 16 Main Dish Classes (Owner Decision)
FINAL_MAIN_CLASSES: Tuple[str, ...] = (
    # 11 Maintained Classes
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
    # 1 Newly Merged Class (Udon + Soba)
    "main_japanese_noodles",
    # 4 Maintained Independent Classes (Evaluation is reference-only)
    "main_ethnic_gapao",
    "main_hotpot",
    "main_fried_rice",
    "main_sashimi_seafood",
)

# 3 Excluded Low-sample Tags (Excluded from main dish learning target)
EXCLUDED_LOW_SAMPLE_TAGS: Tuple[str, ...] = (
    "main_bal_ajillo",
    "main_simmered_meat_potato",
    "main_pasta",
)

# Final 14 Side Dish Classes (All Maintained)
FINAL_SIDE_CLASSES: Tuple[str, ...] = (
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

# Reference-only evaluation classes
REFERENCE_EVAL_CLASSES: Set[str] = {
    "main_ethnic_gapao",
    "main_hotpot",
    "main_fried_rice",
    "main_sashimi_seafood",
}

# Updated Mapping dictionary patterns reflecting final decisions in canonical order
MAIN_MATCHERS_UPDATED: List[Tuple[str, List[str], str]] = [
    ("main_grilled_fish", ["焼き魚", "焼き鮭", "サーモン", "ホッケ", "アジの開き", "サバの塩焼き", "鯖の塩焼き", "塩サバ", "干物", "ししゃも", "サンマ"], "standard"),
    ("main_pork_ginger_stirfry", ["生姜焼き", "しょうが焼き", "豚肉炒め", "豚バラ炒め", "豚肉と", "ポークソテー", "豚ロースステーキ", "豚肉のソテー", "豚肉ソテー", "豚キムチ", "豚ニラ炒め"], "standard"),
    ("main_chicken_dish", ["チキンソテー", "照り焼きチキン", "鶏もも肉", "手羽先", "手羽元", "鶏肉のソテー", "鶏の照り焼き", "チキングリル", "鶏肉と", "よだれ鶏", "蒸し鶏"], "standard"),
    ("main_fried_meat", ["唐揚げ", "から揚げ", "からあげ", "竜田揚げ", "チキンカツ", "とんかつ", "トンカツ", "豚カツ", "コロッケ", "メンチカツ", "エビフライ", "白身魚フライ"], "standard"),
    ("main_hamburg", ["ハンバーグ"], "standard"),
    ("main_simmered_meat_potato", ["肉じゃが", "角煮", "豚の角煮", "豚角煮"], "excluded_low_sample"),
    ("main_keema_curry", ["キーマカレー", "キーマ"], "standard"),
    ("main_curry_hayashi", ["カレーライス", "カレー", "ハヤシライス", "ハヤシ", "欧風カレー", "グリーンカレー", "カレールー"], "standard"),
    ("main_ethnic_gapao", ["ガパオ", "ガパオライス", "タイカレー", "ジャンバラヤ", "ナシゴレン"], "reference_eval"),
    ("main_ramen", ["ラーメン", "つけ麺", "担々麺", "中華そば", "素ラーメン"], "standard"),
    ("main_japanese_noodles", ["うどん", "そば", "蕎麦", "ざるそば", "ざるうどん", "かけうどん", "煮込みうどん", "カレーうどん", "天ぷらそば"], "standard"),
    ("main_pasta", ["パスタ", "スパゲッティ", "ペンネ", "ボロネーゼ", "カルボナーラ", "ナポリタン", "ミートソース", "ペペロンチーノ"], "excluded_low_sample"),
    ("main_gyoza_dimsum", ["餃子", "ギョーザ", "焼き餃子", "水餃子", "春巻き", "揚げ春巻き", "点心", "焼売", "シュウマイ"], "standard"),
    ("main_mapo_chuka", ["麻婆豆腐", "麻婆", "回鍋肉", "エビチリ", "青椒肉絲", "八宝菜"], "standard"),
    ("main_hotpot", ["すき焼き", "おでん", "水炊き", "キムチ鍋", "寄せ鍋", "もつ鍋", "鍋料理", "卓上鍋"], "reference_eval"),
    ("main_bal_ajillo", ["アヒージョ", "ソーセージ盛り", "バゲット料理", "グリルソーセージ"], "excluded_low_sample"),
    ("main_donburi", ["親子丼", "カツ丼", "かつ丼", "牛丼", "豚丼", "天丼", "海鮮丼", "うな丼", "ネギトロ丼"], "standard"),
    ("main_fried_rice", ["チャーハン", "炒飯", "ピラフ", "五目ご飯", "チキンライス"], "reference_eval"),
    ("main_sashimi_seafood", ["刺身", "お刺身", "マグロ", "サーモン刺身", "海鮮盛り", "タコ刺し"], "reference_eval"),
]

SIDE_MATCHERS: List[Tuple[str, List[str]]] = [
    ("side_simmered_pumpkin", ["かぼちゃの煮物", "かぼちゃ煮", "南瓜の煮物", "かぼちゃ"]),
    ("side_kinpira", ["きんぴら", "きんぴらごぼう", "蓮根きんぴら", "れんこんきんぴら"]),
    ("side_tonjiru_soup", ["豚汁", "けんちん汁"]),
    ("side_miso_soup", ["味噌汁", "お味噌汁", "赤だし", "お吸い物", "澄まし汁"]),
    ("side_veggie_soup", ["野菜スープ", "キャベツスープ", "もやしスープ", "ポトフ", "具だくさんスープ", "トマトスープ", "かきたまスープ", "わかめスープ", "中華スープ", "コンソメスープ", "スープ"]),
    ("side_tofu_hiyayakko", ["冷奴", "湯豆腐", "厚揚げ", "焼き厚揚げ", "豆腐"]),
    ("side_natto_pack", ["納豆", "納豆パック"]),
    ("side_egg_dish", ["ゆで卵", "目玉焼き", "卵焼き", "玉子焼き", "味玉", "温泉卵"]),
    ("side_salad_greens", ["サラダ", "温野菜", "生野菜", "ブロッコリー", "ミニトマト", "キャベツ千切り", "千切りキャベツ"]),
    ("side_chikuzenni_root", ["筑前煮", "大根煮", "大根の煮物", "里芋の煮物", "煮物小鉢", "煮浸し", "ナスの煮浸し"]),
    ("side_sauteed_mushrooms", ["舞茸ソテー", "舞茸", "キノコソテー", "きのこソテー", "エリンギ", "しめじ"]),
    ("side_pickles_kimchi", ["浅漬け", "漬物", "お漬物", "キムチ", "たくあん", "ピクルス", "ぬか漬け"]),
    ("side_cut_fruit", ["りんご", "リンゴ", "柿", "スイカ", "フルーツ", "果物", "ぶどう", "みかん"]),
    ("side_izakaya_appetizer", ["レバー煮", "焼きピーマン", "砂肝", "おつまみ小鉢", "枝豆", "メンマ", "ザーサイ"]),
]


def load_blind_id_lookup() -> Dict[str, str]:
    """Build lookup map from blind file / id to actual source path."""
    lookup: Dict[str, str] = {}
    if AUDIT_SAMPLE_70_MAPPING.exists():
        with open(AUDIT_SAMPLE_70_MAPPING, encoding="utf-8") as f:
            for r in json.load(f).get("records", []):
                sp = r.get("source_path", "")
                if r.get("blind_image_file"):
                    lookup[r["blind_image_file"]] = sp
                if r.get("blind_id"):
                    lookup[r["blind_id"]] = sp

    if AUDIT_SAMPLE_A_MAPPING.exists():
        with open(AUDIT_SAMPLE_A_MAPPING, encoding="utf-8") as f:
            for r in json.load(f).get("records", []):
                sp = r.get("source_path", "")
                if r.get("image_file"):
                    lookup[r["image_file"]] = sp
                if r.get("blind_id"):
                    lookup[r["blind_id"]] = sp

    return lookup


def normalize_photo_key(raw_str: Optional[str], blind_lookup: Dict[str, str]) -> Optional[str]:
    """Extract canonical photo key: MESHI_YYYYMMDD_HHMMSS or meal-XXXX."""
    if not raw_str:
        return None
    base_name = Path(raw_str).name
    if base_name in blind_lookup:
        raw_str = blind_lookup[base_name]
    elif raw_str in blind_lookup:
        raw_str = blind_lookup[raw_str]

    m_meshi = re.search(r"MESHI_\d{8}_\d{6}", raw_str, re.IGNORECASE)
    if m_meshi:
        return m_meshi.group(0).upper()

    m_meal = re.search(r"meal[-_](\d+)", raw_str, re.IGNORECASE)
    if m_meal:
        return f"meal-{m_meal.group(1)}"

    return raw_str.strip()


def extract_datetime_from_text(text: str) -> Optional[datetime.datetime]:
    """Parse shooting datetime from meshi_key or meal- timestamp."""
    m_meshi = re.search(r"MESHI_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})", text, re.IGNORECASE)
    if m_meshi:
        y, m, d, H, M, S = map(int, m_meshi.groups())
        return datetime.datetime(y, m, d, H, M, S, tzinfo=TZ_JST)

    m_meal = re.search(r"meal[-_](\d{13})", text, re.IGNORECASE)
    if m_meal:
        ts = int(m_meal.group(1)) / 1000.0
        return datetime.datetime.fromtimestamp(ts, TZ_JST)

    return None


def resolve_evaluation_sets(blind_lookup: Dict[str, str]) -> Dict[str, Any]:
    """Resolve and deduplicate batch250, even48, and Golden Test Set v2."""
    sets_data: Dict[str, Set[str]] = {
        "batch250": set(),
        "even48": set(),
        "golden_eval_v2": set(),
    }

    if EVAL_BATCH250_CSV.exists():
        with open(EVAL_BATCH250_CSV, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                k = (
                    normalize_photo_key(row.get("filename"), blind_lookup)
                    or normalize_photo_key(row.get("source_path"), blind_lookup)
                    or normalize_photo_key(row.get("image_id"), blind_lookup)
                )
                if k:
                    sets_data["batch250"].add(k)

    if EVAL_EVEN48_CSV.exists():
        with open(EVAL_EVEN48_CSV, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                k = (
                    normalize_photo_key(row.get("source_path"), blind_lookup)
                    or normalize_photo_key(row.get("image_id"), blind_lookup)
                )
                if k:
                    sets_data["even48"].add(k)

    if EVAL_GOLDEN_V2_CSV.exists():
        with open(EVAL_GOLDEN_V2_CSV, encoding="utf-8") as f:
            for row in csv.DictReader(f):
                k = (
                    normalize_photo_key(row.get("filename"), blind_lookup)
                    or normalize_photo_key(row.get("rel_path_source"), blind_lookup)
                )
                if k:
                    sets_data["golden_eval_v2"].add(k)

    b250 = sets_data["batch250"]
    e48 = sets_data["even48"]
    gv2 = sets_data["golden_eval_v2"]

    deduped_union = b250 | e48 | gv2

    return {
        "batch250_count": len(b250),
        "even48_count": len(e48),
        "golden_eval_v2_count": len(gv2),
        "sum_counts": len(b250) + len(e48) + len(gv2),
        "deduped_total_count": len(deduped_union),
        "overlap_batch250_even48": len(b250 & e48),
        "overlap_batch250_golden_v2": len(b250 & gv2),
        "overlap_even48_golden_v2": len(e48 & gv2),
        "overlap_all_three": len(b250 & e48 & gv2),
        "eval_keys_set": deduped_union,
    }


def cluster_sessions(records: List[Dict[str, Any]], gap_seconds: float = 1800.0) -> List[List[Dict[str, Any]]]:
    """Cluster chronologically sorted records into meal sessions by gap threshold."""
    records_sorted = sorted(records, key=lambda r: r["dt"])
    sessions: List[List[Dict[str, Any]]] = []
    curr: List[Dict[str, Any]] = []

    for r in records_sorted:
        if not curr:
            curr.append(r)
        else:
            gap = (r["dt"] - curr[-1]["dt"]).total_seconds()
            if gap <= gap_seconds:
                curr.append(r)
            else:
                sessions.append(curr)
                curr = [r]
    if curr:
        sessions.append(curr)

    for idx, s in enumerate(sessions, 1):
        sid = f"sess_{idx:04d}"
        for r in s:
            r["session_id"] = sid

    return sessions


def classify_record_dish(record_raw: Dict[str, Any]) -> Tuple[str, str, List[str], Dict[str, Any]]:
    """Classify meal type, main dish (from short_caption), and side dishes.

    Returns:
        (meal_type, main_class, side_classes, main_metadata)
    """
    sc = str(record_raw.get("short_caption") or "")
    ve = [str(x) for x in (record_raw.get("visual_elements") or [])]
    tags = [str(x) for x in (record_raw.get("free_tags") or [])]
    full_text = " ".join([sc] + ve + tags)

    # 1. Non-meal detection (bottle/container only)
    is_bottle_caption = any(
        w in sc
        for w in [
            "酒瓶", "ボトル", "日本酒瓶", "ワインボトル", "ビール缶", "缶ビール", "酒の瓶", "ラベル"
        ]
    )
    is_food_ve = any(
        any(f in el for f in ["ご飯", "スープ", "汁", "炒め", "焼き", "煮", "サラダ", "カレー", "肉", "魚", "パスタ", "うどん", "そば", "鍋", "皿", "丼"])
        for el in ve
    )
    if is_bottle_caption and not is_food_ve:
        return "not_meal", "not_meal", ["not_meal"], {"is_learning_target": False, "reason": "non_meal_photo"}

    # 2. Main dish classification (strictly from primary topic in short_caption)
    matched_tag: Optional[str] = None
    matched_role: Optional[str] = None

    for tag, kws, role in MAIN_MATCHERS_UPDATED:
        if tag == "main_curry_hayashi" and any(k in sc for k in ["キーマカレー", "キーマ"]):
            continue
        if any(kw in sc for kw in kws):
            matched_tag = tag
            matched_role = role
            break

    main_meta: Dict[str, Any] = {}
    if not matched_tag:
        main_class = "main_undetermined"
        main_meta = {"is_learning_target": False, "category": "undetermined", "reason": "topic_undetermined"}
    elif matched_role == "excluded_low_sample":
        main_class = matched_tag
        main_meta = {
            "is_learning_target": False,
            "category": "excluded_low_sample",
            "original_tag": matched_tag,
            "reason": "independent_class_disallowed_due_to_low_sample_count",
        }
    elif matched_role == "reference_eval":
        main_class = matched_tag
        main_meta = {"is_learning_target": True, "category": "reference_evaluation", "is_reference_eval": True}
    else:
        main_class = matched_tag
        main_meta = {"is_learning_target": True, "category": "standard_class", "is_reference_eval": False}

    # 3. Side dish classification (from ve, tags, sc)
    side_classes: List[str] = []
    for tag, kws in SIDE_MATCHERS:
        if tag == "side_miso_soup" and any(k in full_text for k in ["豚汁", "けんちん汁"]):
            continue
        if any(kw in full_text for kw in kws):
            side_classes.append(tag)

    if not side_classes:
        side_classes = ["side_none"]

    return "meal", main_class, side_classes, main_meta


def run_full_pipeline() -> Dict[str, Any]:
    """Execute complete Step 1 pipeline with final decisions applied."""
    blind_lookup = load_blind_id_lookup()

    # W2 mapping
    w2_map: Dict[str, Dict[str, Any]] = {}
    if W2_MAPPING_JSON.exists():
        with open(W2_MAPPING_JSON, encoding="utf-8") as f:
            for r in json.load(f).get("records", []):
                w2_map[r["blind_id"]] = r

    # Step 3. Resolve evaluation sets
    eval_info = resolve_evaluation_sets(blind_lookup)
    eval_keys: Set[str] = eval_info["eval_keys_set"]

    # Load 3,391 observations
    observations_records: List[Dict[str, Any]] = []
    with open(INTEGRATED_OBSERVATIONS_JSONL, encoding="utf-8") as f:
        for line in f:
            raw = json.loads(line)
            iid = raw.get("image_id", "")

            keys_to_search: List[str] = []
            if raw.get("meshi_key"):
                keys_to_search.append(raw["meshi_key"])
            if raw.get("original_path"):
                keys_to_search.append(raw["original_path"])
            if raw.get("image_path"):
                keys_to_search.append(raw["image_path"])
            if iid in w2_map:
                keys_to_search.append(w2_map[iid].get("meshi_key", ""))
                keys_to_search.append(w2_map[iid].get("original_path", ""))

            search_text = " ".join(keys_to_search)
            pk = normalize_photo_key(search_text, blind_lookup)
            dt = extract_datetime_from_text(search_text)

            is_new = not (iid.startswith("blind_A_") or iid.startswith("blind_ext_") or (iid.startswith("blind_w2_") and int(iid.split("_")[2]) <= 360))

            observations_records.append({
                "image_id": iid,
                "photo_key": pk,
                "dt": dt,
                "is_eval": pk in eval_keys,
                "is_new_obs": is_new,
                "is_unresolved_25": iid in UNRESOLVED_25_IDS,
                "raw": raw,
            })

    # Cluster into sessions
    sessions = cluster_sessions(observations_records, gap_seconds=1800.0)

    # Separate eval sessions
    eval_sessions = [s for s in sessions if any(r["is_eval"] for r in s)]
    clean_sessions = [s for s in sessions if not any(r["is_eval"] for r in s)]

    eval_photos_in_obs = sum(sum(1 for r in s if r["is_eval"]) for s in sessions)
    eval_session_total_photos = sum(len(s) for s in eval_sessions)
    co_session_excluded = eval_session_total_photos - eval_photos_in_obs

    # Step 6. Session-level split allocation
    # 1. Isolate 350 photos from new observations for auxiliary holdout
    new_obs_clean_sessions = [s for s in clean_sessions if all(r["is_new_obs"] for r in s)]
    rng_aux = random.Random(42)
    shuffled_new_sessions = list(new_obs_clean_sessions)
    rng_aux.shuffle(shuffled_new_sessions)

    aux_sessions: List[List[Dict[str, Any]]] = []
    aux_count = 0
    aux_sids: Set[str] = set()

    for s in shuffled_new_sessions:
        if aux_count + len(s) <= 350:
            aux_sessions.append(s)
            aux_count += len(s)
            aux_sids.add(s[0]["session_id"])
        if aux_count == 350:
            break

    remaining_sessions = [s for s in clean_sessions if s[0]["session_id"] not in aux_sids]
    rng_split = random.Random(12345)
    shuffled_remaining = list(remaining_sessions)
    rng_split.shuffle(shuffled_remaining)

    total_rem_photos = sum(len(s) for s in shuffled_remaining)
    target_val = int(total_rem_photos * 0.10)
    target_test = int(total_rem_photos * 0.10)

    val_sessions: List[List[Dict[str, Any]]] = []
    val_count = 0
    val_sids: Set[str] = set()

    test_sessions: List[List[Dict[str, Any]]] = []
    test_count = 0
    test_sids: Set[str] = set()

    train_sessions: List[List[Dict[str, Any]]] = []
    train_count = 0
    train_sids: Set[str] = set()

    for s in shuffled_remaining:
        s_len = len(s)
        sid = s[0]["session_id"]
        if val_count + s_len <= target_val:
            val_sessions.append(s)
            val_count += s_len
            val_sids.add(sid)
        elif test_count + s_len <= target_test:
            test_sessions.append(s)
            test_count += s_len
            test_sids.add(sid)
        else:
            train_sessions.append(s)
            train_count += s_len
            train_sids.add(sid)

    # Initial split assignment
    for s in train_sessions:
        for r in s:
            r["split"] = "train"
    for s in val_sessions:
        for r in s:
            r["split"] = "val"
    for s in test_sessions:
        for r in s:
            r["split"] = "test"
    for s in aux_sessions:
        for r in s:
            r["split"] = "auxiliary_holdout"
    for s in eval_sessions:
        for r in s:
            r["split"] = "eval_excluded"

    # Pre-exclusion counts
    pre_exclusion_split_counts = {
        "train": sum(1 for r in observations_records if r["split"] == "train"),
        "val": sum(1 for r in observations_records if r["split"] == "val"),
        "test": sum(1 for r in observations_records if r["split"] == "test"),
        "auxiliary_holdout": sum(1 for r in observations_records if r["split"] == "auxiliary_holdout"),
        "eval_excluded": sum(1 for r in observations_records if r["split"] == "eval_excluded"),
    }

    # Step 3 (Owner Rule): Exclude the 25 path-unresolved records explicitly from learning pool
    unresolved_split_breakdown: Counter[str] = Counter()
    for r in observations_records:
        if r["image_id"] in UNRESOLVED_25_IDS:
            orig = r["split"]
            unresolved_split_breakdown[orig] += 1
            r["original_split"] = orig
            r["split"] = "unresolved_path_excluded"

    # Post-exclusion counts
    post_exclusion_split_counts = {
        "train": sum(1 for r in observations_records if r["split"] == "train"),
        "val": sum(1 for r in observations_records if r["split"] == "val"),
        "test": sum(1 for r in observations_records if r["split"] == "test"),
        "auxiliary_holdout": sum(1 for r in observations_records if r["split"] == "auxiliary_holdout"),
        "eval_excluded": sum(1 for r in observations_records if r["split"] == "eval_excluded"),
        "unresolved_path_excluded": sum(1 for r in observations_records if r["split"] == "unresolved_path_excluded"),
    }

    # Audit session disjointness
    split_sids_map: Dict[str, Set[str]] = {}
    for r in observations_records:
        sp = r["split"]
        split_sids_map.setdefault(sp, set()).add(r["session_id"])

    split_names = list(split_sids_map.keys())
    audit_passed = True
    audit_errors: List[str] = []

    for i in range(len(split_names)):
        for j in range(i + 1, len(split_names)):
            n1, n2 = split_names[i], split_names[j]
            overlap = split_sids_map[n1] & split_sids_map[n2]
            if overlap:
                audit_passed = False
                audit_errors.append(f"Overlap between {n1} and {n2}: {overlap}")

    # Dish classification on all records
    for r in observations_records:
        mtype, mclass, sclasses, mmeta = classify_record_dish(r["raw"])
        r["meal_type"] = mtype
        r["main_class"] = mclass
        r["side_classes"] = sclasses
        r["main_meta"] = mmeta

    # Inventory calculation strictly on the clean, resolved learning pool
    # (Train + Val + Test + Auxiliary Holdout, excluding eval_excluded and unresolved_path_excluded)
    active_learning_pool = [
        r for r in observations_records
        if r["split"] in ("train", "val", "test", "auxiliary_holdout")
    ]

    active_main_counts: Counter[str] = Counter()
    active_side_counts: Counter[str] = Counter()
    active_meal_type_counts: Counter[str] = Counter()
    excluded_low_sample_counts: Counter[str] = Counter()

    for r in active_learning_pool:
        mtype = r["meal_type"]
        mclass = r["main_class"]
        sclasses = r["side_classes"]
        mmeta = r["main_meta"]

        active_meal_type_counts[mtype] += 1
        if mtype == "meal":
            if mmeta.get("category") == "excluded_low_sample":
                excluded_low_sample_counts[mclass] += 1
            else:
                active_main_counts[mclass] += 1

            for sid in sclasses:
                active_side_counts[sid] += 1

    # Also calculate counts before 25 exclusion (for reference / continuity)
    pre_25_pool = [
        r for r in observations_records
        if r["split"] in ("train", "val", "test", "auxiliary_holdout", "unresolved_path_excluded")
    ]
    pre_25_main_counts: Counter[str] = Counter()
    pre_25_side_counts: Counter[str] = Counter()
    pre_25_excluded_low_sample_counts: Counter[str] = Counter()
    for r in pre_25_pool:
        if r["meal_type"] == "meal":
            if r["main_meta"].get("category") == "excluded_low_sample":
                pre_25_excluded_low_sample_counts[r["main_class"]] += 1
            else:
                pre_25_main_counts[r["main_class"]] += 1
            for sid in r["side_classes"]:
                pre_25_side_counts[sid] += 1

    # Unmapped free tags analysis on active learning pool
    flat_mapped_kws = [k for _, kws, _ in MAIN_MATCHERS_UPDATED for k in kws] + [k for _, kws in SIDE_MATCHERS for k in kws]
    total_free_tags = 0
    unmapped_free_tags = 0
    unmapped_counter: Counter[str] = Counter()

    for r in active_learning_pool:
        if r.get("meal_type") == "not_meal":
            continue
        for t in r["raw"].get("free_tags", []) or []:
            t_str = str(t)
            total_free_tags += 1
            if any(kw in t_str or t_str in kw for kw in flat_mapped_kws):
                pass
            else:
                unmapped_free_tags += 1
                unmapped_counter[t_str] += 1

    unmapped_rate = (unmapped_free_tags / total_free_tags) if total_free_tags > 0 else 0.0

    # Build detailed main inventory dict
    main_dish_inventory_final: Dict[str, Dict[str, Any]] = {}
    for tag in FINAL_MAIN_CLASSES:
        c_active = active_main_counts[tag]
        c_pre = pre_25_main_counts[tag]
        is_ref = tag in REFERENCE_EVAL_CLASSES
        status = "independent_standard" if not is_ref else "independent_reference_eval"
        desc = "標準評価（独立クラス確定）" if not is_ref else "参考値評価扱い（Step 0 既決ルール。自然な合流先なし）"
        if tag == "main_japanese_noodles":
            desc += "【うどん・そば合流新クラス】"
        main_dish_inventory_final[tag] = {
            "count_in_learning_pool": c_active,
            "count_pre_25_exclusion": c_pre,
            "status": status,
            "evaluation_mode": "reference_only" if is_ref else "standard",
            "description": desc,
        }

    side_dish_inventory_final: Dict[str, Dict[str, Any]] = {}
    for tag in FINAL_SIDE_CLASSES:
        c_active = active_side_counts[tag]
        c_pre = pre_25_side_counts[tag]
        side_dish_inventory_final[tag] = {
            "count_in_learning_pool": c_active,
            "count_pre_25_exclusion": c_pre,
            "status": "maintained",
            "description": "維持確定（正例数十分）",
        }

    out_dir = DEFAULT_OBSERVATION_DIR

    # 1. mapping_dictionary.json
    mapping_dict_artifact = {
        "metadata": {
            "version": "2.0.0",
            "updated_at": "2026-10-30",
            "description": "Observation free-text to personal dish classes mapping dictionary (Owner Final Decision).",
            "owner_decisions": {
                "japanese_noodles_merged": "うどん（18件）とそば（14件）を合流し、main_japanese_noodles（計32件）として新設。",
                "reference_evaluation_classes": [
                    "main_ethnic_gapao", "main_hotpot", "main_fried_rice", "main_sashimi_seafood"
                ],
                "excluded_low_sample_tags": [
                    "main_bal_ajillo", "main_simmered_meat_potato", "main_pasta"
                ],
                "path_unresolved_25_excluded": "blind_w2_2720〜2744の25件を学習プールから完全除外。",
            },
            "rules": {
                "main_dish": "short_caption が主題として挙げる料理。決められない写真は main_undetermined、対象外低頻度タグは main_excluded_low_sample として主菜学習対象外とする。",
                "side_dish": "visual_elements, free_tags, short_caption から抽出。読み取れない写真は side_none とする。",
                "non_meal": "ボトル単体・飲料単体等の非食事写真は not_meal として学習対象から外す。",
            },
        },
        "main_dish_mapping": {
            tag: {
                "keywords": kws,
                "role": role,
                "is_learning_target": role in ("standard", "reference_eval"),
                "is_reference_eval": role == "reference_eval",
            }
            for tag, kws, role in MAIN_MATCHERS_UPDATED
        },
        "side_dish_mapping": {
            tag: {"keywords": kws, "role": "standard", "is_learning_target": True}
            for tag, kws in SIDE_MATCHERS
        },
        "unmapped_free_tags_statistics": {
            "total_free_tags": total_free_tags,
            "mapped_free_tags": total_free_tags - unmapped_free_tags,
            "unmapped_free_tags": unmapped_free_tags,
            "unmapped_rate": round(unmapped_rate, 4),
            "top_30_unmapped_tags": unmapped_counter.most_common(30),
        },
    }
    with open(out_dir / "mapping_dictionary.json", "w", encoding="utf-8") as f:
        json.dump(mapping_dict_artifact, f, indent=2, ensure_ascii=False)

    # 2. inventory_report.json
    total_non_target_main = active_main_counts.get("main_undetermined", 0) + sum(excluded_low_sample_counts.values())
    inventory_artifact = {
        "metadata": {
            "status": "final_owner_decision_applied",
            "updated_at": "2026-10-30",
        },
        "learning_pool_summary": {
            "total_learning_pool_photos": len(active_learning_pool),
            "total_learning_pool_sessions": len(split_sids_map["train"] | split_sids_map["val"] | split_sids_map["test"] | split_sids_map["auxiliary_holdout"]),
            "meal_photos": active_meal_type_counts.get("meal", 0),
            "non_meal_photos": active_meal_type_counts.get("not_meal", 0),
        },
        "main_dish_inventory": main_dish_inventory_final,
        "side_dish_inventory": side_dish_inventory_final,
        "main_dish_non_learning_targets": {
            "total_main_learning_excluded": total_non_target_main,
            "main_undetermined_count": active_main_counts.get("main_undetermined", 0),
            "excluded_low_sample_tags_count": sum(excluded_low_sample_counts.values()),
            "excluded_low_sample_details": dict(excluded_low_sample_counts),
            "not_meal_count": active_meal_type_counts.get("not_meal", 0),
        },
        "side_none_count": active_side_counts.get("side_none", 0),
    }
    with open(out_dir / "inventory_report.json", "w", encoding="utf-8") as f:
        json.dump(inventory_artifact, f, indent=2, ensure_ascii=False)

    # 3. session_splits_manifest.json
    splits_manifest_artifact = {
        "metadata": {
            "version": "2.0.0",
            "generated_at": "2026-10-30",
            "total_photos": len(observations_records),
            "total_sessions": len(sessions),
            "audit_session_disjointness_passed": audit_passed,
            "audit_errors": audit_errors,
            "owner_decision_notes": "25 path-unresolved records (blind_w2_2720..2744) excluded to unresolved_path_excluded.",
        },
        "split_summary_final": {
            sp: {
                "photos": post_exclusion_split_counts[sp],
                "sessions": len(split_sids_map[sp]),
            }
            for sp in [
                "train",
                "val",
                "test",
                "auxiliary_holdout",
                "eval_excluded",
                "unresolved_path_excluded",
            ]
        },
        "unresolved_25_exclusion_breakdown": dict(unresolved_split_breakdown),
        "split_summary_before_25_exclusion": pre_exclusion_split_counts,
        "splits": [
            {
                "image_id": r["image_id"],
                "photo_key": r["photo_key"],
                "session_id": r["session_id"],
                "split": r["split"],
                "original_split": r.get("original_split"),
                "shooting_datetime": r["dt"].isoformat() if r["dt"] else None,
                "meal_type": r.get("meal_type"),
                "main_class": r.get("main_class"),
                "is_main_learning_target": r["main_meta"].get("is_learning_target", False),
                "is_main_reference_eval": r["main_meta"].get("is_reference_eval", False),
                "side_classes": r.get("side_classes"),
            }
            for r in observations_records
        ],
    }
    with open(out_dir / "session_splits_manifest.json", "w", encoding="utf-8") as f:
        json.dump(splits_manifest_artifact, f, indent=2, ensure_ascii=False)

    return {
        "splits_final": post_exclusion_split_counts,
        "unresolved_25_breakdown": dict(unresolved_split_breakdown),
        "main_dish_counts_active": dict(active_main_counts),
        "side_dish_counts_active": dict(active_side_counts),
        "excluded_low_sample_details": dict(excluded_low_sample_counts),
        "main_undetermined_count": active_main_counts.get("main_undetermined", 0),
        "session_audit_passed": audit_passed,
    }


if __name__ == "__main__":
    res = run_full_pipeline()
    print(json.dumps(res, indent=2, ensure_ascii=False))
