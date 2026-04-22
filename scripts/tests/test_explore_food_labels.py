from __future__ import annotations

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path
from unittest import mock


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


def make_stage_result(payload: dict[str, object]) -> dict[str, object]:
    content = json.dumps(payload, ensure_ascii=False)
    return {
        "request": {"stub": True},
        "raw_message_content": content,
        "response_json": {"message": {"content": content}},
    }


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

    def test_build_broad_refinement_prompt_limits_compare_set_per_broad_key(self) -> None:
        cases = {
            "stew": ["nimono", "curry_rice", "meat_and_potato_stew", "stew"],
            "meat_dish": ["stir_fry", "grilled_meat", "meat_dish"],
            "noodles": ["pasta", "noodles"],
        }

        for broad_key, compare_keys in cases.items():
            with self.subTest(broad_key=broad_key):
                prompt = MODULE.build_broad_refinement_prompt(
                    image_id="img-refine",
                    source_path="photos/refine.jpg",
                    coarse_normalized={
                        "primary_dish_key": broad_key,
                        "primary_dish_label_ja": "仮ラベル",
                        "primary_dish_candidates": [{"key": broad_key, "label_ja": "仮ラベル", "score": 0.61}],
                        "scene_type": "single_dish",
                        "review_reasons": ["scene_dominant"],
                    },
                )

                for compare_key in compare_keys:
                    self.assertIn(compare_key, prompt)

    def test_should_run_broad_refinement_depends_only_on_primary_key(self) -> None:
        self.assertTrue(
            MODULE.should_run_broad_refinement(
                {
                    "primary_dish_key": "stew",
                    "scene_type": "multi_dish_table",
                    "review_reasons": ["scene_dominant"],
                }
            )
        )
        self.assertFalse(
            MODULE.should_run_broad_refinement(
                {
                    "primary_dish_key": "grilled_fish",
                    "scene_type": "multi_dish_table",
                    "review_reasons": ["scene_dominant"],
                }
            )
        )

    def test_process_single_image_resolves_broad_primary_with_fine_stage(self) -> None:
        coarse_payload = make_raw_result(
            primary_dish_key="stew",
            primary_dish_label_ja="煮込み",
            primary_dish_candidates=[
                {"key": "stew", "label_ja": "煮込み", "score": 0.66},
                {"key": "nimono", "label_ja": "煮物", "score": 0.61},
            ],
            scene_type="single_dish",
            meal_style="single_item",
            serving_style="single_bowl",
            analysis_confidence=0.66,
        )
        fine_payload = {
            "primary_dish_key": "nimono",
            "primary_dish_label_ja": "煮物",
            "primary_dish_candidates": [
                {"key": "nimono", "label_ja": "煮物", "score": 0.84},
                {"key": "stew", "label_ja": "煮込み", "score": 0.4},
            ],
            "analysis_confidence": 0.84,
            "review_note_ja": "",
        }

        result, normalized_payload, raw_payload, calls = self.run_process_single_image(
            [make_stage_result(coarse_payload), make_stage_result(fine_payload)]
        )

        self.assertEqual(result["primary_dish_key"], "nimono")
        self.assertEqual(result["coarse_primary_dish_key"], "stew")
        self.assertEqual(result["broad_refinement_status"], "resolved")
        self.assertEqual(result["broad_refinement_compare_keys"], ["nimono", "curry_rice", "meat_and_potato_stew", "stew"])
        self.assertEqual(normalized_payload["primary_dish_key"], "nimono")
        self.assertNotIn("broad_primary", normalized_payload["review_reasons"])
        self.assertIn("broad_refinement", raw_payload)
        self.assertEqual(raw_payload["broad_refinement"]["compare_keys"], ["nimono", "curry_rice", "meat_and_potato_stew", "stew"])
        self.assertEqual(calls[0]["format_schema"], MODULE.FORMAT_SCHEMA)
        self.assertEqual(calls[1]["format_schema"], MODULE.BROAD_REFINEMENT_FORMAT_SCHEMA)

    def test_process_single_image_keeps_broad_primary_when_fine_stage_cannot_resolve(self) -> None:
        coarse_payload = make_raw_result(
            primary_dish_key="meat_dish",
            primary_dish_label_ja="肉料理",
            primary_dish_candidates=[
                {"key": "meat_dish", "label_ja": "肉料理", "score": 0.63},
                {"key": "grilled_meat", "label_ja": "焼肉系", "score": 0.49},
            ],
            analysis_confidence=0.63,
        )
        fine_payload = {
            "primary_dish_key": "meat_dish",
            "primary_dish_label_ja": "肉料理",
            "primary_dish_candidates": [
                {"key": "meat_dish", "label_ja": "肉料理", "score": 0.58},
                {"key": "grilled_meat", "label_ja": "焼肉系", "score": 0.47},
            ],
            "analysis_confidence": 0.58,
            "review_note_ja": "焼きか炒めか判別困難",
        }

        result, normalized_payload, raw_payload, _calls = self.run_process_single_image(
            [make_stage_result(coarse_payload), make_stage_result(fine_payload)]
        )

        self.assertEqual(result["primary_dish_key"], "meat_dish")
        self.assertEqual(result["broad_refinement_status"], "kept_broad")
        self.assertTrue(result["needs_human_review"])
        self.assertIn("broad_primary", result["review_reasons"])
        self.assertEqual(result["review_note_ja"], "焼きか炒めか判別困難")
        self.assertEqual(normalized_payload["broad_refinement_note_ja"], "焼きか炒めか判別困難")
        self.assertEqual(raw_payload["broad_refinement"]["response_json"]["message"]["content"], json.dumps(fine_payload, ensure_ascii=False))

    def test_process_single_image_falls_back_to_coarse_when_fine_stage_fails(self) -> None:
        coarse_payload = make_raw_result(
            primary_dish_key="stew",
            primary_dish_label_ja="煮込み",
            primary_dish_candidates=[
                {"key": "stew", "label_ja": "煮込み", "score": 0.62},
                {"key": "curry_rice", "label_ja": "カレーライス", "score": 0.41},
            ],
            analysis_confidence=0.62,
        )

        result, normalized_payload, raw_payload, calls = self.run_process_single_image(
            [make_stage_result(coarse_payload), RuntimeError("fine stage timeout")]
        )

        self.assertEqual(result["primary_dish_key"], "stew")
        self.assertEqual(result["broad_refinement_status"], "failed")
        self.assertEqual(result["coarse_primary_dish_key"], "stew")
        self.assertTrue(result["needs_human_review"])
        self.assertIn("broad_primary", normalized_payload["review_reasons"])
        self.assertIn("error", raw_payload["broad_refinement"])
        self.assertIn("fine stage timeout", raw_payload["broad_refinement"]["error"])
        self.assertEqual(calls[1]["image_mode"], MODULE.FULL_IMAGE_MODE)

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

    def run_process_single_image(
        self,
        stage_results: list[object],
    ) -> tuple[dict[str, object], dict[str, object], dict[str, object], list[dict[str, object]]]:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            image_path = root / "photos" / "sample.jpg"
            image_path.parent.mkdir(parents=True, exist_ok=True)
            image_path.write_bytes(b"\xff\xd8\xff\xd9")
            normalized_path = root / "normalized" / "sample.jpg.json"
            raw_path = root / "raw" / "sample.jpg.response.json"

            calls: list[dict[str, object]] = []

            def fake_run_model_stage(**kwargs: object) -> dict[str, object]:
                calls.append(dict(kwargs))
                index = len(calls) - 1
                outcome = stage_results[index]
                if isinstance(outcome, Exception):
                    raise outcome
                return outcome

            with mock.patch.object(MODULE, "run_model_stage", side_effect=fake_run_model_stage):
                result = MODULE.process_single_image(
                    image_path=image_path,
                    relative_path=Path("photos/sample.jpg"),
                    image_id="img-process",
                    source_path="photos/sample.jpg",
                    normalized_path=normalized_path,
                    raw_path=raw_path,
                    model="stub-model",
                    timeout=30.0,
                )

            if result is None:
                raise AssertionError("Expected process_single_image to return a normalized record.")

            normalized_payload = json.loads(normalized_path.read_text(encoding="utf-8"))
            raw_payload = json.loads(raw_path.read_text(encoding="utf-8"))
            return result, normalized_payload, raw_payload, calls


if __name__ == "__main__":
    unittest.main()
