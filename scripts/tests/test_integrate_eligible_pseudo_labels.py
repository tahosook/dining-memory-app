#!/usr/bin/env python3
"""Unit tests for dataset integration pipeline for eligible pseudo-labels.

Validates that eligible pseudo-labels are correctly merged into the baseline training dataset,
ensures all pseudo-labels are confined to the 'train' split, mechanically prevents data leakage
into the Golden Test Set, and ensures clean checkout test compatibility.
"""

from __future__ import annotations

import csv
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts.integrate_eligible_pseudo_labels import (
    CANONICAL_CLASSES,
    DEFAULT_BASE_DATASET,
    DEFAULT_ELIGIBLE_MANIFEST,
    DEFAULT_GOLDEN_TEST_DIR,
    DEFAULT_SAMPLE_PKG_DIR,
    IntegrationError,
    LeakageError,
    get_image_files,
    integrate_pseudo_labels,
)

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent


class TestIntegrateEligiblePseudoLabels(unittest.TestCase):
    def _create_synthetic_environment(
        self,
        tmp_dir: Path,
        simulate_leakage: bool = False,
        invalid_class: str | None = None,
    ) -> tuple[Path, Path, Path, Path, Path]:
        """Creates minimal synthetic base dataset, eligible manifest, sample pkg, and golden test set."""
        base_dataset = tmp_dir / "base_dataset"
        eligible_manifest = tmp_dir / "eligible_manifest.csv"
        sample_pkg = tmp_dir / "sample_pkg"
        golden_test = tmp_dir / "golden_test"
        output_dataset = tmp_dir / "output_dataset"

        # 1. Base dataset structure (9 classes in train, val, test)
        for split in ["train", "val", "test"]:
            for cls in CANONICAL_CLASSES:
                d = base_dataset / split / cls
                d.mkdir(parents=True, exist_ok=True)
                # 1 image per class in train, val, test
                img = d / f"{split}_{cls}_base.jpg"
                img.write_bytes(f"base_img_{split}_{cls}".encode("utf-8"))

        # labels.txt in base dataset
        labels_txt = base_dataset / "labels.txt"
        labels_txt.write_text("\n".join(CANONICAL_CLASSES) + "\n", encoding="utf-8")

        # 2. Golden test set (exactly 7 images across arbitrary classes)
        golden_classes = CANONICAL_CLASSES[:7]
        for i, cls in enumerate(golden_classes):
            d = golden_test / cls
            d.mkdir(parents=True, exist_ok=True)
            img = d / f"golden_{cls}.jpg"
            img.write_bytes(f"golden_content_{i}_{cls}".encode("utf-8"))

        # 3. Sample package structure (blind_images + private mapping)
        blind_images_dir = sample_pkg / "blind_images"
        blind_images_dir.mkdir(parents=True, exist_ok=True)
        priv_dir = sample_pkg / "private_reconciliation"
        priv_dir.mkdir(parents=True, exist_ok=True)

        mapping_records = []
        manifest_rows = []

        # Add 2 eligible samples: 1 curry_rice, 1 drink
        test_samples = [
            ("meshi_curry_01", "curry_rice", "blind_curry.jpg", b"pseudo_curry_content"),
            ("meshi_drink_01", "drink", "blind_drink.jpg", b"pseudo_drink_content"),
        ]

        if simulate_leakage:
            # Overwrite content with golden image 0
            leak_content = f"golden_content_0_{golden_classes[0]}".encode("utf-8")
            test_samples[0] = ("meshi_curry_01", "curry_rice", "blind_curry.jpg", leak_content)

        if invalid_class:
            test_samples[1] = ("meshi_drink_01", invalid_class, "blind_drink.jpg", b"pseudo_drink_content")

        for img_id, mapped_cls, fname, content in test_samples:
            img_file = blind_images_dir / fname
            img_file.write_bytes(content)
            sha = hashlib.sha256(content).hexdigest()

            mapping_records.append({
                "image_id": img_id,
                "image_file": fname,
                "mapped_class": mapped_cls,
                "source_path": f"{img_id}.jpg",
                "raw_image_sha256": sha,
                "stripped_image_sha256": sha,
            })
            manifest_rows.append({
                "image_id": img_id,
                "mapped_class": mapped_cls,
                "source_path": f"{img_id}.jpg",
            })

        mapping_json = priv_dir / "blind_id_mapping.private.json"
        with open(mapping_json, "w", encoding="utf-8") as f:
            json.dump({"records": mapping_records}, f)

        with open(eligible_manifest, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=["image_id", "mapped_class", "source_path"])
            writer.writeheader()
            writer.writerows(manifest_rows)

        return base_dataset, eligible_manifest, sample_pkg, golden_test, output_dataset

    def test_synthetic_dataset_integration_success(self) -> None:
        """Verify normal integration: 2 samples added to train, val & test unaltered, summary written."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            base_ds, manifest, pkg, golden, out_ds = self._create_synthetic_environment(tmp)

            summary_path, summary = integrate_pseudo_labels(
                base_dataset_dir=base_ds,
                eligible_manifest_path=manifest,
                sample_pkg_dir=pkg,
                golden_test_dir=golden,
                output_dataset_dir=out_ds,
            )

            self.assertTrue(summary_path.is_file())
            counts = summary["counts"]
            # Base had 9 train, 9 val, 9 test = 27 images
            self.assertEqual(counts["base_train"], 9)
            self.assertEqual(counts["base_val"], 9)
            self.assertEqual(counts["base_test"], 9)
            self.assertEqual(counts["base_total"], 27)

            # Output should have 9 + 2 = 11 train, 9 val, 9 test = 29 images
            self.assertEqual(counts["pseudo_labels_added"], 2)
            self.assertEqual(counts["output_train"], 11)
            self.assertEqual(counts["output_val"], 9)
            self.assertEqual(counts["output_test"], 9)
            self.assertEqual(counts["output_total"], 29)

            # Check that files were placed in train split
            train_curry = get_image_files(out_ds / "train" / "curry_rice")
            train_drink = get_image_files(out_ds / "train" / "drink")
            self.assertEqual(len(train_curry), 2)  # 1 base + 1 pseudo
            self.assertEqual(len(train_drink), 2)  # 1 base + 1 pseudo

            # Val and Test splits must still only have 1 per class
            val_curry = get_image_files(out_ds / "val" / "curry_rice")
            test_curry = get_image_files(out_ds / "test" / "curry_rice")
            self.assertEqual(len(val_curry), 1)
            self.assertEqual(len(test_curry), 1)

            # Golden leakage must be 0
            self.assertEqual(summary["golden_test_leakage_count"], 0)

    def test_golden_test_leakage_detection_raises_error(self) -> None:
        """Verify that any pseudo-label matching a Golden Test image raises LeakageError."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            base_ds, manifest, pkg, golden, out_ds = self._create_synthetic_environment(
                tmp, simulate_leakage=True
            )

            with self.assertRaises(LeakageError) as ctx:
                integrate_pseudo_labels(
                    base_dataset_dir=base_ds,
                    eligible_manifest_path=manifest,
                    sample_pkg_dir=pkg,
                    golden_test_dir=golden,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("Data leakage detected", str(ctx.exception))

    def test_invalid_class_raises_error(self) -> None:
        """Verify that an invalid non-canonical class raises IntegrationError."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            base_ds, manifest, pkg, golden, out_ds = self._create_synthetic_environment(
                tmp, invalid_class="pizza"
            )

            with self.assertRaises(IntegrationError) as ctx:
                integrate_pseudo_labels(
                    base_dataset_dir=base_ds,
                    eligible_manifest_path=manifest,
                    sample_pkg_dir=pkg,
                    golden_test_dir=golden,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("Invalid class 'pizza'", str(ctx.exception))

    def test_real_dataset_integration_integrity(self) -> None:
        """Integration test against actual repository state when files exist.

        Skipped gracefully on clean checkout environments where state/ data is not committed.
        """
        if not (
            DEFAULT_BASE_DATASET.is_dir()
            and DEFAULT_ELIGIBLE_MANIFEST.is_file()
            and DEFAULT_SAMPLE_PKG_DIR.is_dir()
            and DEFAULT_GOLDEN_TEST_DIR.is_dir()
        ):
            self.skipTest("Real dataset files not present (clean checkout); skipped.")

        with tempfile.TemporaryDirectory() as tmp_dir:
            out_ds = Path(tmp_dir) / "real_integrated_dataset"
            summary_path, summary = integrate_pseudo_labels(
                base_dataset_dir=DEFAULT_BASE_DATASET,
                eligible_manifest_path=DEFAULT_ELIGIBLE_MANIFEST,
                sample_pkg_dir=DEFAULT_SAMPLE_PKG_DIR,
                golden_test_dir=DEFAULT_GOLDEN_TEST_DIR,
                output_dataset_dir=out_ds,
                enforce_real_counts=True,
            )

            self.assertTrue(summary_path.is_file())
            counts = summary["counts"]

            # Exact real metrics assertion
            self.assertEqual(counts["base_total"], 256)
            self.assertEqual(counts["base_train"], 190)
            self.assertEqual(counts["base_val"], 33)
            self.assertEqual(counts["base_test"], 33)

            self.assertEqual(counts["pseudo_labels_added"], 74)
            self.assertEqual(counts["output_total"], 330)
            self.assertEqual(counts["output_train"], 264)
            self.assertEqual(counts["output_val"], 33)
            self.assertEqual(counts["output_test"], 33)

            self.assertEqual(summary["added_by_class"], {"curry_rice": 34, "drink": 40})
            self.assertEqual(summary["golden_test_leakage_count"], 0)
            self.assertEqual(summary["golden_test_samples_checked"], 7)

    def test_path_collision_detection(self) -> None:
        """Verify that output_dataset_dir colliding with input paths raises ValueError."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            base_ds, manifest, pkg, golden, _ = self._create_synthetic_environment(tmp)

            with self.assertRaises(ValueError) as ctx:
                integrate_pseudo_labels(
                    base_dataset_dir=base_ds,
                    eligible_manifest_path=manifest,
                    sample_pkg_dir=pkg,
                    golden_test_dir=golden,
                    output_dataset_dir=base_ds,  # Collision!
                )
            self.assertIn("Path collision detected", str(ctx.exception))

    def test_raw_sha256_leakage_detection(self) -> None:
        """Verify that leakage is caught via raw_image_sha256 even if stripped bytes differ."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            base_ds, manifest, pkg, golden, out_ds = self._create_synthetic_environment(tmp)

            # Get hash of golden image 0
            from scripts.validate_zip2_audit_manifest import compute_sha256
            golden_img_0 = list(golden.rglob("*.jpg"))[0]
            golden_raw_hash = compute_sha256(golden_img_0)

            # Inject golden_raw_hash as raw_image_sha256 in private mapping
            mapping_file = pkg / "private_reconciliation" / "blind_id_mapping.private.json"
            mapping_data = json.loads(mapping_file.read_text(encoding="utf-8"))
            mapping_data["records"][0]["raw_image_sha256"] = golden_raw_hash
            mapping_file.write_text(json.dumps(mapping_data), encoding="utf-8")

            with self.assertRaises(LeakageError) as ctx:
                integrate_pseudo_labels(
                    base_dataset_dir=base_ds,
                    eligible_manifest_path=manifest,
                    sample_pkg_dir=pkg,
                    golden_test_dir=golden,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("CRITICAL LEAKAGE DETECTED", str(ctx.exception))

    def test_failure_preserves_existing_dataset(self) -> None:
        """Verify that failure during integration does not delete or corrupt existing output dataset."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            base_ds, manifest, pkg, golden, out_ds = self._create_synthetic_environment(tmp)

            # 1st successful integration
            integrate_pseudo_labels(
                base_dataset_dir=base_ds,
                eligible_manifest_path=manifest,
                sample_pkg_dir=pkg,
                golden_test_dir=golden,
                output_dataset_dir=out_ds,
            )
            summary_before = (out_ds / "dataset_summary.json").read_text()

            # Create a 2nd environment that simulates leakage
            _, leak_manifest, leak_pkg, _, _ = self._create_synthetic_environment(
                tmp / "leak_env", simulate_leakage=True
            )

            # Run with leak -> must fail
            with self.assertRaises(LeakageError):
                integrate_pseudo_labels(
                    base_dataset_dir=base_ds,
                    eligible_manifest_path=leak_manifest,
                    sample_pkg_dir=leak_pkg,
                    golden_test_dir=golden,
                    output_dataset_dir=out_ds,
                )

            # Prior output must remain intact!
            self.assertTrue(out_ds.exists())
            self.assertEqual((out_ds / "dataset_summary.json").read_text(), summary_before)

    def test_duplicate_image_id_rejected(self) -> None:
        """Regression test 9: Verify duplicate image_id in manifest is rejected."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            base_ds, manifest, pkg, golden, out_ds = self._create_synthetic_environment(tmp)

            # Append a duplicate row to manifest
            with open(manifest, "a", encoding="utf-8") as f:
                f.write("meshi_curry_01,curry_rice,meshi_curry_01.jpg\n")

            with self.assertRaises(IntegrationError) as ctx:
                integrate_pseudo_labels(
                    base_dataset_dir=base_ds,
                    eligible_manifest_path=manifest,
                    sample_pkg_dir=pkg,
                    golden_test_dir=golden,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("Duplicate image_id 'meshi_curry_01'", str(ctx.exception))

    def test_source_path_mismatch_rejected(self) -> None:
        """Regression test 10: Verify source_path mismatch between manifest and mapping is rejected."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            base_ds, manifest, pkg, golden, out_ds = self._create_synthetic_environment(tmp)

            # Mutate mapping source_path for meshi_curry_01
            mapping_file = pkg / "private_reconciliation" / "blind_id_mapping.private.json"
            mapping_data = json.loads(mapping_file.read_text(encoding="utf-8"))
            mapping_data["records"][0]["source_path"] = "different_source_path.jpg"
            mapping_file.write_text(json.dumps(mapping_data), encoding="utf-8")

            with self.assertRaises(IntegrationError) as ctx:
                integrate_pseudo_labels(
                    base_dataset_dir=base_ds,
                    eligible_manifest_path=manifest,
                    sample_pkg_dir=pkg,
                    golden_test_dir=golden,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("source_path mismatch", str(ctx.exception))

    def test_path_traversal_rejected(self) -> None:
        """Regression test 11: Verify path traversal in image_file is rejected."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            base_ds, manifest, pkg, golden, out_ds = self._create_synthetic_environment(tmp)

            # Mutate mapping image_file to include traversal ../
            mapping_file = pkg / "private_reconciliation" / "blind_id_mapping.private.json"
            mapping_data = json.loads(mapping_file.read_text(encoding="utf-8"))
            mapping_data["records"][0]["image_file"] = "../outside.jpg"
            mapping_file.write_text(json.dumps(mapping_data), encoding="utf-8")

            with self.assertRaises(IntegrationError) as ctx:
                integrate_pseudo_labels(
                    base_dataset_dir=base_ds,
                    eligible_manifest_path=manifest,
                    sample_pkg_dir=pkg,
                    golden_test_dir=golden,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("Path traversal detected", str(ctx.exception))

    def test_missing_or_invalid_hash_rejected(self) -> None:
        """Regression test 12: Verify missing or invalid hash format is rejected."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            base_ds, manifest, pkg, golden, out_ds = self._create_synthetic_environment(tmp)

            mapping_file = pkg / "private_reconciliation" / "blind_id_mapping.private.json"
            mapping_data = json.loads(mapping_file.read_text(encoding="utf-8"))

            # 1. Missing raw_image_sha256
            mapping_data["records"][0]["raw_image_sha256"] = ""
            mapping_file.write_text(json.dumps(mapping_data), encoding="utf-8")
            with self.assertRaises(IntegrationError) as ctx:
                integrate_pseudo_labels(
                    base_dataset_dir=base_ds,
                    eligible_manifest_path=manifest,
                    sample_pkg_dir=pkg,
                    golden_test_dir=golden,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("Missing required 'raw_image_sha256'", str(ctx.exception))

            # 2. Invalid hash format (uppercase or bad length)
            mapping_data["records"][0]["raw_image_sha256"] = "INVALID_HASH_UPPERCASE"
            mapping_file.write_text(json.dumps(mapping_data), encoding="utf-8")
            with self.assertRaises(IntegrationError) as ctx:
                integrate_pseudo_labels(
                    base_dataset_dir=base_ds,
                    eligible_manifest_path=manifest,
                    sample_pkg_dir=pkg,
                    golden_test_dir=golden,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("Invalid SHA-256 format", str(ctx.exception))

    def test_mapping_missing_or_duplicate_id_rejected(self) -> None:
        """Issue 2: Verify mapping with missing or duplicate ID is rejected before dictionary creation."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            base_ds, manifest, pkg, golden, out_ds = self._create_synthetic_environment(tmp)

            mapping_file = pkg / "private_reconciliation" / "blind_id_mapping.private.json"
            mapping_data = json.loads(mapping_file.read_text(encoding="utf-8"))

            # 1. Duplicate ID in mapping
            dup_record = dict(mapping_data["records"][0])
            mapping_data["records"].append(dup_record)
            mapping_file.write_text(json.dumps(mapping_data), encoding="utf-8")

            from scripts.dataset_safety_guards import SafetyError
            with self.assertRaises(SafetyError) as ctx:
                integrate_pseudo_labels(
                    base_dataset_dir=base_ds,
                    eligible_manifest_path=manifest,
                    sample_pkg_dir=pkg,
                    golden_test_dir=golden,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("Duplicate image_id", str(ctx.exception))

            # 2. Missing ID in mapping
            mapping_data["records"][0]["image_id"] = ""
            mapping_file.write_text(json.dumps(mapping_data), encoding="utf-8")
            with self.assertRaises(SafetyError) as ctx:
                integrate_pseudo_labels(
                    base_dataset_dir=base_ds,
                    eligible_manifest_path=manifest,
                    sample_pkg_dir=pkg,
                    golden_test_dir=golden,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("missing 'image_id'", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
