#!/usr/bin/env python3
"""Unit tests for build_personal_dual_dataset.py (Step 2 Dataset Builder)."""
from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict

from scripts.build_personal_dual_dataset import (
    PERSONAL_MAIN_16_CLASSES,
    PERSONAL_SIDE_15_CLASSES,
    UNIVERSAL_23_CLASSES,
    build_dual_datasets,
    classify_universal_23class,
    link_or_copy_file,
    load_blind_ext_lookup,
    resolve_image_path,
)


class TestBuildPersonalDualDataset(unittest.TestCase):
    def test_classify_universal_23class(self):
        # 1. Non food
        rec_non_food = {
            "short_caption": "眼鏡店の店頭でメガネを試着した写真",
            "visual_elements": ["メガネ"],
            "free_tags": ["眼鏡"],
        }
        self.assertEqual(classify_universal_23class(rec_non_food), "non_food_exclude")

        # 2. Pure alcohol bottle
        rec_alcohol = {
            "short_caption": "日本酒の四合瓶 純米吟醸 1639",
            "visual_elements": ["日本酒の四合瓶"],
            "free_tags": ["酒瓶", "純米吟醸"],
        }
        self.assertEqual(classify_universal_23class(rec_alcohol), "alcohol_drink_record")

        # 3. Japanese breakfast natto
        rec_natto = {
            "short_caption": "納豆パックと白ご飯の和朝食",
            "visual_elements": ["納豆", "白ご飯"],
            "free_tags": ["朝食", "和朝食"],
        }
        self.assertEqual(classify_universal_23class(rec_natto), "breakfast_japanese_natto")

        # 4. Western toast breakfast
        rec_toast = {
            "short_caption": "トーストとコーヒーの朝食",
            "visual_elements": ["食パン", "トースト"],
            "free_tags": ["トースト", "朝食"],
        }
        self.assertEqual(classify_universal_23class(rec_toast), "breakfast_western_toast")

        # 5. Grilled fish
        rec_fish = {
            "short_caption": "鮭の塩焼きと味噌汁の定食",
            "visual_elements": ["焼き鮭", "味噌汁"],
            "free_tags": ["焼き魚", "鮭"],
        }
        self.assertEqual(classify_universal_23class(rec_fish), "teishoku_fish")

    def test_resolve_image_path(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            repo_root = Path(tmpdir)
            img_dir = repo_root / "images"
            img_dir.mkdir(parents=True)
            real_img = img_dir / "real.jpg"
            real_img.write_text("dummy")

            ext_img = img_dir / "ext.jpg"
            ext_img.write_text("dummy_ext")

            ext_lookup = {
                "blind_ext_001": "images/ext.jpg",
                "blind_ext_images/blind_ext_002.jpg": "images/ext.jpg",
            }

            # Case 1: direct image_path exists
            rec1 = {"image_id": "img1", "image_path": "images/real.jpg"}
            self.assertEqual(resolve_image_path(rec1, ext_lookup, repo_root), real_img)

            # Case 2: image_path is mapped in ext_lookup
            rec2 = {"image_id": "img2", "image_path": "blind_ext_images/blind_ext_002.jpg"}
            self.assertEqual(resolve_image_path(rec2, ext_lookup, repo_root), ext_img)

            # Case 3: image_id is mapped in ext_lookup
            rec3 = {"image_id": "blind_ext_001"}
            self.assertEqual(resolve_image_path(rec3, ext_lookup, repo_root), ext_img)

            # Case 4: non-existent
            rec4 = {"image_id": "img4", "image_path": "images/missing.jpg"}
            self.assertIsNone(resolve_image_path(rec4, ext_lookup, repo_root))

    def test_build_dual_datasets_end_to_end(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            repo_root = tmp_path / "repo"
            repo_root.mkdir()

            # Monkeypatch _REPO_ROOT in module
            import scripts.build_personal_dual_dataset as bmod

            orig_repo_root = bmod._REPO_ROOT
            bmod._REPO_ROOT = repo_root

            try:
                # Create dummy images
                img_dir = repo_root / "test_imgs"
                img_dir.mkdir(parents=True)
                for i in range(1, 6):
                    (img_dir / f"img_{i}.jpg").write_text(f"dummy content {i}")

                # Create observations JSONL
                obs_file = tmp_path / "observations.jsonl"
                records = [
                    # 1: Train, meal, fish, side miso + natto
                    {
                        "image_id": "rec_001",
                        "image_path": "test_imgs/img_1.jpg",
                        "short_caption": "焼き鮭定食",
                        "visual_elements": ["焼き魚", "味噌汁", "納豆"],
                        "free_tags": ["焼き魚", "定食"],
                    },
                    # 2: Val, meal, curry, no side
                    {
                        "image_id": "rec_002",
                        "image_path": "test_imgs/img_2.jpg",
                        "short_caption": "カレーライス",
                        "visual_elements": ["カレー"],
                        "free_tags": ["カレーライス"],
                    },
                    # 3: Test, not_meal, alcohol
                    {
                        "image_id": "rec_003",
                        "image_path": "test_imgs/img_3.jpg",
                        "short_caption": "日本酒の四合瓶",
                        "visual_elements": ["日本酒"],
                        "free_tags": ["日本酒", "酒瓶"],
                    },
                    # 4: Auxiliary holdout (MUST BE SKIPPED)
                    {
                        "image_id": "rec_004",
                        "image_path": "test_imgs/img_4.jpg",
                        "short_caption": "ラーメン",
                        "visual_elements": ["ラーメン"],
                        "free_tags": ["ラーメン"],
                    },
                    # 5: Main undetermined (not a main learning target)
                    {
                        "image_id": "rec_005",
                        "image_path": "test_imgs/img_5.jpg",
                        "short_caption": "小鉢料理色々",
                        "visual_elements": ["冷奴"],
                        "free_tags": ["冷奴"],
                    },
                ]
                with open(obs_file, "w", encoding="utf-8") as f:
                    for r in records:
                        f.write(json.dumps(r, ensure_ascii=False) + "\n")

                # Create session splits manifest
                manifest_file = tmp_path / "splits_manifest.json"
                manifest = {
                    "metadata": {"version": "2.0.0"},
                    "splits": [
                        {
                            "image_id": "rec_001",
                            "split": "train",
                            "meal_type": "meal",
                            "main_class": "main_grilled_fish",
                            "is_main_learning_target": True,
                            "side_classes": ["side_miso_soup", "side_natto_pack"],
                        },
                        {
                            "image_id": "rec_002",
                            "split": "val",
                            "meal_type": "meal",
                            "main_class": "main_curry_hayashi",
                            "is_main_learning_target": True,
                            "side_classes": [],
                        },
                        {
                            "image_id": "rec_003",
                            "split": "test",
                            "meal_type": "not_meal",
                            "main_class": "not_meal",
                            "is_main_learning_target": False,
                            "side_classes": ["not_meal"],
                        },
                        {
                            "image_id": "rec_004",
                            "split": "auxiliary_holdout",
                            "meal_type": "meal",
                            "main_class": "main_ramen",
                            "is_main_learning_target": True,
                            "side_classes": [],
                        },
                        {
                            "image_id": "rec_005",
                            "split": "train",
                            "meal_type": "meal",
                            "main_class": "main_undetermined",
                            "is_main_learning_target": False,
                            "side_classes": ["side_tofu_hiyayakko"],
                        },
                    ],
                }
                with open(manifest_file, "w", encoding="utf-8") as f:
                    json.dump(manifest, f)

                blind_ext_file = tmp_path / "blind_ext.json"
                blind_ext_file.write_text(json.dumps({"records": []}))

                out_dir = tmp_path / "dataset_out"

                stats = build_dual_datasets(
                    observations_jsonl=obs_file,
                    splits_manifest_path=manifest_file,
                    blind_ext_path=blind_ext_file,
                    output_dir=out_dir,
                    link_mode="copy",
                )

                # Verification:
                # 1. Holdout skipped
                self.assertEqual(stats["skipped_holdout"], 1)
                self.assertFalse(any("rec_004" in str(p) for p in out_dir.rglob("*")))

                # 2. Universal dataset
                self.assertTrue((out_dir / "universal_dining_23class" / "train" / "teishoku_fish" / "rec_001__img_1.jpg").exists())
                self.assertTrue((out_dir / "universal_dining_23class" / "val" / "curry_hayashi_ethnic" / "rec_002__img_2.jpg").exists())
                self.assertTrue((out_dir / "universal_dining_23class" / "test" / "alcohol_drink_record" / "rec_003__img_3.jpg").exists())

                # 3. Personal Main Dish dataset
                self.assertTrue((out_dir / "personal_main_dish" / "train" / "main_grilled_fish" / "rec_001__img_1.jpg").exists())
                self.assertTrue((out_dir / "personal_main_dish" / "val" / "main_curry_hayashi" / "rec_002__img_2.jpg").exists())
                self.assertFalse(any("rec_003" in str(p) for p in (out_dir / "personal_main_dish").rglob("*")))
                self.assertFalse(any("rec_005" in str(p) for p in (out_dir / "personal_main_dish").rglob("*")))

                # 4. Personal Side Dish dataset
                self.assertTrue((out_dir / "personal_side_dish" / "train" / "side_miso_soup" / "rec_001__img_1.jpg").exists())
                self.assertTrue((out_dir / "personal_side_dish" / "train" / "side_natto_pack" / "rec_001__img_1.jpg").exists())
                self.assertTrue((out_dir / "personal_side_dish" / "val" / "side_none" / "rec_002__img_2.jpg").exists())
                self.assertFalse(any("rec_003" in str(p) for p in (out_dir / "personal_side_dish").rglob("*")))
                self.assertTrue((out_dir / "personal_side_dish" / "train" / "side_tofu_hiyayakko" / "rec_005__img_5.jpg").exists())

            finally:
                bmod._REPO_ROOT = orig_repo_root


if __name__ == "__main__":
    unittest.main()
