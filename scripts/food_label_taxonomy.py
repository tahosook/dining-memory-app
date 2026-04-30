from __future__ import annotations

from typing import Any, Dict, Optional, Sequence


BROAD_PRIMARY_KEYS = {"meat_dish", "stew", "noodles"}

PRIMARY_DISH_LABEL_JA: Dict[str, str] = {
    "unknown": "不明",
    "set_meal": "定食",
    "multi_dish_table": "複数料理の食卓",
    "bento": "弁当",
    "dessert": "デザート",
    "drink": "ドリンク",
    "menu_or_text": "メニュー画像",
    "packaged_food": "包装食品",
    "meat_dish": "肉料理",
    "fried_meat": "肉の揚げ物",
    "stew": "煮込み",
    "noodles": "麺類",
    "nimono": "煮物",
    "curry_rice": "カレーライス",
    "meat_and_potato_stew": "肉じゃが",
    "stir_fry": "炒め物",
    "grilled_meat": "焼肉・グリル肉",
    "pasta": "パスタ",
    "pizza": "ピザ",
    "grilled_fish": "焼き魚",
    "fried_cutlet": "とんかつ",
    "fried_chicken": "唐揚げ",
    "fried_fish": "魚フライ",
    "fried_rice": "チャーハン",
    "fried_dumplings": "揚げ餃子",
    "fried_dumpling": "揚げ餃子",
    "rice_bowl": "丼もの",
    "rice_dish": "ご飯もの",
    "sushi": "寿司",
    "grilled_sushi": "焼き寿司",
    "sashimi": "刺身",
    "ramen": "ラーメン",
    "udon": "うどん",
    "soba": "そば",
    "sandwich": "サンドイッチ",
    "dim_sum": "点心",
    "breakfast": "朝食",
    "salad": "サラダ",
    "soup": "スープ",
    "miso_soup": "味噌汁",
    "rice": "ご飯",
    "bread": "パン",
    "egg": "卵料理",
    "side_dish": "副菜",
}

TRAINING_CLASS_MAP: Dict[str, str] = {
    "nimono": "simmered_dish",
    "meat_and_potato_stew": "simmered_dish",
    "stew": "simmered_dish_review",
    "curry_rice": "curry_rice",
    "meat_dish": "meat_dish_review",
    "stir_fry": "meat_dish",
    "grilled_meat": "meat_dish",
    "fried_cutlet": "fried_dish",
    "grilled_fish": "fish_dish",
    "noodles": "noodles_review",
    "ramen": "noodles",
    "udon": "noodles",
    "soba": "noodles",
    "pasta": "pasta",
    "rice_bowl": "rice_bowl",
    "sushi": "sushi",
    "bento": "bento",
    "dessert": "dessert",
    "drink": "drink",
    "salad": "salad",
}

MEDIAPIPE_TRAINING_CLASSES = (
    "curry_rice",
    "drink",
    "fish_dish",
    "fried_dish",
    "meat_dish",
    "noodles",
    "other_or_exclude",
    "simmered_dish",
    "stir_fry",
)

MEDIAPIPE_TRAINING_CLASS_MAP: Dict[str, str] = {
    "breakfast": "other_or_exclude",
    "bento": "other_or_exclude",
    "bread": "other_or_exclude",
    "curry_rice": "curry_rice",
    "dessert": "other_or_exclude",
    "dim_sum": "other_or_exclude",
    "drink": "drink",
    "drinks": "drink",
    "egg": "other_or_exclude",
    "fried_chicken": "fried_dish",
    "fried_cutlet": "fried_dish",
    "fried_dumpling": "fried_dish",
    "fried_dumplings": "fried_dish",
    "fried_fish": "fried_dish",
    "fried_meat": "fried_dish",
    "fried_rice": "other_or_exclude",
    "grilled_fish": "fish_dish",
    "grilled_sushi": "other_or_exclude",
    "grilled_meat": "meat_dish",
    "meat_dish": "meat_dish",
    "meat_and_potato_stew": "simmered_dish",
    "menu_or_text": "other_or_exclude",
    "miso_soup": "other_or_exclude",
    "multi_dish_table": "other_or_exclude",
    "nimono": "simmered_dish",
    "non_food": "other_or_exclude",
    "noodles": "noodles",
    "packaged_food": "other_or_exclude",
    "pasta": "noodles",
    "pickles": "other_or_exclude",
    "pizza": "other_or_exclude",
    "ramen": "noodles",
    "rice": "other_or_exclude",
    "rice_bowl": "other_or_exclude",
    "rice_dish": "other_or_exclude",
    "salad": "other_or_exclude",
    "sandwich": "other_or_exclude",
    "sauce": "other_or_exclude",
    "sashimi": "fish_dish",
    "set_meal": "other_or_exclude",
    "side_dish": "other_or_exclude",
    "soup": "other_or_exclude",
    "soba": "noodles",
    "stew": "simmered_dish",
    "stir_fry": "stir_fry",
    "sushi": "other_or_exclude",
    "udon": "noodles",
    "unknown": "other_or_exclude",
}

MEDIAPIPE_EXCLUDED_PRIMARY_KEYS = {
    "missing",
    "unknown",
}

MEDIAPIPE_OTHER_OR_EXCLUDE_CLASS = "other_or_exclude"
MEDIAPIPE_EXCLUDE_CANDIDATE_PRIMARY_KEYS = {
    "menu_or_text",
    "multi_dish_table",
    "non_food",
    "packaged_food",
    "set_meal",
    "unknown",
}
MEDIAPIPE_UNRESOLVED_PRIMARY_KEYS = {
    "missing",
    "unknown",
}
REVIEW_PRIORITY_BUCKETS = (
    "p1_unknown_candidates",
    "p2_broad_stew_meat_dish",
    "p3_side_item_primary",
    "p4_low_confidence",
    "p5_broad_noodles",
    "p9_other_review",
)

NON_CONCRETE_PRIMARY_KEYS = BROAD_PRIMARY_KEYS | {
    "unknown",
    "set_meal",
    "multi_dish_table",
    "menu_or_text",
    "packaged_food",
    "rice",
    "soup",
    "miso_soup",
    "salad",
    "pickles",
    "sauce",
    "side_dish",
    "bread",
    "egg",
    "drink",
    "drinks",
}


def derive_boolean_flags(
    *,
    primary_dish_key: str,
    scene_type: str,
    meal_style: str,
    serving_style: str,
) -> Dict[str, bool]:
    return {
        "is_drink_only": (
            primary_dish_key == "drink"
            or scene_type == "drink_only"
            or meal_style == "drink"
        ),
        "contains_multiple_dishes": (
            scene_type in {"set_meal", "multi_dish_table", "dessert_and_drink"}
            or meal_style in {"set_meal", "shared_table", "course_meal"}
            or serving_style in {"tray", "table_with_multiple_items"}
        ),
        "is_packaged_food": (
            primary_dish_key == "packaged_food"
            or scene_type == "packaged_food"
            or meal_style == "packaged"
            or serving_style == "package"
        ),
        "is_menu_or_text_only": (
            primary_dish_key == "menu_or_text"
            or scene_type == "menu_or_text"
            or serving_style == "menu_page"
        ),
    }


def derive_design_candidate_primary_key(
    *,
    primary_dish_key: str,
    review_reasons: Sequence[str],
) -> str:
    if primary_dish_key in NON_CONCRETE_PRIMARY_KEYS:
        return ""
    if any(reason in {"side_item_primary", "scene_dominant", "broad_primary"} for reason in review_reasons):
        return ""
    return primary_dish_key


def derive_training_class_candidate(
    primary_dish_key: str,
    *,
    review_reasons: Optional[Sequence[str]] = None,
) -> str:
    if primary_dish_key in {"unknown", "set_meal", "multi_dish_table", "menu_or_text"}:
        return ""
    if review_reasons and "side_item_primary" in review_reasons:
        return ""
    return TRAINING_CLASS_MAP.get(primary_dish_key, primary_dish_key)


def derive_mediapipe_training_class(
    primary_dish_key: str,
    *,
    review_reasons: Optional[Sequence[str]] = None,
    is_food_related: bool = True,
    scene_type: str = "",
    allow_direct_training_class: bool = True,
) -> str:
    return derive_mediapipe_training_class_coarse(
        primary_dish_key,
        review_reasons=review_reasons,
        is_food_related=is_food_related,
        scene_type=scene_type,
        allow_direct_training_class=allow_direct_training_class,
        include_unresolved=False,
    )


def derive_mediapipe_training_class_coarse(
    primary_dish_key: str,
    *,
    review_reasons: Optional[Sequence[str]] = None,
    is_food_related: bool = True,
    scene_type: str = "",
    allow_direct_training_class: bool = True,
    include_unresolved: bool = True,
) -> str:
    key = str(primary_dish_key or "").strip().lower()
    normalized_scene_type = str(scene_type or "").strip().lower()
    reason_set = {
        str(reason or "").strip().lower()
        for reason in (review_reasons or [])
        if str(reason or "").strip()
    }
    unresolved_class = MEDIAPIPE_OTHER_OR_EXCLUDE_CLASS if include_unresolved else ""
    if not is_food_related or normalized_scene_type == "non_food":
        return MEDIAPIPE_OTHER_OR_EXCLUDE_CLASS
    if key in MEDIAPIPE_UNRESOLVED_PRIMARY_KEYS:
        return unresolved_class
    if "side_item_primary" in reason_set:
        return unresolved_class
    if allow_direct_training_class and key in MEDIAPIPE_TRAINING_CLASSES:
        return key
    mapped = MEDIAPIPE_TRAINING_CLASS_MAP.get(key)
    if mapped:
        return mapped
    return unresolved_class


def is_mediapipe_training_target_unresolved(
    *,
    primary_dish_key: str,
    review_reasons: Optional[Sequence[str]] = None,
    is_food_related: bool = True,
    scene_type: str = "",
) -> bool:
    key = str(primary_dish_key or "").strip().lower()
    normalized_scene_type = str(scene_type or "").strip().lower()
    reason_set = {
        str(reason or "").strip().lower()
        for reason in (review_reasons or [])
        if str(reason or "").strip()
    }
    if key in MEDIAPIPE_UNRESOLVED_PRIMARY_KEYS:
        return True
    if "unknown_primary" in reason_set or "side_item_primary" in reason_set:
        return True
    return derive_mediapipe_training_class(
        key,
        review_reasons=review_reasons,
        is_food_related=is_food_related,
        scene_type=normalized_scene_type,
    ) == ""


def is_mediapipe_exclude_candidate_primary(
    *,
    primary_dish_key: str,
    is_food_related: bool = True,
    scene_type: str = "",
    meal_style: str = "",
) -> bool:
    key = str(primary_dish_key or "").strip().lower()
    normalized_scene_type = str(scene_type or "").strip().lower()
    normalized_meal_style = str(meal_style or "").strip().lower()
    if not is_food_related or normalized_scene_type == "non_food":
        return True
    if key in MEDIAPIPE_EXCLUDE_CANDIDATE_PRIMARY_KEYS:
        return True
    return normalized_scene_type in {"menu_or_text", "packaged_food"} or normalized_meal_style == "packaged"


def derive_review_priority_bucket(
    *,
    primary_dish_key: str,
    review_reasons: Optional[Sequence[str]] = None,
    needs_human_review: bool = False,
) -> str:
    key = str(primary_dish_key or "").strip().lower()
    reason_set = {
        str(reason or "").strip().lower()
        for reason in (review_reasons or [])
        if str(reason or "").strip()
    }
    if key == "unknown" or "unknown_primary" in reason_set:
        return "p1_unknown_candidates"
    if "broad_primary" in reason_set and key in {"stew", "meat_dish"}:
        return "p2_broad_stew_meat_dish"
    if "side_item_primary" in reason_set:
        return "p3_side_item_primary"
    if "low_confidence" in reason_set:
        return "p4_low_confidence"
    if "broad_primary" in reason_set and key == "noodles":
        return "p5_broad_noodles"
    if needs_human_review or reason_set:
        return "p9_other_review"
    return ""


def review_priority_rank(review_priority_bucket: str) -> int:
    try:
        return REVIEW_PRIORITY_BUCKETS.index(review_priority_bucket) + 1
    except ValueError:
        return 99


def resolve_primary_dish_label_ja(primary_dish_key: str, fallback: Any = "") -> str:
    label = PRIMARY_DISH_LABEL_JA.get(primary_dish_key)
    if label:
        return label
    return str(fallback).strip() if fallback is not None else ""
