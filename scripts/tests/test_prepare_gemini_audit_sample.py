from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

from scripts.prepare_gemini_audit_sample import (
    GeminiAuditSampler,
    strip_jpeg_metadata,
)
from scripts.tests.test_validate_zip2_audit_manifest import make_dummy_jpeg
from scripts.validate_zip2_audit_manifest import compute_sha256, extract_exif_dates


class TestPrepareGeminiAuditSample(unittest.TestCase):
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

        self.target_classes = [
            "curry_rice",
            "drink",
            "fish_dish",
            "fried_dish",
            "meat_dish",
            "simmered_dish",
            "stir_fry",
        ]

        # Setup synthetic dataset: 15 candidates per class (105 total candidates)
        # plus 1 eval image, plus 1 baseline train image
        self.rows = []

        # 1. Protected eval image
        eval_img_name = "eval_001.jpg"
        eval_data = make_dummy_jpeg("2024:01:01 10:00:00", b"eval_content")
        (self.image_dir / eval_img_name).write_bytes(eval_data)
        (self.golden_eval_dir / "test" / "curry_rice" / eval_img_name).write_bytes(eval_data)
        self.rows.append({
            "image_id": "eval_001_jpg",
            "source_path": eval_img_name,
            "mapped_class": "curry_rice",
            "assigned_role": "protected_evaluation",
            "primary_dish_key": "curry_rice",
            "analysis_confidence": "0.95",
        })

        # 2. Protected baseline train image
        train_img_name = "train_001.jpg"
        train_data = make_dummy_jpeg("2024:01:01 12:00:00", b"train_content")
        (self.image_dir / train_img_name).write_bytes(train_data)
        (self.batch250_dir / "train" / "curry_rice" / train_img_name).write_bytes(train_data)
        self.rows.append({
            "image_id": "train_001_jpg",
            "source_path": train_img_name,
            "mapped_class": "curry_rice",
            "assigned_role": "protected_baseline_train",
            "primary_dish_key": "curry_rice",
            "analysis_confidence": "0.95",
        })

        # 3. Candidates: 15 per class
        for cls_name in self.target_classes:
            for i in range(15):
                img_name = f"candidate_{cls_name}_{i:02d}.jpg"
                img_data = make_dummy_jpeg("2024:02:01 12:00:00", f"{cls_name}_{i}".encode("ascii"))
                (self.image_dir / img_name).write_bytes(img_data)
                self.rows.append({
                    "image_id": f"candidate_{cls_name}_{i:02d}_jpg",
                    "source_path": img_name,
                    "mapped_class": cls_name,
                    "assigned_role": "pseudo_label_candidate",
                    "primary_dish_key": cls_name,
                    "analysis_confidence": "0.85",
                })

        # Write manifest CSV
        fieldnames = list(self.rows[0].keys())
        with open(self.manifest_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(self.rows)

        self.manifest_sha256 = compute_sha256(self.manifest_path)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_exact_70_sample_balance(self) -> None:
        """Verify that exactly 10 samples per class (70 total) are extracted with no duplicates."""
        sampler = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=10,
            seed=20261010,
        )
        res = sampler.sample()
        sampled_rows = res["sampled_rows"]

        self.assertEqual(len(sampled_rows), 70)
        class_counts = {}
        for r in sampled_rows:
            c = r["mapped_class"]
            class_counts[c] = class_counts.get(c, 0) + 1
            self.assertEqual(r["assigned_role"], "pseudo_label_candidate")

        for cls_name in self.target_classes:
            self.assertEqual(class_counts.get(cls_name), 10)

        # Uniqueness check
        unique_paths = {r["source_path"] for r in sampled_rows}
        self.assertEqual(len(unique_paths), 70)

    def test_deterministic_reproducibility(self) -> None:
        """Verify that running sampling twice with the same seed yields 100% identical results."""
        sampler1 = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=10,
            seed=20261010,
        )
        sampler2 = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=10,
            seed=20261010,
        )

        res1 = sampler1.sample()
        res2 = sampler2.sample()

        paths1 = [r["source_path"] for r in res1["sampled_rows"]]
        paths2 = [r["source_path"] for r in res2["sampled_rows"]]

        self.assertEqual(paths1, paths2)

    def test_manifest_hash_guard(self) -> None:
        """Verify that an unexpected manifest hash immediately raises ValueError."""
        sampler = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
            image_dir=self.image_dir,
            expected_manifest_sha256="wrong_hash_0000000000000000000000000000000000000000000000000000",
        )
        with self.assertRaises(ValueError) as ctx:
            sampler.sample()
        self.assertIn("Manifest SHA-256 mismatch", str(ctx.exception))

    def test_eval_leak_guard(self) -> None:
        """Verify that if a sampled image matches a protected evaluation hash, RuntimeError is raised."""
        # Forge an image to match eval hash
        eval_hash = compute_sha256(self.image_dir / "eval_001.jpg")
        target_candidate = self.image_dir / "candidate_curry_rice_00.jpg"
        target_candidate.write_bytes((self.image_dir / "eval_001.jpg").read_bytes())

        sampler = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=10,
            seed=20261010,
        )
        with self.assertRaises(RuntimeError) as ctx:
            sampler.sample()
        self.assertIn("CRITICAL LEAK", str(ctx.exception))

    def test_metadata_stripping(self) -> None:
        """Verify that strip_jpeg_metadata completely removes EXIF DateTimeOriginal."""
        src_path = self.root / "exif_test.jpg"
        dst_path = self.root / "stripped_test.jpg"

        exif_dt = "2024:05:01 14:20:30"
        src_path.write_bytes(make_dummy_jpeg(exif_dt, b"pixel_data_here"))

        self.assertEqual(extract_exif_dates(src_path).get("DateTimeOriginal"), exif_dt)

        strip_jpeg_metadata(src_path, dst_path)

        self.assertTrue(dst_path.is_file())
        self.assertEqual(extract_exif_dates(dst_path), {})

    def test_export_pipeline(self) -> None:
        """Verify that export() produces sample_manifest.csv, jsonl, blind inputs, mapping, and metadata."""
        out_dir = self.root / "export_test"
        sampler = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=10,
            seed=20261010,
        )
        res = sampler.export(output_dir=out_dir, strip_images=True)

        self.assertTrue((out_dir / "sample_manifest.csv").is_file())
        self.assertTrue((out_dir / "sample_manifest.jsonl").is_file())
        self.assertTrue((out_dir / "blind_request_inputs.jsonl").is_file())
        self.assertTrue((out_dir / "blind_id_mapping.private.json").is_file())
        self.assertTrue((out_dir / "provenance_metadata.json").is_file())
        self.assertTrue((out_dir / "stripped_images").is_dir())
        self.assertTrue((out_dir / "blind_images").is_dir())

        # Check provenance metadata structure
        meta = json.loads((out_dir / "provenance_metadata.json").read_text(encoding="utf-8"))
        self.assertEqual(meta["metadata_version"], "1.1.0")
        self.assertEqual(meta["sampling_parameters"]["seed"], 20261010)
        self.assertEqual(meta["sampling_parameters"]["total_samples"], 70)
        self.assertEqual(meta["safety_verification"]["eval_leak_check_passed"], True)
        self.assertEqual(meta["safety_verification"]["exif_stripping_verified"], True)
        self.assertEqual(meta["safety_verification"]["blind_separation_verified"], True)
        self.assertIn("git_commit", meta)
        self.assertIn("is_git_dirty", meta)
        self.assertIn("blind_request_inputs_sha256", meta["output_artifacts"])
        self.assertIn("blind_id_mapping_sha256", meta["output_artifacts"])

    def test_blind_inputs_strict_isolation(self) -> None:
        """Verify that blind_request_inputs.jsonl contains ZERO label or origin information."""
        out_dir = self.root / "blind_test"
        sampler = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=10,
            seed=20261010,
        )
        sampler.export(output_dir=out_dir, strip_images=True)

        blind_jsonl = out_dir / "blind_request_inputs.jsonl"
        lines = [line.strip() for line in blind_jsonl.read_text(encoding="utf-8").splitlines() if line.strip()]
        self.assertEqual(len(lines), 70)

        forbidden_keys = {
            "mapped_class",
            "primary_dish_key",
            "coarse_primary_dish_key",
            "analysis_confidence",
            "source_path",
            "image_id",
            "assigned_role",
            "timestamp",
            "exif",
        }

        # Also verify raw text contains no class names or candidate path patterns
        raw_text = blind_jsonl.read_text(encoding="utf-8")
        for cls_name in self.target_classes:
            self.assertNotIn(cls_name, raw_text)
        self.assertNotIn("candidate_", raw_text)
        self.assertNotIn("eval_", raw_text)
        self.assertNotIn("train_", raw_text)

        for line in lines:
            rec = json.loads(line)
            self.assertEqual(set(rec.keys()), {"blind_id", "image_file"})
            self.assertTrue(rec["blind_id"].startswith("blind_"))
            self.assertTrue(rec["image_file"].startswith("blind_"))
            self.assertTrue(rec["image_file"].endswith(".jpg"))
            for fk in forbidden_keys:
                self.assertNotIn(fk, rec)

    def test_blind_id_sequence_and_uniqueness(self) -> None:
        """Verify blind IDs are strictly unique, sequential 1-based (blind_001..blind_070)."""
        out_dir = self.root / "seq_test"
        sampler = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=10,
            seed=20261010,
        )
        sampler.export(output_dir=out_dir, strip_images=True)

        lines = [json.loads(line) for line in (out_dir / "blind_request_inputs.jsonl").read_text(encoding="utf-8").splitlines() if line.strip()]
        expected_blind_ids = [f"blind_{i:03d}" for i in range(1, 71)]
        actual_blind_ids = [rec["blind_id"] for rec in lines]
        self.assertEqual(actual_blind_ids, expected_blind_ids)

        expected_image_files = [f"blind_{i:03d}.jpg" for i in range(1, 71)]
        actual_image_files = [rec["image_file"] for rec in lines]
        self.assertEqual(actual_image_files, expected_image_files)

    def test_blind_images_metadata_free_and_decodable(self) -> None:
        """Verify that all 70 blind images exist, have zero EXIF dates, and match stripped content."""
        out_dir = self.root / "images_test"
        sampler = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=10,
            seed=20261010,
        )
        sampler.export(output_dir=out_dir, strip_images=True)

        mapping = json.loads((out_dir / "blind_id_mapping.private.json").read_text(encoding="utf-8"))["records"]
        self.assertEqual(len(mapping), 70)

        for rec in mapping:
            blind_img_path = out_dir / "blind_images" / rec["blind_image_file"]
            stripped_img_path = out_dir / "stripped_images" / f"{rec['image_id']}.jpg"

            self.assertTrue(blind_img_path.is_file(), f"Missing {blind_img_path}")
            self.assertTrue(stripped_img_path.is_file(), f"Missing {stripped_img_path}")

            # Identical content
            self.assertEqual(
                compute_sha256(blind_img_path),
                compute_sha256(stripped_img_path),
            )

            # Metadata-free
            self.assertEqual(extract_exif_dates(blind_img_path), {})

    def test_blind_mapping_isolated_and_reconcilable(self) -> None:
        """Verify that blind_id_mapping.private.json correctly maps blind IDs to original metadata."""
        out_dir = self.root / "reconcile_test"
        sampler = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=10,
            seed=20261010,
        )
        sampler.export(output_dir=out_dir, strip_images=False)

        mapping_data = json.loads((out_dir / "blind_id_mapping.private.json").read_text(encoding="utf-8"))
        self.assertEqual(mapping_data["total_records"], 70)

        records = mapping_data["records"]
        self.assertEqual(len(records), 70)

        blind_ids = {r["blind_id"] for r in records}
        self.assertEqual(len(blind_ids), 70)

        source_paths = {r["source_path"] for r in records}
        self.assertEqual(len(source_paths), 70)

        # Check reconciliation against sample_manifest.csv
        with open(out_dir / "sample_manifest.csv", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            manifest_rows = list(reader)

        self.assertEqual(len(manifest_rows), 70)
        for map_rec, man_rec in zip(records, manifest_rows):
            self.assertEqual(map_rec["image_id"], man_rec["image_id"])
            self.assertEqual(map_rec["mapped_class"], man_rec["mapped_class"])
            self.assertEqual(map_rec["source_path"], man_rec["source_path"])

    def test_blind_sampling_reproducibility(self) -> None:
        """Verify that re-exporting with the same seed reproduces identical blind artifacts."""
        out_dir1 = self.root / "repro_1"
        out_dir2 = self.root / "repro_2"

        sampler1 = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=10,
            seed=20261010,
        )
        sampler2 = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
            image_dir=self.image_dir,
            batch250_dir=self.batch250_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
            samples_per_class=10,
            seed=20261010,
        )

        sampler1.export(output_dir=out_dir1, strip_images=True)
        sampler2.export(output_dir=out_dir2, strip_images=True)

        self.assertEqual(
            compute_sha256(out_dir1 / "blind_request_inputs.jsonl"),
            compute_sha256(out_dir2 / "blind_request_inputs.jsonl"),
        )
        self.assertEqual(
            compute_sha256(out_dir1 / "sample_manifest.csv"),
            compute_sha256(out_dir2 / "sample_manifest.csv"),
        )

        # Mapping contents (excluding generated_at timestamp)
        m1 = json.loads((out_dir1 / "blind_id_mapping.private.json").read_text(encoding="utf-8"))
        m2 = json.loads((out_dir2 / "blind_id_mapping.private.json").read_text(encoding="utf-8"))
        self.assertEqual(m1["records"], m2["records"])

    def test_golden_eval_dir_missing_or_empty_fails_closed(self) -> None:
        """Verify fail-closed error when golden_eval_dir is missing or contains zero images."""
        empty_eval_dir = self.root / "empty_eval"
        empty_eval_dir.mkdir()
        sampler = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
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
        sampler = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
            image_dir=self.image_dir,
            batch250_dir=empty_batch_dir,
            golden_eval_dir=self.golden_eval_dir,
            expected_manifest_sha256=self.manifest_sha256,
        )
        with self.assertRaises(RuntimeError) as ctx:
            sampler.sample(require_leak_check=True)
        self.assertIn("Baseline dataset missing or empty", str(ctx.exception))

    def test_image_dir_missing_fails_closed(self) -> None:
        """Verify fail-closed error when image_dir is missing or candidate image is missing."""
        missing_image_dir = self.root / "nonexistent_images"
        sampler = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
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
        sampler = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
            image_dir=self.root / "nonexistent_images",
            expected_manifest_sha256=self.manifest_sha256,
        )
        res = sampler.export(output_dir=out_dir, strip_images=False, require_leak_check=False)
        meta = json.loads((out_dir / "provenance_metadata.json").read_text(encoding="utf-8"))
        self.assertFalse(meta["safety_verification"]["eval_leak_check_passed"])
        self.assertFalse(meta["safety_verification"]["baseline_leak_check_passed"])

    def test_expected_eval_and_baseline_count_mismatch_raises(self) -> None:
        """Regression test 7: Verify fail-closed when protected eval or baseline count does not match expected."""
        # 1. Eval count mismatch
        sampler_eval_mismatch = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
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
        sampler_train_mismatch = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
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
        sampler_matching = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
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
        """Issue 4: Verify partitioned checks for Golden (7), val (33), test (33)."""
        # 1. Golden count mismatch
        s_golden_mismatch = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
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
        s_val_mismatch = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
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
        s_test_mismatch = GeminiAuditSampler(
            manifest_csv=self.manifest_path,
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

    def test_partitioned_duplicate_extraneous_missing_rejected(self) -> None:
        """Verify that duplicate, extraneous, and missing files are rejected for Golden, val, test, and train."""
        # Helper to create dummy jpeg files
        def populate_dir(dir_path: Path, count: int, duplicate: bool = False) -> None:
            dir_path.mkdir(parents=True, exist_ok=True)
            for i in range(count):
                f = dir_path / f"img_{i:04d}.jpg"
                if duplicate and i == count - 1 and count > 1:
                    # Write same content as first file to create duplicate hash
                    content = (dir_path / "img_0000.jpg").read_bytes()
                else:
                    content = b"\xff\xd8\xff\xe0" + f"unique_{dir_path.name}_{i:04d}".encode("utf-8") + b"\xff\xd9"
                f.write_bytes(content)

        # 1. Golden evaluation (expected 7)
        # 1a. Missing (6 files)
        with tempfile.TemporaryDirectory() as tmp_g:
            g_dir = Path(tmp_g)
            populate_dir(g_dir / "test" / "cls", 6)
            s = GeminiAuditSampler(
                manifest_csv=self.manifest_path,
                image_dir=self.image_dir,
                batch250_dir=self.batch250_dir,
                golden_eval_dir=g_dir,
                expected_manifest_sha256=self.manifest_sha256,
                expected_golden_count=7,
            )
            with self.assertRaises(RuntimeError) as ctx:
                s.sample(require_leak_check=True)
            self.assertIn("file count mismatch", str(ctx.exception))

        # 1b. Extraneous (8 files)
        with tempfile.TemporaryDirectory() as tmp_g:
            g_dir = Path(tmp_g)
            populate_dir(g_dir / "test" / "cls", 8)
            s = GeminiAuditSampler(
                manifest_csv=self.manifest_path,
                image_dir=self.image_dir,
                batch250_dir=self.batch250_dir,
                golden_eval_dir=g_dir,
                expected_manifest_sha256=self.manifest_sha256,
                expected_golden_count=7,
            )
            with self.assertRaises(RuntimeError) as ctx:
                s.sample(require_leak_check=True)
            self.assertIn("file count mismatch", str(ctx.exception))

        # 1c. Duplicate (7 files, but 2 share identical hash)
        with tempfile.TemporaryDirectory() as tmp_g:
            g_dir = Path(tmp_g)
            populate_dir(g_dir / "test" / "cls", 7, duplicate=True)
            s = GeminiAuditSampler(
                manifest_csv=self.manifest_path,
                image_dir=self.image_dir,
                batch250_dir=self.batch250_dir,
                golden_eval_dir=g_dir,
                expected_manifest_sha256=self.manifest_sha256,
                expected_golden_count=7,
            )
            with self.assertRaises(RuntimeError) as ctx:
                s.sample(require_leak_check=True)
            self.assertIn("Duplicate files detected in Golden evaluation dataset", str(ctx.exception))

        # 2. batch250 validation (expected 33)
        # 2a. Missing (32 files)
        with tempfile.TemporaryDirectory() as tmp_b:
            b_dir = Path(tmp_b)
            populate_dir(b_dir / "val" / "cls", 32)
            populate_dir(b_dir / "test" / "cls", 33)
            populate_dir(b_dir / "train" / "cls", 190)
            s = GeminiAuditSampler(
                manifest_csv=self.manifest_path,
                image_dir=self.image_dir,
                batch250_dir=b_dir,
                golden_eval_dir=self.golden_eval_dir,
                expected_manifest_sha256=self.manifest_sha256,
                expected_val_count=33,
            )
            with self.assertRaises(RuntimeError) as ctx:
                s.sample(require_leak_check=True)
            self.assertIn("file count mismatch", str(ctx.exception))

        # 2b. Extraneous (34 files)
        with tempfile.TemporaryDirectory() as tmp_b:
            b_dir = Path(tmp_b)
            populate_dir(b_dir / "val" / "cls", 34)
            populate_dir(b_dir / "test" / "cls", 33)
            populate_dir(b_dir / "train" / "cls", 190)
            s = GeminiAuditSampler(
                manifest_csv=self.manifest_path,
                image_dir=self.image_dir,
                batch250_dir=b_dir,
                golden_eval_dir=self.golden_eval_dir,
                expected_manifest_sha256=self.manifest_sha256,
                expected_val_count=33,
            )
            with self.assertRaises(RuntimeError) as ctx:
                s.sample(require_leak_check=True)
            self.assertIn("file count mismatch", str(ctx.exception))

        # 2c. Duplicate (33 files, duplicate hash)
        with tempfile.TemporaryDirectory() as tmp_b:
            b_dir = Path(tmp_b)
            populate_dir(b_dir / "val" / "cls", 33, duplicate=True)
            populate_dir(b_dir / "test" / "cls", 33)
            populate_dir(b_dir / "train" / "cls", 190)
            s = GeminiAuditSampler(
                manifest_csv=self.manifest_path,
                image_dir=self.image_dir,
                batch250_dir=b_dir,
                golden_eval_dir=self.golden_eval_dir,
                expected_manifest_sha256=self.manifest_sha256,
                expected_val_count=33,
            )
            with self.assertRaises(RuntimeError) as ctx:
                s.sample(require_leak_check=True)
            self.assertIn("Duplicate files detected in batch250 validation dataset", str(ctx.exception))

        # 3. batch250 test (expected 33)
        # 3a. Missing (32 files)
        with tempfile.TemporaryDirectory() as tmp_b:
            b_dir = Path(tmp_b)
            populate_dir(b_dir / "val" / "cls", 33)
            populate_dir(b_dir / "test" / "cls", 32)
            populate_dir(b_dir / "train" / "cls", 190)
            s = GeminiAuditSampler(
                manifest_csv=self.manifest_path,
                image_dir=self.image_dir,
                batch250_dir=b_dir,
                golden_eval_dir=self.golden_eval_dir,
                expected_manifest_sha256=self.manifest_sha256,
                expected_test_count=33,
            )
            with self.assertRaises(RuntimeError) as ctx:
                s.sample(require_leak_check=True)
            self.assertIn("file count mismatch", str(ctx.exception))

        # 3b. Extraneous (34 files)
        with tempfile.TemporaryDirectory() as tmp_b:
            b_dir = Path(tmp_b)
            populate_dir(b_dir / "val" / "cls", 33)
            populate_dir(b_dir / "test" / "cls", 34)
            populate_dir(b_dir / "train" / "cls", 190)
            s = GeminiAuditSampler(
                manifest_csv=self.manifest_path,
                image_dir=self.image_dir,
                batch250_dir=b_dir,
                golden_eval_dir=self.golden_eval_dir,
                expected_manifest_sha256=self.manifest_sha256,
                expected_test_count=33,
            )
            with self.assertRaises(RuntimeError) as ctx:
                s.sample(require_leak_check=True)
            self.assertIn("file count mismatch", str(ctx.exception))

        # 3c. Duplicate (33 files, duplicate hash)
        with tempfile.TemporaryDirectory() as tmp_b:
            b_dir = Path(tmp_b)
            populate_dir(b_dir / "val" / "cls", 33)
            populate_dir(b_dir / "test" / "cls", 33, duplicate=True)
            populate_dir(b_dir / "train" / "cls", 190)
            s = GeminiAuditSampler(
                manifest_csv=self.manifest_path,
                image_dir=self.image_dir,
                batch250_dir=b_dir,
                golden_eval_dir=self.golden_eval_dir,
                expected_manifest_sha256=self.manifest_sha256,
                expected_test_count=33,
            )
            with self.assertRaises(RuntimeError) as ctx:
                s.sample(require_leak_check=True)
            self.assertIn("Duplicate files detected in batch250 test dataset", str(ctx.exception))

        # 4. baseline train (expected 190)
        # 4a. Missing (189 files)
        with tempfile.TemporaryDirectory() as tmp_b:
            b_dir = Path(tmp_b)
            populate_dir(b_dir / "val" / "cls", 33)
            populate_dir(b_dir / "test" / "cls", 33)
            populate_dir(b_dir / "train" / "cls", 189)
            s = GeminiAuditSampler(
                manifest_csv=self.manifest_path,
                image_dir=self.image_dir,
                batch250_dir=b_dir,
                golden_eval_dir=self.golden_eval_dir,
                expected_manifest_sha256=self.manifest_sha256,
                expected_baseline_train_count=190,
            )
            with self.assertRaises(RuntimeError) as ctx:
                s.sample(require_leak_check=True)
            self.assertIn("file count mismatch", str(ctx.exception))

        # 4b. Extraneous (191 files)
        with tempfile.TemporaryDirectory() as tmp_b:
            b_dir = Path(tmp_b)
            populate_dir(b_dir / "val" / "cls", 33)
            populate_dir(b_dir / "test" / "cls", 33)
            populate_dir(b_dir / "train" / "cls", 191)
            s = GeminiAuditSampler(
                manifest_csv=self.manifest_path,
                image_dir=self.image_dir,
                batch250_dir=b_dir,
                golden_eval_dir=self.golden_eval_dir,
                expected_manifest_sha256=self.manifest_sha256,
                expected_baseline_train_count=190,
            )
            with self.assertRaises(RuntimeError) as ctx:
                s.sample(require_leak_check=True)
            self.assertIn("file count mismatch", str(ctx.exception))

        # 4c. Duplicate (190 files, duplicate hash)
        with tempfile.TemporaryDirectory() as tmp_b:
            b_dir = Path(tmp_b)
            populate_dir(b_dir / "val" / "cls", 33)
            populate_dir(b_dir / "test" / "cls", 33)
            populate_dir(b_dir / "train" / "cls", 190, duplicate=True)
            s = GeminiAuditSampler(
                manifest_csv=self.manifest_path,
                image_dir=self.image_dir,
                batch250_dir=b_dir,
                golden_eval_dir=self.golden_eval_dir,
                expected_manifest_sha256=self.manifest_sha256,
                expected_baseline_train_count=190,
            )
            with self.assertRaises(RuntimeError) as ctx:
                s.sample(require_leak_check=True)
            self.assertIn("Duplicate files detected in baseline training dataset", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()

