from __future__ import annotations

import csv
import json
import struct
import tempfile
import unittest
from pathlib import Path

from scripts.validate_zip2_audit_manifest import (
    AuditValidator,
    compute_sha256,
    extract_exif_dates,
    save_report_safely,
)


def make_dummy_jpeg(exif_dt: str | None = None, content_seed: bytes = b"") -> bytes:
    """Create a minimal JPEG image with optional Exif APP1 DateTimeOriginal."""
    if not exif_dt:
        return b"\xff\xd8" + content_seed + b"\xff\xd9"

    dt_bytes = exif_dt.encode("ascii") + b"\x00"
    if len(dt_bytes) < 20:
        dt_bytes += b"\x00" * (20 - len(dt_bytes))

    # Big-endian TIFF
    # Header: MM (0x4D4D), 42 (0x002A), IFD0 offset: 8
    # Tag 0x9003 (DateTimeOriginal), type 2 (ASCII), count 20, value_offset 26
    tiff = bytearray()
    tiff += b"MM\x00\x2a\x00\x00\x00\x08"
    tiff += struct.pack(">H", 1)
    tiff += struct.pack(">HHII", 0x9003, 2, 20, 26)
    tiff += struct.pack(">I", 0)
    tiff += dt_bytes

    app1_payload = b"Exif\x00\x00" + tiff
    length = len(app1_payload) + 2

    return b"\xff\xd8\xff\xe1" + struct.pack(">H", length) + app1_payload + content_seed + b"\xff\xd9"


class TestValidateZip2AuditManifest(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

        self.zip2_dir = self.root / "zip2"
        self.zip2_dir.mkdir(parents=True)

        self.labels_file = self.root / "labels.jsonl"
        self.manifest_csv = self.root / "manifest.csv"
        self.validation_json = self.root / "validation.json"

        self.batch250_dir = self.root / "batch250"
        (self.batch250_dir / "train" / "dish1").mkdir(parents=True)
        (self.batch250_dir / "val" / "dish1").mkdir(parents=True)
        (self.batch250_dir / "test" / "dish1").mkdir(parents=True)

        self.golden_eval_dir = self.root / "golden_eval"
        (self.golden_eval_dir / "test" / "dish1").mkdir(parents=True)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _setup_minimal_dataset(
        self,
        *,
        eval_time: str = "2024:01:01 12:00:00",
        candidate_time: str = "2024:01:02 12:00:00",
        candidate_exif: bool = True,
        candidate_role: str = "pseudo_label_candidate",
    ) -> None:
        """Helper to create a minimal 3-image synthetic dataset.

        Image 1: golden eval (protected_evaluation)
        Image 2: batch250 train (protected_baseline_train)
        Image 3: candidate / extra image
        """
        # Image 1: eval
        img1_data = make_dummy_jpeg(eval_time, b"img1")
        (self.zip2_dir / "MESHI_20240101_120000.jpg").write_bytes(img1_data)
        (self.golden_eval_dir / "test" / "dish1" / "eval1.jpg").write_bytes(img1_data)

        # Image 2: baseline train
        img2_data = make_dummy_jpeg("2024:01:01 18:00:00", b"img2")
        (self.zip2_dir / "MESHI_20240101_180000.jpg").write_bytes(img2_data)
        (self.batch250_dir / "train" / "dish1" / "train1.jpg").write_bytes(img2_data)

        # Image 3: candidate
        if candidate_exif:
            img3_data = make_dummy_jpeg(candidate_time, b"img3")
        else:
            img3_data = make_dummy_jpeg(None, b"img3")
        (self.zip2_dir / "MESHI_20240102_120000.jpg").write_bytes(img3_data)

        # labels.jsonl
        labels = [
            {"image_id": "img1", "source_path": "MESHI_20240101_120000.jpg", "primary_dish_key": "dish1"},
            {"image_id": "img2", "source_path": "MESHI_20240101_180000.jpg", "primary_dish_key": "dish1"},
            {"image_id": "img3", "source_path": "MESHI_20240102_120000.jpg", "primary_dish_key": "dish1"},
        ]
        with open(self.labels_file, "w", encoding="utf-8") as f:
            for l in labels:
                f.write(json.dumps(l) + "\n")

        # manifest.csv
        rows = [
            {
                "image_id": "img1",
                "source_path": "MESHI_20240101_120000.jpg",
                "primary_dish_key": "dish1",
                "coarse_primary_dish_key": "dish1",
                "mapped_class": "dish1",
                "analysis_confidence": "0.9",
                "assigned_role": "protected_evaluation",
                "role_assignment_reason": "golden_test",
                "nearest_eval_image": "",
                "nearest_eval_split": "",
                "nearest_eval_time_diff_sec": "0.0",
                "audit_status": "already_verified",
                "pseudo_label_status": "not_applicable",
                "review_notes": "",
            },
            {
                "image_id": "img2",
                "source_path": "MESHI_20240101_180000.jpg",
                "primary_dish_key": "dish1",
                "coarse_primary_dish_key": "dish1",
                "mapped_class": "dish1",
                "analysis_confidence": "0.9",
                "assigned_role": "protected_baseline_train",
                "role_assignment_reason": "b250_train",
                "nearest_eval_image": "MESHI_20240101_120000.jpg",
                "nearest_eval_split": "golden_test",
                "nearest_eval_time_diff_sec": "21600.0",
                "audit_status": "already_verified",
                "pseudo_label_status": "not_applicable",
                "review_notes": "",
            },
            {
                "image_id": "img3",
                "source_path": "MESHI_20240102_120000.jpg",
                "primary_dish_key": "dish1",
                "coarse_primary_dish_key": "dish1",
                "mapped_class": "dish1",
                "analysis_confidence": "0.9",
                "assigned_role": candidate_role,
                "role_assignment_reason": "sampled",
                "nearest_eval_image": "MESHI_20240101_120000.jpg",
                "nearest_eval_split": "golden_test",
                "nearest_eval_time_diff_sec": "86400.0",
                "audit_status": "not_selected_for_audit",
                "pseudo_label_status": "candidate_not_yet_approved" if candidate_role == "pseudo_label_candidate" else "not_applicable",
                "review_notes": "",
            },
        ]
        with open(self.manifest_csv, "w", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)

        # validation.json
        val_data = {
            "total_images": 3,
            "role_counts": {
                "protected_evaluation": 1,
                "protected_baseline_train": 1,
                candidate_role: 1,
            },
        }
        self.validation_json.write_text(json.dumps(val_data), encoding="utf-8")

    def test_exif_extraction(self) -> None:
        """Test EXIF DateTimeOriginal extraction from minimal JPEG."""
        dt_str = "2024:05:01 15:30:45"
        p = self.root / "test_exif.jpg"
        p.write_bytes(make_dummy_jpeg(dt_str))
        dates = extract_exif_dates(p)
        self.assertEqual(dates.get("DateTimeOriginal"), dt_str)

        p_no_exif = self.root / "test_no_exif.jpg"
        p_no_exif.write_bytes(make_dummy_jpeg(None))
        self.assertEqual(extract_exif_dates(p_no_exif), {})

    def test_clean_synthetic_dataset(self) -> None:
        """Verify that a clean synthetic dataset produces PASS for all mandatory checks and NOT_VERIFIED for seed 42."""
        self._setup_minimal_dataset()

        validator = AuditValidator(
            zip2_dir=self.zip2_dir,
            labels_jsonl=self.labels_file,
            manifest_csv=self.manifest_csv,
            validation_json=self.validation_json,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
        )
        report = validator.run_validation()

        self.assertEqual(report["items"]["dataset_correspondence"]["status"], "PASS")
        self.assertEqual(report["items"]["benchmark_eval_membership"]["status"], "PASS")
        self.assertEqual(report["items"]["roles_and_protection"]["status"], "PASS")
        self.assertEqual(report["items"]["time_proximity"]["status"], "PASS")
        self.assertEqual(report["items"]["exif_timestamp_safety"]["status"], "PASS")
        self.assertEqual(report["items"]["csv_json_consistency"]["summary_level_status"], "PASS")
        self.assertEqual(report["items"]["csv_json_consistency"]["record_level_status"], "NOT_VERIFIED")
        self.assertEqual(report["items"]["seed_42_reproducibility"]["status"], "NOT_VERIFIED")

        # Since no FAIL, but NOT_VERIFIED remains -> overall is NOT_VERIFIED
        self.assertEqual(report["overall_status"], "NOT_VERIFIED")

    def test_time_proximity_boundaries(self) -> None:
        """Test 60s and 3600s boundary conditions."""
        # 1. Candidate within 50s (<= 60s) -> both legacy and conservative FAIL
        self._setup_minimal_dataset(
            eval_time="2024:01:01 12:00:00",
            candidate_time="2024:01:01 12:00:50",
            candidate_role="pseudo_label_candidate",
        )
        validator = AuditValidator(
            zip2_dir=self.zip2_dir,
            labels_jsonl=self.labels_file,
            manifest_csv=self.manifest_csv,
            validation_json=self.validation_json,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
        )
        report = validator.run_validation()
        self.assertEqual(report["items"]["time_proximity"]["legacy_60s_status"], "FAIL")
        self.assertEqual(report["items"]["time_proximity"]["conservative_3600s_status"], "FAIL")
        self.assertEqual(report["items"]["time_proximity"]["status"], "FAIL")
        self.assertEqual(report["overall_status"], "FAIL")

        # 2. Candidate within 2000s (>60s but <=3600s) -> legacy 60s PASS, conservative 3600s FAIL
        self._setup_minimal_dataset(
            eval_time="2024:01:01 12:00:00",
            candidate_time="2024:01:01 12:33:20",  # 2000s diff
            candidate_role="pseudo_label_candidate",
        )
        validator = AuditValidator(
            zip2_dir=self.zip2_dir,
            labels_jsonl=self.labels_file,
            manifest_csv=self.manifest_csv,
            validation_json=self.validation_json,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
        )
        report = validator.run_validation()
        self.assertEqual(report["items"]["time_proximity"]["legacy_60s_status"], "PASS")
        self.assertEqual(report["items"]["time_proximity"]["conservative_3600s_status"], "FAIL")
        self.assertEqual(report["items"]["time_proximity"]["status"], "FAIL")
        self.assertEqual(report["overall_status"], "FAIL")

        # 3. Same 2000s image but assigned to quarantine_candidate -> PASS
        self._setup_minimal_dataset(
            eval_time="2024:01:01 12:00:00",
            candidate_time="2024:01:01 12:33:20",
            candidate_role="quarantine_candidate",
        )
        validator = AuditValidator(
            zip2_dir=self.zip2_dir,
            labels_jsonl=self.labels_file,
            manifest_csv=self.manifest_csv,
            validation_json=self.validation_json,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
        )
        report = validator.run_validation()
        self.assertEqual(report["items"]["time_proximity"]["conservative_3600s_status"], "PASS")
        self.assertEqual(report["items"]["time_proximity"]["status"], "PASS")

    def test_missing_exif_in_pseudo_label_candidate(self) -> None:
        """Test that images without EXIF date in pseudo_label_candidate trigger FAIL."""
        self._setup_minimal_dataset(
            candidate_exif=False,
            candidate_role="pseudo_label_candidate",
        )
        validator = AuditValidator(
            zip2_dir=self.zip2_dir,
            labels_jsonl=self.labels_file,
            manifest_csv=self.manifest_csv,
            validation_json=self.validation_json,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
        )
        report = validator.run_validation()
        self.assertEqual(report["items"]["exif_timestamp_safety"]["status"], "FAIL")
        self.assertEqual(report["overall_status"], "FAIL")

    def test_missing_and_duplicate_images(self) -> None:
        """Test detection of missing images and duplicates in labels/manifest."""
        self._setup_minimal_dataset()

        # Remove raw image 3
        (self.zip2_dir / "MESHI_20240102_120000.jpg").unlink()

        validator = AuditValidator(
            zip2_dir=self.zip2_dir,
            labels_jsonl=self.labels_file,
            manifest_csv=self.manifest_csv,
            validation_json=self.validation_json,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
        )
        report = validator.run_validation()
        self.assertEqual(report["items"]["dataset_correspondence"]["status"], "FAIL")
        self.assertEqual(report["overall_status"], "FAIL")

    def test_duplicate_sha256_detection(self) -> None:
        """Test detection of duplicate content (identical SHA256) under different filenames."""
        self._setup_minimal_dataset()

        # Overwrite img3 content with img2 content (identical SHA256)
        img2_data = (self.zip2_dir / "MESHI_20240101_180000.jpg").read_bytes()
        (self.zip2_dir / "MESHI_20240102_120000.jpg").write_bytes(img2_data)

        validator = AuditValidator(
            zip2_dir=self.zip2_dir,
            labels_jsonl=self.labels_file,
            manifest_csv=self.manifest_csv,
            validation_json=self.validation_json,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
        )
        report = validator.run_validation()
        self.assertEqual(report["items"]["dataset_correspondence"]["status"], "FAIL")
        self.assertIn("Duplicate SHA-256", report["items"]["dataset_correspondence"]["errors"][0])

    def test_eval_leak_into_candidate(self) -> None:
        """Test detection of evaluation images assigned to pseudo_label_candidate."""
        self._setup_minimal_dataset()

        # Modify CSV so img1 (eval) is assigned pseudo_label_candidate
        with open(self.manifest_csv, "r", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
        rows[0]["assigned_role"] = "pseudo_label_candidate"
        with open(self.manifest_csv, "w", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            writer.writeheader()
            writer.writerows(rows)

        validator = AuditValidator(
            zip2_dir=self.zip2_dir,
            labels_jsonl=self.labels_file,
            manifest_csv=self.manifest_csv,
            validation_json=self.validation_json,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
        )
        report = validator.run_validation()
        self.assertEqual(report["items"]["roles_and_protection"]["status"], "FAIL")
        self.assertGreater(report["items"]["roles_and_protection"]["evidence"]["eval_leaks_count"], 0)

    def test_save_report_safely(self) -> None:
        """Test safe atomic report save and overwrite guard."""
        out_file = self.root / "sub" / "report.json"
        data = {"test": 123}

        # First write succeeds
        save_report_safely(data, out_file)
        self.assertTrue(out_file.is_file())
        self.assertEqual(json.loads(out_file.read_text()), data)

        # Second write without force raises FileExistsError
        with self.assertRaises(FileExistsError):
            save_report_safely({"test": 456}, out_file, force=False)

        # Second write with force succeeds
        save_report_safely({"test": 456}, out_file, force=True)
        self.assertEqual(json.loads(out_file.read_text())["test"], 456)


if __name__ == "__main__":
    unittest.main()
