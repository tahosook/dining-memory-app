#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import math
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence


TARGET_SCHEMA_VERSION = "food_label_exploration_v3"
DEFAULT_TOP_N = 20
LOW_CONFIDENCE_THRESHOLD = 0.5
SUMMARY_JSON_NAME = "summary.json"
SUMMARY_MD_NAME = "summary.md"
REVIEW_CANDIDATES_NAME = "review_candidates.csv"
UNKNOWN_CANDIDATES_NAME = "unknown_candidates.csv"
SCENE_DOMINANT_CANDIDATES_NAME = "scene_dominant_candidates.csv"
SIDE_ITEM_PRIMARY_CANDIDATES_NAME = "side_item_primary_candidates.csv"
LOW_CONFIDENCE_CANDIDATES_NAME = "low_confidence_candidates.csv"
BROAD_PRIMARY_CANDIDATES_NAME = "broad_primary_candidates.csv"
UNKNOWN_VALUE = "unknown"
BIAS_REASONS = {"side_item_primary", "scene_dominant", "broad_primary"}
BROAD_PRIMARY_KEYS = {"meat_dish", "stew", "noodles"}
RESOLVED_BROAD_REFINEMENT_STATUSES = {"resolved"}
FAILED_BROAD_REFINEMENT_STATUSES = {"failed"}
KEPT_BROAD_REFINEMENT_STATUSES = {"kept_broad"}
NON_CONCRETE_CANDIDATE_KEYS = BROAD_PRIMARY_KEYS | {
    UNKNOWN_VALUE,
    "set_meal",
    "multi_dish_table",
    "menu_or_text",
    "rice",
    "soup",
    "miso_soup",
    "salad",
    "pickles",
    "sauce",
    "side_dish",
    "bread",
    "egg",
    "drink",
    "drinks",
}

CSV_FIELDNAMES = [
    "image_id",
    "source_path",
    "analysis_confidence",
    "primary_dish_key",
    "primary_dish_label_ja",
    "primary_dish_candidates",
    "supporting_items",
    "scene_type",
    "cuisine_type",
    "meal_style",
    "serving_style",
    "needs_human_review",
    "review_reasons",
    "uncertainty_reasons",
    "free_tags",
    "review_note_ja",
]
CSV_WITH_REASONS_FIELDNAMES = CSV_FIELDNAMES + ["candidate_reasons"]

OUTPUT_FILENAMES = {
    SUMMARY_JSON_NAME,
    SUMMARY_MD_NAME,
    REVIEW_CANDIDATES_NAME,
    UNKNOWN_CANDIDATES_NAME,
    SCENE_DOMINANT_CANDIDATES_NAME,
    SIDE_ITEM_PRIMARY_CANDIDATES_NAME,
    LOW_CONFIDENCE_CANDIDATES_NAME,
    BROAD_PRIMARY_CANDIDATES_NAME,
}


@dataclass
class SourceSelection:
    kind: str
    description: str
    input_path: Path
    base_dir: Path
    jsonl_path: Optional[Path] = None
    json_files: List[Path] = field(default_factory=list)


@dataclass
class LoadedRecord:
    payload: Dict[str, Any]
    source_path: str
    origin: str
    schema_version: str
    analysis_confidence: float


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="food_label_exploration_v3 の JSON / JSONL を集計して summary と候補 CSV を出力します。"
    )
    parser.add_argument("--input-path", required=True, help="labels.jsonl または集計対象ディレクトリ")
    parser.add_argument("--output-dir", required=True, help="集計結果の出力先ディレクトリ")
    parser.add_argument(
        "--top-n",
        type=int,
        default=DEFAULT_TOP_N,
        help=f"Counter 系の上位件数 (default: {DEFAULT_TOP_N})",
    )
    parser.add_argument(
        "--min-confidence",
        type=float,
        default=None,
        help="analysis_confidence がこの値未満の record を summary 集計から除外する",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input_path).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()

    if not input_path.exists():
        print(f"Input path not found: {input_path}", file=sys.stderr)
        return 2

    if args.top_n <= 0:
        print("--top-n must be greater than 0.", file=sys.stderr)
        return 2

    if args.min_confidence is not None and not 0 <= args.min_confidence <= 1:
        print("--min-confidence must be between 0 and 1.", file=sys.stderr)
        return 2

    selection = resolve_input_source(input_path)
    output_dir.mkdir(parents=True, exist_ok=True)

    load_result = load_records(selection)
    analysis = analyze_records(
        records=load_result["records"],
        top_n=args.top_n,
        min_confidence=args.min_confidence,
        broken_json_count=load_result["broken_json_count"],
        invalid_record_shape_count=load_result["invalid_record_shape_count"],
        error_samples=load_result["error_samples"],
        selection=selection,
        output_dir=output_dir,
    )

    summary_json_path = output_dir / SUMMARY_JSON_NAME
    summary_md_path = output_dir / SUMMARY_MD_NAME
    review_csv_path = output_dir / REVIEW_CANDIDATES_NAME
    unknown_csv_path = output_dir / UNKNOWN_CANDIDATES_NAME
    scene_dominant_csv_path = output_dir / SCENE_DOMINANT_CANDIDATES_NAME
    side_item_primary_csv_path = output_dir / SIDE_ITEM_PRIMARY_CANDIDATES_NAME
    low_conf_csv_path = output_dir / LOW_CONFIDENCE_CANDIDATES_NAME
    broad_primary_csv_path = output_dir / BROAD_PRIMARY_CANDIDATES_NAME

    write_json(summary_json_path, analysis["summary_json"])
    write_markdown(summary_md_path, analysis["summary_md"])
    write_csv(review_csv_path, analysis["review_candidates"], include_reasons=False)
    write_csv(unknown_csv_path, analysis["unknown_candidates"], include_reasons=True)
    write_csv(scene_dominant_csv_path, analysis["scene_dominant_candidates"], include_reasons=True)
    write_csv(side_item_primary_csv_path, analysis["side_item_primary_candidates"], include_reasons=True)
    write_csv(low_conf_csv_path, analysis["low_confidence_candidates"], include_reasons=True)
    write_csv(broad_primary_csv_path, analysis["broad_primary_candidates"], include_reasons=True)

    print_console_summary(
        summary_json=analysis["summary_json"],
        selection=selection,
        output_files=[
            summary_json_path,
            summary_md_path,
            review_csv_path,
            unknown_csv_path,
            scene_dominant_csv_path,
            side_item_primary_csv_path,
            low_conf_csv_path,
            broad_primary_csv_path,
        ],
        top_n=min(args.top_n, 5),
    )
    return 0


def resolve_input_source(input_path: Path) -> SourceSelection:
    if input_path.is_file():
        if input_path.suffix.lower() == ".jsonl":
            return SourceSelection(
                kind="jsonl_file",
                description=f"single JSONL file: {input_path.name}",
                input_path=input_path,
                base_dir=input_path.parent,
                jsonl_path=input_path,
            )

        if input_path.suffix.lower() == ".json":
            return SourceSelection(
                kind="json_file",
                description=f"single JSON file: {input_path.name}",
                input_path=input_path,
                base_dir=input_path.parent,
                json_files=[input_path],
            )

        raise ValueError(f"Unsupported input file type: {input_path}")

    if not input_path.is_dir():
        raise ValueError(f"Unsupported input path: {input_path}")

    labels_jsonl_path = input_path / "labels.jsonl"
    if labels_jsonl_path.is_file():
        return SourceSelection(
            kind="labels_jsonl",
            description=f"directory root labels.jsonl: {labels_jsonl_path}",
            input_path=input_path,
            base_dir=input_path,
            jsonl_path=labels_jsonl_path,
        )

    normalized_dir = input_path / "normalized"
    normalized_files = collect_json_files(normalized_dir) if normalized_dir.is_dir() else []
    if normalized_files:
        return SourceSelection(
            kind="normalized_dir",
            description=f"normalized JSON directory: {normalized_dir}",
            input_path=input_path,
            base_dir=input_path,
            json_files=normalized_files,
        )

    per_image_dir = input_path / "per_image"
    per_image_files = collect_json_files(per_image_dir) if per_image_dir.is_dir() else []
    if per_image_files:
        return SourceSelection(
            kind="per_image_dir",
            description=f"per_image JSON directory: {per_image_dir}",
            input_path=input_path,
            base_dir=input_path,
            json_files=per_image_files,
        )

    fallback_files = collect_fallback_json_files(input_path)
    if fallback_files:
        return SourceSelection(
            kind="fallback_json_dir",
            description=f"fallback recursive JSON scan: {input_path}",
            input_path=input_path,
            base_dir=input_path,
            json_files=fallback_files,
        )

    raise ValueError(f"No readable labels.jsonl or JSON files were found under {input_path}.")


def collect_json_files(root_dir: Path) -> List[Path]:
    return sorted(
        [path for path in root_dir.rglob("*.json") if path.is_file()],
        key=lambda path: path.relative_to(root_dir).as_posix().lower(),
    )


def collect_fallback_json_files(root_dir: Path) -> List[Path]:
    excluded_dir_names = {"raw", "__pycache__"}
    collected: List[Path] = []
    for path in root_dir.rglob("*.json"):
        if not path.is_file():
            continue
        if any(part in excluded_dir_names for part in path.parts):
            continue
        if path.name in OUTPUT_FILENAMES:
            continue
        if path.name.endswith(".response.json"):
            continue
        collected.append(path)

    return sorted(collected, key=lambda path: path.relative_to(root_dir).as_posix().lower())


def load_records(selection: SourceSelection) -> Dict[str, Any]:
    records: List[LoadedRecord] = []
    broken_json_count = 0
    invalid_record_shape_count = 0
    error_samples: List[Dict[str, str]] = []

    def note_error(kind: str, source: str, message: str) -> None:
        nonlocal broken_json_count, invalid_record_shape_count
        if kind == "broken_json":
            broken_json_count += 1
        else:
            invalid_record_shape_count += 1

        if len(error_samples) < 20:
            error_samples.append(
                {
                    "kind": kind,
                    "source": source,
                    "message": message,
                }
            )

    if selection.jsonl_path is not None:
        with selection.jsonl_path.open("r", encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip():
                    continue

                source_label = f"{selection.jsonl_path.name}:{line_number}"
                try:
                    payload = json.loads(line)
                except json.JSONDecodeError as error:
                    note_error("broken_json", source_label, str(error))
                    continue

                append_loaded_payload(
                    records=records,
                    payload=payload,
                    default_source_path=source_label,
                    origin=source_label,
                    note_error=note_error,
                )

        return {
            "records": records,
            "broken_json_count": broken_json_count,
            "invalid_record_shape_count": invalid_record_shape_count,
            "error_samples": error_samples,
        }

    for json_path in selection.json_files:
        try:
            payload = json.loads(json_path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            note_error("broken_json", relative_source_label(json_path, selection.base_dir), str(error))
            continue

        default_source_path = relative_source_label(json_path, selection.base_dir)
        append_loaded_payload(
            records=records,
            payload=payload,
            default_source_path=default_source_path,
            origin=default_source_path,
            note_error=note_error,
        )

    return {
        "records": records,
        "broken_json_count": broken_json_count,
        "invalid_record_shape_count": invalid_record_shape_count,
        "error_samples": error_samples,
    }


def append_loaded_payload(
    *,
    records: List[LoadedRecord],
    payload: Any,
    default_source_path: str,
    origin: str,
    note_error,
) -> None:
    if isinstance(payload, dict):
        records.append(
            LoadedRecord(
                payload=payload,
                source_path=resolve_source_path(payload, default_source_path),
                origin=origin,
                schema_version=normalize_schema_version(payload.get("schema_version")),
                analysis_confidence=coerce_confidence(payload.get("analysis_confidence")),
            )
        )
        return

    if isinstance(payload, list):
        for index, item in enumerate(payload):
            list_origin = f"{origin}[{index}]"
            if not isinstance(item, dict):
                note_error("invalid_record_shape", list_origin, "Record list item was not a JSON object.")
                continue

            records.append(
                LoadedRecord(
                    payload=item,
                    source_path=resolve_source_path(item, list_origin),
                    origin=list_origin,
                    schema_version=normalize_schema_version(item.get("schema_version")),
                    analysis_confidence=coerce_confidence(item.get("analysis_confidence")),
                )
            )
        return

    note_error("invalid_record_shape", origin, "Top-level JSON payload was not an object or list.")


def analyze_records(
    *,
    records: Sequence[LoadedRecord],
    top_n: int,
    min_confidence: Optional[float],
    broken_json_count: int,
    invalid_record_shape_count: int,
    error_samples: Sequence[Dict[str, str]],
    selection: SourceSelection,
    output_dir: Path,
) -> Dict[str, Any]:
    parseable_records = len(records)
    total_records = parseable_records + broken_json_count + invalid_record_shape_count
    schema_version_counts = Counter(record.schema_version for record in records)

    v3_records = [record for record in records if record.schema_version == TARGET_SCHEMA_VERSION]
    filtered_records = filter_records_by_confidence(v3_records, min_confidence)
    excluded_by_min_confidence = len(v3_records) - len(filtered_records)

    primary_dish_counter = Counter()
    design_candidate_primary_counter = Counter()
    scene_type_counter = Counter()
    supporting_items_counter = Counter()
    review_reasons_counter = Counter()
    cuisine_type_counter = Counter()
    meal_style_counter = Counter()
    serving_style_counter = Counter()
    free_tags_counter = Counter()
    broad_primary_key_counter = Counter()
    broad_primary_concrete_candidate_counter = Counter()
    coarse_broad_primary_key_counter = Counter()
    broad_refinement_resolved_to_key_counter = Counter()

    needs_human_review_count = 0
    unknown_primary_count = 0
    side_item_primary_count = 0
    scene_dominant_count = 0
    broad_primary_count = 0
    coarse_broad_primary_count = 0
    broad_refinement_resolved_count = 0
    broad_refinement_kept_broad_count = 0
    broad_refinement_failed_count = 0
    low_confidence_count = 0

    for record in filtered_records:
        payload = record.payload
        primary_dish_key = normalize_scalar(payload.get("primary_dish_key"))
        coarse_primary_dish_key = normalize_scalar(payload.get("coarse_primary_dish_key"))
        if coarse_primary_dish_key == "missing":
            coarse_primary_dish_key = primary_dish_key
        broad_refinement_status = normalize_scalar(payload.get("broad_refinement_status"))
        scene_type = normalize_scalar(payload.get("scene_type"))
        cuisine_type = normalize_scalar(payload.get("cuisine_type"))
        meal_style = normalize_scalar(payload.get("meal_style"))
        serving_style = normalize_scalar(payload.get("serving_style"))
        supporting_items = extract_string_list(payload.get("supporting_items"))
        review_reasons = extract_string_list(payload.get("review_reasons"))
        free_tags = extract_string_list(payload.get("free_tags"))
        broad_primary_candidate_key = detect_broad_primary_concrete_candidate_key(record)

        primary_dish_counter[primary_dish_key] += 1
        scene_type_counter[scene_type] += 1
        supporting_items_counter.update(supporting_items)
        review_reasons_counter.update(review_reasons)
        cuisine_type_counter[cuisine_type] += 1
        meal_style_counter[meal_style] += 1
        serving_style_counter[serving_style] += 1
        free_tags_counter.update(free_tags)

        if coerce_bool(payload.get("needs_human_review")):
            needs_human_review_count += 1
        if "unknown_primary" in review_reasons:
            unknown_primary_count += 1
        if "side_item_primary" in review_reasons:
            side_item_primary_count += 1
        if "scene_dominant" in review_reasons:
            scene_dominant_count += 1
        if primary_dish_key in BROAD_PRIMARY_KEYS:
            broad_primary_count += 1
            broad_primary_key_counter[primary_dish_key] += 1
            if broad_primary_candidate_key is not None:
                broad_primary_concrete_candidate_counter[broad_primary_candidate_key] += 1
        if coarse_primary_dish_key in BROAD_PRIMARY_KEYS:
            coarse_broad_primary_count += 1
            coarse_broad_primary_key_counter[coarse_primary_dish_key] += 1
        if broad_refinement_status in RESOLVED_BROAD_REFINEMENT_STATUSES:
            broad_refinement_resolved_count += 1
            if primary_dish_key not in {"missing", UNKNOWN_VALUE}:
                broad_refinement_resolved_to_key_counter[primary_dish_key] += 1
        if broad_refinement_status in KEPT_BROAD_REFINEMENT_STATUSES:
            broad_refinement_kept_broad_count += 1
        if broad_refinement_status in FAILED_BROAD_REFINEMENT_STATUSES:
            broad_refinement_failed_count += 1
        if detect_low_confidence_reasons(record):
            low_confidence_count += 1

        if (
            primary_dish_key != UNKNOWN_VALUE
            and primary_dish_key not in BROAD_PRIMARY_KEYS
            and not any(reason in review_reasons for reason in BIAS_REASONS)
        ):
            design_candidate_primary_counter[primary_dish_key] += 1

    review_candidates = [
        build_csv_row(record)
        for record in v3_records
        if coerce_bool(record.payload.get("needs_human_review"))
    ]
    unknown_candidates = [
        build_csv_row(record, candidate_reasons=["unknown_primary"])
        for record in v3_records
        if record_has_review_reason(record, "unknown_primary")
    ]
    scene_dominant_candidates = [
        build_csv_row(record, candidate_reasons=["scene_dominant"])
        for record in v3_records
        if record_has_review_reason(record, "scene_dominant")
    ]
    side_item_primary_candidates = [
        build_csv_row(record, candidate_reasons=["side_item_primary"])
        for record in v3_records
        if record_has_review_reason(record, "side_item_primary")
    ]
    low_confidence_candidates = [
        build_csv_row(record, candidate_reasons=detect_low_confidence_reasons(record))
        for record in v3_records
        if detect_low_confidence_reasons(record)
    ]
    broad_primary_candidates = []
    for record in v3_records:
        candidate_reasons = build_broad_primary_candidate_reasons(record)
        if not candidate_reasons:
            continue
        broad_primary_candidates.append(
            build_csv_row(record, candidate_reasons=candidate_reasons)
        )

    sort_candidate_rows(review_candidates)
    sort_candidate_rows(unknown_candidates)
    sort_candidate_rows(scene_dominant_candidates)
    sort_candidate_rows(side_item_primary_candidates)
    sort_candidate_rows(low_confidence_candidates)
    sort_candidate_rows(broad_primary_candidates)

    filtered_count = len(filtered_records)
    summary_json = {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "input": {
            "input_path": str(selection.input_path),
            "resolved_kind": selection.kind,
            "resolved_description": selection.description,
        },
        "filters": {
            "schema_version": TARGET_SCHEMA_VERSION,
            "min_confidence": min_confidence,
            "low_confidence_threshold": LOW_CONFIDENCE_THRESHOLD,
            "top_n": top_n,
        },
        "totals": {
            "total_records": total_records,
            "parseable_records": parseable_records,
            "broken_json_records": broken_json_count,
            "invalid_record_shape_count": invalid_record_shape_count,
            "v3_valid_records": len(v3_records),
            "filtered_v3_records": filtered_count,
            "excluded_by_min_confidence": excluded_by_min_confidence,
            "legacy_records_skipped": parseable_records - len(v3_records),
            "needs_human_review": build_count_ratio(needs_human_review_count, filtered_count),
            "unknown_primary": build_count_ratio(unknown_primary_count, filtered_count),
            "side_item_primary": build_count_ratio(side_item_primary_count, filtered_count),
            "scene_dominant": build_count_ratio(scene_dominant_count, filtered_count),
            "broad_primary": build_count_ratio(broad_primary_count, filtered_count),
            "coarse_broad_primary": build_count_ratio(coarse_broad_primary_count, filtered_count),
            "broad_refinement_resolved": build_count_ratio(broad_refinement_resolved_count, filtered_count),
            "broad_refinement_kept_broad": build_count_ratio(broad_refinement_kept_broad_count, filtered_count),
            "broad_refinement_failed": build_count_ratio(broad_refinement_failed_count, filtered_count),
            "low_confidence": build_count_ratio(low_confidence_count, filtered_count),
        },
        "schema_version_counts": dict(sorted(schema_version_counts.items())),
        "top_counts": {
            "primary_dish_key": counter_to_items(primary_dish_counter, top_n),
            "design_candidate_primary_dish_key": counter_to_items(design_candidate_primary_counter, top_n),
            "scene_type": counter_to_items(scene_type_counter, top_n),
            "supporting_items": counter_to_items(supporting_items_counter, top_n),
            "review_reasons": counter_to_items(review_reasons_counter, top_n),
            "cuisine_type": counter_to_items(cuisine_type_counter, top_n),
            "meal_style": counter_to_items(meal_style_counter, top_n),
            "serving_style": counter_to_items(serving_style_counter, top_n),
            "free_tags": counter_to_items(free_tags_counter, top_n),
            "coarse_broad_primary_key": counter_to_items(coarse_broad_primary_key_counter, top_n),
            "broad_primary_key": counter_to_items(broad_primary_key_counter, top_n),
            "broad_primary_concrete_candidate_key": counter_to_items(broad_primary_concrete_candidate_counter, top_n),
            "broad_refinement_resolved_to_key": counter_to_items(broad_refinement_resolved_to_key_counter, top_n),
        },
        "candidate_counts": {
            "review_candidates": len(review_candidates),
            "unknown_candidates": len(unknown_candidates),
            "scene_dominant_candidates": len(scene_dominant_candidates),
            "side_item_primary_candidates": len(side_item_primary_candidates),
            "low_confidence_candidates": len(low_confidence_candidates),
            "broad_primary_candidates": len(broad_primary_candidates),
        },
        "errors": {
            "broken_json_count": broken_json_count,
            "invalid_record_shape_count": invalid_record_shape_count,
            "samples": list(error_samples),
        },
        "insights": build_insights(
            filtered_count=filtered_count,
            needs_human_review_count=needs_human_review_count,
            unknown_primary_count=unknown_primary_count,
            side_item_primary_count=side_item_primary_count,
            scene_dominant_count=scene_dominant_count,
            broad_primary_count=broad_primary_count,
            coarse_broad_primary_count=coarse_broad_primary_count,
            broad_refinement_resolved_count=broad_refinement_resolved_count,
            broad_refinement_kept_broad_count=broad_refinement_kept_broad_count,
            broad_refinement_failed_count=broad_refinement_failed_count,
            low_confidence_count=low_confidence_count,
            broad_primary_key_counter=broad_primary_key_counter,
        ),
        "output_files": {
            "summary_json": str(output_dir / SUMMARY_JSON_NAME),
            "summary_md": str(output_dir / SUMMARY_MD_NAME),
            "review_candidates_csv": str(output_dir / REVIEW_CANDIDATES_NAME),
            "unknown_candidates_csv": str(output_dir / UNKNOWN_CANDIDATES_NAME),
            "scene_dominant_candidates_csv": str(output_dir / SCENE_DOMINANT_CANDIDATES_NAME),
            "side_item_primary_candidates_csv": str(output_dir / SIDE_ITEM_PRIMARY_CANDIDATES_NAME),
            "low_confidence_candidates_csv": str(output_dir / LOW_CONFIDENCE_CANDIDATES_NAME),
            "broad_primary_candidates_csv": str(output_dir / BROAD_PRIMARY_CANDIDATES_NAME),
        },
    }

    summary_md = build_summary_markdown(summary_json)

    return {
        "summary_json": summary_json,
        "summary_md": summary_md,
        "review_candidates": review_candidates,
        "unknown_candidates": unknown_candidates,
        "scene_dominant_candidates": scene_dominant_candidates,
        "side_item_primary_candidates": side_item_primary_candidates,
        "low_confidence_candidates": low_confidence_candidates,
        "broad_primary_candidates": broad_primary_candidates,
    }


def filter_records_by_confidence(
    records: Sequence[LoadedRecord],
    min_confidence: Optional[float],
) -> List[LoadedRecord]:
    if min_confidence is None:
        return list(records)

    return [record for record in records if record.analysis_confidence >= min_confidence]


def build_count_ratio(count: int, total: int) -> Dict[str, Any]:
    ratio = 0.0
    if total > 0:
        ratio = round(count / total, 4)
    return {
        "count": count,
        "ratio": ratio,
    }


def counter_to_items(counter: Counter, top_n: int) -> List[Dict[str, Any]]:
    return [
        {"value": value, "count": count}
        for value, count in counter.most_common(top_n)
    ]


def build_summary_markdown(summary_json: Dict[str, Any]) -> str:
    totals = summary_json["totals"]
    schema_version_counts = summary_json["schema_version_counts"]
    top_counts = summary_json["top_counts"]
    insights = summary_json["insights"]
    filters = summary_json["filters"]
    candidate_counts = summary_json["candidate_counts"]

    lines: List[str] = [
        "# Food Label Exploration Summary",
        "",
        "## Summary",
        f"- Input: `{summary_json['input']['input_path']}`",
        f"- Source: `{summary_json['input']['resolved_description']}`",
        f"- Min confidence filter: `{filters['min_confidence']}`",
        f"- Top N: `{filters['top_n']}`",
        f"- 総件数: {totals['total_records']}",
        f"- v3 有効件数: {totals['v3_valid_records']}",
        f"- フィルタ適用後件数: {totals['filtered_v3_records']}",
        f"- 壊れた JSON 件数: {totals['broken_json_records']}",
        f"- 不正 record shape 件数: {totals['invalid_record_shape_count']}",
        f"- legacy records skipped: {totals['legacy_records_skipped']}",
        "",
        "## Schema Version Counts",
        "| schema_version | count |",
        "| --- | ---: |",
    ]

    for schema_version, count in schema_version_counts.items():
        lines.append(f"| `{schema_version}` | {count} |")

    lines.extend(
        [
            "",
            "## Top Counts",
            "### primary_dish_key",
        ]
    )
    lines.extend(render_top_count_table(top_counts["primary_dish_key"]))
    lines.extend(
        [
            "",
            "### design_candidate_primary_dish_key",
        ]
    )
    lines.extend(render_top_count_table(top_counts["design_candidate_primary_dish_key"]))
    lines.extend(
        [
            "",
            "### scene_type",
        ]
    )
    lines.extend(render_top_count_table(top_counts["scene_type"]))
    lines.extend(
        [
            "",
            "### supporting_items",
        ]
    )
    lines.extend(render_top_count_table(top_counts["supporting_items"]))
    lines.extend(
        [
            "",
            "### review_reasons",
        ]
    )
    lines.extend(render_top_count_table(top_counts["review_reasons"]))
    lines.extend(
        [
            "",
            "### broad_primary_key",
        ]
    )
    lines.extend(render_top_count_table(top_counts["broad_primary_key"]))
    lines.extend(
        [
            "",
            "### coarse_broad_primary_key",
        ]
    )
    lines.extend(render_top_count_table(top_counts["coarse_broad_primary_key"]))
    lines.extend(
        [
            "",
            "### broad_primary_concrete_candidate_key",
        ]
    )
    lines.extend(render_top_count_table(top_counts["broad_primary_concrete_candidate_key"]))
    lines.extend(
        [
            "",
            "### broad_refinement_resolved_to_key",
        ]
    )
    lines.extend(render_top_count_table(top_counts["broad_refinement_resolved_to_key"]))
    lines.extend(
        [
            "",
            "## Review & Design Signals",
            f"- 人手レビュー推奨件数: {totals['needs_human_review']['count']} ({format_percent(totals['needs_human_review']['ratio'])})",
            f"- unknown_primary 件数: {totals['unknown_primary']['count']} ({format_percent(totals['unknown_primary']['ratio'])})",
            f"- side_item_primary 件数: {totals['side_item_primary']['count']} ({format_percent(totals['side_item_primary']['ratio'])})",
            f"- scene_dominant 件数: {totals['scene_dominant']['count']} ({format_percent(totals['scene_dominant']['ratio'])})",
            f"- broad_primary 件数: {totals['broad_primary']['count']} ({format_percent(totals['broad_primary']['ratio'])})",
            f"- coarse_broad_primary 件数: {totals['coarse_broad_primary']['count']} ({format_percent(totals['coarse_broad_primary']['ratio'])})",
            f"- broad_refinement_resolved 件数: {totals['broad_refinement_resolved']['count']} ({format_percent(totals['broad_refinement_resolved']['ratio'])})",
            f"- broad_refinement_kept_broad 件数: {totals['broad_refinement_kept_broad']['count']} ({format_percent(totals['broad_refinement_kept_broad']['ratio'])})",
            f"- broad_refinement_failed 件数: {totals['broad_refinement_failed']['count']} ({format_percent(totals['broad_refinement_failed']['ratio'])})",
            f"- low_confidence 件数: {totals['low_confidence']['count']} ({format_percent(totals['low_confidence']['ratio'])})",
            f"- review_candidates.csv 件数: {candidate_counts['review_candidates']}",
            f"- unknown_candidates.csv 件数: {candidate_counts['unknown_candidates']}",
            f"- scene_dominant_candidates.csv 件数: {candidate_counts['scene_dominant_candidates']}",
            f"- side_item_primary_candidates.csv 件数: {candidate_counts['side_item_primary_candidates']}",
            f"- low_confidence_candidates.csv 件数: {candidate_counts['low_confidence_candidates']}",
            f"- broad_primary_candidates.csv 件数: {candidate_counts['broad_primary_candidates']}",
            "",
            "## Insights",
        ]
    )

    if insights:
        lines.extend([f"- {insight}" for insight in insights])
    else:
        lines.append("- 顕著な偏りはまだ大きくありません。100 枚単位で再試行して傾向を確認してください。")

    return "\n".join(lines) + "\n"


def render_top_count_table(items: Sequence[Dict[str, Any]]) -> List[str]:
    lines = [
        "| value | count |",
        "| --- | ---: |",
    ]
    if not items:
        lines.append("| `(none)` | 0 |")
        return lines

    for item in items:
        lines.append(f"| `{item['value']}` | {item['count']} |")
    return lines


def build_insights(
    *,
    filtered_count: int,
    needs_human_review_count: int,
    unknown_primary_count: int,
    side_item_primary_count: int,
    scene_dominant_count: int,
    broad_primary_count: int,
    coarse_broad_primary_count: int,
    broad_refinement_resolved_count: int,
    broad_refinement_kept_broad_count: int,
    broad_refinement_failed_count: int,
    low_confidence_count: int,
    broad_primary_key_counter: Counter,
) -> List[str]:
    if filtered_count <= 0:
        return []

    insights: List[str] = []
    if side_item_primary_count / filtered_count >= 0.10:
        insights.append("primary が rice/soup/side_dish 系に寄っており、主料理定義の強化が必要です。")
    if scene_dominant_count / filtered_count >= 0.10:
        insights.append("primary が set_meal / scene 系に寄っており、dish 優先の prompt 修正が必要です。")
    if unknown_primary_count / filtered_count < 0.10 and scene_dominant_count / filtered_count >= 0.10:
        insights.append("unknown は少なく scene_dominant が多いため、認識不能より prompt 設計の問題が大きい可能性があります。")
    if needs_human_review_count / filtered_count >= 0.10:
        insights.append("needs_human_review が多く、review 条件の再設計が必要です。")
    if broad_primary_count / filtered_count >= 0.10:
        insights.append("broad_primary が多く、主料理カテゴリの粒度がまだ粗い可能性があります。")
    if coarse_broad_primary_count > broad_primary_count:
        resolved_count = coarse_broad_primary_count - broad_primary_count
        insights.append(
            f"coarse broad から {resolved_count} 件は fine refinement で具体カテゴリへ落ちており、broad fallback の残件確認が有効です。"
        )
    if broad_refinement_kept_broad_count / filtered_count >= 0.10:
        insights.append("fine refinement 後も broad fallback が多く残っており、比較 rubric か crop 補助の改善余地があります。")
    if broad_refinement_failed_count > 0:
        insights.append("broad refinement failed があり、fine stage のレスポンス安定性確認が必要です。")
    if broad_refinement_resolved_count > 0 and broad_primary_count == 0:
        insights.append("coarse broad は fine refinement で解消できており、residual broad はかなり減っています。")
    if broad_primary_key_counter.get("meat_dish", 0) / filtered_count >= 0.10:
        insights.append("meat_dish への偏りが残っており、より具体的な肉料理ラベル優先の prompt 強化が必要です。")
    if low_confidence_count / filtered_count >= 0.10:
        insights.append("low_confidence が多く、confidence の出し方と review 条件の整合性を見直す余地があります。")
    return insights


def extract_string_list(value: Any) -> List[str]:
    values: List[str] = []
    seen = set()
    for item in ensure_list(value):
        normalized = normalize_scalar(item)
        if normalized == "missing" or normalized in seen:
            continue
        seen.add(normalized)
        values.append(normalized)
    return values


def extract_primary_dish_candidates(value: Any) -> List[str]:
    candidates: List[str] = []
    for item in extract_primary_dish_candidate_objects(value):
        key = item["key"]
        label_ja = item["label_ja"]
        score = format_confidence(item["score"])
        if key == "missing":
            continue
        if label_ja:
            candidates.append(f"{key}|{label_ja}|{score}")
        else:
            candidates.append(f"{key}|{score}")
    return candidates


def extract_primary_dish_candidate_objects(value: Any) -> List[Dict[str, Any]]:
    candidates: List[Dict[str, Any]] = []
    for item in ensure_list(value):
        if not isinstance(item, dict):
            continue
        key = normalize_scalar(item.get("key"))
        if key == "missing":
            continue
        candidates.append(
            {
                "key": key,
                "label_ja": clean_text(item.get("label_ja")),
                "score": coerce_confidence(item.get("score")),
            }
        )
    return candidates


def record_has_review_reason(record: LoadedRecord, reason: str) -> bool:
    return reason in extract_string_list(record.payload.get("review_reasons"))


def detect_low_confidence_reasons(record: LoadedRecord) -> List[str]:
    reasons: List[str] = []
    if record.analysis_confidence < LOW_CONFIDENCE_THRESHOLD:
        reasons.append("analysis_confidence<0.5")
    if record_has_review_reason(record, "low_confidence"):
        reasons.append("review_reasons=low_confidence")
    return reasons


def detect_broad_primary_concrete_candidate_key(record: LoadedRecord) -> Optional[str]:
    primary_dish_key = normalize_scalar(record.payload.get("primary_dish_key"))
    if primary_dish_key not in BROAD_PRIMARY_KEYS:
        return None

    for candidate in extract_primary_dish_candidate_objects(record.payload.get("primary_dish_candidates")):
        candidate_key = candidate["key"]
        if candidate_key == primary_dish_key:
            continue
        if candidate_key in NON_CONCRETE_CANDIDATE_KEYS:
            continue
        return candidate_key
    return None


def compact_candidate_reason_text(value: Any) -> str:
    text = clean_text(value)
    if not text:
        return ""
    text = re.sub(r"\s+", " ", text).strip()
    return text.replace(";", ",")


def build_broad_primary_candidate_reasons(record: LoadedRecord) -> List[str]:
    primary_dish_key = normalize_scalar(record.payload.get("primary_dish_key"))
    if primary_dish_key not in BROAD_PRIMARY_KEYS:
        return []

    coarse_primary_dish_key = normalize_scalar(record.payload.get("coarse_primary_dish_key"))
    if coarse_primary_dish_key == "missing":
        coarse_primary_dish_key = primary_dish_key

    reasons = [f"broad_fallback:{coarse_primary_dish_key}"]

    concrete_candidate_key = detect_broad_primary_concrete_candidate_key(record)
    if concrete_candidate_key is not None:
        reasons.append(f"best_alt:{concrete_candidate_key}")

    refinement_note_ja = compact_candidate_reason_text(
        record.payload.get("broad_refinement_note_ja") or record.payload.get("review_note_ja")
    )
    if refinement_note_ja:
        reasons.append(f"refine_note:{refinement_note_ja}")

    return reasons


def build_csv_row(record: LoadedRecord, candidate_reasons: Optional[Sequence[str]] = None) -> Dict[str, str]:
    payload = record.payload
    row = {
        "image_id": clean_text(payload.get("image_id")),
        "source_path": record.source_path,
        "analysis_confidence": format_confidence(record.analysis_confidence),
        "primary_dish_key": normalize_scalar(payload.get("primary_dish_key")),
        "primary_dish_label_ja": clean_text(payload.get("primary_dish_label_ja")),
        "primary_dish_candidates": ";".join(extract_primary_dish_candidates(payload.get("primary_dish_candidates"))),
        "supporting_items": ";".join(extract_string_list(payload.get("supporting_items"))),
        "scene_type": normalize_scalar(payload.get("scene_type")),
        "cuisine_type": normalize_scalar(payload.get("cuisine_type")),
        "meal_style": normalize_scalar(payload.get("meal_style")),
        "serving_style": normalize_scalar(payload.get("serving_style")),
        "needs_human_review": format_bool(payload.get("needs_human_review")),
        "review_reasons": ";".join(extract_string_list(payload.get("review_reasons"))),
        "uncertainty_reasons": ";".join(extract_string_list(payload.get("uncertainty_reasons"))),
        "free_tags": ";".join(extract_string_list(payload.get("free_tags"))),
        "review_note_ja": clean_text(payload.get("review_note_ja")),
    }
    if candidate_reasons is not None:
        row["candidate_reasons"] = ";".join(candidate_reasons)
    return row


def sort_candidate_rows(rows: List[Dict[str, str]]) -> None:
    rows.sort(
        key=lambda row: (
            safe_float(row.get("analysis_confidence"), default=999.0),
            row.get("image_id", ""),
            row.get("source_path", ""),
        )
    )


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    serialized = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    path.write_text(serialized + "\n", encoding="utf-8")


def write_markdown(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")


def write_csv(path: Path, rows: Sequence[Dict[str, str]], *, include_reasons: bool) -> None:
    fieldnames = CSV_WITH_REASONS_FIELDNAMES if include_reasons else CSV_FIELDNAMES
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fieldnames})


def print_console_summary(
    *,
    summary_json: Dict[str, Any],
    selection: SourceSelection,
    output_files: Sequence[Path],
    top_n: int,
) -> None:
    totals = summary_json["totals"]
    schema_counts = summary_json["schema_version_counts"]
    top_counts = summary_json["top_counts"]

    print(f"Input: {selection.input_path}")
    print(f"Source: {selection.description}")
    print(
        "Totals: "
        f"total={totals['total_records']} "
        f"v3_valid={totals['v3_valid_records']} "
        f"filtered={totals['filtered_v3_records']} "
        f"broken_json={totals['broken_json_records']} "
        f"invalid_shape={totals['invalid_record_shape_count']}"
    )
    print(f"Schema counts: {format_counter_map(schema_counts)}")
    print(
        "Signals: "
        f"needs_human_review={totals['needs_human_review']['count']} "
        f"low_confidence={totals['low_confidence']['count']} "
        f"unknown_primary={totals['unknown_primary']['count']} "
        f"broad_primary={totals['broad_primary']['count']} "
        f"coarse_broad_primary={totals['coarse_broad_primary']['count']} "
        f"refined={totals['broad_refinement_resolved']['count']} "
        f"kept_broad={totals['broad_refinement_kept_broad']['count']} "
        f"refinement_failed={totals['broad_refinement_failed']['count']}"
    )
    print(f"Top primary_dish_key: {format_top_items(top_counts['primary_dish_key'], top_n)}")
    print(
        "Top design_candidate_primary_dish_key: "
        f"{format_top_items(top_counts['design_candidate_primary_dish_key'], top_n)}"
    )
    print(f"Top broad_primary_key: {format_top_items(top_counts['broad_primary_key'], top_n)}")
    print(f"Top coarse_broad_primary_key: {format_top_items(top_counts['coarse_broad_primary_key'], top_n)}")
    print(
        "Top broad_refinement_resolved_to_key: "
        f"{format_top_items(top_counts['broad_refinement_resolved_to_key'], top_n)}"
    )
    print(f"Top scene_type: {format_top_items(top_counts['scene_type'], top_n)}")
    print("Outputs:")
    for path in output_files:
        print(f"- {path}")


def format_counter_map(counter_map: Dict[str, int]) -> str:
    if not counter_map:
        return "(none)"
    return ", ".join(f"{key}={value}" for key, value in sorted(counter_map.items()))


def format_top_items(items: Sequence[Dict[str, Any]], top_n: int) -> str:
    if not items:
        return "(none)"
    return ", ".join(
        f"{item['value']}({item['count']})"
        for item in list(items)[:top_n]
    )


def relative_source_label(path: Path, base_dir: Path) -> str:
    try:
        return path.relative_to(base_dir).as_posix()
    except ValueError:
        return str(path)


def resolve_source_path(payload: Dict[str, Any], default_source_path: str) -> str:
    source_path = clean_text(payload.get("source_path"))
    if source_path:
        return source_path
    return default_source_path


def normalize_schema_version(value: Any) -> str:
    normalized = clean_text(value)
    if not normalized:
        return "missing"
    return normalized


def normalize_scalar(value: Any) -> str:
    if value is None:
        return "missing"
    if isinstance(value, bool):
        return str(value).lower()
    return clean_text(value).lower() or "missing"


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    return re.sub(r"\s+", " ", value).strip()


def coerce_confidence(value: Any) -> float:
    confidence = safe_float(value, default=0.0)
    if not math.isfinite(confidence):
        return 0.0
    if confidence < 0:
        return 0.0
    if confidence > 1:
        return 1.0
    return confidence


def safe_float(value: Any, *, default: float) -> float:
    try:
        parsed = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(parsed):
        return default
    return parsed


def coerce_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        candidate = value.strip().lower()
        if candidate in {"true", "1", "yes", "y"}:
            return True
        if candidate in {"false", "0", "no", "n"}:
            return False
    return False


def ensure_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def format_confidence(value: float) -> str:
    return f"{value:.4f}"


def format_bool(value: Any) -> str:
    return "true" if coerce_bool(value) else "false"


def format_percent(value: float) -> str:
    return f"{value * 100:.1f}%"


if __name__ == "__main__":
    sys.exit(main())
