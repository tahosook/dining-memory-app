#!/usr/bin/env python3
"""Unit tests for Personal 3-Axis Multi-Label Dataset Builder (Issue-25)."""
from __future__ import annotations

import json
import shutil
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict, List

from scripts.build_personal_3axis_dataset import (
    ALL_44_TAGS,
    PERSONAL_MAIN_TAGS,
    PERSONAL_SCENE_TAGS,
    PERSONAL_SIDE_TAGS,
    Personal3AxisDatasetError,
    _record_text,
    assign_record_level_splits,
    build_personal_3axis_dataset,
    collect_protected_golden_meshi_keys,
    export_multi_axis_directories,
    extract_meshi_key,
    extract_personal_3axis_tags,
)


class TestBuildPersonal3AxisDataset(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = Path(tempfile.mkdtemp(prefix="test_pers_3axis_"))

    def tearDown(self) -> None:
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_tag_taxonomy_counts_and_uniqueness(self) -> None:
        self.assertEqual(len(PERSONAL_MAIN_TAGS), 20)
        self.assertEqual(len(PERSONAL_SIDE_TAGS), 14)
        self.assertEqual(len(PERSONAL_SCENE_TAGS), 10)
        self.assertEqual(len(ALL_44_TAGS), 44)
        self.assertEqual(len(set(ALL_44_TAGS)), 44)

        # Confirm tableware words are not in tags
        for t in ALL_44_TAGS:
            self.assertFalse("plate" in t and "nordic" in t)
            self.assertFalse("sometsuke" in t)
            self.assertFalse("bowl" in t and "tableware" in t)

    def test_extract_personal_3axis_tags(self) -> None:
        rec = {
            "short_caption": "豚肉の生姜焼きとかぼちゃの煮物、具だくさん豚汁が並ぶ一汁三菜の夕食",
            "free_tags": ["生姜焼き", "かぼちゃ煮", "豚汁", "夕定食"],
        }
        tags = extract_personal_3axis_tags(rec)
        self.assertIn("main_pork_ginger_stirfry", tags["main"])
        self.assertIn("side_simmered_pumpkin", tags["side"])
        self.assertIn("side_tonjiru_soup", tags["side"])
        self.assertIn("scene_teishoku_multi_dish", tags["scene"])

    def test_tableware_and_setting_excluded_from_personal_tags(self) -> None:
        rec = {
            "short_caption": "日々の食事記録",
            "tableware_and_setting": "北欧大皿に盛られた生姜焼きと具だくさん豚汁",
        }
        text = _record_text(rec)
        self.assertNotIn("北欧大皿", text)
        self.assertNotIn("生姜焼き", text)
        self.assertNotIn("豚汁", text)
        tags = extract_personal_3axis_tags(rec)
        self.assertNotIn("main_pork_ginger_stirfry", tags["main"])
        self.assertNotIn("side_tonjiru_soup", tags["side"])

    def test_strict_data_leakage_prevention_across_splits(self) -> None:
        """CRITICAL TEST: Multi-labeled image must have all its tag folder copies inside the SAME split."""
        dataset_dir = self.temp_dir / "exported"
        src_dir = self.temp_dir / "src_images"
        src_dir.mkdir(parents=True)

        records: List[Dict[str, Any]] = []
        for i in range(30):
            mk = f"MESHI_20260420_1400{i:02d}"
            img_file = src_dir / f"{mk}.jpg"
            img_file.write_bytes(b"\xFF\xD8\xFF\xE0dummy_jpg")
            records.append({
                "meshi_key": mk,
                "extracted_tags": {
                    "main": ["main_pork_ginger_stirfry"],
                    "side": ["side_simmered_pumpkin", "side_tonjiru_soup"],
                    "scene": ["scene_teishoku_multi_dish"],
                },
            })

        # Assign split at record-level
        splits = assign_record_level_splits(records, protected_test_keys={"MESHI_20260420_140000"})
        for r in records:
            r["split"] = splits[r["meshi_key"]]

        # Golden protected key must be strictly in test
        self.assertEqual(splits["MESHI_20260420_140000"], "test")

        # Export multi-axis directory tree
        stats = export_multi_axis_directories(
            records=records,
            output_dir=dataset_dir,
            image_search_roots=[src_dir],
            link_mode="copy",
        )
        self.assertTrue(stats["train_tag_instances"] > 0)
        self.assertTrue(stats["val_tag_instances"] > 0)
        self.assertTrue(stats["test_tag_instances"] > 0)

        # Collect unique image keys per split across all tag subdirectories
        train_image_keys = set()
        for p in (dataset_dir / "train").glob("*/*.jpg"):
            train_image_keys.add(extract_meshi_key(p.name))

        val_image_keys = set()
        for p in (dataset_dir / "val").glob("*/*.jpg"):
            val_image_keys.add(extract_meshi_key(p.name))

        test_image_keys = set()
        for p in (dataset_dir / "test").glob("*/*.jpg"):
            test_image_keys.add(extract_meshi_key(p.name))

        # ZERO LEAKAGE ASSERTION: Train, Val, and Test must have completely disjoint image key sets!
        self.assertEqual(
            train_image_keys & val_image_keys,
            set(),
            "Data leakage detected between train and val!",
        )
        self.assertEqual(
            train_image_keys & test_image_keys,
            set(),
            "Data leakage detected between train and test!",
        )
        self.assertEqual(
            val_image_keys & test_image_keys,
            set(),
            "Data leakage detected between val and test!",
        )

    def test_collect_protected_golden_fail_closed_when_missing_dir(self) -> None:
        missing_dir = self.temp_dir / "non_existent_golden_dir"
        with self.assertRaises(Personal3AxisDatasetError) as ctx:
            collect_protected_golden_meshi_keys(missing_dir, allow_missing_golden=False)
        self.assertIn("Golden Test Set directory not found", str(ctx.exception))

    def test_collect_protected_golden_fail_closed_when_empty_dir(self) -> None:
        empty_dir = self.temp_dir / "empty_golden_dir"
        empty_dir.mkdir(parents=True)
        with self.assertRaises(Personal3AxisDatasetError) as ctx:
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
