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
    assign_record_level_splits,
    build_personal_3axis_dataset,
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


if __name__ == "__main__":
    unittest.main()
