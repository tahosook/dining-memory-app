#!/usr/bin/env python3
"""Unit tests for Universal 23-Class Dining Dataset Builder (Issue-24)."""
from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict, List

from scripts.build_universal_23class_dataset import (
    UNIVERSAL_23_CLASSES,
    Universal23ClassDatasetError,
    _record_text,
    assign_stratified_splits,
    build_universal_23class_dataset,
    classify_universal_23class,
    collect_protected_golden_meshi_keys,
    export_dataset_directories,
    extract_meshi_key,
)


class TestBuildUniversal23ClassDataset(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="test_univ_23_"))

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_universal_classes_count_and_uniqueness(self) -> None:
        self.assertEqual(len(UNIVERSAL_23_CLASSES), 23)
        self.assertEqual(len(set(UNIVERSAL_23_CLASSES)), 23)
        for cls in UNIVERSAL_23_CLASSES:
            self.assertFalse("plate" in cls and "nordic" in cls, "Must not contain tableware")
            self.assertFalse("sometsuke" in cls, "Must not contain tableware")

    def test_classify_universal_23class_priority(self) -> None:
        # Non-food
        rec_noise = {"short_caption": "眼鏡店の店頭スナップ写真"}
        self.assertEqual(classify_universal_23class(rec_noise), "non_food_exclude")

        # Drink bottle
        rec_drink = {"short_caption": "純米大吟醸の四合瓶ボトルラベル接写"}
        self.assertEqual(classify_universal_23class(rec_drink), "alcohol_drink_record")

        # Breakfast: Natto
        rec_b_natto = {"short_caption": "納豆パックと白ご飯とお味噌汁の朝ごはん"}
        self.assertEqual(classify_universal_23class(rec_b_natto), "breakfast_japanese_natto")

        # Breakfast: Toast
        rec_b_toast = {"short_caption": "バタートーストと目玉焼きの朝食プレート"}
        self.assertEqual(classify_universal_23class(rec_b_toast), "breakfast_western_toast")

        # Noodles: Ramen vs Udon vs Soba vs Pasta
        self.assertEqual(
            classify_universal_23class({"short_caption": "特製煮干しラーメン"}), "noodles_ramen"
        )
        self.assertEqual(
            classify_universal_23class({"short_caption": "煮込みうどん小鍋"}), "noodles_udon"
        )
        self.assertEqual(
            classify_universal_23class({"short_caption": "ざるそばと薬味"}), "noodles_soba"
        )
        self.assertEqual(
            classify_universal_23class({"short_caption": "トマトパスタスパゲッティ"}),
            "pasta_dishes",
        )

        # Fish unified: Salmon & Saba both map to teishoku_fish
        self.assertEqual(
            classify_universal_23class({"short_caption": "焼き鮭定食とお味噌汁"}),
            "teishoku_fish",
        )
        self.assertEqual(
            classify_universal_23class({"short_caption": "サバ塩焼き定食と小鉢"}),
            "teishoku_fish",
        )

        # Meat dishes
        self.assertEqual(
            classify_universal_23class({"short_caption": "豚肉の生姜焼き定食"}),
            "teishoku_pork_ginger_stirfry",
        )
        self.assertEqual(
            classify_universal_23class({"short_caption": "照り焼きチキンソテー"}),
            "teishoku_chicken",
        )
        self.assertEqual(
            classify_universal_23class({"short_caption": "鶏の唐揚げとキャベツ"}),
            "teishoku_fried_meat",
        )
        self.assertEqual(
            classify_universal_23class({"short_caption": "自家製手ごねハンバーグ"}),
            "teishoku_hamburg",
        )

    def test_tableware_and_setting_excluded_from_classification_text(self) -> None:
        rec = {
            "short_caption": "日々の食卓",
            "tableware_and_setting": "北欧大皿に盛られた特製ラーメンと染付小皿の焼き鮭",
        }
        text = _record_text(rec)
        self.assertNotIn("北欧大皿", text)
        self.assertNotIn("染付小皿", text)
        self.assertNotIn("ラーメン", text)
        self.assertNotIn("焼き鮭", text)
        cls = classify_universal_23class(rec)
        self.assertNotIn(cls, ("noodles_ramen", "teishoku_fish"))

    def test_golden_leakage_protection_and_splits(self) -> None:
        protected_key = "MESHI_20260420_120000"
        records: List[Dict[str, Any]] = [
            {"meshi_key": protected_key, "assigned_class": "teishoku_fish"},
        ]
        for i in range(1, 20):
            records.append({
                "meshi_key": f"MESHI_20260420_1200{i:02d}",
                "assigned_class": "teishoku_fish",
            })

        splits = assign_stratified_splits(
            records=records,
            label_key="assigned_class",
            protected_test_keys={protected_key},
            train_ratio=0.80,
            val_ratio=0.10,
        )

        # Pinned test key must strictly be in test
        self.assertEqual(splits[protected_key], "test")
        counts = [splits[r["meshi_key"]] for r in records]
        self.assertTrue(counts.count("train") > 10)
        self.assertTrue(counts.count("val") >= 1)
        self.assertTrue(counts.count("test") >= 1)

    def test_data_augmentation_applied_only_to_train_split(self) -> None:
        dataset_dir = self.temp_dir / "exported"
        src_dir = self.temp_dir / "src_images"
        src_dir.mkdir(parents=True)

        records: List[Dict[str, Any]] = []
        # Create 10 train, 2 val, 2 test records for a minority class
        cls = "teishoku_hamburg"
        for i in range(14):
            mk = f"MESHI_20260420_1300{i:02d}"
            split = "train" if i < 10 else ("val" if i < 12 else "test")
            img_file = src_dir / f"{mk}.jpg"
            img_file.write_bytes(b"\xFF\xD8\xFF\xE0dummy_jpg")
            records.append({"meshi_key": mk, "assigned_class": cls, "split": split})

        export_stats = export_dataset_directories(
            records=records,
            output_dir=dataset_dir,
            image_search_roots=[src_dir],
            link_mode="copy",
            augment_train_min_samples=15,  # Needs 5 more in train (10 -> 15)
        )

        self.assertEqual(export_stats["train_images"], 10)
        self.assertEqual(export_stats["val_images"], 2)
        self.assertEqual(export_stats["test_images"], 2)
        self.assertEqual(export_stats["augmented_train_images"], 5)

        # Check train directory has augmented files
        train_files = list((dataset_dir / "train" / cls).glob("*.jpg"))
        self.assertEqual(len(train_files), 15)
        train_aug_files = [f for f in train_files if "_aug_" in f.name]
        self.assertEqual(len(train_aug_files), 5)

        # CRITICAL TEST: val and test must NEVER contain _aug_ files
        val_files = list((dataset_dir / "val" / cls).glob("*.jpg"))
        self.assertEqual(len(val_files), 2)
        self.assertEqual(sum(1 for f in val_files if "_aug_" in f.name), 0)

        test_files = list((dataset_dir / "test" / cls).glob("*.jpg"))
        self.assertEqual(len(test_files), 2)
        self.assertEqual(sum(1 for f in test_files if "_aug_" in f.name), 0)

    def test_collect_protected_golden_fail_closed_when_missing_dir(self) -> None:
        missing_dir = self.temp_dir / "non_existent_golden_dir"
        with self.assertRaises(Universal23ClassDatasetError) as ctx:
            collect_protected_golden_meshi_keys(missing_dir, allow_missing_golden=False)
        self.assertIn("Golden Test Set directory not found", str(ctx.exception))

    def test_collect_protected_golden_fail_closed_when_empty_dir(self) -> None:
        empty_dir = self.temp_dir / "empty_golden_dir"
        empty_dir.mkdir(parents=True)
        with self.assertRaises(Universal23ClassDatasetError) as ctx:
            collect_protected_golden_meshi_keys(empty_dir, allow_missing_golden=False)
        self.assertIn("No valid protected MESHI keys found", str(ctx.exception))

    def test_collect_protected_golden_allowed_with_explicit_flag(self) -> None:
        missing_dir = self.temp_dir / "non_existent_golden_dir_2"
        res = collect_protected_golden_meshi_keys(missing_dir, allow_missing_golden=True)
        self.assertEqual(res, set())

        empty_dir = self.temp_dir / "empty_golden_dir_2"
        empty_dir.mkdir(parents=True)
        res_empty = collect_protected_golden_meshi_keys(empty_dir, allow_missing_golden=True)
        self.assertEqual(res_empty, set())


if __name__ == "__main__":
    unittest.main()
