#!/usr/bin/env python3
"""Unit tests for deterministic eligible pseudo-label export pipeline.

Validates that only candidate_eligible samples (curry_rice & drink) are extracted,
mechanically guarantees that blocked classes and unaudited candidates cannot contaminate
the exported training dataset, verifies defensive invariant checks, and tests clean checkout
compatibility.
"""

from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

from scripts.export_eligible_pseudo_labels import (
    ALLOWED_PASSED_CLASSES,
    BLOCKED_CLASSES,
    DEFAULT_MANIFEST_PATH,
    DEFAULT_REGISTRY_PATH,
    EXPECTED_REAL_CLASS_COUNTS,
    EXPECTED_REAL_ELIGIBLE_TOTAL,
    ContaminationError,
    export_eligible_pseudo_labels,
    load_and_filter_eligible_records,
)

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent


class TestExportEligiblePseudoLabels(unittest.TestCase):
    def _create_synthetic_registry_and_manifest(
        self,
        tmp_dir: Path,
        extra_eligible: list[dict[str, str]] | None = None,
    ) -> tuple[Path, Path]:
        """Creates a minimal valid synthetic adoption registry and manifest for testing."""
        registry_path = tmp_dir / "test_adoption_registry.csv"
        manifest_path = tmp_dir / "test_manifest.csv"

        rows = [
            # 1. Valid eligible curry_rice
            {
                "image_id": "img_curry_001",
                "source_path": "curry_001.jpg",
                "mapped_class": "curry_rice",
                "audit_subset": "sample_A",
                "audit_predicted_class": "curry_rice",
                "audit_is_uncertain": "false",
                "audit_reason_code": "dominant_main_dish_clear",
                "class_gate_status": "passed",
                "adoption_status": "candidate_eligible",
                "rejection_reason": "class_gate_passed_inter_model_agreed_confident",
                "evaluated_at": "2026-10-11T00:00:00Z",
                "spec_version": "v2",
            },
            # 2. Valid eligible drink
            {
                "image_id": "img_drink_001",
                "source_path": "drink_001.jpg",
                "mapped_class": "drink",
                "audit_subset": "sample_A",
                "audit_predicted_class": "drink",
                "audit_is_uncertain": "false",
                "audit_reason_code": "dominant_main_dish_clear",
                "class_gate_status": "passed",
                "adoption_status": "candidate_eligible",
                "rejection_reason": "class_gate_passed_inter_model_agreed_confident",
                "evaluated_at": "2026-10-11T00:00:00Z",
                "spec_version": "v2",
            },
            # 3. Blocked class unaudited (must be excluded)
            {
                "image_id": "img_fish_unaudited",
                "source_path": "fish_unaudited.jpg",
                "mapped_class": "fish_dish",
                "audit_subset": "unaudited",
                "audit_predicted_class": "",
                "audit_is_uncertain": "",
                "audit_reason_code": "",
                "class_gate_status": "blocked",
                "adoption_status": "excluded_class_gate_blocked",
                "rejection_reason": "class_gate_blocked",
                "evaluated_at": "2026-10-11T00:00:00Z",
                "spec_version": "v2",
            },
            # 4. Blocked class audited agreement (must be pending_human_review, excluded)
            {
                "image_id": "img_fried_audited_agree",
                "source_path": "fried_001.jpg",
                "mapped_class": "fried_dish",
                "audit_subset": "sample_A",
                "audit_predicted_class": "fried_dish",
                "audit_is_uncertain": "false",
                "audit_reason_code": "dominant_main_dish_clear",
                "class_gate_status": "blocked",
                "adoption_status": "pending_human_review",
                "rejection_reason": "class_gate_blocked_inter_model_agreed",
                "evaluated_at": "2026-10-11T00:00:00Z",
                "spec_version": "v2",
            },
            # 5. Passed class unaudited (must remain unaudited_candidate_pending, excluded)
            {
                "image_id": "img_curry_unaudited",
                "source_path": "curry_unaudited.jpg",
                "mapped_class": "curry_rice",
                "audit_subset": "unaudited",
                "audit_predicted_class": "",
                "audit_is_uncertain": "",
                "audit_reason_code": "",
                "class_gate_status": "passed",
                "adoption_status": "unaudited_candidate_pending",
                "rejection_reason": "passed_class_individual_audit_pending",
                "evaluated_at": "2026-10-11T00:00:00Z",
                "spec_version": "v2",
            },
        ]

        if extra_eligible:
            rows.extend(extra_eligible)

        fieldnames = [
            "image_id",
            "source_path",
            "mapped_class",
            "audit_subset",
            "audit_predicted_class",
            "audit_is_uncertain",
            "audit_reason_code",
            "class_gate_status",
            "adoption_status",
            "rejection_reason",
            "evaluated_at",
            "spec_version",
        ]
        with open(registry_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

        manifest_rows = [
            {
                "image_id": r["image_id"],
                "source_path": r["source_path"],
                "primary_dish_key": r["mapped_class"],
                "analysis_confidence": "0.72",
            }
            for r in rows
        ]
        with open(manifest_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(
                f,
                fieldnames=["image_id", "source_path", "primary_dish_key", "analysis_confidence"],
            )
            writer.writeheader()
            writer.writerows(manifest_rows)

        return registry_path, manifest_path

    def test_export_clean_synthetic_dataset(self) -> None:
        """Verify normal extraction with synthetic registry: only eligible rows extracted."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            registry_path, manifest_path = self._create_synthetic_registry_and_manifest(tmp)
            output_dir = tmp / "export_output"

            manifest_csv, summary_json, _ = export_eligible_pseudo_labels(
                registry_path=registry_path,
                manifest_path=manifest_path,
                output_dir=output_dir,
            )

            self.assertTrue(manifest_csv.is_file())
            self.assertTrue(summary_json.is_file())

            with open(manifest_csv, "r", encoding="utf-8") as f:
                records = list(csv.DictReader(f))

            self.assertEqual(len(records), 2)
            self.assertEqual(records[0]["image_id"], "img_curry_001")
            self.assertEqual(records[0]["mapped_class"], "curry_rice")
            self.assertEqual(records[1]["image_id"], "img_drink_001")
            self.assertEqual(records[1]["mapped_class"], "drink")

            with open(summary_json, "r", encoding="utf-8") as f:
                summary = json.load(f)

            self.assertEqual(summary["eligible_sample_count"], 2)
            self.assertEqual(summary["class_distribution"], {"curry_rice": 1, "drink": 1})
            self.assertEqual(summary["blocked_classes_contamination_count"], 0)
            self.assertEqual(summary["unaudited_contamination_count"], 0)

    def test_contamination_blocked_class_marked_eligible_raises_error(self) -> None:
        """Verify that a blocked class improperly flagged as eligible triggers ContaminationError."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            tampered_row = {
                "image_id": "img_fried_illegal",
                "source_path": "fried_illegal.jpg",
                "mapped_class": "fried_dish",  # BLOCKED class!
                "audit_subset": "sample_A",
                "audit_predicted_class": "fried_dish",
                "audit_is_uncertain": "false",
                "audit_reason_code": "dominant_main_dish_clear",
                "class_gate_status": "passed",  # forged gate
                "adoption_status": "candidate_eligible",  # forged adoption
                "rejection_reason": "",
                "evaluated_at": "2026-10-11T00:00:00Z",
                "spec_version": "v2",
            }
            registry_path, manifest_path = self._create_synthetic_registry_and_manifest(
                tmp, extra_eligible=[tampered_row]
            )

            with self.assertRaises(ContaminationError) as ctx:
                load_and_filter_eligible_records(registry_path, manifest_path)
            self.assertIn("forbidden/blocked class 'fried_dish'", str(ctx.exception))

    def test_contamination_unaudited_marked_eligible_raises_error(self) -> None:
        """Verify that an unaudited candidate improperly marked eligible triggers ContaminationError."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            tampered_row = {
                "image_id": "img_curry_illegal_unaudited",
                "source_path": "curry_illegal.jpg",
                "mapped_class": "curry_rice",
                "audit_subset": "unaudited",  # Not audited in Sample A!
                "audit_predicted_class": "curry_rice",
                "audit_is_uncertain": "false",
                "audit_reason_code": "dominant_main_dish_clear",
                "class_gate_status": "passed",
                "adoption_status": "candidate_eligible",
                "rejection_reason": "",
                "evaluated_at": "2026-10-11T00:00:00Z",
                "spec_version": "v2",
            }
            registry_path, manifest_path = self._create_synthetic_registry_and_manifest(
                tmp, extra_eligible=[tampered_row]
            )

            with self.assertRaises(ContaminationError) as ctx:
                load_and_filter_eligible_records(registry_path, manifest_path)
            self.assertIn("unaudited leak", str(ctx.exception))

    def test_contamination_gate_blocked_marked_eligible_raises_error(self) -> None:
        """Verify that a sample with class_gate_status 'blocked' marked eligible raises error."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            tampered_row = {
                "image_id": "img_drink_blocked_mismatch",
                "source_path": "drink_mismatch.jpg",
                "mapped_class": "drink",
                "audit_subset": "sample_A",
                "audit_predicted_class": "drink",
                "audit_is_uncertain": "false",
                "audit_reason_code": "dominant_main_dish_clear",
                "class_gate_status": "blocked",  # Mismatch with candidate_eligible
                "adoption_status": "candidate_eligible",
                "rejection_reason": "",
                "evaluated_at": "2026-10-11T00:00:00Z",
                "spec_version": "v2",
            }
            registry_path, manifest_path = self._create_synthetic_registry_and_manifest(
                tmp, extra_eligible=[tampered_row]
            )

            with self.assertRaises(ContaminationError) as ctx:
                load_and_filter_eligible_records(registry_path, manifest_path)
            self.assertIn("class_gate_status is 'blocked'", str(ctx.exception))

    def test_contamination_uncertain_sample_marked_eligible_raises_error(self) -> None:
        """Verify that an uncertain audit sample marked eligible raises error."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            tampered_row = {
                "image_id": "img_drink_uncertain",
                "source_path": "drink_unc.jpg",
                "mapped_class": "drink",
                "audit_subset": "sample_A",
                "audit_predicted_class": "drink",
                "audit_is_uncertain": "true",  # Uncertain!
                "audit_reason_code": "multiple_dishes_unresolvable",
                "class_gate_status": "passed",
                "adoption_status": "candidate_eligible",
                "rejection_reason": "",
                "evaluated_at": "2026-10-11T00:00:00Z",
                "spec_version": "v2",
            }
            registry_path, manifest_path = self._create_synthetic_registry_and_manifest(
                tmp, extra_eligible=[tampered_row]
            )

            with self.assertRaises(ContaminationError) as ctx:
                load_and_filter_eligible_records(registry_path, manifest_path)
            self.assertIn("audit_is_uncertain is 'true'", str(ctx.exception))

    def test_contamination_inter_model_disagreement_marked_eligible_raises_error(self) -> None:
        """Verify that an inter-model disagreement marked eligible raises error."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            tampered_row = {
                "image_id": "img_disagreement",
                "source_path": "disagree.jpg",
                "mapped_class": "curry_rice",
                "audit_subset": "sample_A",
                "audit_predicted_class": "drink",  # Disagrees with mapped_class!
                "audit_is_uncertain": "false",
                "audit_reason_code": "dominant_main_dish_clear",
                "class_gate_status": "passed",
                "adoption_status": "candidate_eligible",
                "rejection_reason": "",
                "evaluated_at": "2026-10-11T00:00:00Z",
                "spec_version": "v2",
            }
            registry_path, manifest_path = self._create_synthetic_registry_and_manifest(
                tmp, extra_eligible=[tampered_row]
            )

            with self.assertRaises(ContaminationError) as ctx:
                load_and_filter_eligible_records(registry_path, manifest_path)
            self.assertIn("mapped_class 'curry_rice' != audit_predicted 'drink'", str(ctx.exception))

    def test_duplicate_image_id_raises_error(self) -> None:
        """Verify that duplicate image_id within eligible set raises ContaminationError."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            dup_row = {
                "image_id": "img_curry_001",  # Duplicate of row 1!
                "source_path": "curry_dup.jpg",
                "mapped_class": "curry_rice",
                "audit_subset": "sample_A",
                "audit_predicted_class": "curry_rice",
                "audit_is_uncertain": "false",
                "audit_reason_code": "dominant_main_dish_clear",
                "class_gate_status": "passed",
                "adoption_status": "candidate_eligible",
                "rejection_reason": "",
                "evaluated_at": "2026-10-11T00:00:00Z",
                "spec_version": "v2",
            }
            registry_path, manifest_path = self._create_synthetic_registry_and_manifest(
                tmp, extra_eligible=[dup_row]
            )

            with self.assertRaises(ContaminationError) as ctx:
                load_and_filter_eligible_records(registry_path, manifest_path)
            self.assertIn("Duplicate image_id 'img_curry_001'", str(ctx.exception))

    def test_real_adoption_registry_export_integrity(self) -> None:
        """Integration test against actual repository state when files exist.

        Skipped gracefully on clean checkout environments where state/ data is not committed.
        """
        if not (DEFAULT_REGISTRY_PATH.is_file() and DEFAULT_MANIFEST_PATH.is_file()):
            self.skipTest("Real adoption registry or manifest not present (clean checkout); skipped.")

        with tempfile.TemporaryDirectory() as tmp_dir:
            output_dir = Path(tmp_dir) / "test_real_export"
            manifest_csv, summary_json, _ = export_eligible_pseudo_labels(
                registry_path=DEFAULT_REGISTRY_PATH,
                manifest_path=DEFAULT_MANIFEST_PATH,
                output_dir=output_dir,
                enforce_real_counts=True,
            )

            self.assertTrue(manifest_csv.is_file())
            self.assertTrue(summary_json.is_file())

            with open(manifest_csv, "r", encoding="utf-8") as f:
                records = list(csv.DictReader(f))

            # 1. Exact count check (74)
            self.assertEqual(len(records), EXPECTED_REAL_ELIGIBLE_TOTAL)

            # 2. Class distribution check
            classes = [r["mapped_class"] for r in records]
            class_counts = {c: classes.count(c) for c in set(classes)}
            self.assertEqual(class_counts, EXPECTED_REAL_CLASS_COUNTS)

            # 3. Blocked classes must be zero
            for b in BLOCKED_CLASSES:
                self.assertEqual(classes.count(b), 0, f"Blocked class '{b}' leaked into export!")

            # 4. Invariants on every row
            for r in records:
                self.assertEqual(r["adoption_status"], "candidate_eligible")
                self.assertEqual(r["class_gate_status"], "passed")
                self.assertEqual(r["audit_is_uncertain"], "false")
                self.assertEqual(r["mapped_class"], r["audit_predicted_class"])
                self.assertIn(r["mapped_class"], ALLOWED_PASSED_CLASSES)

            # 5. Deterministic sorting
            expected_sorted_pairs = sorted([(r["mapped_class"], r["image_id"]) for r in records])
            actual_pairs = [(r["mapped_class"], r["image_id"]) for r in records]
            self.assertEqual(actual_pairs, expected_sorted_pairs)


    def test_copy_images_with_sha256_verification(self) -> None:
        """Verify that --copy-images copies files and confirms SHA-256 match."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            registry_path, manifest_path = self._create_synthetic_registry_and_manifest(tmp)
            images_dir = tmp / "src_images"
            images_dir.mkdir()

            # Create dummy image files matching the eligible rows
            curry_img = images_dir / "curry_001.jpg"
            curry_img.write_bytes(b"\xff\xd8\xff\xe0dummy_curry_bytes\xff\xd9")
            drink_img = images_dir / "drink_001.jpg"
            drink_img.write_bytes(b"\xff\xd8\xff\xe0dummy_drink_bytes\xff\xd9")

            output_dir = tmp / "export_output"

            manifest_csv, summary_json, exported_images = export_eligible_pseudo_labels(
                registry_path=registry_path,
                manifest_path=manifest_path,
                output_dir=output_dir,
                images_dir=images_dir,
                copy_images=True,
            )

            self.assertIsNotNone(exported_images)
            assert exported_images is not None
            self.assertTrue((exported_images / "img_curry_001.jpg").is_file())
            self.assertTrue((exported_images / "img_drink_001.jpg").is_file())

            # Verify byte equality
            self.assertEqual(
                (exported_images / "img_curry_001.jpg").read_bytes(),
                curry_img.read_bytes(),
            )
            self.assertEqual(
                (exported_images / "img_drink_001.jpg").read_bytes(),
                drink_img.read_bytes(),
            )

            with open(summary_json, "r", encoding="utf-8") as f:
                summary = json.load(f)
            self.assertEqual(summary["copied_images_count"], 2)

    def test_copy_images_missing_file_raises_error(self) -> None:
        """Verify that missing image file raises FileNotFoundError when copy_images=True."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            registry_path, manifest_path = self._create_synthetic_registry_and_manifest(tmp)
            images_dir = tmp / "empty_images_dir"
            images_dir.mkdir()
            output_dir = tmp / "export_output"

            with self.assertRaises(FileNotFoundError) as ctx:
                export_eligible_pseudo_labels(
                    registry_path=registry_path,
                    manifest_path=manifest_path,
                    output_dir=output_dir,
                    images_dir=images_dir,
                    copy_images=True,
                )
            self.assertIn("Image file not found", str(ctx.exception))

    def test_rerun_eliminates_orphan_images(self) -> None:
        """Verify rerun completely replaces directory, ensuring orphan images from prior runs are eliminated."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            registry_path, manifest_path = self._create_synthetic_registry_and_manifest(tmp)
            images_dir = tmp / "raw_images"
            images_dir.mkdir()
            (images_dir / "curry_001.jpg").write_bytes(b"dummy curry bytes")
            (images_dir / "drink_001.jpg").write_bytes(b"dummy drink bytes")
            output_dir = tmp / "export_output"

            # 1st run
            export_eligible_pseudo_labels(
                registry_path=registry_path,
                manifest_path=manifest_path,
                output_dir=output_dir,
                images_dir=images_dir,
                copy_images=True,
            )
            # Inject orphan image into existing output
            orphan_img = output_dir / "images" / "orphan_ghost_sample.jpg"
            orphan_img.write_bytes(b"ghost data")
            self.assertTrue(orphan_img.exists())

            # 2nd run
            export_eligible_pseudo_labels(
                registry_path=registry_path,
                manifest_path=manifest_path,
                output_dir=output_dir,
                images_dir=images_dir,
                copy_images=True,
            )
            # Verify orphan image is cleanly eliminated
            self.assertFalse(orphan_img.exists())
            images_in_output = sorted(p.name for p in (output_dir / "images").glob("*.jpg"))
            self.assertEqual(images_in_output, ["img_curry_001.jpg", "img_drink_001.jpg"])

    def test_failure_preserves_existing_output(self) -> None:
        """Verify that mid-run failures do not destroy or corrupt existing output directory."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            registry_path, manifest_path = self._create_synthetic_registry_and_manifest(tmp)
            images_dir = tmp / "raw_images"
            images_dir.mkdir()
            curry_file = images_dir / "curry_001.jpg"
            drink_file = images_dir / "drink_001.jpg"
            curry_file.write_bytes(b"curry bytes")
            drink_file.write_bytes(b"drink bytes")
            output_dir = tmp / "export_output"

            # 1st run successfully creates output
            export_eligible_pseudo_labels(
                registry_path=registry_path,
                manifest_path=manifest_path,
                output_dir=output_dir,
                images_dir=images_dir,
                copy_images=True,
            )
            manifest_before = (output_dir / "eligible_pseudo_labels_manifest.csv").read_text()

            # Now delete drink_file to induce mid-run FileNotFoundError on 2nd run
            drink_file.unlink()

            with self.assertRaises(FileNotFoundError):
                export_eligible_pseudo_labels(
                    registry_path=registry_path,
                    manifest_path=manifest_path,
                    output_dir=output_dir,
                    images_dir=images_dir,
                    copy_images=True,
                )

            # Prior output must remain intact!
            self.assertTrue(output_dir.exists())
            self.assertEqual(
                (output_dir / "eligible_pseudo_labels_manifest.csv").read_text(),
                manifest_before,
            )
            self.assertTrue((output_dir / "images" / "img_curry_001.jpg").exists())
            self.assertTrue((output_dir / "images" / "img_drink_001.jpg").exists())

    def test_path_collision_detection(self) -> None:
        """Verify that output_dir colliding with input paths raises ValueError."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp = Path(tmp_dir)
            registry_path, manifest_path = self._create_synthetic_registry_and_manifest(tmp)
            images_dir = tmp / "raw_images"
            images_dir.mkdir()

            # output_dir identical to images_dir
            with self.assertRaises(ValueError) as ctx:
                export_eligible_pseudo_labels(
                    registry_path=registry_path,
                    manifest_path=manifest_path,
                    output_dir=images_dir,
                    images_dir=images_dir,
                    copy_images=True,
                )
            self.assertIn("Path collision detected", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()

