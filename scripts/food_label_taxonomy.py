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
    "stew": "煮込み",
    "noodles": "麺類",
    "nimono": "煮物",
    "curry_rice": "カレーライス",
    "meat_and_potato_stew": "肉じゃが",
    "stir_fry": "炒め物",
    "grilled_meat": "焼肉・グリル肉",
    "pasta": "パスタ",
    "grilled_fish": "焼き魚",
    "fried_cutlet": "とんかつ",
    "rice_bowl": "丼もの",
    "sushi": "寿司",
    "ramen": "ラーメン",
    "udon": "うどん",
    "soba": "そば",
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
    "bento",
    "curry_rice",
    "dessert",
    "drink",
    "fish_dish",
    "meat_dish",
    "nimono_or_stew",
    "noodles",
    "other_food",
    "packaged_food",
    "pasta",
    "set_meal_or_multi_dish",
)

MEDIAPIPE_TRAINING_CLASS_MAP: Dict[str, str] = {
    "bento": "bento",
    "curry_rice": "curry_rice",
    "dessert": "dessert",
    "drink": "drink",
    "drinks": "drink",
    "grilled_fish": "fish_dish",
    "fried_cutlet": "meat_dish",
    "grilled_meat": "meat_dish",
    "meat_dish": "meat_dish",
    "stir_fry": "meat_dish",
    "meat_and_potato_stew": "nimono_or_stew",
    "nimono": "nimono_or_stew",
    "stew": "nimono_or_stew",
    "noodles": "noodles",
    "ramen": "noodles",
    "soba": "noodles",
    "udon": "noodles",
    "bread": "other_food",
    "egg": "other_food",
    "miso_soup": "other_food",
    "rice": "other_food",
    "rice_bowl": "other_food",
    "salad": "other_food",
    "side_dish": "other_food",
    "soup": "other_food",
    "sushi": "other_food",
    "packaged_food": "packaged_food",
    "pasta": "pasta",
    "multi_dish_table": "set_meal_or_multi_dish",
    "set_meal": "set_meal_or_multi_dish",
}

MEDIAPIPE_EXCLUDED_PRIMARY_KEYS = {
    "missing",
    "non_food",
    "unknown",
    "menu_or_text",
}

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
    key = str(primary_dish_key or "").strip().lower()
    normalized_scene_type = str(scene_type or "").strip().lower()
    reason_set = {
        str(reason or "").strip().lower()
        for reason in (review_reasons or [])
        if str(reason or "").strip()
    }
    if not is_food_related or normalized_scene_type == "non_food":
        return ""
    if key in MEDIAPIPE_EXCLUDED_PRIMARY_KEYS:
        return ""
    if "side_item_primary" in reason_set:
        return ""
    if allow_direct_training_class and key in MEDIAPIPE_TRAINING_CLASSES:
        return key
    return MEDIAPIPE_TRAINING_CLASS_MAP.get(key, "")


def resolve_primary_dish_label_ja(primary_dish_key: str, fallback: Any = "") -> str:
    label = PRIMARY_DISH_LABEL_JA.get(primary_dish_key)
    if label:
        return label
    return str(fallback).strip() if fallback is not None else ""
