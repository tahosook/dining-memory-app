from __future__ import annotations

import contextlib
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

    def test_build_user_prompt_discourages_scene_dominant_for_specific_dish(self) -> None:
        prompt = MODULE.build_user_prompt(image_id="img-001", source_path="photos/meal.jpg")

        self.assertIn("Do not include scene_dominant", prompt)
        self.assertIn("primary_dish_key is a specific dish", prompt)

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

    def test_normalize_result_removes_scene_dominant_for_specific_primary(self) -> None:
        normalized = MODULE.normalize_result(
            make_raw_result(
                primary_dish_key="grilled_fish",
                primary_dish_label_ja="焼き魚",
                primary_dish_candidates=[
                    {"key": "grilled_fish", "label_ja": "焼き魚", "score": 0.72},
                    {"key": "set_meal", "label_ja": "定食", "score": 0.31},
                ],
                supporting_items=["rice", "soup"],
                scene_type="multi_dish_table",
                meal_style="set_meal",
                review_reasons=["scene_dominant"],
                analysis_confidence=0.72,
            ),
            image_id="img-specific-scene",
            source_path="photos/specific-scene.jpg",
        )

        self.assertEqual(normalized["primary_dish_key"], "grilled_fish")
        self.assertNotIn("scene_dominant", normalized["review_reasons"])
        self.assertFalse(normalized["needs_human_review"])

    def test_normalize_result_keeps_scene_dominant_for_unresolved_set_meal(self) -> None:
        normalized = MODULE.normalize_result(
            make_raw_result(
                primary_dish_key="set_meal",
                primary_dish_label_ja="定食",
                primary_dish_candidates=[
                    {"key": "set_meal", "label_ja": "定食", "score": 0.58},
                    {"key": "rice", "label_ja": "ご飯", "score": 0.42},
                ],
                supporting_items=["rice", "soup"],
                scene_type="set_meal",
                meal_style="set_meal",
                review_reasons=[],
                analysis_confidence=0.58,
            ),
            image_id="img-set-meal",
            source_path="photos/set-meal.jpg",
        )

        self.assertEqual(normalized["primary_dish_key"], "set_meal")
        self.assertIn("scene_dominant", normalized["review_reasons"])
        self.assertTrue(normalized["needs_human_review"])

    def test_normalize_result_prefers_low_confidence_over_scene_dominant_for_set_meal(self) -> None:
        normalized = MODULE.normalize_result(
            make_raw_result(
                primary_dish_key="set_meal",
                primary_dish_label_ja="定食",
                primary_dish_candidates=[
                    {"key": "set_meal", "label_ja": "定食", "score": 0.45},
                    {"key": "rice", "label_ja": "ご飯", "score": 0.4},
                ],
                supporting_items=["rice", "soup"],
                scene_type="set_meal",
                meal_style="set_meal",
                review_reasons=[],
                analysis_confidence=0.45,
            ),
            image_id="img-set-meal-low-confidence",
            source_path="photos/set-meal-low-confidence.jpg",
        )

        self.assertEqual(normalized["primary_dish_key"], "set_meal")
        self.assertIn("low_confidence", normalized["review_reasons"])
        self.assertNotIn("scene_dominant", normalized["review_reasons"])
        self.assertTrue(normalized["needs_human_review"])

    def test_normalize_result_uses_top_level_confidence_when_candidate_scores_are_zero(self) -> None:
        normalized = MODULE.normalize_result(
            make_raw_result(
                primary_dish_key="fried_cutlet",
                primary_dish_label_ja="とんかつ",
                primary_dish_candidates=[
                    {"key": "fried_cutlet", "label_ja": "とんかつ", "score": 0.0},
                    {"key": "meat_dish", "label_ja": "肉料理", "score": 0.0},
                ],
                scene_type="set_meal",
                meal_style="set_meal",
                review_reasons=["low_confidence"],
                analysis_confidence=0.72,
            ),
            image_id="img-zero-scores",
            source_path="photos/zero-scores.jpg",
        )

        self.assertEqual(normalized["analysis_confidence"], 0.72)
        self.assertNotIn("low_confidence", normalized["review_reasons"])
        self.assertFalse(normalized["needs_human_review"])

    def test_merge_broad_refinement_clears_carried_review_state(self) -> None:
        merged = MODULE.merge_broad_refinement_into_raw_result(
            coarse_raw_result=make_raw_result(
                primary_dish_key="meat_dish",
                primary_dish_label_ja="肉料理",
                review_reasons=["broad_primary", "low_confidence"],
                needs_human_review=True,
            ),
            fine_raw_result={
                "primary_dish_key": "grilled_meat",
                "primary_dish_label_ja": "焼き肉",
                "primary_dish_candidates": [
                    {"key": "grilled_meat", "label_ja": "焼き肉", "score": 0.74},
                    {"key": "meat_dish", "label_ja": "肉料理", "score": 0.33},
                ],
                "analysis_confidence": 0.74,
                "review_note_ja": "",
            },
            coarse_primary_dish_key="meat_dish",
        )

        self.assertEqual(merged["review_reasons"], [])
        self.assertFalse(merged["needs_human_review"])

    def test_normalize_result_removes_broad_primary_for_specific_final_key(self) -> None:
        normalized = MODULE.normalize_result(
            make_raw_result(
                primary_dish_key="grilled_meat",
                primary_dish_label_ja="焼き肉",
                primary_dish_candidates=[
                    {"key": "grilled_meat", "label_ja": "焼き肉", "score": 0.88},
                    {"key": "meat_dish", "label_ja": "肉料理", "score": 0.31},
                ],
                scene_type="single_dish",
                meal_style="single_item",
                serving_style="single_plate",
                is_drink_only=False,
                review_reasons=["broad_primary"],
                analysis_confidence=0.88,
            ),
            image_id="img-final-specific",
            source_path="photos/final-specific.jpg",
        )

        self.assertNotIn("broad_primary", normalized["review_reasons"])
        self.assertFalse(normalized["needs_human_review"])

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

    def test_build_broad_refinement_prompt_strengthens_meat_dish_comparison(self) -> None:
        prompt = MODULE.build_broad_refinement_prompt(
            image_id="img-meat-refine",
            source_path="photos/meat.jpg",
            coarse_normalized={
                "primary_dish_key": "meat_dish",
                "primary_dish_label_ja": "肉料理",
                "primary_dish_candidates": [{"key": "meat_dish", "label_ja": "肉料理", "score": 0.58}],
                "scene_type": "single_dish",
                "review_reasons": ["broad_primary"],
            },
        )

        self.assertIn("stir-fried feel", prompt)
        self.assertIn("cooked meat pieces are visible with sauce", prompt)
        self.assertIn("yakiniku-like pieces", prompt)
        self.assertIn("for cooked meat served over or beside rice, prefer stir_fry", prompt)
        self.assertIn("choose that more specific key instead of meat_dish", prompt)

    def test_build_broad_refinement_prompt_strengthens_stew_to_nimono(self) -> None:
        prompt = MODULE.build_broad_refinement_prompt(
            image_id="img-stew-refine",
            source_path="photos/stew.jpg",
            coarse_normalized={
                "primary_dish_key": "stew",
                "primary_dish_label_ja": "煮込み",
                "primary_dish_candidates": [
                    {"key": "stew", "label_ja": "煮込み", "score": 0.58},
                    {"key": "nimono", "label_ja": "煮物", "score": 0.53},
                ],
                "scene_type": "single_dish",
                "review_reasons": ["broad_primary"],
            },
        )

        self.assertIn("stew-specific rule", prompt)
        self.assertIn("choose nimono instead of stew", prompt)
        self.assertIn("visible shaped ingredients", prompt)
        self.assertIn("do not keep stew merely because the sauce is thick/dark", prompt)
        self.assertIn("sauce/soup-heavy Western stew cues", prompt)

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

    def test_should_run_crop_refinement_depends_on_scene_review_or_broad(self) -> None:
        self.assertTrue(
            MODULE.should_run_crop_refinement(
                {
                    "primary_dish_key": "grilled_fish",
                    "scene_type": "set_meal",
                    "review_reasons": [],
                }
            )
        )
        self.assertTrue(
            MODULE.should_run_crop_refinement(
                {
                    "primary_dish_key": "grilled_fish",
                    "scene_type": "single_dish",
                    "review_reasons": ["scene_dominant"],
                }
            )
        )
        self.assertTrue(
            MODULE.should_run_crop_refinement(
                {
                    "primary_dish_key": "stew",
                    "scene_type": "single_dish",
                    "review_reasons": [],
                }
            )
        )
        self.assertFalse(
            MODULE.should_run_crop_refinement(
                {
                    "primary_dish_key": "grilled_fish",
                    "scene_type": "single_dish",
                    "review_reasons": [],
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
        crop_payload = make_raw_result(
            primary_dish_key="stew",
            primary_dish_label_ja="煮込み",
            primary_dish_candidates=[
                {"key": "stew", "label_ja": "煮込み", "score": 0.63},
                {"key": "nimono", "label_ja": "煮物", "score": 0.44},
            ],
            scene_type="single_dish",
            meal_style="single_item",
            serving_style="single_bowl",
            analysis_confidence=0.63,
        )

        result, normalized_payload, raw_payload, calls = self.run_process_single_image(
            [
                make_stage_result(coarse_payload),
                make_stage_result(crop_payload),
                make_stage_result(fine_payload),
            ],
            crop_candidates=[{"name": "center_large"}],
        )

        self.assertEqual(result["primary_dish_key"], "nimono")
        self.assertEqual(result["coarse_primary_dish_key"], "stew")
        self.assertEqual(result["crop_refinement_status"], "kept_full_image")
        self.assertEqual(result["broad_refinement_status"], "resolved")
        self.assertEqual(result["broad_refinement_compare_keys"], ["nimono", "curry_rice", "meat_and_potato_stew", "stew"])
        self.assertEqual(normalized_payload["primary_dish_key"], "nimono")
        self.assertNotIn("broad_primary", normalized_payload["review_reasons"])
        self.assertFalse(normalized_payload["needs_human_review"])
        self.assertIn("broad_refinement", raw_payload)
        self.assertIn("crop_refinement", raw_payload)
        self.assertEqual(raw_payload["broad_refinement"]["compare_keys"], ["nimono", "curry_rice", "meat_and_potato_stew", "stew"])
        self.assertEqual(calls[0]["format_schema"], MODULE.FORMAT_SCHEMA)
        self.assertEqual(calls[1]["format_schema"], MODULE.FORMAT_SCHEMA)
        self.assertEqual(calls[1]["image_mode"], MODULE.CROP_CANDIDATE_IMAGE_MODE)
        self.assertEqual(calls[2]["format_schema"], MODULE.BROAD_REFINEMENT_FORMAT_SCHEMA)
        self.assertEqual(calls[2]["image_mode"], MODULE.FULL_IMAGE_MODE)

    def test_process_single_image_applies_crop_for_scene_dominant_set_meal(self) -> None:
        coarse_payload = make_raw_result(
            primary_dish_key="set_meal",
            primary_dish_label_ja="定食",
            primary_dish_candidates=[
                {"key": "set_meal", "label_ja": "定食", "score": 0.61},
                {"key": "rice", "label_ja": "ご飯", "score": 0.35},
            ],
            scene_type="set_meal",
            meal_style="set_meal",
            serving_style="tray",
            analysis_confidence=0.61,
            review_reasons=["scene_dominant"],
        )
        crop_payload = make_raw_result(
            primary_dish_key="grilled_fish",
            primary_dish_label_ja="焼き魚",
            primary_dish_candidates=[
                {"key": "grilled_fish", "label_ja": "焼き魚", "score": 0.78},
                {"key": "set_meal", "label_ja": "定食", "score": 0.2},
            ],
            scene_type="single_dish",
            meal_style="single_item",
            serving_style="single_plate",
            analysis_confidence=0.78,
        )

        result, normalized_payload, raw_payload, _calls = self.run_process_single_image(
            [make_stage_result(coarse_payload), make_stage_result(crop_payload)],
            crop_candidates=[{"name": "lower_center_large"}],
        )

        self.assertEqual(result["primary_dish_key"], "grilled_fish")
        self.assertEqual(result["crop_refinement_status"], "applied")
        self.assertTrue(result["crop_refinement_applied"])
        self.assertEqual(result["crop_selected_index"], 0)
        self.assertEqual(result["broad_refinement_status"], "not_applicable")
        self.assertNotIn("scene_dominant", normalized_payload["review_reasons"])
        self.assertEqual(raw_payload["crop_refinement"]["selected_index"], 0)

    def test_process_single_image_keeps_full_image_when_crop_is_weak(self) -> None:
        coarse_payload = make_raw_result(
            primary_dish_key="set_meal",
            primary_dish_label_ja="定食",
            primary_dish_candidates=[
                {"key": "set_meal", "label_ja": "定食", "score": 0.62},
                {"key": "rice", "label_ja": "ご飯", "score": 0.34},
            ],
            scene_type="set_meal",
            meal_style="set_meal",
            serving_style="tray",
            analysis_confidence=0.62,
            review_reasons=["scene_dominant"],
        )
        crop_payload = make_raw_result(
            primary_dish_key="stew",
            primary_dish_label_ja="煮込み",
            primary_dish_candidates=[
                {"key": "stew", "label_ja": "煮込み", "score": 0.44},
                {"key": "set_meal", "label_ja": "定食", "score": 0.4},
            ],
            scene_type="single_dish",
            meal_style="single_item",
            serving_style="single_bowl",
            analysis_confidence=0.44,
        )

        result, normalized_payload, raw_payload, _calls = self.run_process_single_image(
            [make_stage_result(coarse_payload), make_stage_result(crop_payload)],
            crop_candidates=[{"name": "center_tight"}],
        )

        self.assertEqual(result["primary_dish_key"], "set_meal")
        self.assertEqual(result["crop_refinement_status"], "kept_full_image")
        self.assertFalse(result["crop_refinement_applied"])
        self.assertEqual(result["crop_candidate_count"], 1)
        self.assertEqual(normalized_payload["primary_dish_key"], "set_meal")
        self.assertEqual(raw_payload["crop_refinement"]["status"], "kept_full_image")

    def test_process_single_image_uses_selected_crop_for_broad_refinement(self) -> None:
        coarse_payload = make_raw_result(
            primary_dish_key="set_meal",
            primary_dish_label_ja="定食",
            primary_dish_candidates=[
                {"key": "set_meal", "label_ja": "定食", "score": 0.63},
                {"key": "rice", "label_ja": "ご飯", "score": 0.35},
            ],
            scene_type="set_meal",
            meal_style="set_meal",
            serving_style="tray",
            analysis_confidence=0.63,
            review_reasons=["scene_dominant"],
        )
        crop_payload = make_raw_result(
            primary_dish_key="stew",
            primary_dish_label_ja="煮込み",
            primary_dish_candidates=[
                {"key": "stew", "label_ja": "煮込み", "score": 0.68},
                {"key": "set_meal", "label_ja": "定食", "score": 0.2},
            ],
            scene_type="single_dish",
            meal_style="single_item",
            serving_style="single_bowl",
            analysis_confidence=0.68,
        )
        fine_payload = {
            "primary_dish_key": "nimono",
            "primary_dish_label_ja": "煮物",
            "primary_dish_candidates": [
                {"key": "nimono", "label_ja": "煮物", "score": 0.8},
                {"key": "stew", "label_ja": "煮込み", "score": 0.37},
            ],
            "analysis_confidence": 0.8,
            "review_note_ja": "",
        }

        result, normalized_payload, _raw_payload, calls = self.run_process_single_image(
            [
                make_stage_result(coarse_payload),
                make_stage_result(crop_payload),
                make_stage_result(fine_payload),
            ],
            crop_candidates=[{"name": "lower_center_large"}],
        )

        self.assertEqual(result["primary_dish_key"], "nimono")
        self.assertEqual(result["crop_refinement_status"], "applied")
        self.assertTrue(result["crop_refinement_applied"])
        self.assertEqual(normalized_payload["crop_selected_index"], 0)
        self.assertEqual(calls[2]["image_mode"], MODULE.CROP_SELECTED_IMAGE_MODE)

    def test_process_single_image_rescues_meat_dish_to_specific_candidate(self) -> None:
        coarse_payload = make_raw_result(
            primary_dish_key="meat_dish",
            primary_dish_label_ja="肉料理",
            primary_dish_candidates=[
                {"key": "meat_dish", "label_ja": "肉料理", "score": 0.6},
                {"key": "grilled_meat", "label_ja": "焼き肉系", "score": 0.5},
            ],
            scene_type="single_dish",
            meal_style="single_item",
            serving_style="single_plate",
            is_drink_only=False,
            analysis_confidence=0.6,
        )
        fine_payload = {
            "primary_dish_key": "meat_dish",
            "primary_dish_label_ja": "肉料理",
            "primary_dish_candidates": [
                {"key": "meat_dish", "label_ja": "肉料理", "score": 0.55},
                {"key": "grilled_meat", "label_ja": "焼き肉系", "score": 0.46},
            ],
            "analysis_confidence": 0.55,
            "review_note_ja": "焼きか炒めか判別困難",
        }
        crop_payload = make_raw_result(
            primary_dish_key="meat_dish",
            primary_dish_label_ja="肉料理",
            primary_dish_candidates=[
                {"key": "meat_dish", "label_ja": "肉料理", "score": 0.58},
                {"key": "grilled_meat", "label_ja": "焼き肉系", "score": 0.43},
            ],
            analysis_confidence=0.58,
        )

        result, normalized_payload, _raw_payload, _calls = self.run_process_single_image(
            [
                make_stage_result(coarse_payload),
                make_stage_result(crop_payload),
                make_stage_result(fine_payload),
            ],
            crop_candidates=[{"name": "center_large"}],
        )

        self.assertEqual(result["primary_dish_key"], "grilled_meat")
        self.assertEqual(result["crop_refinement_status"], "kept_full_image")
        self.assertEqual(result["broad_refinement_status"], "resolved")
        self.assertEqual(result["review_note_ja"], "")
        self.assertEqual(result["broad_refinement_note_ja"], "")
        self.assertNotIn("broad_primary", normalized_payload["review_reasons"])
        self.assertFalse(normalized_payload["needs_human_review"])

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
        crop_payload = make_raw_result(
            primary_dish_key="meat_dish",
            primary_dish_label_ja="肉料理",
            primary_dish_candidates=[
                {"key": "meat_dish", "label_ja": "肉料理", "score": 0.6},
                {"key": "grilled_meat", "label_ja": "焼肉系", "score": 0.43},
            ],
            analysis_confidence=0.6,
        )

        result, normalized_payload, raw_payload, _calls = self.run_process_single_image(
            [
                make_stage_result(coarse_payload),
                make_stage_result(crop_payload),
                make_stage_result(fine_payload),
            ],
            crop_candidates=[{"name": "center_large"}],
        )

        self.assertEqual(result["primary_dish_key"], "meat_dish")
        self.assertEqual(result["broad_refinement_status"], "kept_broad")
        self.assertTrue(result["needs_human_review"])
        self.assertIn("broad_primary", result["review_reasons"])
        self.assertEqual(result["review_note_ja"], "焼きか炒めか判別困難")
        self.assertEqual(normalized_payload["broad_refinement_note_ja"], "焼きか炒めか判別困難")
        self.assertEqual(raw_payload["broad_refinement"]["response_json"]["message"]["content"], json.dumps(fine_payload, ensure_ascii=False))

    def test_process_single_image_does_not_rescue_weak_meat_dish_candidate(self) -> None:
        coarse_payload = make_raw_result(
            primary_dish_key="meat_dish",
            primary_dish_label_ja="肉料理",
            primary_dish_candidates=[
                {"key": "meat_dish", "label_ja": "肉料理", "score": 0.62},
                {"key": "stir_fry", "label_ja": "炒め物", "score": 0.41},
            ],
            scene_type="single_dish",
            meal_style="single_item",
            serving_style="single_plate",
            is_drink_only=False,
            analysis_confidence=0.62,
        )
        fine_payload = {
            "primary_dish_key": "meat_dish",
            "primary_dish_label_ja": "肉料理",
            "primary_dish_candidates": [
                {"key": "meat_dish", "label_ja": "肉料理", "score": 0.58},
                {"key": "stir_fry", "label_ja": "炒め物", "score": 0.44},
            ],
            "analysis_confidence": 0.58,
            "review_note_ja": "炒め物か断定しにくい",
        }
        crop_payload = make_raw_result(
            primary_dish_key="meat_dish",
            primary_dish_label_ja="肉料理",
            primary_dish_candidates=[
                {"key": "meat_dish", "label_ja": "肉料理", "score": 0.59},
                {"key": "stir_fry", "label_ja": "炒め物", "score": 0.4},
            ],
            analysis_confidence=0.59,
        )

        result, normalized_payload, _raw_payload, _calls = self.run_process_single_image(
            [
                make_stage_result(coarse_payload),
                make_stage_result(crop_payload),
                make_stage_result(fine_payload),
            ],
            crop_candidates=[{"name": "center_large"}],
        )

        self.assertEqual(result["primary_dish_key"], "meat_dish")
        self.assertEqual(result["broad_refinement_status"], "kept_broad")
        self.assertIn("broad_primary", normalized_payload["review_reasons"])
        self.assertTrue(normalized_payload["needs_human_review"])

    def test_apply_conservative_broad_candidate_rescue_rescues_stew(self) -> None:
        rescued = MODULE.apply_conservative_broad_candidate_rescue(
            merged_raw_result={
                "primary_dish_key": "stew",
                "primary_dish_label_ja": "煮込み",
                "primary_dish_candidates": [
                    {"key": "stew", "label_ja": "煮込み", "score": 0.56},
                    {"key": "nimono", "label_ja": "煮物", "score": 0.5},
                ],
                "review_note_ja": "煮物か断定しにくい",
                "broad_refinement_note_ja": "煮物か断定しにくい",
            },
            coarse_primary_dish_key="stew",
        )

        self.assertEqual(rescued["primary_dish_key"], "nimono")
        self.assertEqual(rescued["review_note_ja"], "")

    def test_apply_conservative_broad_candidate_rescue_rescues_noodles(self) -> None:
        rescued = MODULE.apply_conservative_broad_candidate_rescue(
            merged_raw_result={
                "primary_dish_key": "noodles",
                "primary_dish_label_ja": "麺類",
                "primary_dish_candidates": [
                    {"key": "noodles", "label_ja": "麺類", "score": 0.58},
                    {"key": "pasta", "label_ja": "パスタ", "score": 0.53},
                ],
                "review_note_ja": "麺類のままでもよいか迷う",
                "broad_refinement_note_ja": "麺類のままでもよいか迷う",
            },
            coarse_primary_dish_key="noodles",
        )

        self.assertEqual(rescued["primary_dish_key"], "pasta")
        self.assertEqual(rescued["broad_refinement_note_ja"], "")

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
        crop_payload = make_raw_result(
            primary_dish_key="stew",
            primary_dish_label_ja="煮込み",
            primary_dish_candidates=[
                {"key": "stew", "label_ja": "煮込み", "score": 0.61},
                {"key": "curry_rice", "label_ja": "カレーライス", "score": 0.39},
            ],
            analysis_confidence=0.61,
        )

        result, normalized_payload, raw_payload, calls = self.run_process_single_image(
            [
                make_stage_result(coarse_payload),
                make_stage_result(crop_payload),
                RuntimeError("fine stage timeout"),
            ],
            crop_candidates=[{"name": "center_large"}],
        )

        self.assertEqual(result["primary_dish_key"], "stew")
        self.assertEqual(result["broad_refinement_status"], "failed")
        self.assertEqual(result["coarse_primary_dish_key"], "stew")
        self.assertTrue(result["needs_human_review"])
        self.assertIn("broad_primary", normalized_payload["review_reasons"])
        self.assertIn("error", raw_payload["broad_refinement"])
        self.assertIn("fine stage timeout", raw_payload["broad_refinement"]["error"])
        self.assertEqual(calls[2]["image_mode"], MODULE.FULL_IMAGE_MODE)

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
        *,
        crop_candidates: list[dict[str, object]] | None = None,
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

            with contextlib.ExitStack() as stack:
                stack.enter_context(mock.patch.object(MODULE, "run_model_stage", side_effect=fake_run_model_stage))
                if crop_candidates is not None:
                    patched_candidates = []
                    for index, candidate in enumerate(crop_candidates):
                        crop_path = root / f"crop-{index}.jpg"
                        crop_path.write_bytes(b"\xff\xd8\xff\xd9")
                        patched_candidates.append(
                            {
                                "index": index,
                                "name": candidate.get("name", f"crop-{index}"),
                                "box": candidate.get(
                                    "box",
                                    {"left": 0, "top": 0, "width": 120, "height": 120},
                                ),
                                "path": crop_path,
                            }
                        )

                    @contextlib.contextmanager
                    def fake_temporary_crop_candidates(*, prepared_path: Path):
                        del prepared_path
                        yield patched_candidates

                    stack.enter_context(
                        mock.patch.object(MODULE, "temporary_crop_candidates", fake_temporary_crop_candidates)
                    )

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
