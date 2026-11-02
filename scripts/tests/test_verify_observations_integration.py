#!/usr/bin/env python3
"""Unit tests for verify_observations_integration.py."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from scripts.verify_observations_integration import (
    ALL_13_KEYS,
    verify_observations_integration,
)


class TestVerifyObservationsIntegration(unittest.TestCase):
    def test_verify_observations_integration_success(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            jsonl_file = tmp_path / "obs.jsonl"
            mapping_file = tmp_path / "mapping.json"

            mapping_data = {
                "records": [
                    {"blind_id": "blind_w2_0001", "original_key": "meshi_1"},
                ]
            }
            mapping_file.write_text(json.dumps(mapping_data), encoding="utf-8")

            dummy_img = tmp_path / "sample.jpg"
            dummy_img.write_text("fake image content")

            base_record = {k: "test_val" for k in ALL_13_KEYS}
            base_record["image_id"] = "blind_A_001"
            base_record["meshi_key"] = "MESHI_20240101_120000"
            base_record["image_path"] = str(dummy_img)
            base_record["original_path"] = str(dummy_img)

            jsonl_file.write_text(
                json.dumps(base_record, ensure_ascii=False) + "\n",
                encoding="utf-8",
            )

            result = verify_observations_integration(jsonl_file, mapping_file)

            self.assertEqual(result["total_lines"], 1)
            self.assertEqual(result["image_id_stats"]["total_ids"], 1)
            self.assertEqual(result["image_id_stats"]["unique_ids"], 1)
            self.assertEqual(result["image_id_stats"]["duplicate_ids_count"], 0)
            self.assertEqual(result["image_id_stats"]["blind_a_count"], 1)
            self.assertEqual(result["path_resolution"]["either_path_exists_count"], 1)
            self.assertEqual(result["meshi_key_uniqueness"]["meshi_keys_present_count"], 1)
            self.assertEqual(result["meshi_key_uniqueness"]["duplicate_meshi_keys_count"], 0)

    def test_verify_observations_integration_missing_file(self):
        with self.assertRaises(FileNotFoundError):
            verify_observations_integration(Path("/non/existent/path/obs.jsonl"))

    def test_verify_observations_integration_duplicates(self):
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_path = Path(tmpdir)
            jsonl_file = tmp_path / "obs_dup.jsonl"

            r1 = {k: "v" for k in ALL_13_KEYS}
            r1["image_id"] = "blind_A_001"
            r1["meshi_key"] = "MESHI_dup"
            r1["image_path"] = ""
            r1["original_path"] = ""

            r2 = {k: "v" for k in ALL_13_KEYS}
            r2["image_id"] = "blind_A_001"
            r2["meshi_key"] = "MESHI_dup"
            r2["image_path"] = ""
            r2["original_path"] = ""

            with open(jsonl_file, "w", encoding="utf-8") as f:
                f.write(json.dumps(r1) + "\n")
                f.write(json.dumps(r2) + "\n")

            result = verify_observations_integration(jsonl_file)
            self.assertEqual(result["total_lines"], 2)
            self.assertEqual(result["image_id_stats"]["duplicate_ids_count"], 1)
            self.assertEqual(result["meshi_key_uniqueness"]["duplicate_meshi_keys_count"], 1)
            self.assertEqual(result["path_resolution"]["neither_path_exists_count"], 2)


if __name__ == "__main__":
    unittest.main()
