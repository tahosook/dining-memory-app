#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from mediapipe_labeling_common import (
    build_next_target_hints,
    compare_reports,
    count_coarse_mediapipe_training_classes,
    coerce_float,
    coerce_int,
    determine_recommended_next_phase,
    ensure_dict,
    ensure_list,
    evaluate_stop_conditions,
    extract_top_count_items,
    extract_total_metric,
    find_metric_definition,
    get_metric_value,
    load_json,
    normalize_path,
    write_json,
)


STATE_SCHEMA_VERSION = "mediapipe_labeling_state_v1"
DEFAULT_CODEX_MODEL = "gpt-5.4-mini"
DEFAULT_CODEX_FALLBACK_MODEL = "gpt-5.3-codex"
STALL_COMPARE_RESULTS = {"no_change", "regressed"}


class CodexCliExecutor:
    def __init__(self, default_model: str = DEFAULT_CODEX_MODEL) -> None:
        self.default_model = default_model

    def run(
        self,
        prompt_text: str,
        repo_root: Path,
        output_dir: Path,
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        output_dir.mkdir(parents=True, exist_ok=True)
        last_message_path = output_dir / "executor_last_message.txt"
        stdout_path = output_dir / "executor_stdout.txt"
        stderr_path = output_dir / "executor_stderr.txt"
        selected_model = (model_name or self.default_model).strip() or DEFAULT_CODEX_MODEL

        result = subprocess.run(
            [
                "codex",
                "exec",
                "--full-auto",
                "-m",
                selected_model,
                "-C",
                str(repo_root),
                "-o",
                str(last_message_path),
                "-",
            ],
            cwd=repo_root,
            input=prompt_text,
            text=True,
            capture_output=True,
            check=False,
        )

        stdout_path.write_text(result.stdout, encoding="utf-8")
        stderr_path.write_text(result.stderr, encoding="utf-8")
        if not last_message_path.exists():
            last_message_path.write_text("", encoding="utf-8")

        return {
            "success": result.returncode == 0,
            "exit_code": result.returncode,
            "model": selected_model,
            "last_message_path": str(last_message_path),
            "stdout_path": str(stdout_path),
            "stderr_path": str(stderr_path),
        }


class DryRunExecutor:
    def run(
        self,
        prompt_text: str,
        repo_root: Path,
        output_dir: Path,
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        del prompt_text, repo_root
        output_dir.mkdir(parents=True, exist_ok=True)
        last_message_path = output_dir / "executor_last_message.txt"
        stdout_path = output_dir / "executor_stdout.txt"
        stderr_path = output_dir / "executor_stderr.txt"
        last_message_path.write_text("DryRunExecutor: no repository changes applied.\n", encoding="utf-8")
        stdout_path.write_text("dry-run\n", encoding="utf-8")
        stderr_path.write_text("", encoding="utf-8")
        return {
            "success": True,
            "exit_code": 0,
            "model": model_name,
            "last_message_path": str(last_message_path),
            "stdout_path": str(stdout_path),
            "stderr_path": str(stderr_path),
        }


class PromptOnlyExecutor:
    def run(
        self,
        prompt_text: str,
        repo_root: Path,
        output_dir: Path,
        model_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        del prompt_text, repo_root
        output_dir.mkdir(parents=True, exist_ok=True)
        last_message_path = output_dir / "executor_last_message.txt"
        stdout_path = output_dir / "executor_stdout.txt"
        stderr_path = output_dir / "executor_stderr.txt"
        last_message_path.write_text("PromptOnlyExecutor: prompt captured without execution.\n", encoding="utf-8")
        stdout_path.write_text("prompt-only\n", encoding="utf-8")
        stderr_path.write_text("", encoding="utf-8")
        return {
            "success": True,
            "exit_code": 0,
            "model": model_name,
            "last_message_path": str(last_message_path),
            "stdout_path": str(stdout_path),
            "stderr_path": str(stderr_path),
        }


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="MediaPipe labeling 改善 loop を自動で回します。"
    )
    parser.add_argument("--input-dir", required=True, help="入力画像ディレクトリ")
    parser.add_argument("--config-path", required=True, help="機械可読 config")
    parser.add_argument("--prompt-template", required=True, help="Codex implementer prompt template")
    parser.add_argument("--state-path", required=True, help="state JSON")
    parser.add_argument("--runs-dir", required=True, help="baseline と cycle artifact の出力先")
    parser.add_argument("--summary-path", default=None, help="既存 summary.json を baseline に使うときの path")
    parser.add_argument(
        "--executor",
        default="codex_cli",
        choices=["codex_cli", "dry_run", "prompt_only"],
        help="実装 executor",
    )
    parser.add_argument(
        "--codex-model",
        default=DEFAULT_CODEX_MODEL,
        help="codex_cli executor が最初に使う model",
    )
    parser.add_argument(
        "--codex-fallback-model",
        default=DEFAULT_CODEX_FALLBACK_MODEL,
        help="mini で連続 stall した後に使う fallback model。空文字で無効化。",
    )
    parser.add_argument(
        "--codex-fallback-after-stalled-cycles",
        type=int,
        default=2,
        help="no_change / regressed が何 cycle 続いたら fallback model に切り替えるか",
    )
    parser.add_argument("--explore-model", default="gemma4:e4b", help="explore-food-labels.py の model")
    parser.add_argument("--explore-limit", type=int, default=None, help="explore-food-labels.py の limit")
    parser.add_argument("--explore-workers", type=int, default=2, help="explore-food-labels.py の workers")
    parser.add_argument("--explore-timeout", type=float, default=180.0, help="explore-food-labels.py の timeout")
    parser.add_argument("--analyze-top-n", type=int, default=20, help="analyze-food-labels.py の top_n")
    parser.add_argument(
        "--analyze-min-confidence",
        type=float,
        default=0.5,
        help="analyze-food-labels.py の min-confidence",
    )
    return parser.parse_args()


def default_state() -> Dict[str, Any]:
    return {
        "schema_version": STATE_SCHEMA_VERSION,
        "current_iteration": 0,
        "latest_summary_path": None,
        "tried_targets": [],
        "target_attempt_counts": {},
        "target_hypothesis_attempts": {},
        "cycle_history": [],
        "last_result": None,
        "last_before_summary": None,
        "last_after_summary": None,
        "stop_reason": None,
        "next_phase": None,
    }


def load_state(path: Path) -> Dict[str, Any]:
    if not path.is_file():
        return default_state()
    payload = ensure_dict(load_json(path))
    state = default_state()
    state.update(payload)
    return state


def save_state(path: Path, state: Dict[str, Any]) -> None:
    write_json(path, state)


def build_executor(name: str, codex_model: str = DEFAULT_CODEX_MODEL) -> Any:
    if name == "codex_cli":
        return CodexCliExecutor(default_model=codex_model)
    if name == "dry_run":
        return DryRunExecutor()
    return PromptOnlyExecutor()


def executor_changes_worktree(executor_name: str) -> bool:
    return executor_name == "codex_cli"


def count_consecutive_stalled_cycles(state: Dict[str, Any]) -> int:
    stalled = 0
    for raw_entry in reversed(ensure_list(state.get("cycle_history"))):
        entry = ensure_dict(raw_entry)
        result = str(entry.get("result", ""))
        if result == "improved":
            break
        if result in STALL_COMPARE_RESULTS:
            stalled += 1
            continue
        break
    return stalled


def select_executor_model(
    *,
    executor_name: str,
    state: Dict[str, Any],
    primary_model: str,
    fallback_model: Optional[str],
    fallback_after_stalled_cycles: int,
) -> Dict[str, Optional[str]]:
    if executor_name != "codex_cli":
        return {"model": None, "strategy": None}

    normalized_primary_model = primary_model.strip() or DEFAULT_CODEX_MODEL
    normalized_fallback_model = (fallback_model or "").strip()
    if (
        normalized_fallback_model
        and fallback_after_stalled_cycles > 0
        and count_consecutive_stalled_cycles(state) >= fallback_after_stalled_cycles
    ):
        return {
            "model": normalized_fallback_model,
            "strategy": "fallback_after_stalled_cycles",
        }

    return {
        "model": normalized_primary_model,
        "strategy": "primary",
    }


def build_current_metrics_payload(summary: Dict[str, Any], config: Dict[str, Any]) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "tracked_metrics": {},
        "insights": ensure_list(summary.get("insights")),
    }
    for definition in ensure_list(config.get("tracked_metrics")):
        if not isinstance(definition, dict):
            continue
        name = str(definition.get("name", ""))
        if not name:
            continue
        payload["tracked_metrics"][name] = get_metric_value(summary, definition)
    payload["top_counts"] = {
        "design_candidate_primary_dish_key": extract_top_count_items(summary, "design_candidate_primary_dish_key") or [],
        "broad_primary_key": extract_top_count_items(summary, "broad_primary_key") or [],
        "broad_primary_concrete_candidate_key": extract_top_count_items(summary, "broad_primary_concrete_candidate_key") or [],
    }
    return payload


def build_context_snippets(summary: Dict[str, Any], selected_target: Dict[str, Any]) -> Dict[str, Any]:
    snippets: Dict[str, Any] = {
        "insights": ensure_list(summary.get("insights"))[:5],
        "design_candidate_primary_dish_key": extract_top_count_items(summary, "design_candidate_primary_dish_key") or [],
        "review_reasons": extract_top_count_items(summary, "review_reasons") or [],
    }
    if selected_target.get("target_kind") == "broad_primary":
        snippets["broad_primary_key"] = extract_top_count_items(summary, "broad_primary_key") or []
        snippets["broad_primary_concrete_candidate_key"] = extract_top_count_items(summary, "broad_primary_concrete_candidate_key") or []
    return snippets


def render_prompt(
    *,
    template_text: str,
    summary: Dict[str, Any],
    selected_target: Dict[str, Any],
    config: Dict[str, Any],
) -> str:
    replacements = {
        "{{CURRENT_METRICS_JSON}}": json.dumps(
            build_current_metrics_payload(summary, config),
            ensure_ascii=False,
            indent=2,
        ),
        "{{SELECTED_TARGET_JSON}}": json.dumps(selected_target, ensure_ascii=False, indent=2),
        "{{HYPOTHESIS_TEXT}}": str(selected_target.get("hypothesis_text", "")),
        "{{GUARDRAILS_JSON}}": json.dumps(ensure_dict(config.get("guardrails")), ensure_ascii=False, indent=2),
        "{{TOUCHED_FILES_SCOPE}}": "\n".join(
            f"- {path}" for path in ensure_list(ensure_dict(config.get("guardrails")).get("allowed_touched_paths"))
        ),
        "{{VERIFICATION_COMMANDS}}": "\n".join(
            f"- {command}" for command in ensure_list(config.get("verification_commands"))
        ),
        "{{CONTEXT_SNIPPETS}}": json.dumps(
            build_context_snippets(summary, selected_target),
            ensure_ascii=False,
            indent=2,
        ),
    }

    prompt = template_text
    for placeholder, value in replacements.items():
        prompt = prompt.replace(placeholder, value)
    return prompt


def target_id(target_kind: str, target_key: str) -> str:
    return f"{target_kind}:{target_key}"


def select_cycle_target(
    *,
    summary: Dict[str, Any],
    report_dir: Path,
    config: Dict[str, Any],
    state: Dict[str, Any],
) -> Optional[Dict[str, Any]]:
    hints = build_next_target_hints(summary, config, report_dir)
    max_attempts = coerce_int(config.get("max_no_change_attempts_per_target"))
    if max_attempts <= 0:
        max_attempts = 2
    max_hypotheses = coerce_int(
        ensure_dict(config.get("target_selection")).get("max_hypotheses_per_target")
    )
    if max_hypotheses <= 0:
        max_hypotheses = 2

    target_attempt_counts = ensure_dict(state.get("target_attempt_counts"))
    target_hypothesis_attempts = ensure_dict(state.get("target_hypothesis_attempts"))

    for hint in hints:
        selected_target_id = target_id(str(hint.get("target_kind")), str(hint.get("target_key")))
        if coerce_int(target_attempt_counts.get(selected_target_id)) >= max_attempts:
            continue

        used_hypotheses = {
            str(item)
            for item in ensure_list(target_hypothesis_attempts.get(selected_target_id))
        }
        hypothesis_options = [
            item
            for item in ensure_list(hint.get("hypothesis_options"))
            if isinstance(item, dict)
        ][:max_hypotheses]

        for hypothesis in hypothesis_options:
            hypothesis_id = str(hypothesis.get("id", ""))
            if not hypothesis_id or hypothesis_id in used_hypotheses:
                continue

            selected = dict(hint)
            selected["target_id"] = selected_target_id
            selected["hypothesis_id"] = hypothesis_id
            selected["hypothesis_text"] = str(hypothesis.get("text", ""))
            return selected

    return None


def is_path_allowed(path: str, allowed_scopes: Sequence[str]) -> bool:
    normalized = normalize_path(path)
    for scope in allowed_scopes:
        normalized_scope = normalize_path(str(scope))
        if not normalized_scope:
            continue
        if normalized_scope.endswith("/"):
            if normalized.startswith(normalized_scope):
                return True
        elif normalized == normalized_scope:
            return True
        elif normalized.startswith(normalized_scope + "/"):
            return True
    return False


def has_disallowed_prefix(path: str, prefixes: Sequence[str]) -> bool:
    normalized = normalize_path(path)
    for prefix in prefixes:
        normalized_prefix = normalize_path(str(prefix))
        if normalized_prefix and normalized.startswith(normalized_prefix):
            return True
    return False


def file_hash(path: Path) -> str:
    if not path.exists():
        return "<missing>"
    if path.is_dir():
        return "<dir>"
    digest = hashlib.sha256()
    digest.update(path.read_bytes())
    return digest.hexdigest()


def parse_git_status_paths(status_output: str) -> List[str]:
    paths: List[str] = []
    for raw_line in status_output.splitlines():
        if len(raw_line) < 4:
            continue
        path_text = raw_line[3:].strip()
        if " -> " in path_text:
            path_text = path_text.split(" -> ", 1)[1].strip()
        if path_text:
            paths.append(normalize_path(path_text))
    return paths


def capture_git_snapshot(
    repo_root: Path,
    allowed_scopes: Sequence[str],
    disallowed_prefixes: Sequence[str],
) -> Dict[str, Any]:
    result = subprocess.run(
        ["git", "status", "--porcelain"],
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )
    changed_paths = parse_git_status_paths(result.stdout)
    disallowed_dirty_hashes = {}
    for path in changed_paths:
        if is_path_allowed(path, allowed_scopes) and not has_disallowed_prefix(path, disallowed_prefixes):
            continue
        disallowed_dirty_hashes[path] = file_hash(repo_root / path)

    return {
        "git_status_exit_code": result.returncode,
        "status_lines": result.stdout.splitlines(),
        "changed_paths": changed_paths,
        "disallowed_dirty_hashes": disallowed_dirty_hashes,
    }


def detect_guardrail_violations(
    *,
    repo_root: Path,
    before_snapshot: Dict[str, Any],
    after_snapshot: Dict[str, Any],
    allowed_scopes: Sequence[str],
    disallowed_prefixes: Sequence[str],
) -> List[Dict[str, Any]]:
    violations: List[Dict[str, Any]] = []
    before_paths = {
        normalize_path(path) for path in ensure_list(before_snapshot.get("changed_paths"))
    }
    after_paths = {
        normalize_path(path) for path in ensure_list(after_snapshot.get("changed_paths"))
    }

    for path in sorted(after_paths):
        if is_path_allowed(path, allowed_scopes) and not has_disallowed_prefix(path, disallowed_prefixes):
            continue
        if path not in before_paths:
            violations.append({"type": "new_disallowed_change", "path": path})

    before_hashes = ensure_dict(before_snapshot.get("disallowed_dirty_hashes"))
    for path, previous_hash in before_hashes.items():
        current_hash = file_hash(repo_root / str(path))
        if current_hash != str(previous_hash):
            violations.append(
                {
                    "type": "dirty_disallowed_file_changed",
                    "path": str(path),
                    "before_hash": str(previous_hash),
                    "after_hash": current_hash,
                }
            )
    return violations


def run_pipeline(
    *,
    repo_root: Path,
    input_dir: Path,
    labels_dir: Path,
    report_dir: Path,
    options: Dict[str, Any],
) -> Dict[str, Any]:
    labels_dir.mkdir(parents=True, exist_ok=True)
    report_dir.mkdir(parents=True, exist_ok=True)

    explore_cmd = [
        sys.executable,
        str(repo_root / "scripts" / "explore-food-labels.py"),
        "--input-dir",
        str(input_dir),
        "--output-dir",
        str(labels_dir),
        "--model",
        str(options["explore_model"]),
        "--workers",
        str(options["explore_workers"]),
        "--timeout",
        str(options["explore_timeout"]),
    ]
    if options.get("explore_limit") is not None:
        explore_cmd.extend(["--limit", str(options["explore_limit"])])
    explore_result = subprocess.run(
        explore_cmd,
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )
    if explore_result.returncode != 0:
        raise RuntimeError(f"explore-food-labels.py failed: {explore_result.stderr.strip()}")

    analyze_cmd = [
        sys.executable,
        str(repo_root / "scripts" / "analyze-food-labels.py"),
        "--input-path",
        str(labels_dir),
        "--output-dir",
        str(report_dir),
        "--top-n",
        str(options["analyze_top_n"]),
    ]
    min_confidence = options.get("analyze_min_confidence")
    if min_confidence is not None:
        analyze_cmd.extend(["--min-confidence", str(min_confidence)])

    analyze_result = subprocess.run(
        analyze_cmd,
        cwd=repo_root,
        text=True,
        capture_output=True,
        check=False,
    )
    if analyze_result.returncode != 0:
        raise RuntimeError(f"analyze-food-labels.py failed: {analyze_result.stderr.strip()}")

    return {
        "labels_dir": labels_dir,
        "report_dir": report_dir,
        "summary_path": report_dir / "summary.json",
    }


def resolve_current_summary_path(
    *,
    explicit_summary_path: Optional[Path],
    state: Dict[str, Any],
) -> Optional[Path]:
    if explicit_summary_path is not None:
        return explicit_summary_path
    latest_summary_path = state.get("latest_summary_path")
    if isinstance(latest_summary_path, str) and latest_summary_path:
        path = Path(latest_summary_path).expanduser().resolve()
        if path.is_file():
            return path
    return None


def decide_next_phase_on_stop(
    *,
    summary: Dict[str, Any],
    config: Dict[str, Any],
    report_dir: Path,
    stop_reason: str,
) -> str:
    stop_eval = evaluate_stop_conditions(summary, config, report_dir)
    if stop_eval.get("met"):
        return str(stop_eval.get("next_phase") or "teacher-data curation")

    unknown_primary = extract_total_metric(summary, "unknown_primary") or {"count": 0, "ratio": 0.0}
    side_item_primary = extract_total_metric(summary, "side_item_primary") or {"count": 0, "ratio": 0.0}
    needs_review = extract_total_metric(summary, "needs_human_review") or {"count": 0, "ratio": 0.0}
    broad_unmapped = extract_total_metric(summary, "broad_primary_unmapped_training_class") or {"count": 0, "ratio": 0.0}

    unknown_ratio = coerce_float(unknown_primary.get("ratio")) or 0.0
    side_ratio = coerce_float(side_item_primary.get("ratio")) or 0.0
    needs_review_ratio = coerce_float(needs_review.get("ratio")) or 0.0
    broad_unmapped_count = coerce_int(broad_unmapped.get("count"))
    coarse_training_class_count = count_coarse_mediapipe_training_classes(summary)
    preferred_range = ensure_dict(
        ensure_dict(config.get("stop_conditions")).get("preferred_primary_class_count_range")
    )
    if (
        coerce_int(preferred_range.get("min")) <= coarse_training_class_count <= coerce_int(preferred_range.get("max"))
        and broad_unmapped_count <= 5
    ):
        return "MediaPipe class set finalization"
    if unknown_ratio <= 0.03 and side_ratio <= 0.03 and needs_review_ratio > 0.0:
        return "review UI / correction UX"
    if stop_reason in {"max_cycles_reached", "no_targets_remaining"}:
        return "teacher-data curation"
    return str(
        determine_recommended_next_phase(
            summary=summary,
            config=config,
            report_dir=report_dir,
            stop_met=False,
        )
        or "teacher-data curation"
    )


def run_loop(
    *,
    repo_root: Path,
    input_dir: Path,
    config_path: Path,
    prompt_template_path: Path,
    state_path: Path,
    runs_dir: Path,
    summary_path: Optional[Path],
    executor_name: str,
    codex_model: str,
    codex_fallback_model: Optional[str],
    codex_fallback_after_stalled_cycles: int,
    explore_model: str,
    explore_limit: Optional[int],
    explore_workers: int,
    explore_timeout: float,
    analyze_top_n: int,
    analyze_min_confidence: Optional[float],
    executor: Optional[Any] = None,
    pipeline_runner: Optional[Callable[..., Dict[str, Any]]] = None,
    git_snapshot_provider: Optional[Callable[..., Dict[str, Any]]] = None,
    compare_fn: Optional[Callable[..., Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    config = ensure_dict(load_json(config_path))
    state = load_state(state_path)
    runs_dir.mkdir(parents=True, exist_ok=True)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    template_text = prompt_template_path.read_text(encoding="utf-8")

    active_executor = executor or build_executor(executor_name, codex_model)
    active_pipeline_runner = pipeline_runner or run_pipeline
    active_git_snapshot_provider = git_snapshot_provider or capture_git_snapshot
    active_compare_fn = compare_fn or compare_reports

    current_summary_path = resolve_current_summary_path(
        explicit_summary_path=summary_path,
        state=state,
    )

    pipeline_options = {
        "explore_model": explore_model,
        "explore_limit": explore_limit,
        "explore_workers": explore_workers,
        "explore_timeout": explore_timeout,
        "analyze_top_n": analyze_top_n,
        "analyze_min_confidence": analyze_min_confidence,
    }

    if current_summary_path is None:
        baseline_dir = runs_dir / "baseline"
        baseline_result = active_pipeline_runner(
            repo_root=repo_root,
            input_dir=input_dir,
            labels_dir=baseline_dir / "labels",
            report_dir=baseline_dir / "report",
            options=pipeline_options,
        )
        current_summary_path = Path(baseline_result["summary_path"]).resolve()
        state["latest_summary_path"] = str(current_summary_path)
        save_state(state_path, state)

    current_summary = ensure_dict(load_json(current_summary_path))
    initial_stop = evaluate_stop_conditions(current_summary, config, current_summary_path.parent)
    if initial_stop.get("met"):
        state["stop_reason"] = "stop_conditions_met"
        state["next_phase"] = initial_stop.get("next_phase")
        state["latest_summary_path"] = str(current_summary_path)
        save_state(state_path, state)
        return {
            "status": "stopped",
            "stop_reason": state["stop_reason"],
            "next_phase": state["next_phase"],
            "latest_summary_path": str(current_summary_path),
        }

    max_cycles = coerce_int(config.get("max_cycles_per_run"))
    if max_cycles <= 0:
        max_cycles = 1

    allowed_scopes = [str(item) for item in ensure_list(ensure_dict(config.get("guardrails")).get("allowed_touched_paths"))]
    disallowed_prefixes = [str(item) for item in ensure_list(ensure_dict(config.get("guardrails")).get("disallowed_path_prefixes"))]

    while coerce_int(state.get("current_iteration")) < max_cycles:
        iteration = coerce_int(state.get("current_iteration")) + 1
        current_summary = ensure_dict(load_json(current_summary_path))
        selected_target = select_cycle_target(
            summary=current_summary,
            report_dir=current_summary_path.parent,
            config=config,
            state=state,
        )
        if selected_target is None:
            state["stop_reason"] = "no_targets_remaining"
            state["next_phase"] = decide_next_phase_on_stop(
                summary=current_summary,
                config=config,
                report_dir=current_summary_path.parent,
                stop_reason=state["stop_reason"],
            )
            save_state(state_path, state)
            break

        cycle_dir = runs_dir / f"cycle-{iteration:03d}"
        cycle_dir.mkdir(parents=True, exist_ok=True)
        prompt_text = render_prompt(
            template_text=template_text,
            summary=current_summary,
            selected_target=selected_target,
            config=config,
        )
        prompt_path = cycle_dir / "implementer_prompt.txt"
        prompt_path.write_text(prompt_text, encoding="utf-8")

        executor_model_selection = select_executor_model(
            executor_name=executor_name,
            state=state,
            primary_model=codex_model,
            fallback_model=codex_fallback_model,
            fallback_after_stalled_cycles=codex_fallback_after_stalled_cycles,
        )
        before_snapshot = active_git_snapshot_provider(repo_root, allowed_scopes, disallowed_prefixes)
        executor_result = active_executor.run(
            prompt_text,
            repo_root,
            cycle_dir,
            model_name=executor_model_selection["model"],
        )
        after_snapshot = active_git_snapshot_provider(repo_root, allowed_scopes, disallowed_prefixes)
        violations = detect_guardrail_violations(
            repo_root=repo_root,
            before_snapshot=before_snapshot,
            after_snapshot=after_snapshot,
            allowed_scopes=allowed_scopes,
            disallowed_prefixes=disallowed_prefixes,
        )
        write_json(
            cycle_dir / "git_snapshot.json",
            {
                "before": before_snapshot,
                "after": after_snapshot,
                "violations": violations,
            },
        )

        state["current_iteration"] = iteration
        selected_target_id = str(selected_target["target_id"])
        state["tried_targets"] = list(dict.fromkeys([*ensure_list(state.get("tried_targets")), selected_target_id]))
        target_attempt_counts = ensure_dict(state.get("target_attempt_counts"))
        target_attempt_counts[selected_target_id] = coerce_int(target_attempt_counts.get(selected_target_id)) + 1
        state["target_attempt_counts"] = target_attempt_counts
        target_hypothesis_attempts = ensure_dict(state.get("target_hypothesis_attempts"))
        target_hypothesis_attempts.setdefault(selected_target_id, [])
        if selected_target["hypothesis_id"] not in target_hypothesis_attempts[selected_target_id]:
            target_hypothesis_attempts[selected_target_id].append(selected_target["hypothesis_id"])
        state["target_hypothesis_attempts"] = target_hypothesis_attempts

        cycle_history_entry = {
            "iteration": iteration,
            "target_kind": selected_target["target_kind"],
            "target_key": selected_target["target_key"],
            "target_id": selected_target_id,
            "hypothesis_id": selected_target["hypothesis_id"],
            "hypothesis_text": selected_target["hypothesis_text"],
            "prompt_path": str(prompt_path),
            "executor_last_message_path": executor_result["last_message_path"],
            "executor_model": executor_result.get("model"),
            "executor_model_strategy": executor_model_selection["strategy"],
            "labels_dir": str((cycle_dir / "labels").resolve()),
            "report_dir": str((cycle_dir / "report").resolve()),
        }

        if not executor_result["success"]:
            cycle_history_entry["result"] = "executor_failure"
            state["cycle_history"] = [*ensure_list(state.get("cycle_history")), cycle_history_entry]
            state["last_result"] = "executor_failure"
            state["stop_reason"] = "executor_failure"
            state["next_phase"] = decide_next_phase_on_stop(
                summary=current_summary,
                config=config,
                report_dir=current_summary_path.parent,
                stop_reason=state["stop_reason"],
            )
            save_state(state_path, state)
            break

        if violations:
            cycle_history_entry["result"] = "guardrail_violation"
            cycle_history_entry["guardrail_violations"] = violations
            state["cycle_history"] = [*ensure_list(state.get("cycle_history")), cycle_history_entry]
            state["last_result"] = "guardrail_violation"
            state["stop_reason"] = "guardrail_violation"
            state["next_phase"] = decide_next_phase_on_stop(
                summary=current_summary,
                config=config,
                report_dir=current_summary_path.parent,
                stop_reason=state["stop_reason"],
            )
            save_state(state_path, state)
            break

        if executor_changes_worktree(executor_name):
            pipeline_result = active_pipeline_runner(
                repo_root=repo_root,
                input_dir=input_dir,
                labels_dir=cycle_dir / "labels",
                report_dir=cycle_dir / "report",
                options=pipeline_options,
            )
            after_summary_path = Path(pipeline_result["summary_path"]).resolve()
            relabel_skipped = False
        else:
            after_summary_path = current_summary_path
            relabel_skipped = True

        compare_result = active_compare_fn(
            before_summary_path=current_summary_path,
            after_summary_path=after_summary_path,
            config_path=config_path,
        )
        compare_path = cycle_dir / "compare.json"
        write_json(compare_path, compare_result)

        state["last_result"] = compare_result["status"]
        state["last_before_summary"] = str(current_summary_path)
        state["last_after_summary"] = str(after_summary_path)
        cycle_history_entry["result"] = compare_result["status"]
        cycle_history_entry["compare_path"] = str(compare_path)
        cycle_history_entry["before_summary_path"] = str(current_summary_path)
        cycle_history_entry["after_summary_path"] = str(after_summary_path)
        cycle_history_entry["relabel_skipped"] = relabel_skipped
        state["cycle_history"] = [*ensure_list(state.get("cycle_history")), cycle_history_entry]

        if compare_result["status"] == "improved":
            current_summary_path = after_summary_path
            state["latest_summary_path"] = str(current_summary_path)
            stop_evaluation = ensure_dict(compare_result.get("stop_evaluation"))
            if stop_evaluation.get("met"):
                state["stop_reason"] = "stop_conditions_met"
                state["next_phase"] = stop_evaluation.get("next_phase")
                save_state(state_path, state)
                break

        save_state(state_path, state)

    if not state.get("stop_reason"):
        state["stop_reason"] = "max_cycles_reached"
        latest_summary_path = state.get("latest_summary_path")
        summary_for_next_phase = current_summary
        report_dir_for_next_phase = current_summary_path.parent
        if isinstance(latest_summary_path, str) and latest_summary_path:
            latest_summary_file = Path(latest_summary_path)
            if latest_summary_file.is_file():
                summary_for_next_phase = ensure_dict(load_json(latest_summary_file))
                report_dir_for_next_phase = latest_summary_file.parent
        state["next_phase"] = decide_next_phase_on_stop(
            summary=summary_for_next_phase,
            config=config,
            report_dir=report_dir_for_next_phase,
            stop_reason=state["stop_reason"],
        )
        save_state(state_path, state)

    return {
        "status": "completed",
        "stop_reason": state.get("stop_reason"),
        "next_phase": state.get("next_phase"),
        "latest_summary_path": state.get("latest_summary_path"),
        "current_iteration": state.get("current_iteration"),
    }


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parents[1]
    input_dir = Path(args.input_dir).expanduser().resolve()
    config_path = Path(args.config_path).expanduser().resolve()
    prompt_template_path = Path(args.prompt_template).expanduser().resolve()
    state_path = Path(args.state_path).expanduser().resolve()
    runs_dir = Path(args.runs_dir).expanduser().resolve()
    summary_path = Path(args.summary_path).expanduser().resolve() if args.summary_path else None

    if not input_dir.is_dir():
        print(f"Input directory not found: {input_dir}", file=sys.stderr)
        return 2
    for path in (config_path, prompt_template_path):
        if not path.is_file():
            print(f"Required file not found: {path}", file=sys.stderr)
            return 2
    if summary_path is not None and not summary_path.is_file():
        print(f"Summary path not found: {summary_path}", file=sys.stderr)
        return 2
    if args.explore_workers <= 0:
        print("--explore-workers must be greater than 0.", file=sys.stderr)
        return 2
    if args.explore_timeout <= 0:
        print("--explore-timeout must be greater than 0.", file=sys.stderr)
        return 2
    if args.codex_fallback_after_stalled_cycles < 0:
        print("--codex-fallback-after-stalled-cycles must be greater than or equal to 0.", file=sys.stderr)
        return 2
    if args.analyze_top_n <= 0:
        print("--analyze-top-n must be greater than 0.", file=sys.stderr)
        return 2

    result = run_loop(
        repo_root=repo_root,
        input_dir=input_dir,
        config_path=config_path,
        prompt_template_path=prompt_template_path,
        state_path=state_path,
        runs_dir=runs_dir,
        summary_path=summary_path,
        executor_name=args.executor,
        codex_model=args.codex_model,
        codex_fallback_model=args.codex_fallback_model or None,
        codex_fallback_after_stalled_cycles=args.codex_fallback_after_stalled_cycles,
        explore_model=args.explore_model,
        explore_limit=args.explore_limit,
        explore_workers=args.explore_workers,
        explore_timeout=args.explore_timeout,
        analyze_top_n=args.analyze_top_n,
        analyze_min_confidence=args.analyze_min_confidence,
    )
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
