#!/usr/bin/env python3
"""Unit tests for verify-golden-dataset-v2 script."""

import csv
import hashlib
import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import importlib.util
spec = importlib.util.spec_from_file_location(
    "verify_golden_dataset_v2",
    str(Path(__file__).resolve().parent.parent / "verify-golden-dataset-v2.py")
)
verify_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify_mod)


class TestVerifyGoldenDatasetV2(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.repo_root = Path(self.test_dir)
        self.dataset_dir = self.repo_root / "state/mediapipe-dataset/golden_eval_v2"
        self.dataset_dir.mkdir(parents=True)
        self.test_sub_dir = self.dataset_dir / "test"
        self.test_sub_dir.mkdir()

    def tearDown(self):
        shutil.rmtree(self.test_dir)

    def _create_dummy_jpeg(self, path: Path, tag: bytes = b"") -> str:
        path.parent.mkdir(parents=True, exist_ok=True)
        # Valid JPEG: SOI (\xff\xd8), payload, EOI (\xff\xd9)
        content = b"\xff\xd8" + tag + b"\x00" * 150 + b"\xff\xd9"
        path.write_bytes(content)
        return hashlib.sha256(content).hexdigest()

    def test_verify_jpeg_health_valid(self):
        p = self.repo_root / "sample.jpg"
        self._create_dummy_jpeg(p)
        ok, reason = verify_mod.verify_jpeg_health(p)
        self.assertTrue(ok)
        self.assertEqual(reason, "OK")

    def test_verify_jpeg_health_truncated(self):
        p = self.repo_root / "truncated.jpg"
        p.write_bytes(b"\xff\xd8" + b"\x00" * 150)  # Missing EOI
        ok, reason = verify_mod.verify_jpeg_health(p)
        self.assertFalse(ok)
        self.assertIn("Invalid EOI marker", reason)

    def test_verify_jpeg_health_too_small(self):
        p = self.repo_root / "tiny.jpg"
        p.write_bytes(b"\xff\xd8\xff\xd9")  # Only 4 bytes
        ok, reason = verify_mod.verify_jpeg_health(p)
        self.assertFalse(ok)
        self.assertIn("File too small", reason)

    def test_main_success_flow(self):
        # Create minimal 2-sample setup
        p1 = self.test_sub_dir / "curry_rice" / "GOLDEN_V2_001_c1.jpg"
        sha1 = self._create_dummy_jpeg(p1, b"sample_1")
        p2 = self.test_sub_dir / "drink" / "GOLDEN_V2_002_d1.jpg"
        sha2 = self._create_dummy_jpeg(p2, b"sample_2")

        records = [
            {
                "golden_id": "GOLDEN_V2_001",
                "candidate_id": "CAND_001",
                "confirmed_label": "curry_rice",
                "sha256": sha1,
                "filename": "c1.jpg",
            },
            {
                "golden_id": "GOLDEN_V2_002",
                "candidate_id": "CAND_002",
                "confirmed_label": "drink",
                "sha256": sha2,
                "filename": "d1.jpg",
            },
        ]
        with open(self.dataset_dir / "manifest.jsonl", "w", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r) + "\n")

        with open(self.dataset_dir / "manifest.csv", "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(records[0].keys()))
            writer.writeheader()
            for r in records:
                writer.writerow(r)

        (self.dataset_dir / "labels.txt").write_text("curry_rice\ndrink\n", encoding="utf-8")

        test_args = [
            "verify-golden-dataset-v2.py",
            "--dataset-dir", str(self.dataset_dir),
            "--expected-count", "2",
            "--allow-empty-classes",
        ]
        with patch("sys.argv", test_args), \
             patch.object(verify_mod, "collect_training_hashes", return_value={}):
            exit_code = verify_mod.main()
            self.assertEqual(exit_code, 0)

    def test_main_detects_leakage(self):
        p1 = self.test_sub_dir / "curry_rice" / "GOLDEN_V2_001_c1.jpg"
        sha1 = self._create_dummy_jpeg(p1)

        records = [
            {
                "golden_id": "GOLDEN_V2_001",
                "candidate_id": "CAND_001",
                "confirmed_label": "curry_rice",
                "sha256": sha1,
                "filename": "c1.jpg",
            },
        ]
        with open(self.dataset_dir / "manifest.jsonl", "w", encoding="utf-8") as f:
            for r in records:
                f.write(json.dumps(r) + "\n")

        with open(self.dataset_dir / "manifest.csv", "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(records[0].keys()))
            writer.writeheader()
            for r in records:
                writer.writerow(r)

        (self.dataset_dir / "labels.txt").write_text("curry_rice\n", encoding="utf-8")

        test_args = [
            "verify-golden-dataset-v2.py",
            "--dataset-dir", str(self.dataset_dir),
            "--expected-count", "1",
            "--allow-empty-classes",
        ]
        # Simulate that sha1 is in training hashes (LEAKAGE)
        with patch("sys.argv", test_args), \
             patch.object(verify_mod, "collect_training_hashes", return_value={sha1: "train/sample.jpg"}):
            exit_code = verify_mod.main()
            self.assertEqual(exit_code, 1)


if __name__ == "__main__":
    unittest.main()
