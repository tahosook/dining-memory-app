from __future__ import annotations

import csv
import json
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence


COMPARE_SCHEMA_VERSION = "mediapipe_labeling_compare_v1"


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def ensure_dict(value: Any) -> Dict[str, Any]:
    return value if isinstance(value, dict) else {}


def ensure_list(value: Any) -> List[Any]:
    return value if isinstance(value, list) else []


def coerce_int(value: Any) -> int:
    if isinstance(value, bool):
        return int(value)
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        return int(value)
    if isinstance(value, str):
        try:
            return int(float(value.strip()))
        except ValueError:
            return 0
    return 0


def coerce_float(value: Any) -> Optional[float]:
    if value is None:
        return None
    if isinstance(value, bool):
        return float(value)
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        try:
            return float(text)
        except ValueError:
            return None
    return None


def normalize_path(path: str) -> str:
    return path.replace("\\", "/").lstrip("./")


def metric_definitions(config: Dict[str, Any]) -> List[Dict[str, Any]]:
    return [item for item in ensure_list(config.get("tracked_metrics")) if isinstance(item, dict)]


def find_metric_definition(config: Dict[str, Any], name: str) -> Optional[Dict[str, Any]]:
    for item in metric_definitions(config):
        if item.get("name") == name:
            return item
    return None


def extract_total_metric(summary: Dict[str, Any], name: str) -> Optional[Dict[str, Optional[float]]]:
    totals = ensure_dict(summary.get("totals"))
    if name not in totals:
        return None
    value = totals.get(name)
    if isinstance(value, dict):
        count = coerce_int(value.get("count"))
        ratio = coerce_float(value.get("ratio"))
        return {"count": count, "ratio": ratio}
    return {"count": coerce_int(value), "ratio": None}


def extract_top_count_items(summary: Dict[str, Any], name: str) -> Optional[List[Dict[str, Any]]]:
    top_counts = ensure_dict(summary.get("top_counts"))
    if name not in top_counts:
        return None
    items = []
    for item in ensure_list(top_counts.get(name)):
        if not isinstance(item, dict):
            continue
        items.append(
            {
                "value": str(item.get("value", "")),
                "count": coerce_int(item.get("count")),
                "ratio": coerce_float(item.get("ratio")),
            }
        )
    return items


def extract_top_count_map(summary: Dict[str, Any], name: str) -> Optional[Dict[str, int]]:
    items = extract_top_count_items(summary, name)
    if items is None:
        return None
    return {
        item["value"]: item["count"]
        for item in items
        if item["value"]
    }


def get_metric_value(summary: Dict[str, Any], definition: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    name = str(definition.get("name", ""))
    kind = definition.get("kind")
    if kind == "count_ratio":
        return extract_total_metric(summary, name)
    if kind == "top_count_map":
        items = extract_top_count_items(summary, name)
        if items is None:
            return None
        return {"items": items, "map": extract_top_count_map(summary, name) or {}}
    return None


def get_metric_direction(definition: Optional[Dict[str, Any]], metric_name: str) -> str:
    if definition is not None:
        better = str(definition.get("better", "")).lower()
        if better in {"lower", "higher"}:
            return better
    if metric_name == "broad_refinement_resolved":
        return "higher"
    return "lower"


def material_change(delta_count: int, delta_ratio: Optional[float], thresholds: Dict[str, Any]) -> bool:
    min_count = coerce_int(thresholds.get("count"))
    min_ratio = coerce_float(thresholds.get("ratio"))
    if abs(delta_count) >= max(min_count, 1):
        return True
    if delta_ratio is not None and min_ratio is not None and abs(delta_ratio) >= min_ratio:
        return True
    return False


def parse_candidate_reasons(cell: str) -> List[str]:
    if not cell:
        return []
    return [part.strip() for part in cell.split(";") if part.strip()]


def report_dir_from_summary_path(summary_path: Path) -> Path:
    return summary_path.parent


def load_broad_candidate_stats(report_dir: Path) -> Dict[str, Dict[str, Any]]:
    csv_path = report_dir / "broad_primary_candidates.csv"
    stats: Dict[str, Dict[str, Any]] = {}
    if not csv_path.is_file():
        return stats

    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            reasons = parse_candidate_reasons(row.get("candidate_reasons", ""))
            broad_key = None
            candidate_key = None
            for reason in reasons:
                if reason.startswith("broad_fallback:"):
                    broad_key = reason.split(":", 1)[1].strip()
                elif reason.startswith("best_alt:"):
                    candidate_key = reason.split(":", 1)[1].strip()

            if not broad_key:
                continue

            bucket = stats.setdefault(
                broad_key,
                {
                    "residual_count": 0,
                    "candidate_counts": Counter(),
                },
            )
            bucket["residual_count"] += 1
            if candidate_key:
                bucket["candidate_counts"][candidate_key] += 1

    normalized: Dict[str, Dict[str, Any]] = {}
    for broad_key, bucket in stats.items():
        candidate_counts: Counter = bucket["candidate_counts"]
        dominant_candidate_key = None
        dominant_candidate_count = 0
        if candidate_counts:
            dominant_candidate_key, dominant_candidate_count = candidate_counts.most_common(1)[0]
        residual_count = coerce_int(bucket["residual_count"])
        dominant_candidate_share = (
            dominant_candidate_count / residual_count if residual_count > 0 else 0.0
        )
        normalized[broad_key] = {
            "residual_count": residual_count,
            "candidate_counts": [
                {"value": key, "count": count}
                for key, count in candidate_counts.most_common()
            ],
            "dominant_candidate_key": dominant_candidate_key,
            "dominant_candidate_count": dominant_candidate_count,
            "dominant_candidate_share": dominant_candidate_share,
        }
    return normalized


def build_broad_hypothesis(
    broad_key: str,
    candidate_key: Optional[str],
    dominant_share: float,
    share_threshold: float,
) -> List[Dict[str, str]]:
    if candidate_key and dominant_share >= share_threshold:
        return [
            {
                "id": f"refine_to:{candidate_key}",
                "text": f"{broad_key} refinement を {candidate_key} に寄せる",
            },
            {
                "id": "compare_rubric",
                "text": f"{broad_key} の compare rubric を明確化し、unsafe な時だけ {broad_key} を残す",
            },
        ]
    return [
        {
            "id": "compare_rubric",
            "text": f"{broad_key} の compare rubric を明確化し、unsafe な時だけ {broad_key} を残す",
        },
        {
            "id": "fine_stage_prompt",
            "text": f"{broad_key} の fine refinement prompt と fallback 条件を見直し、broad 固定を減らす",
        },
    ]


def build_metric_hypotheses(metric_name: str) -> List[Dict[str, str]]:
    mapping = {
        "unknown_primary": [
            {
                "id": "primary_candidate_extraction",
                "text": "unknown_primary を減らすため、primary candidate extraction と fallback 順序を見直す",
            },
            {
                "id": "unknown_review_gate",
                "text": "unknown を安易に確定しないよう、candidate split と review 条件を見直す",
            },
        ],
        "side_item_primary": [
            {
                "id": "supporting_item_demote",
                "text": "side item が primary に上がりにくいよう、supporting_items への退避条件を強化する",
            },
            {
                "id": "primary_priority_prompt",
                "text": "rice や soup より主料理を優先する prompt と rubric を強化する",
            },
        ],
        "scene_dominant": [
            {
                "id": "dish_priority_prompt",
                "text": "scene より dish を優先する prompt を強化し、scene_dominant を減らす",
            },
            {
                "id": "scene_review_thresholds",
                "text": "scene_dominant の review 条件と fallback を見直し、主料理を拾いやすくする",
            },
        ],
        "low_confidence": [
            {
                "id": "confidence_threshold_alignment",
                "text": "low_confidence の閾値と review 条件を揃え、実用上の低信頼だけを残す",
            },
            {
                "id": "candidate_scoring_rubric",
                "text": "candidate score と confidence の出し方を見直し、不要な low_confidence を減らす",
            },
        ],
        "needs_human_review": [
            {
                "id": "review_trigger_alignment",
                "text": "needs_human_review の trigger を見直し、本当に必要な review だけに絞る",
            },
            {
                "id": "review_reason_cleanup",
                "text": "review_reasons と review_note の整合を見直し、過剰な review 指示を減らす",
            },
        ],
    }
    return list(mapping.get(metric_name, []))


def count_design_candidate_primary_keys(summary: Dict[str, Any]) -> int:
    items = extract_top_count_items(summary, "design_candidate_primary_dish_key")
    return len(items or [])


def count_coarse_mediapipe_training_classes(summary: Dict[str, Any]) -> int:
    sanity_checks = ensure_dict(summary.get("sanity_checks"))
    coarse_summary = ensure_dict(sanity_checks.get("mediapipe_class_set_coarse_summary"))
    class_count = coarse_summary.get("class_count")
    if class_count is not None:
        return coerce_int(class_count)
    items = extract_top_count_items(summary, "mediapipe_training_class_coarse")
    if items is not None:
        return len(items)
    return count_design_candidate_primary_keys(summary)


def metric_needs_work(metric_name: str, metric_value: Dict[str, Optional[float]], config: Dict[str, Any]) -> bool:
    stop_metrics = ensure_dict(ensure_dict(config.get("stop_conditions")).get("metrics"))
    thresholds = ensure_dict(stop_metrics.get(metric_name))
    count = coerce_int(metric_value.get("count"))
    ratio = coerce_float(metric_value.get("ratio"))

    max_count = thresholds.get("max_count")
    max_ratio = thresholds.get("max_ratio")
    if max_count is None and max_ratio is None:
        return count > 0

    count_needs_work = count > coerce_int(max_count) if max_count is not None else False
    ratio_limit = coerce_float(max_ratio)
    ratio_needs_work = ratio is not None and ratio_limit is not None and ratio > ratio_limit
    return count_needs_work or ratio_needs_work


def build_next_target_hints(
    summary: Dict[str, Any],
    config: Dict[str, Any],
    report_dir: Path,
) -> List[Dict[str, Any]]:
    hints: List[Dict[str, Any]] = []
    priority_rank = 1
    share_threshold = coerce_float(
        ensure_dict(config.get("comparison_rules")).get("broad_hint_candidate_share_threshold")
    )
    if share_threshold is None:
        share_threshold = 0.45

    def append_metric_hint(metric_name: str) -> None:
        nonlocal priority_rank
        definition = find_metric_definition(config, metric_name) or {
            "name": metric_name,
            "kind": "count_ratio",
            "better": "lower",
        }
        metric_value = get_metric_value(summary, definition)
        if not metric_value:
            return
        if not metric_needs_work(metric_name, metric_value, config):
            return
        hypotheses = build_metric_hypotheses(metric_name)
        if not hypotheses:
            return
        hints.append(
            {
                "target_kind": "metric",
                "target_key": metric_name,
                "priority_rank": priority_rank,
                "reason": f"{metric_name}={coerce_int(metric_value.get('count'))}",
                "hypothesis": hypotheses[0]["text"],
                "hypothesis_options": hypotheses,
                "dominant_candidate_key": None,
                "dominant_candidate_share": None,
                "current_count": coerce_int(metric_value.get("count")),
                "current_ratio": coerce_float(metric_value.get("ratio")),
            }
        )
        priority_rank += 1

    append_metric_hint("unknown_primary")
    append_metric_hint("side_item_primary")

    broad_map = extract_top_count_map(summary, "broad_primary_key") or {}
    broad_stats = load_broad_candidate_stats(report_dir)
    broad_stop = ensure_dict(ensure_dict(config.get("stop_conditions")).get("broad_keys"))
    broad_max_residual = coerce_int(broad_stop.get("max_residual_count"))
    broad_unmapped_metric = extract_total_metric(summary, "broad_primary_unmapped_training_class")
    if broad_unmapped_metric is not None and coerce_int(broad_unmapped_metric.get("count")) <= broad_max_residual:
        broad_map = {}
    broad_share_threshold = coerce_float(broad_stop.get("dominant_candidate_share_threshold"))
    if broad_share_threshold is None:
        broad_share_threshold = 0.6
    min_residual_for_share = coerce_int(broad_stop.get("min_residual_count_for_dominant_share"))

    for broad_key in ensure_list(config.get("priority_broad_keys")):
        normalized_key = str(broad_key)
        residual_count = coerce_int(broad_map.get(normalized_key))
        stats = ensure_dict(broad_stats.get(normalized_key))
        dominant_candidate_key = stats.get("dominant_candidate_key")
        dominant_candidate_share = coerce_float(stats.get("dominant_candidate_share")) or 0.0
        broad_satisfied = False
        if residual_count <= broad_max_residual:
            broad_satisfied = True
        if (
            residual_count >= min_residual_for_share
            and dominant_candidate_key
            and dominant_candidate_share >= broad_share_threshold
        ):
            broad_satisfied = True
        if residual_count <= 0:
            continue

        hypotheses = build_broad_hypothesis(
            normalized_key,
            str(dominant_candidate_key) if dominant_candidate_key else None,
            dominant_candidate_share,
            share_threshold,
        )
        reason = f"broad_primary_key[{normalized_key}]={residual_count}"
        if dominant_candidate_key:
            reason += f", best_alt={dominant_candidate_key} ({dominant_candidate_share:.2f})"
        hints.append(
            {
                "target_kind": "broad_primary",
                "target_key": normalized_key,
                "priority_rank": priority_rank,
                "reason": reason,
                "hypothesis": hypotheses[0]["text"],
                "hypothesis_options": hypotheses,
                "dominant_candidate_key": dominant_candidate_key,
                "dominant_candidate_share": dominant_candidate_share,
                "current_count": residual_count,
                "current_ratio": None,
            }
        )
        priority_rank += 1

    append_metric_hint("scene_dominant")
    append_metric_hint("low_confidence")
    append_metric_hint("needs_human_review")
    return hints


def evaluate_stop_conditions(
    summary: Dict[str, Any],
    config: Dict[str, Any],
    report_dir: Path,
) -> Dict[str, Any]:
    stop_conditions = ensure_dict(config.get("stop_conditions"))
    metric_thresholds = ensure_dict(stop_conditions.get("metrics"))
    metric_checks: List[Dict[str, Any]] = []
    all_metric_checks_passed = True

    for metric_name, thresholds_any in metric_thresholds.items():
        definition = find_metric_definition(config, metric_name) or {
            "name": metric_name,
            "kind": "count_ratio",
            "better": "lower",
        }
        metric_value = get_metric_value(summary, definition)
        if not metric_value:
            metric_checks.append(
                {
                    "metric": metric_name,
                    "satisfied": False,
                    "reason": "metric_missing",
                }
            )
            all_metric_checks_passed = False
            continue

        thresholds = ensure_dict(thresholds_any)
        count = coerce_int(metric_value.get("count"))
        ratio = coerce_float(metric_value.get("ratio"))
        max_count = thresholds.get("max_count")
        max_ratio = coerce_float(thresholds.get("max_ratio"))
        satisfied = True
        reasons: List[str] = []
        if max_count is not None and count > coerce_int(max_count):
            satisfied = False
            reasons.append(f"count>{coerce_int(max_count)}")
        if max_ratio is not None and ratio is not None and ratio > max_ratio:
            satisfied = False
            reasons.append(f"ratio>{max_ratio}")

        metric_checks.append(
            {
                "metric": metric_name,
                "count": count,
                "ratio": ratio,
                "satisfied": satisfied,
                "reason": ",".join(reasons) if reasons else "ok",
            }
        )
        all_metric_checks_passed = all_metric_checks_passed and satisfied

    broad_map = extract_top_count_map(summary, "broad_primary_key") or {}
    broad_stats = load_broad_candidate_stats(report_dir)
    broad_thresholds = ensure_dict(stop_conditions.get("broad_keys"))
    max_residual_count = coerce_int(broad_thresholds.get("max_residual_count"))
    dominant_candidate_share_threshold = coerce_float(
        broad_thresholds.get("dominant_candidate_share_threshold")
    )
    if dominant_candidate_share_threshold is None:
        dominant_candidate_share_threshold = 0.6
    min_residual_count_for_dominant_share = coerce_int(
        broad_thresholds.get("min_residual_count_for_dominant_share")
    )

    broad_checks: List[Dict[str, Any]] = []
    all_broad_checks_passed = True
    broad_unmapped_metric = extract_total_metric(summary, "broad_primary_unmapped_training_class")
    if broad_unmapped_metric is not None:
        broad_unmapped_count = coerce_int(broad_unmapped_metric.get("count"))
        all_broad_checks_passed = broad_unmapped_count <= max_residual_count
        broad_checks.append(
            {
                "broad_key": "*",
                "residual_count": broad_unmapped_count,
                "residual_basis": "broad_primary_unmapped_training_class",
                "dominant_candidate_key": None,
                "dominant_candidate_share": None,
                "satisfied": all_broad_checks_passed,
            }
        )
    else:
        for broad_key in ensure_list(config.get("priority_broad_keys")):
            normalized_key = str(broad_key)
            residual_count = coerce_int(broad_map.get(normalized_key))
            stats = ensure_dict(broad_stats.get(normalized_key))
            dominant_candidate_key = stats.get("dominant_candidate_key")
            dominant_candidate_share = coerce_float(stats.get("dominant_candidate_share")) or 0.0
            satisfied = residual_count <= max_residual_count
            if (
                residual_count >= min_residual_count_for_dominant_share
                and dominant_candidate_key
                and dominant_candidate_share >= dominant_candidate_share_threshold
            ):
                satisfied = True
            broad_checks.append(
                {
                    "broad_key": normalized_key,
                    "residual_count": residual_count,
                    "dominant_candidate_key": dominant_candidate_key,
                    "dominant_candidate_share": dominant_candidate_share,
                    "satisfied": satisfied,
                }
            )
            all_broad_checks_passed = all_broad_checks_passed and satisfied

    preferred_range = ensure_dict(stop_conditions.get("preferred_primary_class_count_range"))
    coarse_training_class_count = count_coarse_mediapipe_training_classes(summary)
    min_classes = coerce_int(preferred_range.get("min"))
    max_classes = coerce_int(preferred_range.get("max"))
    coarse_count_in_range = min_classes <= coarse_training_class_count <= max_classes

    met = all_metric_checks_passed and all_broad_checks_passed and coarse_count_in_range
    next_phase = determine_recommended_next_phase(
        summary=summary,
        config=config,
        report_dir=report_dir,
        stop_met=met,
    )
    return {
        "met": met,
        "metric_checks": metric_checks,
        "broad_checks": broad_checks,
        "design_candidate_primary_class_count": count_design_candidate_primary_keys(summary),
        "design_candidate_primary_class_count_in_range": coarse_count_in_range,
        "coarse_mediapipe_training_class_count": coarse_training_class_count,
        "coarse_mediapipe_training_class_count_in_range": coarse_count_in_range,
        "next_phase": next_phase,
    }


def determine_recommended_next_phase(
    *,
    summary: Dict[str, Any],
    config: Dict[str, Any],
    report_dir: Path,
    stop_met: bool,
) -> Optional[str]:
    if not stop_met:
        return None

    stop_conditions = ensure_dict(config.get("stop_conditions"))
    preferred_range = ensure_dict(stop_conditions.get("preferred_primary_class_count_range"))
    coarse_training_class_count = count_coarse_mediapipe_training_classes(summary)
    min_classes = coerce_int(preferred_range.get("min"))
    max_classes = coerce_int(preferred_range.get("max"))
    if min_classes <= coarse_training_class_count <= max_classes:
        return "MediaPipe class set finalization"

    needs_review = extract_total_metric(summary, "needs_human_review") or {"count": 0, "ratio": 0.0}
    unknown_primary = extract_total_metric(summary, "unknown_primary") or {"count": 0, "ratio": 0.0}
    side_item_primary = extract_total_metric(summary, "side_item_primary") or {"count": 0, "ratio": 0.0}
    if (
        coerce_float(needs_review.get("ratio")) or 0.0
    ) > 0.0 and (coerce_float(unknown_primary.get("ratio")) or 0.0) <= 0.03 and (
        coerce_float(side_item_primary.get("ratio")) or 0.0
    ) <= 0.03:
        return "review UI / correction UX"

    return "teacher-data curation"


def compare_reports(
    *,
    before_summary_path: Path,
    after_summary_path: Path,
    config_path: Path,
) -> Dict[str, Any]:
    before_summary = ensure_dict(load_json(before_summary_path))
    after_summary = ensure_dict(load_json(after_summary_path))
    config = ensure_dict(load_json(config_path))

    before_report_dir = report_dir_from_summary_path(before_summary_path)
    after_report_dir = report_dir_from_summary_path(after_summary_path)

    thresholds = ensure_dict(ensure_dict(config.get("comparison_rules")).get("material_change_thresholds"))
    weights = ensure_dict(ensure_dict(config.get("comparison_rules")).get("weights"))
    guardrails = ensure_dict(config.get("guardrails"))
    regression_limits = ensure_dict(guardrails.get("regression_limits"))

    metric_deltas: List[Dict[str, Any]] = []
    distribution_deltas: List[Dict[str, Any]] = []
    improved_metrics: List[Dict[str, Any]] = []
    worsened_metrics: List[Dict[str, Any]] = []
    guardrail_failures: List[Dict[str, Any]] = []
    weighted_score = 0.0

    before_filtered = extract_total_metric(before_summary, "filtered_v3_records")
    after_filtered = extract_total_metric(after_summary, "filtered_v3_records")
    before_filtered_count = coerce_int(before_filtered["count"]) if before_filtered else 0
    after_filtered_count = coerce_int(after_filtered["count"]) if after_filtered else 0
    dataset_matches = before_filtered_count == after_filtered_count
    if not dataset_matches and str(guardrails.get("dataset_size_mismatch")) == "regressed":
        guardrail_failures.append(
            {
                "type": "dataset_size_mismatch",
                "before_filtered_v3_records": before_filtered_count,
                "after_filtered_v3_records": after_filtered_count,
            }
        )

    for definition in metric_definitions(config):
        name = str(definition.get("name", ""))
        kind = str(definition.get("kind", ""))
        direction = get_metric_direction(definition, name)
        before_value = get_metric_value(before_summary, definition)
        after_value = get_metric_value(after_summary, definition)

        if before_value is None or after_value is None:
            guardrail_failures.append(
                {
                    "type": "missing_metric",
                    "metric": name,
                    "missing_in": "before" if before_value is None else "after",
                }
            )
            continue

        if kind == "count_ratio":
            before_count = coerce_int(before_value.get("count"))
            after_count = coerce_int(after_value.get("count"))
            before_ratio = coerce_float(before_value.get("ratio"))
            after_ratio = coerce_float(after_value.get("ratio"))
            delta_count = after_count - before_count
            delta_ratio = None
            if before_ratio is not None and after_ratio is not None:
                delta_ratio = after_ratio - before_ratio

            if direction == "lower":
                raw_direction_score = (before_ratio - after_ratio) if before_ratio is not None and after_ratio is not None else float(-delta_count)
            else:
                raw_direction_score = (after_ratio - before_ratio) if before_ratio is not None and after_ratio is not None else float(delta_count)

            outcome = "unchanged"
            if raw_direction_score > 0:
                outcome = "improved"
            elif raw_direction_score < 0:
                outcome = "worsened"

            delta_item = {
                "metric": name,
                "before_count": before_count,
                "after_count": after_count,
                "before_ratio": before_ratio,
                "after_ratio": after_ratio,
                "delta_count": delta_count,
                "delta_ratio": delta_ratio,
                "direction": direction,
                "outcome": outcome,
            }
            metric_deltas.append(delta_item)

            if material_change(delta_count, delta_ratio, thresholds):
                if outcome == "improved":
                    improved_metrics.append(delta_item)
                elif outcome == "worsened":
                    worsened_metrics.append(delta_item)

            normalized_score = raw_direction_score
            if before_ratio is None or after_ratio is None:
                denominator = max(before_filtered_count, after_filtered_count, 1)
                normalized_score = raw_direction_score / denominator
            weighted_score += normalized_score * float(weights.get(name, 0))

            regression_limit = ensure_dict(regression_limits.get(name))
            if regression_limit and outcome == "worsened":
                max_delta_count = coerce_int(regression_limit.get("max_delta_count"))
                max_delta_ratio = coerce_float(regression_limit.get("max_delta_ratio"))
                count_exceeded = delta_count > max_delta_count
                ratio_exceeded = (
                    delta_ratio is not None
                    and max_delta_ratio is not None
                    and delta_ratio > max_delta_ratio
                )
                if count_exceeded or ratio_exceeded:
                    guardrail_failures.append(
                        {
                            "type": "regression_limit_exceeded",
                            "metric": name,
                            "delta_count": delta_count,
                            "delta_ratio": delta_ratio,
                            "max_delta_count": max_delta_count,
                            "max_delta_ratio": max_delta_ratio,
                        }
                    )
        elif kind == "top_count_map":
            before_map = before_value.get("map", {})
            after_map = after_value.get("map", {})
            changed_values = []
            all_keys = sorted(set(before_map) | set(after_map))
            for key in all_keys:
                before_count = coerce_int(before_map.get(key))
                after_count = coerce_int(after_map.get(key))
                if before_count == after_count:
                    continue
                changed_values.append(
                    {
                        "value": key,
                        "before_count": before_count,
                        "after_count": after_count,
                        "delta_count": after_count - before_count,
                    }
                )
            distribution_deltas.append(
                {
                    "metric": name,
                    "changed_values": changed_values,
                    "before_top_items": before_value.get("items", []),
                    "after_top_items": after_value.get("items", []),
                }
            )

    tracked_metric_names = {
        str(item.get("name", ""))
        for item in metric_definitions(config)
    }
    for metric_name, limit_any in regression_limits.items():
        if metric_name in tracked_metric_names:
            continue
        before_metric = extract_total_metric(before_summary, metric_name)
        after_metric = extract_total_metric(after_summary, metric_name)
        if before_metric is None or after_metric is None:
            continue
        delta_count = coerce_int(after_metric.get("count")) - coerce_int(before_metric.get("count"))
        before_ratio = coerce_float(before_metric.get("ratio"))
        after_ratio = coerce_float(after_metric.get("ratio"))
        delta_ratio = None
        if before_ratio is not None and after_ratio is not None:
            delta_ratio = after_ratio - before_ratio

        regression_limit = ensure_dict(limit_any)
        max_delta_count = coerce_int(regression_limit.get("max_delta_count"))
        max_delta_ratio = coerce_float(regression_limit.get("max_delta_ratio"))
        count_exceeded = delta_count > max_delta_count
        ratio_exceeded = (
            delta_ratio is not None
            and max_delta_ratio is not None
            and delta_ratio > max_delta_ratio
        )
        if count_exceeded or ratio_exceeded:
            guardrail_failures.append(
                {
                    "type": "regression_limit_exceeded",
                    "metric": metric_name,
                    "delta_count": delta_count,
                    "delta_ratio": delta_ratio,
                    "max_delta_count": max_delta_count,
                    "max_delta_ratio": max_delta_ratio,
                }
            )

    next_target_hints = build_next_target_hints(after_summary, config, after_report_dir)
    stop_evaluation = evaluate_stop_conditions(after_summary, config, after_report_dir)

    if guardrail_failures:
        status = "regressed"
    elif improved_metrics and weighted_score > 0:
        status = "improved"
    else:
        status = "no_change"

    return {
        "schema_version": COMPARE_SCHEMA_VERSION,
        "status": status,
        "before_summary_path": str(before_summary_path),
        "after_summary_path": str(after_summary_path),
        "dataset_guardrails": {
            "before_filtered_v3_records": before_filtered_count,
            "after_filtered_v3_records": after_filtered_count,
            "filtered_record_count_matches": dataset_matches,
        },
        "metric_deltas": metric_deltas,
        "distribution_deltas": distribution_deltas,
        "improved_metrics": improved_metrics,
        "worsened_metrics": worsened_metrics,
        "guardrail_failures": guardrail_failures,
        "next_target_hints": next_target_hints,
        "recommended_next_phase": stop_evaluation.get("next_phase"),
        "stop_evaluation": stop_evaluation,
        "weighted_score": weighted_score,
    }
