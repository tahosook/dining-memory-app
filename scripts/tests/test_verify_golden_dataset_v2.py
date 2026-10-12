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

    def _write_canonical_labels_txt(self):
        classes = sorted(verify_mod.CANONICAL_CLASSES)
        (self.dataset_dir / "labels.txt").write_text("\n".join(classes) + "\n", encoding="utf-8")

    # -------------------------------------------------------------------------
    # 1. JPEG health tests
    # -------------------------------------------------------------------------
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

    # -------------------------------------------------------------------------
    # 2. Path safety tests (Prevention of path traversal)
    # -------------------------------------------------------------------------
    def test_validate_path_safety_valid(self):
        base = self.dataset_dir / "test"
        safe, reason = verify_mod.validate_path_safety(base, "curry_rice", "GOLDEN_001_sample.jpg")
        self.assertTrue(safe)
        self.assertEqual(reason, "")

    def test_validate_path_safety_detects_traversal(self):
        base = self.dataset_dir / "test"
        # Test directory escape attempt
        safe, reason = verify_mod.validate_path_safety(base, "..", "escape.jpg")
        self.assertFalse(safe)
        self.assertIn("Unsafe path component", reason)

        safe, reason = verify_mod.validate_path_safety(base, "curry_rice", "../../secret.txt")
        self.assertFalse(safe)
        self.assertIn("Unsafe path component", reason)

    def test_validate_path_safety_detects_invalid_chars(self):
        base = self.dataset_dir / "test"
        safe, reason = verify_mod.validate_path_safety(base, "curry_rice", "sample\x00injection.jpg")
        self.assertFalse(safe)
        self.assertIn("Unsafe path component", reason)

    # -------------------------------------------------------------------------
    # 3. labels.txt canonical validation tests
    # -------------------------------------------------------------------------
    def test_verify_labels_txt_valid(self):
        labels_path = self.dataset_dir / "labels.txt"
        self._write_canonical_labels_txt()
        errs = verify_mod.verify_labels_txt(labels_path)
        self.assertEqual(errs, [])

    def test_verify_labels_txt_missing_canonical_class(self):
        labels_path = self.dataset_dir / "labels.txt"
        # Omit 'stir_fry'
        classes = sorted(verify_mod.CANONICAL_CLASSES - {"stir_fry"})
        labels_path.write_text("\n".join(classes) + "\n", encoding="utf-8")
        errs = verify_mod.verify_labels_txt(labels_path)
        self.assertTrue(any("missing canonical classes" in e for e in errs))

    def test_verify_labels_txt_extraneous_class(self):
        labels_path = self.dataset_dir / "labels.txt"
        classes = sorted(verify_mod.CANONICAL_CLASSES) + ["unknown_food_type"]
        labels_path.write_text("\n".join(classes) + "\n", encoding="utf-8")
        errs = verify_mod.verify_labels_txt(labels_path)
        self.assertTrue(any("extraneous classes" in e for e in errs))

    def test_verify_labels_txt_duplicate_class(self):
        labels_path = self.dataset_dir / "labels.txt"
        classes = sorted(verify_mod.CANONICAL_CLASSES) + ["curry_rice"]
        labels_path.write_text("\n".join(classes) + "\n", encoding="utf-8")
        errs = verify_mod.verify_labels_txt(labels_path)
        self.assertTrue(any("Duplicate classes" in e for e in errs))

    # -------------------------------------------------------------------------
    # 4. Manifest reconciliation tests (JSONL vs CSV content)
    # -------------------------------------------------------------------------
    def test_manifest_reconciliation_exact_match(self):
        r1 = {"golden_id": "G001", "candidate_id": "C01", "confirmed_label": "drink", "sha256": "abc", "filename": "1.jpg"}
        r2 = {"golden_id": "G002", "candidate_id": "C02", "confirmed_label": "curry_rice", "sha256": "def", "filename": "2.jpg"}
        errs = verify_mod.reconcile_manifests([r1, r2], [r1, r2])
        self.assertEqual(errs, [])

    def test_manifest_reconciliation_detects_field_mismatch(self):
        r1_json = {"golden_id": "G001", "candidate_id": "C01", "confirmed_label": "drink", "sha256": "abc", "filename": "1.jpg"}
        r1_csv = {"golden_id": "G001", "candidate_id": "C01", "confirmed_label": "curry_rice", "sha256": "abc", "filename": "1.jpg"}  # label differs
        errs = verify_mod.reconcile_manifests([r1_json], [r1_csv])
        self.assertTrue(any("Mismatch in field 'confirmed_label'" in e for e in errs))

    def test_manifest_reconciliation_detects_missing_records(self):
        r1 = {"golden_id": "G001", "candidate_id": "C01", "confirmed_label": "drink", "sha256": "abc", "filename": "1.jpg"}
        r2 = {"golden_id": "G002", "candidate_id": "C02", "confirmed_label": "curry_rice", "sha256": "def", "filename": "2.jpg"}
        # r2 missing in CSV
        errs = verify_mod.reconcile_manifests([r1, r2], [r1])
        self.assertTrue(any("missing in CSV" in e for e in errs))

    # -------------------------------------------------------------------------
    # 5. Training data fail-closed leakage collection tests
    # -------------------------------------------------------------------------
    def test_collect_training_hashes_fails_if_required_dir_missing(self):
        # Temp repo root without required directories
        hashes, errs = verify_mod.collect_training_hashes(self.repo_root, expected_count=349)
        self.assertTrue(len(errs) > 0)
        self.assertTrue(any("Required baseline training directory missing" in e for e in errs))

    def test_collect_training_hashes_fails_if_count_mismatch(self):
        train_d1 = self.repo_root / "state/mediapipe-dataset/batch250_plus_agreed54/train/curry_rice"
        train_d1.mkdir(parents=True)
        sha1 = self._create_dummy_jpeg(train_d1 / "train_01.jpg", b"t1")

        # Create all 4 directories
        (self.repo_root / "state/mediapipe-dataset/batch250_plus_pseudo74/train").mkdir(parents=True)
        (self.repo_root / "state/mediapipe_labeling_runs/zip2-batch250/exported_dataset/train").mkdir(parents=True)
        (self.repo_root / "state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset/train").mkdir(parents=True)

        # Expected 349, but only 1 hash exists -> Must fail-closed
        hashes, errs = verify_mod.collect_training_hashes(self.repo_root, expected_count=349)
        self.assertTrue(any("Baseline training hash count mismatch" in e for e in errs))

    def test_collect_training_hashes_success_with_exact_count(self):
        train_d1 = self.repo_root / "state/mediapipe-dataset/batch250_plus_agreed54/train/curry_rice"
        train_d1.mkdir(parents=True)
        sha1 = self._create_dummy_jpeg(train_d1 / "train_01.jpg", b"t1")
        (self.repo_root / "state/mediapipe-dataset/batch250_plus_pseudo74/train").mkdir(parents=True)
        (self.repo_root / "state/mediapipe_labeling_runs/zip2-batch250/exported_dataset/train").mkdir(parents=True)
        (self.repo_root / "state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset/train").mkdir(parents=True)

        hashes, errs = verify_mod.collect_training_hashes(self.repo_root, expected_count=1)
        self.assertEqual(errs, [])
        self.assertIn(sha1, hashes)

    # -------------------------------------------------------------------------
    # 6. End-to-end main() flow and bidirectional reconciliation
    # -------------------------------------------------------------------------
    def test_main_success_flow(self):
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

        self._write_canonical_labels_txt()

        test_args = [
            "verify-golden-dataset-v2.py",
            "--dataset-dir", str(self.dataset_dir),
            "--expected-count", "2",
            "--allow-empty-classes",
            "--skip-train-leak-check",
        ]
        with patch("sys.argv", test_args):
            exit_code = verify_mod.main()
            self.assertEqual(exit_code, 0)

    def test_main_detects_extraneous_image_file(self):
        # Create valid image p1
        p1 = self.test_sub_dir / "curry_rice" / "GOLDEN_V2_001_c1.jpg"
        sha1 = self._create_dummy_jpeg(p1, b"sample_1")

        # Create extraneous image p_extra not in manifest
        p_extra = self.test_sub_dir / "curry_rice" / "extraneous.jpg"
        self._create_dummy_jpeg(p_extra, b"extra")

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

        self._write_canonical_labels_txt()

        test_args = [
            "verify-golden-dataset-v2.py",
            "--dataset-dir", str(self.dataset_dir),
            "--expected-count", "1",
            "--allow-empty-classes",
            "--skip-train-leak-check",
        ]
        with patch("sys.argv", test_args):
            exit_code = verify_mod.main()
            self.assertEqual(exit_code, 1)

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

        self._write_canonical_labels_txt()

        test_args = [
            "verify-golden-dataset-v2.py",
            "--dataset-dir", str(self.dataset_dir),
            "--expected-count", "1",
            "--allow-empty-classes",
        ]
        # Simulate that sha1 is in training hashes (LEAKAGE)
        with patch("sys.argv", test_args), \
             patch.object(verify_mod, "collect_training_hashes", return_value=({sha1: "train/sample.jpg"}, [])):
            exit_code = verify_mod.main()
            self.assertEqual(exit_code, 1)


if __name__ == "__main__":
    unittest.main()
