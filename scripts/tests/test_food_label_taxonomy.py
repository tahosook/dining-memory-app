from __future__ import annotations

import unittest

from scripts.food_label_taxonomy import (
    derive_mediapipe_training_class,
    derive_mediapipe_training_class_coarse,
    derive_review_priority_bucket,
    resolve_primary_dish_label_ja,
)


class FoodLabelTaxonomyTests(unittest.TestCase):
    def test_maps_raw_primary_keys_to_coarse_mediapipe_classes(self) -> None:
        cases = {
            "fried_cutlet": "fried_dish",
            "fried_chicken": "fried_dish",
            "fried_fish": "fried_dish",
            "fried_dumplings": "fried_dish",
            "fried_dumpling": "fried_dish",
            "fried_meat": "fried_dish",
            "grilled_fish": "fish_dish",
            "sashimi": "fish_dish",
            "grilled_meat": "meat_dish",
            "meat_dish": "meat_dish",
            "nimono": "simmered_dish",
            "stew": "simmered_dish",
            "meat_and_potato_stew": "simmered_dish",
            "curry_rice": "curry_rice",
            "stir_fry": "stir_fry",
            "noodles": "noodles",
            "pasta": "noodles",
            "drink": "drink",
            "pizza": "other_or_exclude",
            "sushi": "other_or_exclude",
            "bento": "other_or_exclude",
            "packaged_food": "other_or_exclude",
            "unknown": "other_or_exclude",
        }

        for primary_key, expected_class in cases.items():
            with self.subTest(primary_key=primary_key):
                self.assertEqual(
                    derive_mediapipe_training_class_coarse(primary_key),
                    expected_class,
                )

    def test_unknown_is_visible_in_summary_but_not_auto_training_target(self) -> None:
        self.assertEqual(derive_mediapipe_training_class_coarse("unknown"), "other_or_exclude")
        self.assertEqual(derive_mediapipe_training_class("unknown"), "")

    def test_review_priority_bucket_order(self) -> None:
        self.assertEqual(
            derive_review_priority_bucket(
                primary_dish_key="unknown",
                review_reasons=["unknown_primary", "low_confidence"],
                needs_human_review=True,
            ),
            "p1_unknown_candidates",
        )
        self.assertEqual(
            derive_review_priority_bucket(
                primary_dish_key="stew",
                review_reasons=["broad_primary", "low_confidence"],
                needs_human_review=True,
            ),
            "p2_broad_stew_meat_dish",
        )
        self.assertEqual(
            derive_review_priority_bucket(
                primary_dish_key="rice",
                review_reasons=["side_item_primary", "low_confidence"],
                needs_human_review=True,
            ),
            "p3_side_item_primary",
        )
        self.assertEqual(
            derive_review_priority_bucket(
                primary_dish_key="fried_cutlet",
                review_reasons=["low_confidence"],
                needs_human_review=True,
            ),
            "p4_low_confidence",
        )
        self.assertEqual(
            derive_review_priority_bucket(
                primary_dish_key="noodles",
                review_reasons=["broad_primary"],
                needs_human_review=True,
            ),
            "p5_broad_noodles",
        )

    def test_major_label_ja_values_are_not_left_as_english_keys(self) -> None:
        keys = [
            "fried_chicken",
            "fried_fish",
            "fried_rice",
            "pizza",
            "sashimi",
            "sandwich",
            "fried_dumplings",
            "fried_dumpling",
            "rice_dish",
            "fried_meat",
            "dim_sum",
            "breakfast",
            "dessert",
            "bread",
            "bento",
            "packaged_food",
        ]

        for key in keys:
            with self.subTest(key=key):
                self.assertNotEqual(resolve_primary_dish_label_ja(key, key), key)


if __name__ == "__main__":
    unittest.main()
