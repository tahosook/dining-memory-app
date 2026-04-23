from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPTS_DIR = REPO_ROOT / "scripts"
MODULE_PATH = SCRIPTS_DIR / "mediapipe_labeling_loop.py"


def load_module():
    sys.path.insert(0, str(SCRIPTS_DIR))
    spec = importlib.util.spec_from_file_location("mediapipe_labeling_loop_for_tests", MODULE_PATH)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load module from {MODULE_PATH}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


MODULE = load_module()


def write_json(path: Path, payload: dict[str, object]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def make_summary(
    *,
    filtered_v3_records: int = 20,
    unknown_primary: tuple[int, float] = (0, 0.0),
    side_item_primary: tuple[int, float] = (0, 0.0),
    broad_primary: tuple[int, float] = (0, 0.0),
    coarse_broad_primary: tuple[int, float] = (0, 0.0),
    broad_refinement_resolved: tuple[int, float] = (0, 0.0),
    broad_refinement_failed: tuple[int, float] = (0, 0.0),
    scene_dominant: tuple[int, float] = (0, 0.0),
    low_confidence: tuple[int, float] = (0, 0.0),
    needs_human_review: tuple[int, float] = (0, 0.0),
    broad_primary_key: list[dict[str, object]] | None = None,
    broad_primary_concrete_candidate_key: list[dict[str, object]] | None = None,
    design_candidate_primary_dish_key: list[dict[str, object]] | None = None,
) -> dict[str, object]:
    return {
        "generated_at": "2026-04-23T00:00:00+00:00",
        "input": {"input_path": "/tmp/input", "resolved_kind": "labels_jsonl", "resolved_description": "test"},
        "filters": {"schema_version": "food_label_exploration_v3", "top_n": 20},
        "totals": {
            "filtered_v3_records": filtered_v3_records,
            "broken_json_records": 0,
            "invalid_record_shape_count": 0,
            "unknown_primary": {"count": unknown_primary[0], "ratio": unknown_primary[1]},
            "side_item_primary": {"count": side_item_primary[0], "ratio": side_item_primary[1]},
            "broad_primary": {"count": broad_primary[0], "ratio": broad_primary[1]},
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
            "broad_refinement_resolved_to_key": [],
            "design_candidate_primary_dish_key": design_candidate_primary_dish_key or []
        },
        "insights": []
    }


def make_config(
    *,
    max_cycles_per_run: int = 5,
    max_no_change_attempts_per_target: int = 2,
) -> dict[str, object]:
    return {
        "schema_version": "mediapipe_labeling_goals_v1",
        "priority_broad_keys": ["stew", "meat_dish", "noodles"],
        "preferred_primary_class_count_range": {"min": 8, "max": 12},
        "tracked_metrics": [
            {"name": "unknown_primary", "source": "totals", "kind": "count_ratio", "better": "lower"},
            {"name": "side_item_primary", "source": "totals", "kind": "count_ratio", "better": "lower"},
            {"name": "broad_primary", "source": "totals", "kind": "count_ratio", "better": "lower"},
            {"name": "coarse_broad_primary", "source": "totals", "kind": "count_ratio", "better": "lower"},
            {"name": "broad_refinement_resolved", "source": "totals", "kind": "count_ratio", "better": "higher"},
            {"name": "broad_refinement_failed", "source": "totals", "kind": "count_ratio", "better": "lower"},
            {"name": "scene_dominant", "source": "totals", "kind": "count_ratio", "better": "lower"},
            {"name": "low_confidence", "source": "totals", "kind": "count_ratio", "better": "lower"},
            {"name": "needs_human_review", "source": "totals", "kind": "count_ratio", "better": "lower"},
            {"name": "broad_primary_key", "source": "top_counts", "kind": "top_count_map", "better": "lower"},
            {
                "name": "broad_primary_concrete_candidate_key",
                "source": "top_counts",
                "kind": "top_count_map",
                "better": "higher"
            },
            {
                "name": "broad_refinement_resolved_to_key",
                "source": "top_counts",
                "kind": "top_count_map",
                "better": "higher"
            }
        ],
        "max_cycles_per_run": max_cycles_per_run,
        "max_no_change_attempts_per_target": max_no_change_attempts_per_target,
        "guardrails": {
            "allowed_touched_paths": ["scripts/", "config/", "prompts/", "docs/engineering/", "state/"],
            "disallowed_path_prefixes": ["src/"],
            "dataset_size_mismatch": "regressed",
            "regression_limits": {
                "unknown_primary": {"max_delta_count": 1, "max_delta_ratio": 0.005},
                "side_item_primary": {"max_delta_count": 1, "max_delta_ratio": 0.005},
                "needs_human_review": {"max_delta_count": 3, "max_delta_ratio": 0.02},
                "scene_dominant": {"max_delta_count": 2, "max_delta_ratio": 0.01},
                "broken_json_records": {"max_delta_count": 0, "max_delta_ratio": 0.0},
                "invalid_record_shape_count": {"max_delta_count": 0, "max_delta_ratio": 0.0}
            }
        },
        "stop_conditions": {
            "metrics": {
                "unknown_primary": {"max_count": 5, "max_ratio": 0.03},
                "side_item_primary": {"max_count": 5, "max_ratio": 0.03},
                "broad_primary": {"max_ratio": 0.12},
                "needs_human_review": {"max_ratio": 0.15}
            },
            "broad_keys": {
                "max_residual_count": 5,
                "dominant_candidate_share_threshold": 0.6,
                "min_residual_count_for_dominant_share": 3
            },
            "preferred_primary_class_count_range": {"min": 8, "max": 12}
        },
        "comparison_rules": {
            "weights": {
                "unknown_primary": 5,
                "side_item_primary": 5,
                "broad_primary": 4,
                "broad_refinement_failed": 4,
                "scene_dominant": 3,
                "needs_human_review": 3,
                "low_confidence": 2,
                "coarse_broad_primary": 2,
                "broad_refinement_resolved": 2
            },
            "material_change_thresholds": {"count": 1, "ratio": 0.005},
            "broad_hint_candidate_share_threshold": 0.45
        },
        "target_selection": {
            "ordered_metric_targets": ["unknown_primary", "side_item_primary", "scene_dominant", "low_confidence", "needs_human_review"],
            "max_hypotheses_per_target": 2,
            "broad_candidate_share_threshold": 0.45
        },
        "verification_commands": ["python3 -m unittest scripts.tests.test_compare_labeling_reports"]
    }


class FakePipelineRunner:
    def __init__(self, payloads: list[dict[str, object]]):
        self.payloads = payloads
        self.calls: list[dict[str, str]] = []

    def __call__(self, *, repo_root: Path, input_dir: Path, labels_dir: Path, report_dir: Path, options: dict[str, object]) -> dict[str, object]:
        del repo_root, input_dir, options
        payload = self.payloads[len(self.calls)]
        labels_dir.mkdir(parents=True, exist_ok=True)
        report_dir.mkdir(parents=True, exist_ok=True)
        (labels_dir / "labels.jsonl").write_text("", encoding="utf-8")
        write_json(report_dir / "summary.json", payload["summary"])
        broad_rows = payload.get("broad_rows", [])
        broad_csv = report_dir / "broad_primary_candidates.csv"
        broad_csv.write_text("image_id,source_path,candidate_reasons\n", encoding="utf-8")
        if broad_rows:
            broad_csv.write_text(
                "image_id,source_path,candidate_reasons\n" + "\n".join(broad_rows) + "\n",
                encoding="utf-8",
            )
        self.calls.append({"labels_dir": str(labels_dir), "report_dir": str(report_dir)})
        return {
            "labels_dir": labels_dir,
            "report_dir": report_dir,
            "summary_path": report_dir / "summary.json"
        }


class StaticGitSnapshotProvider:
    def __call__(self, repo_root: Path, allowed_scopes: list[str], disallowed_prefixes: list[str]) -> dict[str, object]:
        del repo_root, allowed_scopes, disallowed_prefixes
        return {
            "git_status_exit_code": 0,
            "status_lines": [],
            "changed_paths": [],
            "disallowed_dirty_hashes": {}
        }


class SequencedGitSnapshotProvider:
    def __init__(self, snapshots: list[dict[str, object]]):
        self.snapshots = snapshots
        self.index = 0

    def __call__(self, repo_root: Path, allowed_scopes: list[str], disallowed_prefixes: list[str]) -> dict[str, object]:
        del repo_root, allowed_scopes, disallowed_prefixes
        snapshot = self.snapshots[self.index]
        self.index += 1
        return snapshot


class MediaPipeLabelingLoopTests(unittest.TestCase):
    def test_select_target_prioritizes_unknown_primary_over_broad(self) -> None:
        config = make_config()
        summary = make_summary(
            unknown_primary=(4, 0.2),
            broad_primary=(5, 0.25),
            broad_primary_key=[{"value": "stew", "count": 5}]
        )
        state = MODULE.default_state()
        with tempfile.TemporaryDirectory() as temp_dir:
            report_dir = Path(temp_dir)
            target = MODULE.select_cycle_target(
                summary=summary,
                report_dir=report_dir,
                config=config,
                state=state,
            )

        self.assertIsNotNone(target)
        self.assertEqual(target["target_kind"], "metric")
        self.assertEqual(target["target_key"], "unknown_primary")

    def test_select_target_builds_broad_hypothesis_from_candidate_csv(self) -> None:
        config = make_config()
        summary = make_summary(
            broad_primary=(4, 0.2),
            broad_primary_key=[{"value": "stew", "count": 4}],
        )
        state = MODULE.default_state()
        with tempfile.TemporaryDirectory() as temp_dir:
            report_dir = Path(temp_dir)
            (report_dir / "broad_primary_candidates.csv").write_text(
                "image_id,source_path,candidate_reasons\n"
                "img-1,photos/1.jpg,broad_fallback:stew;best_alt:nimono\n"
                "img-2,photos/2.jpg,broad_fallback:stew;best_alt:nimono\n"
                "img-3,photos/3.jpg,broad_fallback:stew;best_alt:curry_rice\n",
                encoding="utf-8",
            )
            target = MODULE.select_cycle_target(
                summary=summary,
                report_dir=report_dir,
                config=config,
                state=state,
            )

        self.assertIsNotNone(target)
        self.assertEqual(target["target_kind"], "broad_primary")
        self.assertEqual(target["target_key"], "stew")
        self.assertIn("nimono", target["hypothesis_text"])

    def test_run_loop_bootstraps_baseline_and_skips_cycle_relabel_with_dry_run_executor(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "photos"
            input_dir.mkdir()
            prompt_template_path = root / "prompt.txt"
            prompt_template_path.write_text(
                "{{CURRENT_METRICS_JSON}}\n{{SELECTED_TARGET_JSON}}\n{{HYPOTHESIS_TEXT}}\n{{GUARDRAILS_JSON}}\n{{TOUCHED_FILES_SCOPE}}\n{{VERIFICATION_COMMANDS}}\n{{CONTEXT_SNIPPETS}}\n",
                encoding="utf-8",
            )
            config_path = root / "config.json"
            write_json(config_path, make_config(max_cycles_per_run=1))
            state_path = root / "state.json"
            write_json(state_path, MODULE.default_state())
            runs_dir = root / "runs"

            baseline_summary = make_summary(
                unknown_primary=(4, 0.2),
                broad_primary=(4, 0.2),
                broad_primary_key=[{"value": "stew", "count": 4}]
            )
            pipeline_runner = FakePipelineRunner(
                [
                    {"summary": baseline_summary},
                ]
            )

            result = MODULE.run_loop(
                repo_root=REPO_ROOT,
                input_dir=input_dir,
                config_path=config_path,
                prompt_template_path=prompt_template_path,
                state_path=state_path,
                runs_dir=runs_dir,
                summary_path=None,
                executor_name="dry_run",
                explore_model="gemma4:e4b",
                explore_limit=5,
                explore_workers=2,
                explore_timeout=180.0,
                analyze_top_n=20,
                analyze_min_confidence=0.5,
                executor=MODULE.DryRunExecutor(),
                pipeline_runner=pipeline_runner,
                git_snapshot_provider=StaticGitSnapshotProvider(),
            )

            state = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual(result["status"], "completed")
            self.assertEqual(state["current_iteration"], 1)
            self.assertEqual(len(state["cycle_history"]), 1)
            self.assertEqual(len(pipeline_runner.calls), 1)
            self.assertTrue(state["cycle_history"][0]["relabel_skipped"])
            self.assertTrue((runs_dir / "baseline" / "report" / "summary.json").is_file())
            self.assertTrue((runs_dir / "cycle-001" / "implementer_prompt.txt").is_file())
            self.assertTrue((runs_dir / "cycle-001" / "compare.json").is_file())
            self.assertFalse((runs_dir / "cycle-001" / "report" / "summary.json").is_file())

    def test_run_loop_reruns_cycle_pipeline_when_executor_can_change_worktree(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "photos"
            input_dir.mkdir()
            prompt_template_path = root / "prompt.txt"
            prompt_template_path.write_text("{{HYPOTHESIS_TEXT}}", encoding="utf-8")
            config_path = root / "config.json"
            write_json(config_path, make_config(max_cycles_per_run=1))
            state_path = root / "state.json"
            write_json(state_path, MODULE.default_state())
            runs_dir = root / "runs"

            baseline_summary = make_summary(unknown_primary=(4, 0.2))
            after_summary = make_summary(unknown_primary=(2, 0.1))
            pipeline_runner = FakePipelineRunner(
                [
                    {"summary": baseline_summary},
                    {"summary": after_summary},
                ]
            )

            MODULE.run_loop(
                repo_root=REPO_ROOT,
                input_dir=input_dir,
                config_path=config_path,
                prompt_template_path=prompt_template_path,
                state_path=state_path,
                runs_dir=runs_dir,
                summary_path=None,
                executor_name="codex_cli",
                explore_model="gemma4:e4b",
                explore_limit=None,
                explore_workers=2,
                explore_timeout=180.0,
                analyze_top_n=20,
                analyze_min_confidence=0.5,
                executor=MODULE.DryRunExecutor(),
                pipeline_runner=pipeline_runner,
                git_snapshot_provider=StaticGitSnapshotProvider(),
            )

            state = json.loads(state_path.read_text(encoding="utf-8"))
            self.assertEqual(len(pipeline_runner.calls), 2)
            self.assertFalse(state["cycle_history"][0]["relabel_skipped"])
            self.assertTrue((runs_dir / "cycle-001" / "report" / "summary.json").is_file())

    def test_run_loop_switches_target_after_no_change_attempt_limit(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "photos"
            input_dir.mkdir()
            prompt_template_path = root / "prompt.txt"
            prompt_template_path.write_text("{{HYPOTHESIS_TEXT}}", encoding="utf-8")
            config_path = root / "config.json"
            write_json(config_path, make_config(max_cycles_per_run=3, max_no_change_attempts_per_target=2))
            state_path = root / "state.json"
            write_json(state_path, MODULE.default_state())
            runs_dir = root / "runs"

            baseline_summary = make_summary(
                unknown_primary=(4, 0.2),
                broad_primary=(4, 0.2),
                broad_primary_key=[{"value": "stew", "count": 4}]
            )
            pipeline_runner = FakePipelineRunner(
                [
                    {"summary": baseline_summary},
                ]
            )

            MODULE.run_loop(
                repo_root=REPO_ROOT,
                input_dir=input_dir,
                config_path=config_path,
                prompt_template_path=prompt_template_path,
                state_path=state_path,
                runs_dir=runs_dir,
                summary_path=None,
                executor_name="dry_run",
                explore_model="gemma4:e4b",
                explore_limit=None,
                explore_workers=2,
                explore_timeout=180.0,
                analyze_top_n=20,
                analyze_min_confidence=0.5,
                executor=MODULE.DryRunExecutor(),
                pipeline_runner=pipeline_runner,
                git_snapshot_provider=StaticGitSnapshotProvider(),
            )

            state = json.loads(state_path.read_text(encoding="utf-8"))
            cycle_targets = [entry["target_key"] for entry in state["cycle_history"]]
            self.assertEqual(cycle_targets[0], "unknown_primary")
            self.assertEqual(cycle_targets[1], "unknown_primary")
            self.assertEqual(cycle_targets[2], "stew")
            self.assertEqual(len(pipeline_runner.calls), 1)
            self.assertTrue(all(entry["relabel_skipped"] for entry in state["cycle_history"]))

    def test_run_loop_stops_at_max_cycles(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "photos"
            input_dir.mkdir()
            prompt_template_path = root / "prompt.txt"
            prompt_template_path.write_text("{{HYPOTHESIS_TEXT}}", encoding="utf-8")
            config_path = root / "config.json"
            write_json(config_path, make_config(max_cycles_per_run=2))
            state_path = root / "state.json"
            write_json(state_path, MODULE.default_state())
            runs_dir = root / "runs"

            baseline_summary = make_summary(unknown_primary=(4, 0.2))
            pipeline_runner = FakePipelineRunner(
                [
                    {"summary": baseline_summary},
                ]
            )

            result = MODULE.run_loop(
                repo_root=REPO_ROOT,
                input_dir=input_dir,
                config_path=config_path,
                prompt_template_path=prompt_template_path,
                state_path=state_path,
                runs_dir=runs_dir,
                summary_path=None,
                executor_name="dry_run",
                explore_model="gemma4:e4b",
                explore_limit=None,
                explore_workers=2,
                explore_timeout=180.0,
                analyze_top_n=20,
                analyze_min_confidence=0.5,
                executor=MODULE.DryRunExecutor(),
                pipeline_runner=pipeline_runner,
                git_snapshot_provider=StaticGitSnapshotProvider(),
            )

            self.assertEqual(result["stop_reason"], "max_cycles_reached")
            self.assertEqual(len(pipeline_runner.calls), 1)

    def test_detect_guardrail_violations_flags_new_disallowed_change(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            repo_root = Path(temp_dir)
            (repo_root / "src").mkdir()
            (repo_root / "src" / "forbidden.txt").write_text("changed", encoding="utf-8")
            violations = MODULE.detect_guardrail_violations(
                repo_root=repo_root,
                before_snapshot={"changed_paths": [], "disallowed_dirty_hashes": {}},
                after_snapshot={"changed_paths": ["src/forbidden.txt"], "disallowed_dirty_hashes": {}},
                allowed_scopes=["scripts/", "state/"],
                disallowed_prefixes=["src/"],
            )

            self.assertEqual(violations[0]["type"], "new_disallowed_change")

    def test_run_loop_stops_on_guardrail_violation(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "photos"
            input_dir.mkdir()
            prompt_template_path = root / "prompt.txt"
            prompt_template_path.write_text("{{HYPOTHESIS_TEXT}}", encoding="utf-8")
            config_path = root / "config.json"
            write_json(config_path, make_config(max_cycles_per_run=1))
            state_path = root / "state.json"
            write_json(state_path, MODULE.default_state())
            runs_dir = root / "runs"

            baseline_summary = make_summary(unknown_primary=(4, 0.2))
            pipeline_runner = FakePipelineRunner([{"summary": baseline_summary}])
            git_provider = SequencedGitSnapshotProvider(
                [
                    {"changed_paths": [], "disallowed_dirty_hashes": {}, "status_lines": []},
                    {"changed_paths": ["src/forbidden.txt"], "disallowed_dirty_hashes": {}, "status_lines": []},
                ]
            )

            result = MODULE.run_loop(
                repo_root=root,
                input_dir=input_dir,
                config_path=config_path,
                prompt_template_path=prompt_template_path,
                state_path=state_path,
                runs_dir=runs_dir,
                summary_path=None,
                executor_name="dry_run",
                explore_model="gemma4:e4b",
                explore_limit=None,
                explore_workers=2,
                explore_timeout=180.0,
                analyze_top_n=20,
                analyze_min_confidence=0.5,
                executor=MODULE.DryRunExecutor(),
                pipeline_runner=pipeline_runner,
                git_snapshot_provider=git_provider,
            )

            self.assertEqual(result["stop_reason"], "guardrail_violation")


if __name__ == "__main__":
    unittest.main()
