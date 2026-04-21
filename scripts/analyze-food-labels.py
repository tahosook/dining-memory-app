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
from typing import Any, Dict, Iterable, List, Optional, Sequence


TARGET_SCHEMA_VERSION = "food_label_exploration_v2"
DEFAULT_TOP_N = 20
LOW_CONFIDENCE_THRESHOLD = 0.5
SUMMARY_JSON_NAME = "summary.json"
SUMMARY_MD_NAME = "summary.md"
REVIEW_CANDIDATES_NAME = "review_candidates.csv"
SCENE_LEVEL_CANDIDATES_NAME = "scene_level_candidates.csv"
LOW_CONFIDENCE_CANDIDATES_NAME = "low_confidence_candidates.csv"
UNKNOWN_CANDIDATES_NAME = "unknown_candidates.csv"
UNKNOWN_VALUE = "unknown"

SUMMARY_BOOLEAN_FIELDS = {
    "needs_human_review": "人手レビュー推奨",
    "contains_multiple_dishes": "複数皿",
    "is_menu_or_text_only": "メニュー/文字のみ",
}

UNKNOWN_FIELD_LABELS = {
    "scene_type": "scene_type",
    "cuisine_type": "cuisine_type",
    "meal_style": "meal_style",
    "serving_style": "serving_style",
    "label_granularity": "label_granularity",
    "main_subjects.key": "main_subjects.key",
    "possible_dish_keys.key": "possible_dish_keys.key",
    "secondary_item_keys": "secondary_item_keys",
}

CSV_FIELDNAMES = [
    "image_id",
    "source_path",
    "analysis_confidence",
    "scene_type",
    "cuisine_type",
    "meal_style",
    "serving_style",
    "label_granularity",
    "needs_human_review",
    "contains_multiple_dishes",
    "is_menu_or_text_only",
    "main_subject_keys",
    "possible_dish_keys",
    "secondary_item_keys",
    "free_tags",
    "uncertainty_reasons",
    "review_note_ja",
]
CSV_WITH_REASONS_FIELDNAMES = CSV_FIELDNAMES + ["candidate_reasons"]

OUTPUT_FILENAMES = {
    SUMMARY_JSON_NAME,
    SUMMARY_MD_NAME,
    REVIEW_CANDIDATES_NAME,
    SCENE_LEVEL_CANDIDATES_NAME,
    LOW_CONFIDENCE_CANDIDATES_NAME,
    UNKNOWN_CANDIDATES_NAME,
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
        description="food_label_exploration_v2 の JSON / JSONL を集計して summary と候補 CSV を出力します。"
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
    scene_csv_path = output_dir / SCENE_LEVEL_CANDIDATES_NAME
    low_conf_csv_path = output_dir / LOW_CONFIDENCE_CANDIDATES_NAME
    unknown_csv_path = output_dir / UNKNOWN_CANDIDATES_NAME

    write_json(summary_json_path, analysis["summary_json"])
    write_markdown(summary_md_path, analysis["summary_md"])
    write_csv(review_csv_path, analysis["review_candidates"], include_reasons=False)
    write_csv(scene_csv_path, analysis["scene_level_candidates"], include_reasons=True)
    write_csv(low_conf_csv_path, analysis["low_confidence_candidates"], include_reasons=False)
    write_csv(unknown_csv_path, analysis["unknown_candidates"], include_reasons=True)

    print_console_summary(
        summary_json=analysis["summary_json"],
        selection=selection,
        output_files=[
            summary_json_path,
            summary_md_path,
            review_csv_path,
            scene_csv_path,
            low_conf_csv_path,
            unknown_csv_path,
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

    valid_records = [record for record in records if record.schema_version == TARGET_SCHEMA_VERSION]
    filtered_records = filter_records_by_confidence(valid_records, min_confidence)
    excluded_by_min_confidence = len(valid_records) - len(filtered_records)

    scene_type_counter = Counter()
    cuisine_type_counter = Counter()
    meal_style_counter = Counter()
    serving_style_counter = Counter()
    label_granularity_counter = Counter()
    main_subject_counter = Counter()
    possible_dish_counter = Counter()
    secondary_item_counter = Counter()
    free_tags_counter = Counter()
    uncertainty_reasons_counter = Counter()

    is_food_related_count = 0
    boolean_counts = Counter()
    unknown_record_count = 0
    multi_dish_table_count = 0
    scene_level_count = 0
    low_confidence_count = 0

    for record in filtered_records:
        payload = record.payload
        if coerce_bool(payload.get("is_food_related")):
            is_food_related_count += 1

        if coerce_bool(payload.get("needs_human_review")):
            boolean_counts["needs_human_review"] += 1
        if coerce_bool(payload.get("contains_multiple_dishes")):
            boolean_counts["contains_multiple_dishes"] += 1
        if coerce_bool(payload.get("is_menu_or_text_only")):
            boolean_counts["is_menu_or_text_only"] += 1

        if record.analysis_confidence < LOW_CONFIDENCE_THRESHOLD:
            low_confidence_count += 1

        scene_type = normalize_scalar(payload.get("scene_type"))
        cuisine_type = normalize_scalar(payload.get("cuisine_type"))
        meal_style = normalize_scalar(payload.get("meal_style"))
        serving_style = normalize_scalar(payload.get("serving_style"))
        label_granularity = normalize_scalar(payload.get("label_granularity"))

        scene_type_counter[scene_type] += 1
        cuisine_type_counter[cuisine_type] += 1
        meal_style_counter[meal_style] += 1
        serving_style_counter[serving_style] += 1
        label_granularity_counter[label_granularity] += 1

        if scene_type == "multi_dish_table":
            multi_dish_table_count += 1
        if label_granularity == "scene_level":
            scene_level_count += 1

        main_subject_counter.update(extract_subject_keys(payload.get("main_subjects")))
        possible_dish_counter.update(extract_subject_keys(payload.get("possible_dish_keys")))
        secondary_item_counter.update(extract_string_list(payload.get("secondary_item_keys")))
        free_tags_counter.update(extract_string_list(payload.get("free_tags")))
        uncertainty_reasons_counter.update(extract_string_list(payload.get("uncertainty_reasons")))

        if detect_unknown_fields(payload):
            unknown_record_count += 1

    review_candidates = [build_csv_row(record) for record in valid_records if coerce_bool(record.payload.get("needs_human_review"))]
    low_confidence_candidates = [
        build_csv_row(record)
        for record in valid_records
        if record.analysis_confidence < LOW_CONFIDENCE_THRESHOLD
    ]
    scene_level_candidates = [
        build_csv_row(record, candidate_reasons=reasons)
        for record in valid_records
        if (reasons := detect_scene_level_candidate_reasons(record.payload))
    ]
    unknown_candidates = [
        build_csv_row(record, candidate_reasons=reasons)
        for record in valid_records
        if (reasons := detect_unknown_fields(record.payload))
    ]

    sort_candidate_rows(review_candidates)
    sort_candidate_rows(low_confidence_candidates)
    sort_candidate_rows(scene_level_candidates)
    sort_candidate_rows(unknown_candidates)

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
            "valid_schema_records": len(valid_records),
            "filtered_records": filtered_count,
            "excluded_by_min_confidence": excluded_by_min_confidence,
            "is_food_related_count": is_food_related_count,
            "needs_human_review": build_count_ratio(boolean_counts["needs_human_review"], filtered_count),
            "contains_multiple_dishes": build_count_ratio(boolean_counts["contains_multiple_dishes"], filtered_count),
            "is_menu_or_text_only": build_count_ratio(boolean_counts["is_menu_or_text_only"], filtered_count),
            "unknown_record_count": build_count_ratio(unknown_record_count, filtered_count),
            "low_confidence_count": build_count_ratio(low_confidence_count, filtered_count),
            "multi_dish_table_count": build_count_ratio(multi_dish_table_count, filtered_count),
            "scene_level_count": build_count_ratio(scene_level_count, filtered_count),
        },
        "schema_version_counts": dict(sorted(schema_version_counts.items())),
        "top_counts": {
            "scene_type": counter_to_items(scene_type_counter, top_n),
            "cuisine_type": counter_to_items(cuisine_type_counter, top_n),
            "meal_style": counter_to_items(meal_style_counter, top_n),
            "serving_style": counter_to_items(serving_style_counter, top_n),
            "label_granularity": counter_to_items(label_granularity_counter, top_n),
            "main_subjects": counter_to_items(main_subject_counter, top_n),
            "possible_dish_keys": counter_to_items(possible_dish_counter, top_n),
            "secondary_item_keys": counter_to_items(secondary_item_counter, top_n),
            "free_tags": counter_to_items(free_tags_counter, top_n),
            "uncertainty_reasons": counter_to_items(uncertainty_reasons_counter, top_n),
        },
        "candidate_counts": {
            "review_candidates": len(review_candidates),
            "scene_level_candidates": len(scene_level_candidates),
            "low_confidence_candidates": len(low_confidence_candidates),
            "unknown_candidates": len(unknown_candidates),
        },
        "errors": {
            "broken_json_count": broken_json_count,
            "invalid_record_shape_count": invalid_record_shape_count,
            "samples": list(error_samples),
        },
        "insights": build_insights(
            filtered_count=filtered_count,
            scene_level_count=scene_level_count,
            multi_dish_table_count=multi_dish_table_count,
            unknown_record_count=unknown_record_count,
            needs_human_review_count=boolean_counts["needs_human_review"],
        ),
        "output_files": {
            "summary_json": str(output_dir / SUMMARY_JSON_NAME),
            "summary_md": str(output_dir / SUMMARY_MD_NAME),
            "review_candidates_csv": str(output_dir / REVIEW_CANDIDATES_NAME),
            "scene_level_candidates_csv": str(output_dir / SCENE_LEVEL_CANDIDATES_NAME),
            "low_confidence_candidates_csv": str(output_dir / LOW_CONFIDENCE_CANDIDATES_NAME),
            "unknown_candidates_csv": str(output_dir / UNKNOWN_CANDIDATES_NAME),
        },
    }

    summary_md = build_summary_markdown(summary_json)

    return {
        "summary_json": summary_json,
        "summary_md": summary_md,
        "review_candidates": review_candidates,
        "scene_level_candidates": scene_level_candidates,
        "low_confidence_candidates": low_confidence_candidates,
        "unknown_candidates": unknown_candidates,
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
        f"- 有効件数: {totals['valid_schema_records']}",
        f"- フィルタ適用後件数: {totals['filtered_records']}",
        f"- 壊れた JSON 件数: {totals['broken_json_records']}",
        f"- 不正 record shape 件数: {totals['invalid_record_shape_count']}",
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
            "### scene_type",
        ]
    )
    lines.extend(render_top_count_table(top_counts["scene_type"]))
    lines.extend(
        [
            "",
            "### main_subjects",
        ]
    )
    lines.extend(render_top_count_table(top_counts["main_subjects"]))
    lines.extend(
        [
            "",
            "### possible_dish_keys",
        ]
    )
    lines.extend(render_top_count_table(top_counts["possible_dish_keys"]))
    lines.extend(
        [
            "",
            "### secondary_item_keys",
        ]
    )
    lines.extend(render_top_count_table(top_counts["secondary_item_keys"]))
    lines.extend(
        [
            "",
            "### free_tags",
        ]
    )
    lines.extend(render_top_count_table(top_counts["free_tags"]))
    lines.extend(
        [
            "",
            "## Review & Design Signals",
            f"- 人手レビュー推奨件数: {totals['needs_human_review']['count']} ({format_percent(totals['needs_human_review']['ratio'])})",
            f"- 低信頼件数: {totals['low_confidence_count']['count']} ({format_percent(totals['low_confidence_count']['ratio'])})",
            f"- multi_dish_table 件数: {totals['multi_dish_table_count']['count']} ({format_percent(totals['multi_dish_table_count']['ratio'])})",
            f"- scene_level 件数: {totals['scene_level_count']['count']} ({format_percent(totals['scene_level_count']['ratio'])})",
            f"- unknown を含む件数: {totals['unknown_record_count']['count']} ({format_percent(totals['unknown_record_count']['ratio'])})",
            f"- review_candidates.csv 件数: {candidate_counts['review_candidates']}",
            f"- scene_level_candidates.csv 件数: {candidate_counts['scene_level_candidates']}",
            f"- low_confidence_candidates.csv 件数: {candidate_counts['low_confidence_candidates']}",
            f"- unknown_candidates.csv 件数: {candidate_counts['unknown_candidates']}",
            "",
            "## Insights",
        ]
    )

    if insights:
        lines.extend([f"- {insight}" for insight in insights])
    else:
        lines.append("- 顕著な偏りはまだ大きくありません。追加データで分布を見直してください。")

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
    scene_level_count: int,
    multi_dish_table_count: int,
    unknown_record_count: int,
    needs_human_review_count: int,
) -> List[str]:
    if filtered_count <= 0:
        return []

    insights: List[str] = []
    if scene_level_count / filtered_count >= 0.10:
        insights.append("scene_level が多いため、単品料理だけでなく scene 系カテゴリを検討してください。")
    if multi_dish_table_count / filtered_count >= 0.10:
        insights.append("multi_dish_table が多いため、単一料理分類に無理がある可能性があります。")
    if unknown_record_count / filtered_count >= 0.10:
        insights.append("unknown を含む record が多いため、プロンプトまたはカテゴリ粒度の見直し候補です。")
    if needs_human_review_count / filtered_count >= 0.10:
        insights.append("人手レビュー推奨の割合が高く、人手確認コストが高い可能性があります。")
    return insights


def extract_subject_keys(value: Any) -> List[str]:
    keys: List[str] = []
    for item in ensure_list(value):
        if not isinstance(item, dict):
            continue
        key = normalize_scalar(item.get("key"))
        if key != "missing":
            keys.append(key)
    return keys


def extract_string_list(value: Any) -> List[str]:
    values: List[str] = []
    for item in ensure_list(value):
        normalized = normalize_scalar(item)
        if normalized != "missing":
            values.append(normalized)
    return values


def detect_scene_level_candidate_reasons(payload: Dict[str, Any]) -> List[str]:
    reasons: List[str] = []
    if normalize_scalar(payload.get("scene_type")) == "multi_dish_table":
        reasons.append("scene_type=multi_dish_table")
    if normalize_scalar(payload.get("label_granularity")) == "scene_level":
        reasons.append("label_granularity=scene_level")
    if coerce_bool(payload.get("contains_multiple_dishes")):
        reasons.append("contains_multiple_dishes=true")
    if coerce_bool(payload.get("is_menu_or_text_only")):
        reasons.append("is_menu_or_text_only=true")
    if coerce_bool(payload.get("is_packaged_food")):
        reasons.append("is_packaged_food=true")
    return reasons


def detect_unknown_fields(payload: Dict[str, Any]) -> List[str]:
    reasons: List[str] = []
    for field_name in ("scene_type", "cuisine_type", "meal_style", "serving_style", "label_granularity"):
        if normalize_scalar(payload.get(field_name)) == UNKNOWN_VALUE:
            reasons.append(UNKNOWN_FIELD_LABELS[field_name])

    if UNKNOWN_VALUE in extract_subject_keys(payload.get("main_subjects")):
        reasons.append(UNKNOWN_FIELD_LABELS["main_subjects.key"])
    if UNKNOWN_VALUE in extract_subject_keys(payload.get("possible_dish_keys")):
        reasons.append(UNKNOWN_FIELD_LABELS["possible_dish_keys.key"])
    if UNKNOWN_VALUE in extract_string_list(payload.get("secondary_item_keys")):
        reasons.append(UNKNOWN_FIELD_LABELS["secondary_item_keys"])
    return reasons


def build_csv_row(record: LoadedRecord, candidate_reasons: Optional[Sequence[str]] = None) -> Dict[str, str]:
    payload = record.payload
    row = {
        "image_id": clean_text(payload.get("image_id")),
        "source_path": record.source_path,
        "analysis_confidence": format_confidence(record.analysis_confidence),
        "scene_type": normalize_scalar(payload.get("scene_type")),
        "cuisine_type": normalize_scalar(payload.get("cuisine_type")),
        "meal_style": normalize_scalar(payload.get("meal_style")),
        "serving_style": normalize_scalar(payload.get("serving_style")),
        "label_granularity": normalize_scalar(payload.get("label_granularity")),
        "needs_human_review": format_bool(payload.get("needs_human_review")),
        "contains_multiple_dishes": format_bool(payload.get("contains_multiple_dishes")),
        "is_menu_or_text_only": format_bool(payload.get("is_menu_or_text_only")),
        "main_subject_keys": ";".join(extract_subject_keys(payload.get("main_subjects"))),
        "possible_dish_keys": ";".join(extract_subject_keys(payload.get("possible_dish_keys"))),
        "secondary_item_keys": ";".join(extract_string_list(payload.get("secondary_item_keys"))),
        "free_tags": ";".join(extract_string_list(payload.get("free_tags"))),
        "uncertainty_reasons": ";".join(extract_string_list(payload.get("uncertainty_reasons"))),
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
        f"valid={totals['valid_schema_records']} "
        f"filtered={totals['filtered_records']} "
        f"broken_json={totals['broken_json_records']} "
        f"invalid_shape={totals['invalid_record_shape_count']}"
    )
    print(f"Schema counts: {format_counter_map(schema_counts)}")
    print(
        "Signals: "
        f"needs_human_review={totals['needs_human_review']['count']} "
        f"low_confidence={totals['low_confidence_count']['count']} "
        f"unknown={totals['unknown_record_count']['count']}"
    )
    print(f"Top scene_type: {format_top_items(top_counts['scene_type'], top_n)}")
    print(f"Top main_subjects: {format_top_items(top_counts['main_subjects'], top_n)}")
    print(f"Top possible_dish_keys: {format_top_items(top_counts['possible_dish_keys'], top_n)}")
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
