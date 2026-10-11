from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path

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


if __name__ == "__main__":
    unittest.main()
