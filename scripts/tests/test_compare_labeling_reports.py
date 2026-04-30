from __future__ import annotations

import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "compare_labeling_reports.py"
CONFIG_PATH = REPO_ROOT / "config" / "mediapipe_labeling_goals.json"


def write_summary(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_broad_candidates(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["image_id", "source_path", "candidate_reasons"]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fieldnames})


def make_summary(
    *,
    filtered_v3_records: int = 25,
    unknown_primary: tuple[int, float] = (0, 0.0),
    side_item_primary: tuple[int, float] = (0, 0.0),
    broad_primary: tuple[int, float] = (0, 0.0),
    broad_primary_unmapped_training_class: tuple[int, float] = (0, 0.0),
    training_target_unresolved: tuple[int, float] = (0, 0.0),
    coarse_broad_primary: tuple[int, float] = (0, 0.0),
    broad_refinement_resolved: tuple[int, float] = (0, 0.0),
    broad_refinement_failed: tuple[int, float] = (0, 0.0),
    scene_dominant: tuple[int, float] = (0, 0.0),
    low_confidence: tuple[int, float] = (0, 0.0),
    needs_human_review: tuple[int, float] = (0, 0.0),
    broken_json_records: int = 0,
    invalid_record_shape_count: int = 0,
    broad_primary_key: list[dict[str, object]] | None = None,
    broad_primary_concrete_candidate_key: list[dict[str, object]] | None = None,
    broad_refinement_resolved_to_key: list[dict[str, object]] | None = None,
    design_candidate_primary_dish_key: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    return {
        "generated_at": "2026-04-23T00:00:00+00:00",
        "input": {"input_path": "/tmp/input", "resolved_kind": "labels_jsonl", "resolved_description": "test"},
        "filters": {"schema_version": "food_label_exploration_v3", "top_n": 20},
        "totals": {
            "filtered_v3_records": filtered_v3_records,
            "broken_json_records": broken_json_records,
            "invalid_record_shape_count": invalid_record_shape_count,
            "unknown_primary": {"count": unknown_primary[0], "ratio": unknown_primary[1]},
            "side_item_primary": {"count": side_item_primary[0], "ratio": side_item_primary[1]},
            "broad_primary": {"count": broad_primary[0], "ratio": broad_primary[1]},
            "broad_primary_unmapped_training_class": {
                "count": broad_primary_unmapped_training_class[0],
                "ratio": broad_primary_unmapped_training_class[1],
            },
            "training_target_unresolved": {
                "count": training_target_unresolved[0],
                "ratio": training_target_unresolved[1],
            },
            "coarse_broad_primary": {"count": coarse_broad_primary[0], "ratio": coarse_broad_primary[1]},
            "broad_refinement_resolved": {"count": broad_refinement_resolved[0], "ratio": broad_refinement_resolved[1]},
            "broad_refinement_failed": {"count": broad_refinement_failed[0], "ratio": broad_refinement_failed[1]},
            "scene_dominant": {"count": scene_dominant[0], "ratio": scene_dominant[1]},
            "low_confidence": {"count": low_confidence[0], "ratio": low_confidence[1]},
            "needs_human_review": {"count": needs_human_review[0], "ratio": needs_human_review[1]}
        },
        "top_counts": {
            "broad_primary_key": broad_primary_key or [],
            "broad_primary_concrete_candidate_key": broad_primary_concrete_candidate_key or [],
            "broad_refinement_resolved_to_key": broad_refinement_resolved_to_key or [],
            "design_candidate_primary_dish_key": design_candidate_primary_dish_key or [],
            "mediapipe_training_class_coarse": [
                {"value": "fried_dish", "count": 5},
                {"value": "fish_dish", "count": 4},
                {"value": "meat_dish", "count": 3},
                {"value": "simmered_dish", "count": 3},
                {"value": "curry_rice", "count": 3},
                {"value": "stir_fry", "count": 2},
                {"value": "noodles", "count": 2},
                {"value": "drink", "count": 2},
                {"value": "other_or_exclude", "count": 1},
            ],
        }
    }


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT_PATH), *args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


class CompareLabelingReportsCliTests(unittest.TestCase):
    def test_marks_improved_when_broad_primary_drops_without_guardrail_violation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            before_path = root / "before" / "summary.json"
            after_path = root / "after" / "summary.json"
            write_summary(
                before_path,
                make_summary(
                    broad_primary=(6, 0.24),
                    broad_primary_unmapped_training_class=(8, 0.32),
                    coarse_broad_primary=(8, 0.32),
                    broad_refinement_resolved=(1, 0.04),
                    needs_human_review=(4, 0.16),
                    broad_primary_key=[{"value": "stew", "count": 4}, {"value": "meat_dish", "count": 2}],
                    design_candidate_primary_dish_key=[
                        {"value": "curry_rice", "count": 5},
                        {"value": "nimono", "count": 4},
                        {"value": "grilled_meat", "count": 3},
                        {"value": "stir_fry", "count": 3},
                        {"value": "pasta", "count": 2},
                        {"value": "noodles", "count": 2},
                        {"value": "fried_chicken", "count": 2},
                        {"value": "sushi", "count": 1}
                    ]
                ),
            )
            write_summary(
                after_path,
                make_summary(
                    broad_primary=(3, 0.12),
                    broad_primary_unmapped_training_class=(6, 0.24),
                    coarse_broad_primary=(7, 0.28),
                    broad_refinement_resolved=(4, 0.16),
                    needs_human_review=(3, 0.12),
                    broad_primary_key=[{"value": "stew", "count": 2}, {"value": "meat_dish", "count": 1}],
                    broad_primary_concrete_candidate_key=[{"value": "nimono", "count": 2}],
                    broad_refinement_resolved_to_key=[{"value": "nimono", "count": 2}],
                    design_candidate_primary_dish_key=[
                        {"value": "curry_rice", "count": 5},
                        {"value": "nimono", "count": 4},
                        {"value": "grilled_meat", "count": 3},
                        {"value": "stir_fry", "count": 3},
                        {"value": "pasta", "count": 2},
                        {"value": "noodles", "count": 2},
                        {"value": "fried_chicken", "count": 2},
                        {"value": "sushi", "count": 1}
                    ]
                ),
            )
            write_broad_candidates(
                after_path.parent / "broad_primary_candidates.csv",
                [
                    {"image_id": "img-1", "source_path": "photos/1.jpg", "candidate_reasons": "broad_fallback:stew;best_alt:nimono"},
                    {"image_id": "img-2", "source_path": "photos/2.jpg", "candidate_reasons": "broad_fallback:stew;best_alt:nimono"},
                    {"image_id": "img-3", "source_path": "photos/3.jpg", "candidate_reasons": "broad_fallback:meat_dish;best_alt:grilled_meat"}
                ],
            )

            result = run_cli(
                "--before-summary",
                str(before_path),
                "--after-summary",
                str(after_path),
                "--config",
                str(CONFIG_PATH),
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], "improved")
            self.assertEqual(payload["metric_deltas"][2]["metric"], "broad_primary")
            broad_hint = next(
                item for item in payload["next_target_hints"] if item["target_kind"] == "broad_primary" and item["target_key"] == "stew"
            )
            self.assertEqual(broad_hint["dominant_candidate_key"], "nimono")
            self.assertGreaterEqual(broad_hint["dominant_candidate_share"], 0.5)

    def test_marks_regressed_when_unknown_primary_worsens_past_guardrail(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            before_path = root / "before" / "summary.json"
            after_path = root / "after" / "summary.json"
            write_summary(before_path, make_summary(broad_primary=(6, 0.24), unknown_primary=(0, 0.0)))
            write_summary(after_path, make_summary(broad_primary=(3, 0.12), unknown_primary=(3, 0.12)))

            result = run_cli(
                "--before-summary",
                str(before_path),
                "--after-summary",
                str(after_path),
                "--config",
                str(CONFIG_PATH),
            )

            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], "regressed")
            failure_types = {item["type"] for item in payload["guardrail_failures"]}
            self.assertIn("regression_limit_exceeded", failure_types)

    def test_marks_no_change_when_only_minor_deltas_exist(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            before_path = root / "before" / "summary.json"
            after_path = root / "after" / "summary.json"
            write_summary(before_path, make_summary(broad_primary=(2, 0.08), needs_human_review=(2, 0.08)))
            write_summary(after_path, make_summary(broad_primary=(2, 0.08), needs_human_review=(2, 0.08)))

            result = run_cli(
                "--before-summary",
                str(before_path),
                "--after-summary",
                str(after_path),
                "--config",
                str(CONFIG_PATH),
            )

            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], "no_change")
            self.assertEqual(payload["improved_metrics"], [])

    def test_marks_regressed_on_dataset_size_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            before_path = root / "before" / "summary.json"
            after_path = root / "after" / "summary.json"
            write_summary(before_path, make_summary(filtered_v3_records=25))
            write_summary(after_path, make_summary(filtered_v3_records=24))

            result = run_cli(
                "--before-summary",
                str(before_path),
                "--after-summary",
                str(after_path),
                "--config",
                str(CONFIG_PATH),
            )

            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], "regressed")
            self.assertFalse(payload["dataset_guardrails"]["filtered_record_count_matches"])

    def test_marks_regressed_when_required_metric_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            before_path = root / "before" / "summary.json"
            after_path = root / "after" / "summary.json"
            before_summary = make_summary()
            after_summary = make_summary()
            del after_summary["totals"]["low_confidence"]
            write_summary(before_path, before_summary)
            write_summary(after_path, after_summary)

            result = run_cli(
                "--before-summary",
                str(before_path),
                "--after-summary",
                str(after_path),
                "--config",
                str(CONFIG_PATH),
            )

            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], "regressed")
            self.assertIn("missing_metric", {item["type"] for item in payload["guardrail_failures"]})

    def test_marks_regressed_when_parse_errors_increase(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            before_path = root / "before" / "summary.json"
            after_path = root / "after" / "summary.json"
            write_summary(before_path, make_summary(broken_json_records=0))
            write_summary(after_path, make_summary(broken_json_records=1))

            result = run_cli(
                "--before-summary",
                str(before_path),
                "--after-summary",
                str(after_path),
                "--config",
                str(CONFIG_PATH),
            )

            payload = json.loads(result.stdout)
            self.assertEqual(payload["status"], "regressed")
            self.assertIn("regression_limit_exceeded", {item["type"] for item in payload["guardrail_failures"]})

    def test_surfaces_broad_candidate_hint_from_csv(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            before_path = root / "before" / "summary.json"
            after_path = root / "after" / "summary.json"
            write_summary(
                before_path,
                make_summary(
                    broad_primary=(4, 0.16),
                    broad_primary_unmapped_training_class=(6, 0.24),
                    broad_primary_key=[{"value": "meat_dish", "count": 4}]
                ),
            )
            write_summary(
                after_path,
                make_summary(
                    broad_primary=(4, 0.16),
                    broad_primary_unmapped_training_class=(6, 0.24),
                    broad_primary_key=[{"value": "meat_dish", "count": 4}]
                ),
            )
            write_broad_candidates(
                after_path.parent / "broad_primary_candidates.csv",
                [
                    {"image_id": "img-1", "source_path": "photos/1.jpg", "candidate_reasons": "broad_fallback:meat_dish;best_alt:grilled_meat"},
                    {"image_id": "img-2", "source_path": "photos/2.jpg", "candidate_reasons": "broad_fallback:meat_dish;best_alt:grilled_meat"},
                    {"image_id": "img-3", "source_path": "photos/3.jpg", "candidate_reasons": "broad_fallback:meat_dish;best_alt:stir_fry"},
                    {"image_id": "img-4", "source_path": "photos/4.jpg", "candidate_reasons": "broad_fallback:meat_dish;best_alt:grilled_meat"}
                ],
            )

            result = run_cli(
                "--before-summary",
                str(before_path),
                "--after-summary",
                str(after_path),
                "--config",
                str(CONFIG_PATH),
            )

            payload = json.loads(result.stdout)
            hint = next(
                item for item in payload["next_target_hints"] if item["target_kind"] == "broad_primary"
            )
            self.assertEqual(hint["target_key"], "meat_dish")
            self.assertEqual(hint["dominant_candidate_key"], "grilled_meat")
            self.assertGreater(hint["dominant_candidate_share"], 0.7)
            self.assertIn("grilled_meat", hint["hypothesis"])


if __name__ == "__main__":
    unittest.main()
