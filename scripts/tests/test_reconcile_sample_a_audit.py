from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

from scripts.dataset_safety_guards import SafetyError
from scripts.reconcile_sample_a_audit import (
    CLASS_GATE_MIN_AGREEMENT,
    TARGET_CLASSES,
    compute_hypergeometric_exact_interval,
    compute_wilson_score_interval,
    reconcile_audit,
    write_reconciliation_outputs,
)

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
REAL_MANIFEST = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-audit-manifest-20261009"
    / "image_audit_manifest_remediated.csv"
)
REAL_PREDICTIONS = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-audit-manifest-20261009"
    / "gemini_audit_sample_A_predictions"
    / "blind_predictions.jsonl"
)
REAL_MAPPING = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-audit-manifest-20261009"
    / "gemini_audit_sample_A_pkg"
    / "private_reconciliation"
    / "blind_id_mapping.private.json"
)
REAL_PILOT_MAPPING = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-audit-manifest-20261009"
    / "gemini_audit_sample_70"
    / "blind_id_mapping.private.json"
)


class TestReconcileSampleAAudit(unittest.TestCase):
    def test_hypergeometric_exact_interval_known_table(self) -> None:
        """Verify hypergeometric exact confidence intervals match finalized spec table exactly."""
        known_cases = [
            # N, n, k, expected_m_lower, expected_m_upper
            (108, 40, 31, 70, 94),
            (108, 40, 32, 73, 96),
            (109, 40, 31, 71, 94),
            (109, 40, 32, 74, 97),
            (110, 40, 31, 72, 95),
            (110, 40, 32, 75, 97),
        ]
        for N, n, k, exp_l, exp_u in known_cases:
            m_l, m_u, p_l, p_u = compute_hypergeometric_exact_interval(N, n, k, alpha=0.05)
            self.assertEqual(
                (m_l, m_u),
                (exp_l, exp_u),
                f"Mismatch for N={N}, n={n}, k={k}: got [{m_l}, {m_u}], expected [{exp_l}, {exp_u}]",
            )
            self.assertAlmostEqual(p_l, exp_l / N, places=5)
            self.assertAlmostEqual(p_u, exp_u / N, places=5)

    def test_class_gate_minimum_k_threshold(self) -> None:
        """Verify k=31 is BLOCKED and k=32 is PASS across all population sizes N in {108, 109, 110}."""
        for N in (108, 109, 110):
            # k=31 (77.5%) -> must be blocked
            _, _, p_low_31, _ = compute_hypergeometric_exact_interval(N, 40, 31)
            passed_31 = (31 / 40 >= 0.80) and (p_low_31 >= 0.65)
            self.assertFalse(passed_31, f"k=31 should not pass gate for N={N}")

            # k=32 (80.0%) -> must pass
            _, _, p_low_32, _ = compute_hypergeometric_exact_interval(N, 40, 32)
            passed_32 = (32 / 40 >= 0.80) and (p_low_32 >= 0.65)
            self.assertTrue(passed_32, f"k=32 should pass gate for N={N}")
            self.assertGreaterEqual(p_low_32, 0.65)

    def test_wilson_score_interval(self) -> None:
        """Verify Wilson score interval calculation."""
        low, high = compute_wilson_score_interval(40, 32)
        self.assertAlmostEqual(low, 0.6524, places=3)
        self.assertAlmostEqual(high, 0.8950, places=3)

    def test_reconcile_audit_synthetic_clean_checkout(self) -> None:
        """Verify full reconciliation pipeline on self-contained synthetic fixtures (clean checkout safe)."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)

            manifest_path = tmp_path / "synthetic_manifest.csv"
            predictions_path = tmp_path / "synthetic_predictions.jsonl"
            mapping_path = tmp_path / "synthetic_mapping.json"
            pilot_mapping_path = tmp_path / "synthetic_pilot_mapping.json"
            output_dir = tmp_path / "eval_out"
            registry_path = tmp_path / "adoption_registry.csv"

            # Create synthetic pilot 70 mapping
            pilot_records = []
            for i in range(1, 71):
                pilot_records.append({"image_id": f"pilot_img_{i:03d}", "mapped_class": "drink"})
            pilot_mapping_path.write_text(json.dumps({"records": pilot_records}), encoding="utf-8")

            # Create synthetic Sample A mapping (280) and predictions (280)
            sample_a_mapping_records = []
            prediction_lines = []

            # We will make 'drink' 100% pass (40/40), and other classes fail (10/40)
            for idx in range(1, 281):
                cls = TARGET_CLASSES[(idx - 1) % len(TARGET_CLASSES)]
                b_id = f"blind_A_{idx:03d}"
                img_id = f"sample_a_img_{idx:03d}"

                sample_a_mapping_records.append({
                    "blind_id": b_id,
                    "image_id": img_id,
                    "source_path": f"sample_{idx:03d}.jpg",
                    "mapped_class": cls,
                    "primary_dish_key": cls,
                    "analysis_confidence": "0.80",
                })

                if cls == "drink":
                    pred_cls = "drink"
                    is_unc = False
                    r_code = "clear_single_dish"
                else:
                    pred_cls = "unknown"
                    is_unc = True
                    r_code = "multiple_dishes_unresolvable"

                prediction_lines.append(json.dumps({
                    "blind_id": b_id,
                    "predicted_class": pred_cls,
                    "is_uncertain": is_unc,
                    "reason_code": r_code,
                }))

            mapping_path.write_text(json.dumps({"records": sample_a_mapping_records}), encoding="utf-8")
            predictions_path.write_text("\n".join(prediction_lines) + "\n", encoding="utf-8")

            # Create synthetic manifest: 70 pilot + 280 sample A + 481 unaudited = 831 candidates
            manifest_rows = []
            for r in pilot_records:
                manifest_rows.append({
                    "image_id": r["image_id"],
                    "source_path": f"{r['image_id']}.jpg",
                    "mapped_class": r["mapped_class"],
                    "assigned_role": "pseudo_label_candidate",
                })
            for r in sample_a_mapping_records:
                manifest_rows.append({
                    "image_id": r["image_id"],
                    "source_path": r["source_path"],
                    "mapped_class": r["mapped_class"],
                    "assigned_role": "pseudo_label_candidate",
                })
            for i in range(1, 482):
                cls = TARGET_CLASSES[(i - 1) % len(TARGET_CLASSES)]
                manifest_rows.append({
                    "image_id": f"unaudited_img_{i:03d}",
                    "source_path": f"unaudited_{i:03d}.jpg",
                    "mapped_class": cls,
                    "assigned_role": "pseudo_label_candidate",
                })

            fieldnames = ["image_id", "source_path", "mapped_class", "assigned_role"]
            with open(manifest_path, "w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(manifest_rows)

            # Run reconciliation
            res = reconcile_audit(
                manifest_path=manifest_path,
                predictions_path=predictions_path,
                mapping_path=mapping_path,
                pilot_mapping_path=pilot_mapping_path,
                verify_predictions_sha256=False,
                verify_manifest_sha256=False,
            )

            # Verify results
            self.assertEqual(res["sample_a_count"], 280)
            self.assertEqual(res["passed_classes"], ["drink"])
            self.assertEqual(len(res["blocked_classes"]), 6)
            self.assertEqual(res["overall_sample_agreement_count"], 40)

            # Write outputs
            reg_out, rep_out, met_out = write_reconciliation_outputs(res, output_dir, registry_path)
            self.assertTrue(reg_out.is_file())
            self.assertTrue(rep_out.is_file())
            self.assertTrue(met_out.is_file())

            # Read registry CSV
            with open(reg_out, "r", encoding="utf-8") as f:
                reader = list(csv.DictReader(f))
                self.assertEqual(len(reader), 831)

                eligible = [r for r in reader if r["adoption_status"] == "candidate_eligible"]
                self.assertEqual(len(eligible), 40)
                for e in eligible:
                    self.assertEqual(e["mapped_class"], "drink")

    def test_real_sample_a_reconciliation_integrity(self) -> None:
        """Verify real Sample A reconciliation results when real data exists in repository."""
        if not (REAL_MANIFEST.exists() and REAL_PREDICTIONS.exists() and REAL_MAPPING.exists()):
            self.skipTest("Real audit data not present (clean checkout); skipped.")

        res = reconcile_audit(
            manifest_path=REAL_MANIFEST,
            predictions_path=REAL_PREDICTIONS,
            mapping_path=REAL_MAPPING,
            pilot_mapping_path=REAL_PILOT_MAPPING,
            verify_predictions_sha256=True,
        )

        self.assertEqual(res["sample_a_count"], 280)
        self.assertEqual(res["overall_sample_agreement_count"], 128)
        self.assertAlmostEqual(res["overall_sample_agreement_rate"], 128 / 280, places=4)
        self.assertEqual(res["passed_classes"], ["curry_rice", "drink"])
        self.assertEqual(
            res["blocked_classes"],
            ["fish_dish", "fried_dish", "meat_dish", "simmered_dish", "stir_fry"],
        )

        # Check two-tier adoption counts
        counts = res["adoption_counts"]
        self.assertEqual(counts["candidate_eligible"], 74)
        self.assertEqual(counts["excluded_class_gate_blocked"], 343)
        self.assertEqual(counts["unaudited_candidate_pending"], 138)
        self.assertEqual(counts["excluded_multiple_mains"], 88)
        self.assertEqual(counts["pending_human_review"], 124)
        self.assertEqual(counts["excluded_inter_model_disagreement"], 43)
        self.assertEqual(counts["excluded_out_of_class_set"], 21)
        self.assertEqual(sum(counts.values()), 831)

    def _create_minimal_fixtures(self, tmp_path: Path):
        manifest_path = tmp_path / "manifest.csv"
        predictions_path = tmp_path / "predictions.jsonl"
        mapping_path = tmp_path / "mapping.json"

        mapping_records = []
        prediction_lines = []
        for idx in range(1, 281):
            cls = TARGET_CLASSES[(idx - 1) % len(TARGET_CLASSES)]
            b_id = f"blind_{idx:03d}"
            img_id = f"img_{idx:03d}"
            mapping_records.append({
                "blind_id": b_id,
                "image_id": img_id,
                "source_path": f"{img_id}.jpg",
                "mapped_class": cls,
            })
            prediction_lines.append(json.dumps({
                "blind_id": b_id,
                "predicted_class": cls,
                "is_uncertain": False,
                "reason_code": "clear",
            }))

        mapping_path.write_text(json.dumps({"records": mapping_records}), encoding="utf-8")
        predictions_path.write_text("\n".join(prediction_lines) + "\n", encoding="utf-8")

        manifest_rows = []
        for r in mapping_records:
            manifest_rows.append({
                "image_id": r["image_id"],
                "source_path": r["source_path"],
                "mapped_class": r["mapped_class"],
                "assigned_role": "pseudo_label_candidate",
            })
        for i in range(281, 832):
            cls = TARGET_CLASSES[(i - 1) % len(TARGET_CLASSES)]
            manifest_rows.append({
                "image_id": f"img_{i:03d}",
                "source_path": f"img_{i:03d}.jpg",
                "mapped_class": cls,
                "assigned_role": "pseudo_label_candidate",
            })

        fieldnames = ["image_id", "source_path", "mapped_class", "assigned_role"]
        with open(manifest_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(manifest_rows)

        return manifest_path, predictions_path, mapping_path

    def test_manifest_sha256_mismatch_raises(self) -> None:
        """Verify reconciliation raises ValueError when manifest SHA does not match expected."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            man_path, pred_path, map_path = self._create_minimal_fixtures(tmp_path)
            with self.assertRaises(ValueError) as ctx:
                reconcile_audit(
                    manifest_path=man_path,
                    predictions_path=pred_path,
                    mapping_path=map_path,
                    verify_predictions_sha256=False,
                    verify_manifest_sha256=True,
                    expected_manifest_sha256="0" * 64,
                )
            self.assertIn("Manifest SHA-256 mismatch", str(ctx.exception))

    def test_mapping_manifest_source_path_mismatch_raises(self) -> None:
        """Verify reconciliation raises ValueError when source_path in mapping doesn't match manifest."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            man_path, pred_path, map_path = self._create_minimal_fixtures(tmp_path)
            # Tamper mapping source_path
            data = json.loads(map_path.read_text(encoding="utf-8"))
            data["records"][0]["source_path"] = "corrupted_path.jpg"
            map_path.write_text(json.dumps(data), encoding="utf-8")

            with self.assertRaises(ValueError) as ctx:
                reconcile_audit(
                    manifest_path=man_path,
                    predictions_path=pred_path,
                    mapping_path=map_path,
                    verify_predictions_sha256=False,
                    verify_manifest_sha256=False,
                )
            self.assertIn("source_path mismatch", str(ctx.exception))

    def test_mapping_manifest_mapped_class_mismatch_raises(self) -> None:
        """Verify reconciliation raises ValueError when mapped_class in mapping doesn't match manifest."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            man_path, pred_path, map_path = self._create_minimal_fixtures(tmp_path)
            # Tamper mapping mapped_class
            data = json.loads(map_path.read_text(encoding="utf-8"))
            data["records"][0]["mapped_class"] = "other_or_exclude"
            map_path.write_text(json.dumps(data), encoding="utf-8")

            with self.assertRaises(ValueError) as ctx:
                reconcile_audit(
                    manifest_path=man_path,
                    predictions_path=pred_path,
                    mapping_path=map_path,
                    verify_predictions_sha256=False,
                    verify_manifest_sha256=False,
                )
            self.assertIn("mapped_class mismatch", str(ctx.exception))

    def test_mapping_image_missing_from_manifest_raises(self) -> None:
        """Verify reconciliation raises ValueError when mapping image_id is not in manifest."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            man_path, pred_path, map_path = self._create_minimal_fixtures(tmp_path)
            # Tamper mapping image_id
            data = json.loads(map_path.read_text(encoding="utf-8"))
            data["records"][0]["image_id"] = "non_existent_img_id"
            map_path.write_text(json.dumps(data), encoding="utf-8")

            with self.assertRaises(ValueError) as ctx:
                reconcile_audit(
                    manifest_path=man_path,
                    predictions_path=pred_path,
                    mapping_path=map_path,
                    verify_predictions_sha256=False,
                    verify_manifest_sha256=False,
                )
            self.assertIn("not found in pseudo_label_candidates manifest", str(ctx.exception))

    def test_class_count_imbalance_raises(self) -> None:
        """Verify reconciliation raises ValueError when a target class does not have exactly 40 items."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            man_path, pred_path, map_path = self._create_minimal_fixtures(tmp_path)
            # Change first record class to create imbalance (39 vs 41)
            data = json.loads(map_path.read_text(encoding="utf-8"))
            orig_cls = data["records"][0]["mapped_class"]
            new_cls = TARGET_CLASSES[(TARGET_CLASSES.index(orig_cls) + 1) % len(TARGET_CLASSES)]
            data["records"][0]["mapped_class"] = new_cls
            map_path.write_text(json.dumps(data), encoding="utf-8")

            # Also update manifest so manifest cross-check passes and hits class count check
            with open(man_path, "r", encoding="utf-8") as f:
                rows = list(csv.DictReader(f))
            rows[0]["mapped_class"] = new_cls
            with open(man_path, "w", encoding="utf-8", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=["image_id", "source_path", "mapped_class", "assigned_role"])
                writer.writeheader()
                writer.writerows(rows)

            with self.assertRaises(ValueError) as ctx:
                reconcile_audit(
                    manifest_path=man_path,
                    predictions_path=pred_path,
                    mapping_path=map_path,
                    verify_predictions_sha256=False,
                    verify_manifest_sha256=False,
                )
            self.assertIn("class count mismatch", str(ctx.exception))

    def test_package_image_verification(self) -> None:
        """Verify package image SHA-256 validation checks work and catch missing/mismatched files."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            man_path, pred_path, map_path = self._create_minimal_fixtures(tmp_path)
            img_dir = tmp_path / "blind_images"
            img_dir.mkdir()

            # Create dummy images and add sha to mapping
            from scripts.validate_zip2_audit_manifest import compute_sha256
            data = json.loads(map_path.read_text(encoding="utf-8"))
            for r in data["records"]:
                img_file = img_dir / f"{r['blind_id']}.jpg"
                img_file.write_bytes(b"dummy image bytes " + r["blind_id"].encode("utf-8"))
                r["image_file"] = f"{r['blind_id']}.jpg"
                r["stripped_image_sha256"] = compute_sha256(img_file)
            map_path.write_text(json.dumps(data), encoding="utf-8")

            # Should pass when verify_images=True
            res = reconcile_audit(
                manifest_path=man_path,
                predictions_path=pred_path,
                mapping_path=map_path,
                verify_predictions_sha256=False,
                verify_manifest_sha256=False,
                images_dir=img_dir,
                verify_images=True,
            )
            self.assertEqual(res["sample_a_count"], 280)

            # Corrupt one image
            corrupt_file = img_dir / f"{data['records'][0]['blind_id']}.jpg"
            corrupt_file.write_bytes(b"corrupted bytes")
            with self.assertRaises(ValueError) as ctx:
                reconcile_audit(
                    manifest_path=man_path,
                    predictions_path=pred_path,
                    mapping_path=map_path,
                    verify_predictions_sha256=False,
                    verify_manifest_sha256=False,
                    images_dir=img_dir,
                    verify_images=True,
                )
            self.assertIn("Package image SHA-256 mismatch", str(ctx.exception))

            # Missing image
            corrupt_file.unlink()
            with self.assertRaises(FileNotFoundError) as ctx:
                reconcile_audit(
                    manifest_path=man_path,
                    predictions_path=pred_path,
                    mapping_path=map_path,
                    verify_predictions_sha256=False,
                    verify_manifest_sha256=False,
                    images_dir=img_dir,
                    verify_images=True,
                )
            self.assertIn("Package image missing", str(ctx.exception))

    def test_package_image_sha256_strict_validation(self) -> None:
        """Verify strict SHA-256 enforcement: presence, 64-hex format, case-insensitivity, and mismatch."""
        from scripts.validate_zip2_audit_manifest import compute_sha256

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            man_path, pred_path, map_path = self._create_minimal_fixtures(tmp_path)
            img_dir = tmp_path / "blind_images"
            img_dir.mkdir()

            def setup_valid_mapping(sha_override_fn=None):
                data = json.loads(map_path.read_text(encoding="utf-8"))
                for r in data["records"]:
                    img_file = img_dir / f"{r['blind_id']}.jpg"
                    if not img_file.exists():
                        img_file.write_bytes(b"dummy image bytes " + r["blind_id"].encode("utf-8"))
                    r["image_file"] = f"{r['blind_id']}.jpg"
                    calc_sha = compute_sha256(img_file)
                    r["stripped_image_sha256"] = sha_override_fn(r["blind_id"], calc_sha) if sha_override_fn else calc_sha
                map_path.write_text(json.dumps(data), encoding="utf-8")

            # 1. Valid SHA-256 (including uppercase compatibility) succeeds
            setup_valid_mapping(lambda b_id, s: s.upper() if b_id.endswith("001") else s.lower())
            res = reconcile_audit(
                manifest_path=man_path,
                predictions_path=pred_path,
                mapping_path=map_path,
                verify_predictions_sha256=False,
                verify_manifest_sha256=False,
                images_dir=img_dir,
                verify_images=True,
            )
            self.assertEqual(res["sample_a_count"], 280)

            # 2. Missing SHA-256 (None) fails
            setup_valid_mapping(lambda b_id, s: None if b_id.endswith("001") else s)
            with self.assertRaises(ValueError) as ctx:
                reconcile_audit(
                    manifest_path=man_path,
                    predictions_path=pred_path,
                    mapping_path=map_path,
                    verify_predictions_sha256=False,
                    verify_manifest_sha256=False,
                    images_dir=img_dir,
                    verify_images=True,
                )
            self.assertIn("missing required stripped_image_sha256", str(ctx.exception))

            # 3. Empty string / whitespace SHA-256 fails
            setup_valid_mapping(lambda b_id, s: "   " if b_id.endswith("001") else s)
            with self.assertRaises(ValueError) as ctx:
                reconcile_audit(
                    manifest_path=man_path,
                    predictions_path=pred_path,
                    mapping_path=map_path,
                    verify_predictions_sha256=False,
                    verify_manifest_sha256=False,
                    images_dir=img_dir,
                    verify_images=True,
                )
            self.assertIn("missing required stripped_image_sha256", str(ctx.exception))

            # 4. Non-64-hex format fails (too short, too long, non-hex)
            for bad_sha in ["a" * 63, "a" * 65, "g" * 64, "invalid_hex!"]:
                setup_valid_mapping(lambda b_id, s, bs=bad_sha: bs if b_id.endswith("001") else s)
                with self.assertRaises(ValueError) as ctx:
                    reconcile_audit(
                        manifest_path=man_path,
                        predictions_path=pred_path,
                        mapping_path=map_path,
                        verify_predictions_sha256=False,
                        verify_manifest_sha256=False,
                        images_dir=img_dir,
                        verify_images=True,
                    )
                self.assertIn("Invalid stripped_image_sha256 format", str(ctx.exception))

            # 5. Correct format but mismatching hash fails
            setup_valid_mapping(lambda b_id, s: "0" * 64 if b_id.endswith("001") else s)
            with self.assertRaises(ValueError) as ctx:
                reconcile_audit(
                    manifest_path=man_path,
                    predictions_path=pred_path,
                    mapping_path=map_path,
                    verify_predictions_sha256=False,
                    verify_manifest_sha256=False,
                    images_dir=img_dir,
                    verify_images=True,
                )
            self.assertIn("Package image SHA-256 mismatch", str(ctx.exception))

    def test_package_image_path_traversal_prevention(self) -> None:
        """Verify that ../ traversal, absolute paths outside images_dir, and symlinks escaping images_dir are rejected."""
        import os
        from scripts.validate_zip2_audit_manifest import compute_sha256

        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_path = Path(tmp_dir)
            man_path, pred_path, map_path = self._create_minimal_fixtures(tmp_path)
            img_dir = tmp_path / "blind_images"
            img_dir.mkdir()
            outside_dir = tmp_path / "outside_secret"
            outside_dir.mkdir()
            secret_file = outside_dir / "secret.jpg"
            secret_file.write_bytes(b"sensitive outside content")

            def setup_mapping_with_path(target_path_str: str):
                data = json.loads(map_path.read_text(encoding="utf-8"))
                for idx, r in enumerate(data["records"]):
                    if idx == 0:
                        r["image_file"] = target_path_str
                        r["stripped_image_sha256"] = compute_sha256(secret_file)
                    else:
                        img_file = img_dir / f"{r['blind_id']}.jpg"
                        if not img_file.exists():
                            img_file.write_bytes(b"dummy image bytes " + r["blind_id"].encode("utf-8"))
                        r["image_file"] = f"{r['blind_id']}.jpg"
                        r["stripped_image_sha256"] = compute_sha256(img_file)
                map_path.write_text(json.dumps(data), encoding="utf-8")

            # 1. Normal image paths work (verified in test_package_image_verification)

            # 2. Relative traversal ../ outside images_dir is rejected
            setup_mapping_with_path("../outside_secret/secret.jpg")
            with self.assertRaises(SafetyError) as ctx:
                reconcile_audit(
                    manifest_path=man_path,
                    predictions_path=pred_path,
                    mapping_path=map_path,
                    verify_predictions_sha256=False,
                    verify_manifest_sha256=False,
                    images_dir=img_dir,
                    verify_images=True,
                )
            self.assertIn("Path traversal detected", str(ctx.exception))

            # 3. Absolute path outside images_dir is rejected
            setup_mapping_with_path(str(secret_file.resolve()))
            with self.assertRaises(SafetyError) as ctx:
                reconcile_audit(
                    manifest_path=man_path,
                    predictions_path=pred_path,
                    mapping_path=map_path,
                    verify_predictions_sha256=False,
                    verify_manifest_sha256=False,
                    images_dir=img_dir,
                    verify_images=True,
                )
            self.assertIn("Path traversal detected", str(ctx.exception))

            # 4. Symlink inside images_dir pointing outside is rejected
            symlink_path = img_dir / "escaping_symlink.jpg"
            try:
                os.symlink(secret_file, symlink_path)
                has_symlink = True
            except (OSError, NotImplementedError):
                has_symlink = False

            if has_symlink:
                setup_mapping_with_path("escaping_symlink.jpg")
                with self.assertRaises(SafetyError) as ctx:
                    reconcile_audit(
                        manifest_path=man_path,
                        predictions_path=pred_path,
                        mapping_path=map_path,
                        verify_predictions_sha256=False,
                        verify_manifest_sha256=False,
                        images_dir=img_dir,
                        verify_images=True,
                    )
                self.assertIn("Path traversal detected", str(ctx.exception))


if __name__ == "__main__":
    unittest.main()
