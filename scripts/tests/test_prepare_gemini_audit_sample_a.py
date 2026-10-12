from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

from scripts.prepare_gemini_audit_sample_a import (
    EXPECTED_REMAINING_POPULATION,
    GeminiAuditSampleASampler,
    TARGET_CLASSES,
)
from scripts.tests.test_validate_zip2_audit_manifest import make_dummy_jpeg
from scripts.validate_zip2_audit_manifest import compute_sha256


class TestPrepareGeminiAuditSampleA(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

        self.image_dir = self.root / "images"
        self.image_dir.mkdir(parents=True)

        self.batch250_dir = self.root / "batch250"
        (self.batch250_dir / "train" / "curry_rice").mkdir(parents=True)
        (self.batch250_dir / "val" / "curry_rice").mkdir(parents=True)
        (self.batch250_dir / "test" / "curry_rice").mkdir(parents=True)

        self.golden_eval_dir = self.root / "golden_eval"
        (self.golden_eval_dir / "test" / "curry_rice").mkdir(parents=True)

        self.manifest_path = self.root / "manifest.csv"
        self.pilot_manifest_path = self.root / "pilot_manifest.csv"

        self.target_classes = TARGET_CLASSES

        # Setup synthetic dataset matching remaining population + 10 pilot per class
        # (curry_rice: 110 + 10 = 120, drink: 108 + 10 = 118, ...)
        self.pilot_rows: list[dict[str, str]] = []
        self.candidate_rows: list[dict[str, str]] = []

        # Pilot 70: exactly 10 per class
        for cls_name in self.target_classes:
            for i in range(10):
                img_name = f"pilot_{cls_name}_{i:02d}.jpg"
                img_data = make_dummy_jpeg("2024:01:01 12:00:00", f"pilot_{cls_name}_{i}".encode("ascii"))
                (self.image_dir / img_name).write_bytes(img_data)
                row = {
                    "image_id": f"pilot_{cls_name}_{i:02d}_jpg",
                    "source_path": img_name,
                    "mapped_class": cls_name,
                    "assigned_role": "pseudo_label_candidate",
                    "primary_dish_key": cls_name,
                    "analysis_confidence": "0.85",
                }
                self.pilot_rows.append(row)

        # Write pilot manifest
        with open(self.pilot_manifest_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(self.pilot_rows[0].keys()))
            writer.writeheader()
            writer.writerows(self.pilot_rows)

        # Remaining candidates: exactly matching EXPECTED_REMAINING_POPULATION
        for cls_name in self.target_classes:
            rem_count = EXPECTED_REMAINING_POPULATION[cls_name]
            for i in range(rem_count):
                img_name = f"candidate_{cls_name}_{i:03d}.jpg"
                img_data = make_dummy_jpeg("2024:02:01 12:00:00", f"cand_{cls_name}_{i}".encode("ascii"))
                (self.image_dir / img_name).write_bytes(img_data)
                row = {
                    "image_id": f"candidate_{cls_name}_{i:03d}_jpg",
                    "source_path": img_name,
                    "mapped_class": cls_name,
                    "assigned_role": "pseudo_label_candidate",
                    "primary_dish_key": cls_name,
                    "analysis_confidence": "0.80",
                }
                self.candidate_rows.append(row)

        # Add protected rows
        eval_img_name = "eval_001.jpg"
        eval_data = make_dummy_jpeg("2024:01:01 10:00:00", b"eval_content")
        (self.image_dir / eval_img_name).write_bytes(eval_data)
        (self.golden_eval_dir / "test" / "curry_rice" / eval_img_name).write_bytes(eval_data)
        eval_row = {
            "image_id": "eval_001_jpg",
            "source_path": eval_img_name,
            "mapped_class": "curry_rice",
            "assigned_role": "protected_evaluation",
            "primary_dish_key": "curry_rice",
            "analysis_confidence": "0.95",
        }

        train_img_name = "train_001.jpg"
        train_data = make_dummy_jpeg("2024:01:01 12:00:00", b"train_content")
        (self.image_dir / train_img_name).write_bytes(train_data)
        (self.batch250_dir / "train" / "curry_rice" / train_img_name).write_bytes(train_data)
        train_row = {
            "image_id": "train_001_jpg",
            "source_path": train_img_name,
            "mapped_class": "curry_rice",
            "assigned_role": "protected_baseline_train",
            "primary_dish_key": "curry_rice",
            "analysis_confidence": "0.95",
        }

        # Full manifest contains: pilot_rows + candidate_rows + protected rows
        all_rows = self.pilot_rows + self.candidate_rows + [eval_row, train_row]
        fieldnames = list(all_rows[0].keys())
        with open(self.manifest_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(all_rows)

        self.manifest_sha256 = compute_sha256(self.manifest_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_sample_a_deterministic_and_correct_counts(self) -> None:
        """Verify Sample A extracts exactly 40 per class (280 total) deterministically."""
        out_dir1 = self.root / "out1"
        sampler1 = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=40,
            seed=20261012,
        )
        res1 = sampler1.export(output_dir=out_dir1, strip_images=True, generated_at="2026-10-12T00:00:00Z")
        self.assertEqual(res1["total_sampled"], 280)

        # Verify second run produces byte-identical artifacts
        out_dir2 = self.root / "out2"
        sampler2 = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=40,
            seed=20261012,
        )
        res2 = sampler2.export(output_dir=out_dir2, strip_images=True, generated_at="2026-10-12T00:00:00Z")

        self.assertEqual(res1["csv_sha256"], res2["csv_sha256"])
        self.assertEqual(res1["jsonl_sha256"], res2["jsonl_sha256"])
        self.assertEqual(res1["blind_inputs_sha256"], res2["blind_inputs_sha256"])
        self.assertEqual(res1["mapping_sha256"], res2["mapping_sha256"])

    def test_pilot_70_strict_exclusion(self) -> None:
        """Verify none of the pilot 70 samples appear in Sample A."""
        out_dir = self.root / "out_pilot_excl"
        sampler = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=40,
            seed=20261012,
        )
        res = sampler.export(output_dir=out_dir, strip_images=False)

        with open(out_dir / "sample_manifest.csv") as f:
            sampled_ids = {r["image_id"] for r in csv.DictReader(f)}

        pilot_ids = {r["image_id"] for r in self.pilot_rows}
        self.assertEqual(len(sampled_ids), 280)
        self.assertTrue(sampled_ids.isdisjoint(pilot_ids))

    def test_protected_images_excluded(self) -> None:
        """Verify protected_evaluation and protected_baseline_train are excluded."""
        out_dir = self.root / "out_protected"
        sampler = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=self.image_dir,
            golden_eval_dir=self.golden_eval_dir,
            batch250_dir=self.batch250_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=40,
            seed=20261012,
        )
        sampler.export(output_dir=out_dir, strip_images=False)

        with open(out_dir / "sample_manifest.csv") as f:
            sampled_ids = {r["image_id"] for r in csv.DictReader(f)}

        self.assertNotIn("eval_001_jpg", sampled_ids)
        self.assertNotIn("train_001_jpg", sampled_ids)

    def test_blind_input_privacy(self) -> None:
        """Verify blind_request_inputs.jsonl leaks NO labels, class names, or original IDs."""
        out_dir = self.root / "out_blind"
        sampler = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=40,
            seed=20261012,
        )
        sampler.export(output_dir=out_dir, strip_images=False)

        blind_file = out_dir / "blind_request_inputs.jsonl"
        with open(blind_file) as f:
            lines = [json.loads(line) for line in f]

        self.assertEqual(len(lines), 280)
        forbidden_substrings = [
            "curry", "drink", "fish", "fried", "meat", "simmered", "stir",
            "candidate_", "pilot_", ".private", "confidence"
        ]

        for i, rec in enumerate(lines, 1):
            self.assertEqual(list(rec.keys()), ["blind_id", "image_file"])
            self.assertEqual(rec["blind_id"], f"sampleA_{i:03d}")
            self.assertEqual(rec["image_file"], f"sampleA_{i:03d}.jpg")
            rec_str = json.dumps(rec).lower()
            for sub in forbidden_substrings:
                self.assertNotIn(sub, rec_str)

    def test_population_mismatch_fails_fast(self) -> None:
        """Verify sampler fails fast if expected remaining population does not match."""
        # Mutate expected population: expect 111 instead of 110 for curry_rice
        bad_expected = dict(EXPECTED_REMAINING_POPULATION)
        bad_expected["curry_rice"] = 111

        sampler = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            expected_remaining_population=bad_expected,
            samples_per_class=40,
            seed=20261012,
        )

        with self.assertRaises(ValueError) as ctx:
            sampler.sample()
        self.assertIn("Remaining candidate population mismatch", str(ctx.exception))

    def test_manifest_sha256_mismatch_fails_fast(self) -> None:
        """Verify sampler fails fast if manifest hash does not match expected."""
        sampler = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            expected_manifest_sha256="bad_hash_00000000000000000000000000000000000000000000000000000000",
            samples_per_class=40,
            seed=20261012,
        )
        with self.assertRaises(ValueError) as ctx:
            sampler.sample()
        self.assertIn("Manifest SHA-256 mismatch", str(ctx.exception))

    def test_golden_eval_dir_missing_or_empty_fails_closed(self) -> None:
        """Verify fail-closed error when golden_eval_dir is missing or contains zero images."""
        empty_eval_dir = self.root / "empty_eval"
        empty_eval_dir.mkdir()
        sampler = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=empty_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
        )
        with self.assertRaises(RuntimeError) as ctx:
            sampler.sample(require_leak_check=True)
        self.assertIn("Golden evaluation dataset missing or empty", str(ctx.exception))

    def test_batch250_dir_missing_or_empty_fails_closed(self) -> None:
        """Verify fail-closed error when batch250_dir is missing or contains zero images."""
        empty_batch_dir = self.root / "empty_batch"
        empty_batch_dir.mkdir()
        sampler = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=self.image_dir,
            batch250_dir=empty_batch_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
        )
        with self.assertRaises(RuntimeError) as ctx:
            sampler.sample(require_leak_check=True)
        self.assertIn("Baseline dataset missing or empty", str(ctx.exception))

    def test_image_dir_missing_fails_closed(self) -> None:
        """Verify fail-closed error when image_dir is missing."""
        missing_image_dir = self.root / "nonexistent_images"
        sampler = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=missing_image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
        )
        with self.assertRaises(FileNotFoundError) as ctx:
            sampler.sample(require_leak_check=True)
        self.assertIn("Candidate image directory missing", str(ctx.exception))

    def test_unverified_leak_check_reports_false_when_skipped(self) -> None:
        """Verify that when leak check is skipped without images, metadata does NOT claim passed."""
        out_dir = self.root / "unverified_out"
        sampler = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=self.root / "nonexistent_images",
            expected_manifest_sha256=self.manifest_sha256,
        )
        res = sampler.export(output_dir=out_dir, strip_images=False, require_leak_check=False)
        meta = json.loads((out_dir / "provenance_metadata.json").read_text(encoding="utf-8"))
        self.assertFalse(meta["safety_verification"]["eval_leak_check_passed"])
        self.assertFalse(meta["safety_verification"]["baseline_leak_check_passed"])

    def test_expected_eval_and_baseline_count_mismatch_raises(self) -> None:
        """Regression test 8: Verify fail-closed when Sample A protected eval or baseline count does not match expected."""
        # 1. Eval count mismatch
        sampler_eval_mismatch = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            expected_eval_count=73,  # Synthetic test only has 1
            expected_baseline_train_count=1,
        )
        with self.assertRaises(RuntimeError) as ctx:
            sampler_eval_mismatch.sample(require_leak_check=True)
        self.assertIn("Protected evaluation dataset count mismatch: expected 73", str(ctx.exception))

        # 2. Baseline train count mismatch
        sampler_train_mismatch = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            expected_eval_count=1,
            expected_baseline_train_count=190,  # Synthetic test only has 1
        )
        with self.assertRaises(RuntimeError) as ctx:
            sampler_train_mismatch.sample(require_leak_check=True)
        self.assertIn("Baseline training dataset count mismatch: expected 190", str(ctx.exception))

        # 3. Matching counts pass
        sampler_matching = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            expected_eval_count=1,
            expected_baseline_train_count=1,
        )
        res = sampler_matching.sample(require_leak_check=True)
        self.assertTrue(res["leak_check_performed"])

    def test_partitioned_eval_counts_mismatch_raises(self) -> None:
        """Issue 4: Verify partitioned checks for Golden (7), val (33), test (33) in Sample A."""
        # 1. Golden count mismatch
        s_golden_mismatch = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            expected_golden_count=7,  # Synthetic test only has 1
            expected_val_count=0,
            expected_test_count=0,
            expected_baseline_train_count=1,
        )
        with self.assertRaises(RuntimeError) as ctx:
            s_golden_mismatch.sample(require_leak_check=True)
        self.assertIn("Golden evaluation dataset count mismatch: expected 7", str(ctx.exception))

        # 2. val count mismatch
        s_val_mismatch = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            expected_golden_count=1,
            expected_val_count=33,  # Synthetic test has 0
            expected_test_count=0,
            expected_baseline_train_count=1,
        )
        with self.assertRaises(RuntimeError) as ctx:
            s_val_mismatch.sample(require_leak_check=True)
        self.assertIn("batch250 validation dataset count mismatch: expected 33", str(ctx.exception))

        # 3. test count mismatch
        s_test_mismatch = GeminiAuditSampleASampler(
            manifest_csv=self.manifest_path,
            pilot_manifest_csv=self.pilot_manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            expected_golden_count=1,
            expected_val_count=0,
            expected_test_count=33,  # Synthetic test has 0
            expected_baseline_train_count=1,
        )
        with self.assertRaises(RuntimeError) as ctx:
            s_test_mismatch.sample(require_leak_check=True)
        self.assertIn("batch250 test dataset count mismatch: expected 33", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
