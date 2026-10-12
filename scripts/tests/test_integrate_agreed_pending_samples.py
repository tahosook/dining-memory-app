#!/usr/bin/env python3
"""Unit tests for dataset integration pipeline for agreed sample A pending samples.

Validates that agreed sample_A pending samples are correctly merged into the baseline
training dataset, ensures all samples are confined to the 'train' split, mechanically
prevents data leakage into the Golden Test Set, and ensures clean checkout test compatibility.
"""

from __future__ import annotations

import csv
import hashlib
import json
import tempfile
import unittest
from pathlib import Path

from scripts.integrate_agreed_pending_samples import (
    CANONICAL_CLASSES,
    DEFAULT_BASE_DATASET,
    DEFAULT_GOLDEN_TEST_DIR,
    DEFAULT_REGISTRY_PATH,
    DEFAULT_SAMPLE_PKG_DIR,
    IntegrationError,
    LeakageError,
    extract_agreed_candidates,
    get_image_files,
    integrate_agreed_samples,
)

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent


class TestIntegrateAgreedPendingSamples(unittest.TestCase):
    def _create_synthetic_environment(
        self,
        tmp_dir: Path,
        simulate_leakage: bool = False,
        invalid_class: str | None = None,
    ) -> tuple[Path, Path, Path, Path, Path]:
        """Creates minimal synthetic base dataset, registry, sample pkg, and golden test set."""
        base_dataset = tmp_dir / "base_dataset"
        registry_path = tmp_dir / "pseudo_label_adoption_registry.csv"
        sample_pkg = tmp_dir / "sample_pkg"
        golden_test = tmp_dir / "golden_test"
        output_dataset = tmp_dir / "output_dataset"

        # 1. Base dataset structure (9 classes in train, val, test)
        for split in ["train", "val", "test"]:
            for cls in CANONICAL_CLASSES:
                d = base_dataset / split / cls
                d.mkdir(parents=True, exist_ok=True)
                img = d / f"{split}_{cls}_base.jpg"
                img.write_bytes(f"base_img_{split}_{cls}".encode("utf-8"))

        labels_txt = base_dataset / "labels.txt"
        labels_txt.write_text("\n".join(CANONICAL_CLASSES) + "\n", encoding="utf-8")

        # 2. Golden test set (exactly 7 images across arbitrary classes)
        golden_classes = CANONICAL_CLASSES[:7]
        for i, cls in enumerate(golden_classes):
            d = golden_test / cls
            d.mkdir(parents=True, exist_ok=True)
            img = d / f"golden_{i}_{cls}.jpg"
            img.write_bytes(f"golden_content_{i}".encode("utf-8"))

        # 3. Sample package directory with blind mapping and blind images
        blind_images_dir = sample_pkg / "blind_images"
        blind_images_dir.mkdir(parents=True, exist_ok=True)
        priv_dir = sample_pkg / "private_reconciliation"
        priv_dir.mkdir(parents=True, exist_ok=True)

        mapping_records = []
        registry_rows = []

        synthetic_samples = [
            ("meshi_synth_01", "fish_dish", "blind_synth_01.jpg", "synth_bytes_01"),
            ("meshi_synth_02", "fried_dish" if not invalid_class else invalid_class, "blind_synth_02.jpg", "synth_bytes_02"),
            ("meshi_synth_03", "meat_dish", "blind_synth_03.jpg", "synth_bytes_03"),
        ]

        if simulate_leakage:
            # Point first synthetic sample to golden content
            synthetic_samples[0] = ("meshi_synth_01", "fish_dish", "blind_synth_01.jpg", "golden_content_0")

        for img_id, mapped_cls, filename, content in synthetic_samples:
            img_file = blind_images_dir / filename
            img_bytes = content.encode("utf-8")
            img_file.write_bytes(img_bytes)
            sha = hashlib.sha256(img_bytes).hexdigest()

            mapping_records.append({
                "image_id": img_id,
                "image_file": filename,
                "mapped_class": mapped_cls,
                "source_path": f"{img_id}.jpg",
                "raw_image_sha256": sha,
                "stripped_image_sha256": sha,
            })
            registry_rows.append({
                "image_id": img_id,
                "mapped_class": mapped_cls,
                "source_path": f"{img_id}.jpg",
                "adoption_status": "pending_human_review",
                "audit_subset": "sample_A",
                "audit_predicted_class": mapped_cls,
                "audit_is_uncertain": "false",
            })

        # Add dummy unaudited and disagreement rows that must NOT be extracted
        registry_rows.append({
            "image_id": "meshi_unaudited",
            "mapped_class": "fish_dish",
            "adoption_status": "unaudited_candidate_pending",
            "audit_subset": "sample_A",
            "audit_predicted_class": "fish_dish",
            "audit_is_uncertain": "false",
        })
        registry_rows.append({
            "image_id": "meshi_disagree",
            "mapped_class": "fish_dish",
            "adoption_status": "pending_human_review",
            "audit_subset": "sample_A",
            "audit_predicted_class": "stir_fry",
            "audit_is_uncertain": "false",
        })

        with open(priv_dir / "blind_id_mapping.private.json", "w", encoding="utf-8") as f:
            json.dump({"records": mapping_records}, f)

        fieldnames = [
            "image_id", "mapped_class", "source_path", "adoption_status",
            "audit_subset", "audit_predicted_class", "audit_is_uncertain",
        ]
        with open(registry_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for r in registry_rows:
                writer.writerow(r)

        return base_dataset, registry_path, sample_pkg, golden_test, output_dataset

    def test_extract_agreed_candidates_synthetic(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td)
            _, registry_path, _, _, _ = self._create_synthetic_environment(tmp_path)
            candidates = extract_agreed_candidates(registry_path, enforce_real_counts=False)
            self.assertEqual(len(candidates), 3)
            extracted_ids = [c["image_id"] for c in candidates]
            self.assertIn("meshi_synth_01", extracted_ids)
            self.assertIn("meshi_synth_02", extracted_ids)
            self.assertIn("meshi_synth_03", extracted_ids)
            self.assertNotIn("meshi_unaudited", extracted_ids)
            self.assertNotIn("meshi_disagree", extracted_ids)

    def test_integration_synthetic_success(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td)
            base_ds, reg_path, pkg_dir, golden_dir, out_ds = self._create_synthetic_environment(tmp_path)

            summary_path, summary = integrate_agreed_samples(
                base_dataset_dir=base_ds,
                registry_path=reg_path,
                sample_pkg_dir=pkg_dir,
                golden_test_dir=golden_dir,
                output_dataset_dir=out_ds,
                enforce_real_counts=False,
            )

            self.assertTrue(summary_path.is_file())
            self.assertEqual(summary["total_integrated_images"], 3)
            self.assertEqual(summary["golden_test_leakage_count"], 0)
            self.assertEqual(summary["counts_before"]["train"], 9)
            self.assertEqual(summary["counts_after"]["train"], 12)
            self.assertEqual(summary["counts_before"]["val"], 9)
            self.assertEqual(summary["counts_after"]["val"], 9)
            self.assertEqual(summary["counts_before"]["test"], 9)
            self.assertEqual(summary["counts_after"]["test"], 9)

            train_imgs = get_image_files(out_ds / "train")
            self.assertEqual(len(train_imgs), 12)
            val_imgs = get_image_files(out_ds / "val")
            self.assertEqual(len(val_imgs), 9)

    def test_leakage_detection_blocks_integration(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td)
            base_ds, reg_path, pkg_dir, golden_dir, out_ds = self._create_synthetic_environment(
                tmp_path, simulate_leakage=True
            )
            with self.assertRaises(LeakageError) as ctx:
                integrate_agreed_samples(
                    base_dataset_dir=base_ds,
                    registry_path=reg_path,
                    sample_pkg_dir=pkg_dir,
                    golden_test_dir=golden_dir,
                    output_dataset_dir=out_ds,
                    enforce_real_counts=False,
                )
            self.assertIn("Data leakage detected", str(ctx.exception))

    def test_invalid_class_blocks_integration(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td)
            base_ds, reg_path, pkg_dir, golden_dir, out_ds = self._create_synthetic_environment(
                tmp_path, invalid_class="ramen_dish"
            )
            with self.assertRaises(IntegrationError) as ctx:
                integrate_agreed_samples(
                    base_dataset_dir=base_ds,
                    registry_path=reg_path,
                    sample_pkg_dir=pkg_dir,
                    golden_test_dir=golden_dir,
                    output_dataset_dir=out_ds,
                    enforce_real_counts=False,
                )
            self.assertIn("Invalid class 'ramen_dish'", str(ctx.exception))

    def test_real_registry_and_counts_when_state_exists(self) -> None:
        """Integration test on actual repository state if present."""
        if not (DEFAULT_BASE_DATASET.exists() and DEFAULT_REGISTRY_PATH.exists() and DEFAULT_SAMPLE_PKG_DIR.exists()):
            self.skipTest("Real dataset artifacts not present; skipping real-state test.")

        candidates = extract_agreed_candidates(DEFAULT_REGISTRY_PATH, enforce_real_counts=True)
        self.assertEqual(len(candidates), 54)
        class_counts = {c["mapped_class"] for c in candidates}
        self.assertEqual(class_counts, {"fish_dish", "meat_dish", "stir_fry", "fried_dish", "simmered_dish"})

    def test_path_collision_detection(self) -> None:
        """Verify that output_dataset_dir colliding with input paths raises ValueError."""
        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td)
            base_ds, reg_path, pkg_dir, golden_dir, _ = self._create_synthetic_environment(tmp_path)

            with self.assertRaises(ValueError) as ctx:
                integrate_agreed_samples(
                    base_dataset_dir=base_ds,
                    registry_path=reg_path,
                    sample_pkg_dir=pkg_dir,
                    golden_test_dir=golden_dir,
                    output_dataset_dir=base_ds,  # Collision!
                )
            self.assertIn("Path collision detected", str(ctx.exception))

    def test_raw_sha256_leakage_detection(self) -> None:
        """Verify that leakage is caught via raw_image_sha256 even if stripped bytes differ."""
        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td)
            base_ds, reg_path, pkg_dir, golden_dir, out_ds = self._create_synthetic_environment(tmp_path)

            from scripts.validate_zip2_audit_manifest import compute_sha256
            golden_img_0 = list(golden_dir.rglob("*.*"))[0]
            golden_raw_hash = compute_sha256(golden_img_0)

            mapping_file = pkg_dir / "private_reconciliation" / "blind_id_mapping.private.json"
            mapping_data = json.loads(mapping_file.read_text(encoding="utf-8"))
            mapping_data["records"][0]["raw_image_sha256"] = golden_raw_hash
            mapping_file.write_text(json.dumps(mapping_data), encoding="utf-8")

            with self.assertRaises(LeakageError) as ctx:
                integrate_agreed_samples(
                    base_dataset_dir=base_ds,
                    registry_path=reg_path,
                    sample_pkg_dir=pkg_dir,
                    golden_test_dir=golden_dir,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("CRITICAL LEAKAGE DETECTED", str(ctx.exception))

    def test_failure_preserves_existing_dataset(self) -> None:
        """Verify that failure during integration does not delete or corrupt existing output dataset."""
        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td)
            base_ds, reg_path, pkg_dir, golden_dir, out_ds = self._create_synthetic_environment(tmp_path)

            # 1st successful integration
            integrate_agreed_samples(
                base_dataset_dir=base_ds,
                registry_path=reg_path,
                sample_pkg_dir=pkg_dir,
                golden_test_dir=golden_dir,
                output_dataset_dir=out_ds,
            )
            summary_before = (out_ds / "integration_summary.json").read_text()

            # Create a 2nd environment that simulates leakage
            _, leak_reg, leak_pkg, _, _ = self._create_synthetic_environment(
                tmp_path / "leak_env", simulate_leakage=True
            )

            with self.assertRaises(LeakageError):
                integrate_agreed_samples(
                    base_dataset_dir=base_ds,
                    registry_path=leak_reg,
                    sample_pkg_dir=leak_pkg,
                    golden_test_dir=golden_dir,
                    output_dataset_dir=out_ds,
                )

            # Prior output must remain intact!
            self.assertTrue(out_ds.exists())
            self.assertEqual((out_ds / "integration_summary.json").read_text(), summary_before)

    def test_duplicate_image_id_rejected(self) -> None:
        """Verify duplicate image_id in agreed records is rejected."""
        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td)
            base_ds, reg_path, pkg_dir, golden_dir, out_ds = self._create_synthetic_environment(tmp_path)

            # Append a duplicate agreed record to registry
            with open(reg_path, "a", encoding="utf-8") as f:
                f.write("meshi_synth_01,fish_dish,meshi_synth_01.jpg,pending_human_review,sample_A,fish_dish,false\n")

            with self.assertRaises(IntegrationError) as ctx:
                integrate_agreed_samples(
                    base_dataset_dir=base_ds,
                    registry_path=reg_path,
                    sample_pkg_dir=pkg_dir,
                    golden_test_dir=golden_dir,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("Duplicate image_id 'meshi_synth_01'", str(ctx.exception))

    def test_source_path_mismatch_rejected(self) -> None:
        """Verify source_path mismatch between registry and mapping is rejected."""
        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td)
            base_ds, reg_path, pkg_dir, golden_dir, out_ds = self._create_synthetic_environment(tmp_path)

            mapping_file = pkg_dir / "private_reconciliation" / "blind_id_mapping.private.json"
            mapping_data = json.loads(mapping_file.read_text(encoding="utf-8"))
            mapping_data["records"][0]["source_path"] = "different_source_path.jpg"
            mapping_file.write_text(json.dumps(mapping_data), encoding="utf-8")

            with self.assertRaises(IntegrationError) as ctx:
                integrate_agreed_samples(
                    base_dataset_dir=base_ds,
                    registry_path=reg_path,
                    sample_pkg_dir=pkg_dir,
                    golden_test_dir=golden_dir,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("source_path mismatch", str(ctx.exception))

    def test_path_traversal_rejected(self) -> None:
        """Verify path traversal in agreed mapping is rejected."""
        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td)
            base_ds, reg_path, pkg_dir, golden_dir, out_ds = self._create_synthetic_environment(tmp_path)

            mapping_file = pkg_dir / "private_reconciliation" / "blind_id_mapping.private.json"
            mapping_data = json.loads(mapping_file.read_text(encoding="utf-8"))
            mapping_data["records"][0]["image_file"] = "../outside.jpg"
            mapping_file.write_text(json.dumps(mapping_data), encoding="utf-8")

            with self.assertRaises(IntegrationError) as ctx:
                integrate_agreed_samples(
                    base_dataset_dir=base_ds,
                    registry_path=reg_path,
                    sample_pkg_dir=pkg_dir,
                    golden_test_dir=golden_dir,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("Path traversal detected", str(ctx.exception))

    def test_missing_or_invalid_hash_rejected(self) -> None:
        """Verify missing or invalid hash format is rejected."""
        with tempfile.TemporaryDirectory() as td:
            tmp_path = Path(td)
            base_ds, reg_path, pkg_dir, golden_dir, out_ds = self._create_synthetic_environment(tmp_path)

            mapping_file = pkg_dir / "private_reconciliation" / "blind_id_mapping.private.json"
            mapping_data = json.loads(mapping_file.read_text(encoding="utf-8"))

            # Missing raw hash
            mapping_data["records"][0]["raw_image_sha256"] = ""
            mapping_file.write_text(json.dumps(mapping_data), encoding="utf-8")
            with self.assertRaises(IntegrationError) as ctx:
                integrate_agreed_samples(
                    base_dataset_dir=base_ds,
                    registry_path=reg_path,
                    sample_pkg_dir=pkg_dir,
                    golden_test_dir=golden_dir,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("Missing required 'raw_image_sha256'", str(ctx.exception))

            # Invalid hash format
            mapping_data["records"][0]["raw_image_sha256"] = "UPPERCASE_HASH"
            mapping_file.write_text(json.dumps(mapping_data), encoding="utf-8")
            with self.assertRaises(IntegrationError) as ctx:
                integrate_agreed_samples(
                    base_dataset_dir=base_ds,
                    registry_path=reg_path,
                    sample_pkg_dir=pkg_dir,
                    golden_test_dir=golden_dir,
                    output_dataset_dir=out_ds,
                )
            self.assertIn("Invalid SHA-256 format", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
