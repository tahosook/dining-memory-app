from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "explore-food-labels.py"
MODULE_NAME = "explore_food_labels_for_tests"


def load_module():
    spec = importlib.util.spec_from_file_location(MODULE_NAME, SCRIPT_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {SCRIPT_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


MODULE = load_module()


def make_raw_result(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "is_food_related": True,
        "analysis_confidence": 0.82,
        "primary_dish_key": "unknown",
        "primary_dish_label_ja": "不明",
        "primary_dish_candidates": [],
        "supporting_items": [],
        "scene_type": "drink_only",
        "cuisine_type": "drink",
        "meal_style": "drink",
        "serving_style": "cup_or_glass",
        "contains_multiple_dishes": False,
        "is_drink_only": True,
        "is_sweets_or_dessert": False,
        "is_packaged_food": False,
        "is_menu_or_text_only": False,
        "is_takeout_or_delivery": False,
        "visual_attributes": [],
        "uncertainty_reasons": [],
        "review_reasons": [],
        "free_tags": [],
        "review_note_ja": "",
        "needs_human_review": False,
    }
    payload.update(overrides)
    return payload


class ExploreFoodLabelsTests(unittest.TestCase):
    def test_build_user_prompt_mentions_container_hints(self) -> None:
        prompt = MODULE.build_user_prompt(image_id="img-001", source_path="photos/drink.jpg")

        self.assertIn("metal_can", prompt)
        self.assertIn("glass_bottle", prompt)
        self.assertIn("can_drink", prompt)
        self.assertIn("瓶飲料らしい", prompt)

    def test_format_schema_enums_do_not_add_can_or_bottle(self) -> None:
        schema = MODULE.FORMAT_SCHEMA

        self.assertNotIn("can", schema["properties"]["scene_type"]["enum"])
        self.assertNotIn("bottle", schema["properties"]["scene_type"]["enum"])
        self.assertNotIn("can", schema["properties"]["meal_style"]["enum"])
        self.assertNotIn("bottle", schema["properties"]["meal_style"]["enum"])
        self.assertNotIn("can", schema["properties"]["serving_style"]["enum"])
        self.assertNotIn("bottle", schema["properties"]["serving_style"]["enum"])

    def test_normalize_result_derives_bottle_review_metadata(self) -> None:
        normalized = MODULE.normalize_result(
            make_raw_result(
                visual_attributes=["glass_bottle", "label_visible", "tall_container"],
                free_tags=["sake_bottle"],
                review_note_ja="瓶飲料らしい",
                review_reasons=["unknown_primary"],
                analysis_confidence=0.22,
            ),
            image_id="img-bottle",
            source_path="photos/bottle.jpg",
        )

        self.assertEqual(normalized["container_hint"], "bottle")
        self.assertTrue(normalized["contains_can_or_bottle"])
        self.assertEqual(normalized["review_bucket"], "unknown_likely_bottle")

    def test_normalize_result_derives_can_review_metadata(self) -> None:
        normalized = MODULE.normalize_result(
            make_raw_result(
                visual_attributes=["metal_can"],
                free_tags=["beer_can"],
                review_reasons=["unknown_primary"],
                review_note_ja="缶飲料中心",
                analysis_confidence=0.18,
            ),
            image_id="img-can",
            source_path="photos/can.jpg",
        )

        self.assertEqual(normalized["container_hint"], "can")
        self.assertTrue(normalized["contains_can_or_bottle"])
        self.assertEqual(normalized["review_bucket"], "unknown_likely_can")

    def test_normalize_result_derives_unknown_other_without_container_hint(self) -> None:
        normalized = MODULE.normalize_result(
            make_raw_result(
                review_reasons=["unknown_primary"],
                review_note_ja="主料理不明",
                analysis_confidence=0.19,
            ),
            image_id="img-unknown",
            source_path="photos/unknown.jpg",
        )

        self.assertEqual(normalized["container_hint"], "none")
        self.assertFalse(normalized["contains_can_or_bottle"])
        self.assertEqual(normalized["review_bucket"], "unknown_other")

    def test_normalize_result_keeps_normal_bucket_when_no_review_needed(self) -> None:
        normalized = MODULE.normalize_result(
            make_raw_result(
                primary_dish_key="drink",
                primary_dish_label_ja="飲み物",
                visual_attributes=["glass_bottle"],
                free_tags=["bottle_drink"],
                review_note_ja="瓶飲料らしい",
                analysis_confidence=0.91,
            ),
            image_id="img-normal",
            source_path="photos/normal.jpg",
        )

        self.assertEqual(normalized["container_hint"], "bottle")
        self.assertTrue(normalized["contains_can_or_bottle"])
        self.assertFalse(normalized["needs_human_review"])
        self.assertEqual(normalized["review_bucket"], "normal")

    def test_normalize_result_preserves_existing_scene_inference(self) -> None:
        normalized = MODULE.normalize_result(
            make_raw_result(
                scene_type="drink_only",
                meal_style="drink",
                serving_style="cup_or_glass",
                primary_dish_key="drink",
                primary_dish_label_ja="飲み物",
                analysis_confidence=0.88,
            ),
            image_id="img-serving",
            source_path="photos/serving.jpg",
        )

        self.assertEqual(normalized["scene_type"], "drink_only")
        self.assertEqual(normalized["meal_style"], "drink")
        self.assertEqual(normalized["serving_style"], "cup_or_glass")

    def test_rebuild_labels_jsonl_copies_derived_fields(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            normalized_root = root / "normalized"
            labels_path = root / "labels.jsonl"
            normalized_root.mkdir(parents=True, exist_ok=True)

            record = MODULE.normalize_result(
                make_raw_result(
                    visual_attributes=["glass_bottle"],
                    free_tags=["sake_bottle"],
                    review_note_ja="瓶飲料らしい",
                    review_reasons=["unknown_primary"],
                    analysis_confidence=0.2,
                ),
                image_id="img-jsonl",
                source_path="photos/jsonl.jpg",
            )
            (normalized_root / "sample.json").write_text(
                json.dumps(record, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )

            MODULE.rebuild_labels_jsonl(normalized_root=normalized_root, labels_path=labels_path)

            line = labels_path.read_text(encoding="utf-8").strip()
            payload = json.loads(line)
            self.assertEqual(payload["container_hint"], "bottle")
            self.assertTrue(payload["contains_can_or_bottle"])
            self.assertEqual(payload["review_bucket"], "unknown_likely_bottle")


if __name__ == "__main__":
    unittest.main()
