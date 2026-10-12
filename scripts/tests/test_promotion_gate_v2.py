#!/usr/bin/env python3
"""Unit tests for Two-Tier Promotion Gate and Fail-Closed Golden Set v2 verification.

Validates that:
1. --evaluate-golden-v2 strictly enforces 106 samples, valid numeric metrics, and no regression.
2. Tier 2 failures (regression, missing reports, corrupt JSON, count mismatch, invalid metrics,
   or failed evaluation command) strictly prohibit promotion (fail-closed) and leave production
   assets untouched even when Tier 1 passes.
3. Absence of Golden Test Set v2 preserves existing skip behavior.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path


class TestPromotionGateV2(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)
        self.script_path = Path(__file__).resolve().parent.parent / "run-autonomous-model-improvement.sh"

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def _create_v2_report(
        self,
        filename: str,
        total: int = 106,
        top1_correct: int = 80,
        top3_correct: int = 95,
        top1_accuracy: float = 0.7547,
        top3_accuracy: float = 0.8962,
        with_details: bool = True,
        details_count: int | None = None,
        custom_metrics: dict | None = None,
    ) -> Path:
        p = self.root / filename
        metrics = {
            "total": total,
            "top1_correct": top1_correct,
            "top3_correct": top3_correct,
            "top1_accuracy": top1_accuracy,
            "top3_accuracy": top3_accuracy,
            "avg_confidence": 0.85,
            "avg_latency_ms": 45.0,
        }
        if custom_metrics:
            metrics.update(custom_metrics)

        report: dict = {"test": {"metrics": metrics}}
        if with_details:
            count = details_count if details_count is not None else total
            report["test"]["details"] = [
                {"image_name": f"img_{i}.jpg", "ground_truth": "curry_rice", "is_top1": i < top1_correct, "is_top3": i < top3_correct}
                for i in range(count)
            ]
        p.write_text(json.dumps(report, indent=2), encoding="utf-8")
        return p

    def _create_tier1_report(
        self,
        filename: str,
        total: int = 7,
        top1_correct: int = 3,
        top3_correct: int = 6,
        minority_top3: int = 2,
    ) -> Path:
        p = self.root / filename
        minority_classes = ["fried_dish", "stir_fry", "other_or_exclude"]
        details = []
        for i in range(minority_top3):
            details.append({
                "ground_truth": minority_classes[i % len(minority_classes)],
                "is_top1": False,
                "is_top3": True,
            })
        while len(details) < total:
            idx = len(details)
            details.append({
                "ground_truth": "drink",
                "is_top1": idx < top1_correct,
                "is_top3": idx < top3_correct,
            })
        report = {
            "labels": [
                "curry_rice", "drink", "fish_dish", "fried_dish",
                "meat_dish", "noodles", "other_or_exclude", "simmered_dish", "stir_fry"
            ],
            "test": {
                "metrics": {
                    "total": total,
                    "top1_correct": top1_correct,
                    "top3_correct": top3_correct,
                    "avg_latency_ms": 50.0,
                },
                "details": details,
            },
        }
        p.write_text(json.dumps(report, indent=2), encoding="utf-8")
        return p

    def _run_eval_golden_v2(self, chal_path: str | Path, champ_path: str | Path) -> tuple[int, str, str]:
        cmd = [str(self.script_path), "--evaluate-golden-v2", str(chal_path), str(champ_path)]
        res = subprocess.run(cmd, capture_output=True, text=True)
        return res.returncode, res.stdout.strip(), res.stderr

    def _run_promotion_gate(
        self,
        challenger_model: Path,
        asset_task: Path,
        chal_report: Path,
        champ_report: Path,
        golden_v2_dir: Path | str = "",
        chal_v2_report: Path | str = "",
        champ_v2_report: Path | str = "",
    ) -> tuple[int, str, str]:
        cmd = [
            str(self.script_path),
            "--run-promotion-gate",
            str(challenger_model),
            str(asset_task),
            str(chal_report),
            str(champ_report),
            str(golden_v2_dir),
            str(chal_v2_report),
            str(champ_v2_report),
        ]
        res = subprocess.run(cmd, capture_output=True, text=True)
        return res.returncode, res.stdout.strip(), res.stderr

    # -------------------------------------------------------------------------
    # 1. Direct evaluate-golden-v2 tests
    # -------------------------------------------------------------------------
    def test_v2_gate_pass_when_scores_maintained_or_improved(self) -> None:
        """Champion and Challenger both 106, scores maintained or improved: PASS."""
        champ = self._create_v2_report("champ_v2.json", total=106, top1_correct=80, top3_correct=95)
        chal = self._create_v2_report("chal_v2.json", total=106, top1_correct=82, top3_correct=96)
        code, out, err = self._run_eval_golden_v2(chal, champ)
        self.assertEqual(code, 0, f"Expected 0, stderr: {err}")
        self.assertEqual(out, "V2_PASS")
        self.assertIn("Tier 2 Benchmark Gate: PASS", err)

    def test_v2_gate_pass_when_scores_equal(self) -> None:
        """Scores exactly preserved without regression: PASS."""
        champ = self._create_v2_report("champ_v2.json", total=106, top1_correct=80, top3_correct=95)
        chal = self._create_v2_report("chal_v2.json", total=106, top1_correct=80, top3_correct=95)
        code, out, err = self._run_eval_golden_v2(chal, champ)
        self.assertEqual(code, 0)
        self.assertEqual(out, "V2_PASS")

    def test_v2_gate_fail_when_top1_regressed(self) -> None:
        """Top-1 decreased: FAIL (V2_REGRESSION, non-zero exit)."""
        champ = self._create_v2_report("champ_v2.json", total=106, top1_correct=80, top3_correct=95)
        chal = self._create_v2_report("chal_v2.json", total=106, top1_correct=79, top3_correct=95)
        code, out, err = self._run_eval_golden_v2(chal, champ)
        self.assertEqual(code, 1)
        self.assertEqual(out, "V2_REGRESSION")
        self.assertIn("REGRESSION DETECTED", err)

    def test_v2_gate_fail_when_top3_regressed(self) -> None:
        """Top-3 decreased: FAIL (V2_REGRESSION, non-zero exit)."""
        champ = self._create_v2_report("champ_v2.json", total=106, top1_correct=80, top3_correct=95)
        chal = self._create_v2_report("chal_v2.json", total=106, top1_correct=85, top3_correct=94)
        code, out, err = self._run_eval_golden_v2(chal, champ)
        self.assertEqual(code, 1)
        self.assertEqual(out, "V2_REGRESSION")
        self.assertIn("REGRESSION DETECTED", err)

    def test_v2_gate_fail_when_sample_count_less_than_106(self) -> None:
        """Sample count 105 (< 106): FAIL (V2_SAMPLE_COUNT_MISMATCH)."""
        champ = self._create_v2_report("champ_v2.json", total=106)
        chal = self._create_v2_report("chal_v2.json", total=105)
        code, out, err = self._run_eval_golden_v2(chal, champ)
        self.assertEqual(code, 1)
        self.assertEqual(out, "V2_SAMPLE_COUNT_MISMATCH")
        self.assertIn("must be exactly 106", err)

    def test_v2_gate_fail_when_sample_count_greater_than_106(self) -> None:
        """Sample count 107 (> 106): FAIL (V2_SAMPLE_COUNT_MISMATCH)."""
        champ = self._create_v2_report("champ_v2.json", total=107)
        chal = self._create_v2_report("chal_v2.json", total=106)
        code, out, err = self._run_eval_golden_v2(chal, champ)
        self.assertEqual(code, 1)
        self.assertEqual(out, "V2_SAMPLE_COUNT_MISMATCH")

    def test_v2_gate_fail_when_details_count_mismatches_total(self) -> None:
        """Details array length mismatches expected 106: FAIL (V2_SAMPLE_COUNT_MISMATCH)."""
        champ = self._create_v2_report("champ_v2.json", total=106)
        chal = self._create_v2_report("chal_v2.json", total=106, details_count=100)
        code, out, err = self._run_eval_golden_v2(chal, champ)
        self.assertEqual(code, 1)
        self.assertEqual(out, "V2_SAMPLE_COUNT_MISMATCH")

    def test_v2_gate_fail_when_report_file_missing(self) -> None:
        """Report file missing: FAIL (V2_REPORT_NOT_FOUND)."""
        champ = self._create_v2_report("champ_v2.json", total=106)
        missing = self.root / "nonexistent.json"
        code, out, err = self._run_eval_golden_v2(missing, champ)
        self.assertEqual(code, 1)
        self.assertEqual(out, "V2_REPORT_NOT_FOUND")
        self.assertIn("not found", err)

    def test_v2_gate_fail_when_report_json_corrupted(self) -> None:
        """Invalid JSON: FAIL (V2_INVALID_REPORT)."""
        champ = self._create_v2_report("champ_v2.json", total=106)
        corrupt = self.root / "corrupt.json"
        corrupt.write_text("{ broken json: true, ", encoding="utf-8")
        code, out, err = self._run_eval_golden_v2(corrupt, champ)
        self.assertEqual(code, 1)
        self.assertEqual(out, "V2_INVALID_REPORT")
        self.assertIn("Failed to parse", err)

    def test_v2_gate_fail_when_mandatory_metrics_missing(self) -> None:
        """Missing test.metrics object: FAIL (V2_INVALID_METRICS)."""
        champ = self._create_v2_report("champ_v2.json", total=106)
        bad_report = self.root / "bad_report.json"
        bad_report.write_text(json.dumps({"test": {}}), encoding="utf-8")
        code, out, err = self._run_eval_golden_v2(bad_report, champ)
        self.assertEqual(code, 1)
        self.assertEqual(out, "V2_INVALID_METRICS")

    def test_v2_gate_fail_when_metrics_non_numeric_or_out_of_range(self) -> None:
        """Metrics non-integer, negative, or greater than total: FAIL (V2_INVALID_METRICS)."""
        champ = self._create_v2_report("champ_v2.json", total=106)
        
        # String metric
        bad_str = self._create_v2_report("bad_str.json", custom_metrics={"top1_correct": "eighty"})
        code, out, _ = self._run_eval_golden_v2(bad_str, champ)
        self.assertEqual(code, 1)
        self.assertEqual(out, "V2_INVALID_METRICS")

        # Negative metric
        bad_neg = self._create_v2_report("bad_neg.json", custom_metrics={"top1_correct": -5})
        code, out, _ = self._run_eval_golden_v2(bad_neg, champ)
        self.assertEqual(code, 1)
        self.assertEqual(out, "V2_INVALID_METRICS")

        # Exceeds total
        bad_exceed = self._create_v2_report("bad_exceed.json", custom_metrics={"top1_correct": 107})
        code, out, _ = self._run_eval_golden_v2(bad_exceed, champ)
        self.assertEqual(code, 1)
        self.assertEqual(out, "V2_INVALID_METRICS")

    def test_v2_gate_fail_when_accuracy_out_of_range(self) -> None:
        """Accuracy float outside [0.0, 1.0]: FAIL (V2_INVALID_METRICS)."""
        champ = self._create_v2_report("champ_v2.json", total=106)
        bad_acc = self._create_v2_report("bad_acc.json", custom_metrics={"top1_accuracy": 1.25})
        code, out, _ = self._run_eval_golden_v2(bad_acc, champ)
        self.assertEqual(code, 1)
        self.assertEqual(out, "V2_INVALID_METRICS")

    # -------------------------------------------------------------------------
    # 2. End-to-end Two-Tier Promotion Gate execution tests
    # -------------------------------------------------------------------------
    def test_two_tier_gate_promotes_when_tier1_and_tier2_pass(self) -> None:
        """When Tier 1 PROMOTE and Tier 2 PASS, Challenger is promoted atomically."""
        chal_model = self.root / "challenger.task"
        chal_model.write_bytes(b"CHALLENGER_MODEL_BYTES_12345")
        asset_task = self.root / "meal-input-assist.task"
        asset_task.write_bytes(b"ORIGINAL_CHAMPION_BYTES")

        chal_t1 = self._create_tier1_report("chal_t1.json", total=7, top1_correct=4, top3_correct=7, minority_top3=2)
        champ_t1 = self._create_tier1_report("champ_t1.json", total=7, top1_correct=2, top3_correct=5, minority_top3=1)

        v2_dir = self.root / "golden_v2"
        (v2_dir / "test").mkdir(parents=True)
        chal_v2 = self._create_v2_report("chal_v2.json", total=106, top1_correct=85, top3_correct=98)
        champ_v2 = self._create_v2_report("champ_v2.json", total=106, top1_correct=80, top3_correct=95)

        code, out, err = self._run_promotion_gate(
            chal_model, asset_task, chal_t1, champ_t1, v2_dir, chal_v2, champ_v2
        )
        self.assertEqual(code, 0, f"Expected 0, stderr: {err}")
        self.assertEqual(asset_task.read_bytes(), b"CHALLENGER_MODEL_BYTES_12345")
        self.assertIn("Model successfully and atomically deployed", out)

    def test_two_tier_gate_preserves_skip_when_golden_v2_absent(self) -> None:
        """When Golden v2 dir is absent, Tier 2 is SKIPPED and Tier 1 promotes model."""
        chal_model = self.root / "challenger.task"
        chal_model.write_bytes(b"CHALLENGER_MODEL_BYTES_12345")
        asset_task = self.root / "meal-input-assist.task"
        asset_task.write_bytes(b"ORIGINAL_CHAMPION_BYTES")

        chal_t1 = self._create_tier1_report("chal_t1.json", total=7, top1_correct=4, top3_correct=7, minority_top3=2)
        champ_t1 = self._create_tier1_report("champ_t1.json", total=7, top1_correct=2, top3_correct=5, minority_top3=1)

        # Nonexistent v2 directory
        nonexistent_v2 = self.root / "no_v2_dir"

        code, out, err = self._run_promotion_gate(
            chal_model, asset_task, chal_t1, champ_t1, nonexistent_v2
        )
        self.assertEqual(code, 0, f"Expected 0, stderr: {err}")
        self.assertEqual(asset_task.read_bytes(), b"CHALLENGER_MODEL_BYTES_12345")

    def test_two_tier_gate_blocks_promotion_when_tier2_regresses(self) -> None:
        """Fail-Closed: When Tier 1 passes but Tier 2 regresses, promotion is blocked and asset untouched."""
        chal_model = self.root / "challenger.task"
        chal_model.write_bytes(b"CHALLENGER_MODEL_BYTES_12345")
        asset_task = self.root / "meal-input-assist.task"
        asset_task.write_bytes(b"ORIGINAL_CHAMPION_BYTES")

        chal_t1 = self._create_tier1_report("chal_t1.json", total=7, top1_correct=4, top3_correct=7, minority_top3=2)
        champ_t1 = self._create_tier1_report("champ_t1.json", total=7, top1_correct=2, top3_correct=5, minority_top3=1)

        v2_dir = self.root / "golden_v2"
        (v2_dir / "test").mkdir(parents=True)
        # Regressed on Top-1: 75 < 80
        chal_v2 = self._create_v2_report("chal_v2.json", total=106, top1_correct=75, top3_correct=95)
        champ_v2 = self._create_v2_report("champ_v2.json", total=106, top1_correct=80, top3_correct=95)

        code, out, err = self._run_promotion_gate(
            chal_model, asset_task, chal_t1, champ_t1, v2_dir, chal_v2, champ_v2
        )
        self.assertEqual(code, 1, f"Expected 1, stderr: {err}")
        self.assertEqual(asset_task.read_bytes(), b"ORIGINAL_CHAMPION_BYTES")
        self.assertIn("Fail-Closed Gate: Promotion prohibited", err)
        self.assertIn("Status: V2_REGRESSION", err)

    def test_two_tier_gate_blocks_promotion_when_tier2_reports_missing(self) -> None:
        """Fail-Closed: When Tier 2 directory exists but evaluation reports are missing, promotion is blocked."""
        chal_model = self.root / "challenger.task"
        chal_model.write_bytes(b"CHALLENGER_MODEL_BYTES_12345")
        asset_task = self.root / "meal-input-assist.task"
        asset_task.write_bytes(b"ORIGINAL_CHAMPION_BYTES")

        chal_t1 = self._create_tier1_report("chal_t1.json", total=7, top1_correct=4, top3_correct=7, minority_top3=2)
        champ_t1 = self._create_tier1_report("champ_t1.json", total=7, top1_correct=2, top3_correct=5, minority_top3=1)

        v2_dir = self.root / "golden_v2"
        (v2_dir / "test").mkdir(parents=True)
        missing_chal_v2 = self.root / "missing_chal_v2.json"
        champ_v2 = self._create_v2_report("champ_v2.json", total=106)

        code, out, err = self._run_promotion_gate(
            chal_model, asset_task, chal_t1, champ_t1, v2_dir, missing_chal_v2, champ_v2
        )
        self.assertEqual(code, 1)
        self.assertEqual(asset_task.read_bytes(), b"ORIGINAL_CHAMPION_BYTES")
        self.assertIn("Promotion prohibited", err)

    def test_two_tier_gate_blocks_promotion_when_tier2_count_mismatched(self) -> None:
        """Fail-Closed: When Tier 2 report has invalid sample count, promotion is blocked."""
        chal_model = self.root / "challenger.task"
        chal_model.write_bytes(b"CHALLENGER_MODEL_BYTES_12345")
        asset_task = self.root / "meal-input-assist.task"
        asset_task.write_bytes(b"ORIGINAL_CHAMPION_BYTES")

        chal_t1 = self._create_tier1_report("chal_t1.json", total=7, top1_correct=4, top3_correct=7, minority_top3=2)
        champ_t1 = self._create_tier1_report("champ_t1.json", total=7, top1_correct=2, top3_correct=5, minority_top3=1)

        v2_dir = self.root / "golden_v2"
        (v2_dir / "test").mkdir(parents=True)
        chal_v2 = self._create_v2_report("chal_v2.json", total=105)
        champ_v2 = self._create_v2_report("champ_v2.json", total=106)

        code, out, err = self._run_promotion_gate(
            chal_model, asset_task, chal_t1, champ_t1, v2_dir, chal_v2, champ_v2
        )
        self.assertEqual(code, 1)
        self.assertEqual(asset_task.read_bytes(), b"ORIGINAL_CHAMPION_BYTES")
        self.assertIn("Status: V2_SAMPLE_COUNT_MISMATCH", err)


if __name__ == "__main__":
    unittest.main()
