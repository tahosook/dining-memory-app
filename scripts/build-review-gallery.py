#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import csv
import datetime as dt
import hashlib
import html
import json
import math
import mimetypes
import re
import sys
from collections import Counter
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

try:
    from food_label_taxonomy import (
        BROAD_PRIMARY_KEYS as TAXONOMY_BROAD_PRIMARY_KEYS,
        MEDIAPIPE_TRAINING_CLASSES,
        NON_CONCRETE_PRIMARY_KEYS,
        derive_mediapipe_training_class_coarse,
        derive_review_priority_bucket,
        resolve_primary_dish_label_ja,
        review_priority_rank,
    )
except ImportError:
    from scripts.food_label_taxonomy import (
        BROAD_PRIMARY_KEYS as TAXONOMY_BROAD_PRIMARY_KEYS,
        MEDIAPIPE_TRAINING_CLASSES,
        NON_CONCRETE_PRIMARY_KEYS,
        derive_mediapipe_training_class_coarse,
        derive_review_priority_bucket,
        resolve_primary_dish_label_ja,
        review_priority_rank,
    )


LOW_CONFIDENCE_THRESHOLD = 0.5
UNKNOWN_VALUE = "unknown"
BROAD_PRIMARY_KEYS = set(TAXONOMY_BROAD_PRIMARY_KEYS)
NON_CONCRETE_CANDIDATE_KEYS = set(NON_CONCRETE_PRIMARY_KEYS)
OUTPUT_FILENAMES = {
    "summary.json",
    "summary.md",
    "review_candidates.csv",
    "unknown_candidates.csv",
    "scene_dominant_candidates.csv",
    "side_item_primary_candidates.csv",
    "low_confidence_candidates.csv",
    "broad_primary_candidates.csv",
}
GROUP_ORDER = [
    "unknown",
    "broad_primary",
    "side_item_primary",
    "low_confidence",
    "scene_dominant",
    "review",
]
DEFAULT_FOCUS_GROUPS = [
    "unknown",
    "broad_primary",
    "side_item_primary",
    "low_confidence",
    "scene_dominant",
]
GROUP_METADATA = {
    "unknown": {
        "label": "UNKNOWN",
        "section_title": "Unknown candidates",
        "description": "unknown や unknown_primary を重点確認するセクションです。",
        "badge_class": "badge-unknown",
    },
    "broad_primary": {
        "label": "BROAD_PRIMARY",
        "section_title": "Broad primary candidates",
        "description": "broad な primary_dish_key を、より具体化できるか確認するセクションです。",
        "badge_class": "badge-broad",
    },
    "low_confidence": {
        "label": "LOW_CONFIDENCE",
        "section_title": "Low confidence candidates",
        "description": "confidence が低い、または low_confidence reason を持つレコードです。",
        "badge_class": "badge-low-confidence",
    },
    "scene_dominant": {
        "label": "SCENE_DOMINANT",
        "section_title": "Scene dominant candidates",
        "description": "scene 主導で主料理が埋もれていないか確認するセクションです。",
        "badge_class": "badge-scene",
    },
    "side_item_primary": {
        "label": "SIDE_ITEM_PRIMARY",
        "section_title": "Side item primary candidates",
        "description": "副菜や付随アイテムが primary に寄っていないか確認するセクションです。",
        "badge_class": "badge-side-item",
    },
    "review": {
        "label": "REVIEW_TARGET",
        "section_title": "Review targets",
        "description": "needs_human_review または review candidate CSV 該当レコードです。",
        "badge_class": "badge-review-target",
    },
}
GROUP_TO_CSV = {
    "unknown": "unknown_candidates.csv",
    "broad_primary": "broad_primary_candidates.csv",
    "low_confidence": "low_confidence_candidates.csv",
    "scene_dominant": "scene_dominant_candidates.csv",
    "side_item_primary": "side_item_primary_candidates.csv",
    "review": "review_candidates.csv",
}
REVIEW_REASON_SORT_ORDER = {
    "unknown_primary": 0,
    "broad_primary": 1,
    "scene_dominant": 2,
    "side_item_primary": 3,
    "low_confidence": 4,
    "candidate_split": 5,
    "menu_or_text": 6,
    "image_quality_issue": 7,
}
DISPLAY_PRIMARY_BY_CONTAINER_HINT = {
    "bottle": ("bottle_hint", "瓶主体ヒント"),
    "can": ("can_hint", "缶主体ヒント"),
}
DISPLAY_PRIMARY_BY_REVIEW_BUCKET = {
    "unknown_likely_bottle": DISPLAY_PRIMARY_BY_CONTAINER_HINT["bottle"],
    "unknown_likely_can": DISPLAY_PRIMARY_BY_CONTAINER_HINT["can"],
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


@dataclass
class ImageRootIndex:
    root: Path
    by_relative_lower: Dict[str, Path]
    by_name_lower: Dict[str, List[Path]]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Gemma 4 の labels.jsonl / normalized JSON から、写真つき HTML レビュー画面を生成します。"
        )
    )
    parser.add_argument("--input-path", required=True, help="labels.jsonl または run output directory")
    parser.add_argument("--output-html", required=True, help="生成する review_gallery.html")
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="フィルタ後・優先ソート後に出力する最大件数",
    )
    parser.add_argument(
        "--primary-dish-key",
        action="append",
        default=[],
        help="primary_dish_key で OR フィルタ。複数指定可。",
    )
    parser.add_argument(
        "--review-reason",
        action="append",
        default=[],
        help="review_reasons で OR フィルタ。複数指定可。",
    )
    parser.add_argument(
        "--candidate-group",
        action="append",
        default=[],
        choices=GROUP_ORDER + ["all"],
        help="重点 review group で OR フィルタ。未指定なら既定の重点セクションを出力。",
    )
    parser.add_argument(
        "--write-provisional-jsonl",
        action="store_true",
        help="labels.jsonl がなくても、現在読める record から labels.provisional.jsonl を出力する。",
    )
    parser.add_argument(
        "--image-root",
        default=None,
        help=(
            "source_path を解決する画像ルートディレクトリ。"
            "未指定時は input-path 周辺を推測。"
            "source_path がファイル名だけでも、この配下を再帰探索して解決を試みます。"
        ),
    )
    parser.add_argument(
        "--embed-images",
        action="store_true",
        help=(
            "解決できた画像を file:// ではなく data URI として HTML に埋め込みます。"
            " Safari の local file 制約回避に有効ですが、HTML サイズは大きくなります。"
        ),
    )
    parser.add_argument(
        "--include-all-records",
        action="store_true",
        help="All records セクションを出力します。未指定時は HTML サイズ削減のため省略します。",
    )
    parser.add_argument(
        "--include-review-targets",
        action="store_true",
        help="Review targets セクションを出力します。未指定時は HTML サイズ削減のため省略します。",
    )
    parser.add_argument(
        "--candidate-csv-dir",
        default=None,
        help="candidate CSV を優先探索するディレクトリ。未指定時は input / output 周辺を探索。",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input_path).expanduser().resolve()
    output_html = Path(args.output_html).expanduser().resolve()
    image_root = Path(args.image_root).expanduser().resolve() if args.image_root else None
    candidate_csv_dir = Path(args.candidate_csv_dir).expanduser().resolve() if args.candidate_csv_dir else None

    if not input_path.exists():
        print(f"Input path not found: {input_path}", file=sys.stderr)
        return 2

    if args.limit is not None and args.limit <= 0:
        print("--limit must be greater than 0.", file=sys.stderr)
        return 2

    if image_root is not None and not image_root.exists():
        print(f"--image-root not found: {image_root}", file=sys.stderr)
        return 2

    if candidate_csv_dir is not None and not candidate_csv_dir.exists():
        print(f"--candidate-csv-dir not found: {candidate_csv_dir}", file=sys.stderr)
        return 2

    filters = {
        "primary_dish_keys": normalize_filter_values(args.primary_dish_key),
        "review_reasons": normalize_filter_values(args.review_reason),
        "candidate_groups": normalize_candidate_group_filters(args.candidate_group),
        "limit": args.limit,
    }
    if "review" in filters["candidate_groups"] and not args.include_review_targets:
        print(
            "--candidate-group review requires --include-review-targets.",
            file=sys.stderr,
        )
        return 2

    selection = resolve_input_source(input_path)
    load_result = load_records(selection)

    provisional_path = None
    if args.write_provisional_jsonl and selection.jsonl_path is None:
        provisional_path = selection.base_dir / "labels.provisional.jsonl"
        write_provisional_jsonl(provisional_path, load_result["records"])

    candidate_csvs = discover_candidate_csvs(
        selection=selection,
        output_html=output_html,
        candidate_csv_dir=candidate_csv_dir,
    )
    candidate_csv_records = load_candidate_csvs(candidate_csvs)
    image_root_index = build_image_root_index(image_root)

    review_records = build_review_records(
        loaded_records=load_result["records"],
        selection=selection,
        output_html=output_html,
        image_root=image_root,
        image_root_index=image_root_index,
        embed_images=args.embed_images,
        candidate_csv_records=candidate_csv_records,
    )

    filtered_records = filter_records(review_records, filters)
    summary_records = list(filtered_records)
    display_records = list(filtered_records)
    if args.limit is not None:
        display_records = sort_records_for_limit(display_records)[: args.limit]

    page_data = build_page_data(
        selection=selection,
        output_html=output_html,
        filters=filters,
        load_result=load_result,
        review_records=review_records,
        summary_records=summary_records,
        display_records=display_records,
        candidate_csvs=candidate_csvs,
        provisional_path=provisional_path,
        include_all_records=args.include_all_records,
        include_review_targets=args.include_review_targets,
        embed_images=args.embed_images,
    )
    html_content = render_gallery_html(page_data)
    output_html.parent.mkdir(parents=True, exist_ok=True)
    output_html.write_text(html_content, encoding="utf-8")

    print(f"Input: {selection.input_path}")
    print(f"Resolved source: {selection.description}")
    print(f"Parseable records: {len(load_result['records'])}")
    print(f"Filtered records: {len(summary_records)}")
    print(f"Displayed records: {len(display_records)}")
    print(f"Image mode: {'embedded data URI' if args.embed_images else 'file URI'}")
    print(f"All records section: {'included' if args.include_all_records else 'omitted'}")
    print(f"Review targets section: {'included' if args.include_review_targets else 'omitted'}")
    print(f"Broken JSON: {load_result['broken_json_count']}")
    print(f"Invalid shapes: {load_result['invalid_record_shape_count']}")
    if provisional_path is not None:
        print(f"Provisional JSONL: {provisional_path}")
    if candidate_csvs:
        print("Candidate CSVs:")
        for group in GROUP_ORDER:
            path = candidate_csvs.get(group)
            if path is not None:
                print(f"- {group}: {path}")
    print(f"Output HTML: {output_html}")
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
    excluded_dir_names = {"raw", "__pycache__", "node_modules", ".git"}
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
    if selection.jsonl_path is not None:
        return load_records_from_jsonl(selection)
    if selection.kind == "normalized_dir":
        return load_records_from_normalized_dir(selection)
    return load_records_from_fallback_jsons(selection)


def load_records_from_jsonl(selection: SourceSelection) -> Dict[str, Any]:
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
            error_samples.append({"kind": kind, "source": source, "message": message})

    assert selection.jsonl_path is not None
    with selection.jsonl_path.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            origin = f"{selection.jsonl_path.name}:{line_number}"
            try:
                payload = json.loads(line)
            except json.JSONDecodeError as error:
                note_error("broken_json", origin, str(error))
                continue
            append_loaded_payload(
                records=records,
                payload=payload,
                default_source_path=origin,
                origin=origin,
                note_error=note_error,
            )

    return {
        "records": records,
        "broken_json_count": broken_json_count,
        "invalid_record_shape_count": invalid_record_shape_count,
        "error_samples": error_samples,
    }


def load_records_from_normalized_dir(selection: SourceSelection) -> Dict[str, Any]:
    return load_records_from_json_file_list(selection)


def load_records_from_fallback_jsons(selection: SourceSelection) -> Dict[str, Any]:
    return load_records_from_json_file_list(selection)


def load_records_from_json_file_list(selection: SourceSelection) -> Dict[str, Any]:
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
            error_samples.append({"kind": kind, "source": source, "message": message})

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


def discover_candidate_csvs(
    *,
    selection: SourceSelection,
    output_html: Path,
    candidate_csv_dir: Optional[Path],
) -> Dict[str, Path]:
    search_roots: List[Path] = []
    if candidate_csv_dir is not None:
        search_roots.append(candidate_csv_dir)

    if selection.input_path.is_dir():
        search_roots.append(selection.input_path)
        if selection.input_path.parent != selection.input_path:
            search_roots.append(selection.input_path.parent)
    else:
        search_roots.append(selection.input_path.parent)
        if selection.input_path.parent.parent != selection.input_path.parent:
            search_roots.append(selection.input_path.parent.parent)

    search_roots.append(selection.base_dir)
    if selection.base_dir.parent != selection.base_dir:
        search_roots.append(selection.base_dir.parent)
    search_roots.append(output_html.parent)
    if output_html.parent.parent != output_html.parent:
        search_roots.append(output_html.parent.parent)

    unique_roots = unique_paths(search_roots)
    discovered: Dict[str, Path] = {}
    for group in GROUP_ORDER:
        filename = GROUP_TO_CSV[group]
        for root in unique_roots:
            path = discover_named_file(root, filename)
            if path is not None:
                discovered[group] = path
                break
    return discovered


def discover_named_file(root: Path, filename: str) -> Optional[Path]:
    if not root.exists() or not root.is_dir():
        return None
    direct = root / filename
    if direct.is_file():
        return direct
    matches = sorted(path for path in root.rglob(filename) if path.is_file())
    if matches:
        return matches[0]
    return None


def load_candidate_csvs(candidate_csvs: Dict[str, Path]) -> Dict[str, Dict[str, List[str]]]:
    results: Dict[str, Dict[str, List[str]]] = {}
    for group, path in candidate_csvs.items():
        rows: Dict[str, List[str]] = {}
        with path.open("r", encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                image_id = clean_text(row.get("image_id"))
                source_path = clean_text(row.get("source_path"))
                if not image_id or not source_path:
                    continue
                record_key = build_record_key(image_id, source_path)
                reasons = parse_semicolon_list(
                    row.get("candidate_reasons") or row.get("review_reasons") or row.get("review_note_ja")
                )
                if not reasons:
                    reasons = [f"csv:{path.name}"]
                rows.setdefault(record_key, [])
                for reason in reasons:
                    if reason not in rows[record_key]:
                        rows[record_key].append(reason)
        if rows:
            results[group] = rows
    return results


def build_review_records(
    *,
    loaded_records: Sequence[LoadedRecord],
    selection: SourceSelection,
    output_html: Path,
    image_root: Optional[Path],
    image_root_index: Optional[ImageRootIndex],
    embed_images: bool,
    candidate_csv_records: Dict[str, Dict[str, List[str]]],
) -> List[Dict[str, Any]]:
    review_records: List[Dict[str, Any]] = []
    for loaded_record in loaded_records:
        payload = loaded_record.payload
        image_id = clean_text(payload.get("image_id")) or derive_image_id_from_source(loaded_record.source_path)
        source_path = clean_text(loaded_record.source_path)
        record_key = build_record_key(image_id, source_path)
        primary_dish_key = normalize_scalar(payload.get("primary_dish_key"))
        primary_dish_label_ja = resolve_primary_dish_label_ja(
            primary_dish_key,
            clean_text(payload.get("primary_dish_label_ja")),
        ) or "(missing)"
        container_hint = normalize_scalar(payload.get("container_hint"))
        review_bucket = normalize_scalar(payload.get("review_bucket"))
        display_primary_dish_key, display_primary_dish_label_ja = derive_display_primary(
            primary_dish_key=primary_dish_key,
            primary_dish_label_ja=primary_dish_label_ja,
            container_hint=container_hint,
            review_bucket=review_bucket,
        )
        primary_dish_candidates = extract_primary_dish_candidate_objects(payload.get("primary_dish_candidates"))
        supporting_items = extract_string_list(payload.get("supporting_items"))
        review_reasons = extract_string_list(payload.get("review_reasons"))
        is_food_related = True if payload.get("is_food_related") is None else coerce_bool(payload.get("is_food_related"))
        coarse_primary_dish_key = normalize_scalar(payload.get("coarse_primary_dish_key"))
        if coarse_primary_dish_key == "missing":
            coarse_primary_dish_key = primary_dish_key
        scene_type = normalize_scalar(payload.get("scene_type"))
        needs_human_review = coerce_bool(payload.get("needs_human_review"))
        mediapipe_training_class_coarse = derive_mediapipe_training_class_coarse(
            primary_dish_key,
            review_reasons=review_reasons,
            is_food_related=is_food_related,
            scene_type=scene_type,
        )
        review_priority_bucket = derive_review_priority_bucket(
            primary_dish_key=primary_dish_key,
            review_reasons=review_reasons,
            needs_human_review=needs_human_review,
        )
        review_priority = review_priority_rank(review_priority_bucket) if review_priority_bucket else 99
        broad_refinement_status = normalize_scalar(payload.get("broad_refinement_status"))
        crop_refinement_status = normalize_scalar(payload.get("crop_refinement_status"))
        broad_refinement_compare_keys = extract_string_list(payload.get("broad_refinement_compare_keys"))
        crop_refinement_triggered = detect_crop_refinement_triggered(payload)
        crop_refinement_applied = coerce_bool(payload.get("crop_refinement_applied"))
        crop_refinement_trigger_reason = normalize_optional_scalar(payload.get("crop_refinement_trigger_reason"))
        crop_refinement_skip_reason = normalize_optional_scalar(payload.get("crop_refinement_skip_reason"))
        crop_refinement_reject_reason = normalize_optional_scalar(payload.get("crop_refinement_reject_reason"))
        primary_score_info = extract_primary_candidate_scores(primary_dish_candidates)
        broad_primary_concrete_candidate = detect_broad_primary_concrete_candidate_key_from_candidates(
            primary_dish_key=primary_dish_key,
            candidates=primary_dish_candidates,
        )
        image_resolution = resolve_image_reference(
            source_path=source_path,
            selection=selection,
            image_root=image_root,
            image_root_index=image_root_index,
            embed_images=embed_images,
            output_html=output_html,
        )

        candidate_group_reasons: Dict[str, List[str]] = derive_candidate_group_reasons(
            loaded_record=loaded_record,
            primary_dish_candidates=primary_dish_candidates,
            broad_primary_concrete_candidate=broad_primary_concrete_candidate,
        )
        for group, rows in candidate_csv_records.items():
            reasons = rows.get(record_key)
            if reasons:
                candidate_group_reasons.setdefault(group, [])
                for reason in reasons:
                    if reason not in candidate_group_reasons[group]:
                        candidate_group_reasons[group].append(reason)

        candidate_groups = [
            group
            for group in GROUP_ORDER
            if candidate_group_reasons.get(group)
        ]

        review_records.append(
            {
                "record_key": record_key,
                "image_id": image_id,
                "source_path": source_path or "(missing)",
                "schema_version": loaded_record.schema_version,
                "origin": loaded_record.origin,
                "analysis_confidence": loaded_record.analysis_confidence,
                "analysis_confidence_display": format_confidence(loaded_record.analysis_confidence),
                "coarse_primary_dish_key": coarse_primary_dish_key,
                "primary_dish_key": primary_dish_key,
                "primary_dish_label_ja": primary_dish_label_ja,
                "display_primary_dish_key": display_primary_dish_key,
                "display_primary_dish_label_ja": display_primary_dish_label_ja,
                "display_primary_overridden": (
                    display_primary_dish_key != primary_dish_key
                    or display_primary_dish_label_ja != primary_dish_label_ja
                ),
                "primary_dish_candidates": primary_dish_candidates,
                "primary_dish_candidates_display": format_primary_dish_candidates(primary_dish_candidates),
                "best_concrete_candidate_key": primary_score_info["best_concrete_candidate_key"],
                "top1_key": primary_score_info["top1_key"],
                "top1_score_display": format_confidence(primary_score_info["top1_score"]),
                "top2_key": primary_score_info["top2_key"],
                "top2_score_display": format_confidence(primary_score_info["top2_score"]),
                "score_gap_display": format_confidence(primary_score_info["score_gap"]),
                "supporting_items": supporting_items,
                "supporting_items_display": format_list_for_display(supporting_items),
                "mediapipe_training_class_coarse": mediapipe_training_class_coarse,
                "review_priority": review_priority,
                "review_priority_bucket": review_priority_bucket,
                "scene_type": scene_type,
                "cuisine_type": normalize_scalar(payload.get("cuisine_type")),
                "meal_style": normalize_scalar(payload.get("meal_style")),
                "serving_style": normalize_scalar(payload.get("serving_style")),
                "container_hint": container_hint,
                "review_bucket": review_bucket,
                "broad_refinement_status": broad_refinement_status,
                "broad_refinement_compare_keys": broad_refinement_compare_keys,
                "broad_refinement_compare_keys_display": format_list_for_display(broad_refinement_compare_keys),
                "crop_refinement_status": crop_refinement_status,
                "crop_refinement_triggered": crop_refinement_triggered,
                "crop_refinement_applied": crop_refinement_applied,
                "crop_refinement_trigger_reason": crop_refinement_trigger_reason,
                "crop_refinement_skip_reason": crop_refinement_skip_reason,
                "crop_refinement_reject_reason": crop_refinement_reject_reason,
                "contains_can_or_bottle": coerce_bool(payload.get("contains_can_or_bottle")),
                "needs_human_review": needs_human_review,
                "review_reasons": review_reasons,
                "review_reasons_display": format_list_for_display(review_reasons),
                "review_note_ja": clean_text(payload.get("review_note_ja")) or "",
                "candidate_groups": candidate_groups,
                "candidate_group_reasons": candidate_group_reasons,
                "candidate_groups_display": [GROUP_METADATA[group]["label"] for group in candidate_groups],
                "broad_primary_key": primary_dish_key
                if primary_dish_key in BROAD_PRIMARY_KEYS
                else "",
                "broad_primary_concrete_candidate_key": broad_primary_concrete_candidate or "",
                "image_uri": image_resolution["image_uri"],
                "image_path": image_resolution["image_path"],
                "image_missing": image_resolution["missing"],
                "image_missing_reason": image_resolution["reason"],
                "review_flags": review_reasons,
                "group_priority": compute_group_priority(candidate_groups, review_reasons, review_priority),
                "all_sort_key": (
                    primary_dish_key,
                    image_id.lower(),
                    source_path.lower(),
                ),
            }
        )

    return review_records


def derive_candidate_group_reasons(
    *,
    loaded_record: LoadedRecord,
    primary_dish_candidates: Sequence[Dict[str, Any]],
    broad_primary_concrete_candidate: Optional[str],
) -> Dict[str, List[str]]:
    payload = loaded_record.payload
    primary_dish_key = normalize_scalar(payload.get("primary_dish_key"))
    review_reasons = extract_string_list(payload.get("review_reasons"))
    candidate_group_reasons: Dict[str, List[str]] = {}

    if primary_dish_key == UNKNOWN_VALUE or "unknown_primary" in review_reasons:
        reasons: List[str] = []
        if primary_dish_key == UNKNOWN_VALUE:
            reasons.append("primary_dish_key=unknown")
        if "unknown_primary" in review_reasons:
            reasons.append("review_reasons=unknown_primary")
        candidate_group_reasons["unknown"] = reasons

    if primary_dish_key in BROAD_PRIMARY_KEYS:
        suffix = f"->{broad_primary_concrete_candidate}" if broad_primary_concrete_candidate else ""
        candidate_group_reasons["broad_primary"] = [f"broad_primary:{primary_dish_key}{suffix}"]

    low_confidence_reasons: List[str] = []
    if loaded_record.analysis_confidence < LOW_CONFIDENCE_THRESHOLD:
        low_confidence_reasons.append(f"analysis_confidence<{LOW_CONFIDENCE_THRESHOLD}")
    if "low_confidence" in review_reasons:
        low_confidence_reasons.append("review_reasons=low_confidence")
    if low_confidence_reasons:
        candidate_group_reasons["low_confidence"] = low_confidence_reasons

    if "scene_dominant" in review_reasons:
        candidate_group_reasons["scene_dominant"] = ["review_reasons=scene_dominant"]
    if "side_item_primary" in review_reasons:
        candidate_group_reasons["side_item_primary"] = ["review_reasons=side_item_primary"]
    if coerce_bool(payload.get("needs_human_review")):
        candidate_group_reasons["review"] = ["needs_human_review=true"]

    return candidate_group_reasons


def detect_broad_primary_concrete_candidate_key_from_candidates(
    *,
    primary_dish_key: str,
    candidates: Sequence[Dict[str, Any]],
) -> Optional[str]:
    if primary_dish_key not in BROAD_PRIMARY_KEYS:
        return None
    for candidate in candidates:
        key = candidate["key"]
        if key == primary_dish_key:
            continue
        if key in NON_CONCRETE_CANDIDATE_KEYS:
            continue
        return key
    return None


def extract_primary_candidate_scores(candidates: Sequence[Dict[str, Any]]) -> Dict[str, Any]:
    top1_key = candidates[0]["key"] if candidates else ""
    top1_score = candidates[0]["score"] if candidates else 0.0
    top2_key = candidates[1]["key"] if len(candidates) >= 2 else ""
    top2_score = candidates[1]["score"] if len(candidates) >= 2 else 0.0
    best_concrete_candidate_key = ""
    for candidate in candidates:
        key = candidate["key"]
        if key in NON_CONCRETE_CANDIDATE_KEYS:
            continue
        best_concrete_candidate_key = key
        break
    return {
        "top1_key": top1_key,
        "top1_score": top1_score,
        "top2_key": top2_key,
        "top2_score": top2_score,
        "score_gap": max(0.0, top1_score - top2_score),
        "best_concrete_candidate_key": best_concrete_candidate_key,
    }


def derive_display_primary(
    *,
    primary_dish_key: str,
    primary_dish_label_ja: str,
    container_hint: str,
    review_bucket: str,
) -> Tuple[str, str]:
    if primary_dish_key != UNKNOWN_VALUE:
        return primary_dish_key, primary_dish_label_ja

    container_override = DISPLAY_PRIMARY_BY_CONTAINER_HINT.get(container_hint)
    if container_override is not None:
        return container_override

    review_bucket_override = DISPLAY_PRIMARY_BY_REVIEW_BUCKET.get(review_bucket)
    if review_bucket_override is not None:
        return review_bucket_override

    return primary_dish_key, primary_dish_label_ja


def resolve_image_reference(
    *,
    source_path: str,
    selection: SourceSelection,
    image_root: Optional[Path],
    image_root_index: Optional[ImageRootIndex],
    embed_images: bool,
    output_html: Path,
) -> Dict[str, Any]:
    normalized_source = clean_text(source_path)
    if not normalized_source:
        return {
            "image_uri": "",
            "image_path": "",
            "missing": True,
            "reason": "source_path が空のため画像を解決できませんでした。",
        }

    source_as_path = Path(normalized_source)
    candidates: List[Path] = []
    indexed_match = find_indexed_image_match(
        source_path=normalized_source,
        image_root_index=image_root_index,
    )
    if source_as_path.is_absolute():
        candidates.append(source_as_path)
    else:
        if image_root is not None:
            candidates.append(image_root / normalized_source)
        if selection.input_path.is_dir():
            candidates.append(selection.input_path / normalized_source)
        candidates.append(selection.base_dir / normalized_source)
        if selection.input_path.is_file():
            candidates.append(selection.input_path.parent / normalized_source)
        candidates.append(output_html.parent / normalized_source)

    if indexed_match is not None:
        candidate_path, match_reason = indexed_match
        return build_resolved_image_reference(
            path=candidate_path,
            reason=match_reason,
            embed_images=embed_images,
        )

    for candidate in unique_paths(candidates):
        if candidate.is_file():
            return build_resolved_image_reference(
                path=candidate,
                reason="",
                embed_images=embed_images,
            )

    tried = ", ".join(str(path.resolve()) if path.exists() else str(path) for path in unique_paths(candidates))
    return {
        "image_uri": "",
        "image_path": "",
        "missing": True,
        "reason": (
            f"画像を解決できませんでした。source_path={normalized_source}"
            + (f" / tried={tried}" if tried else "")
            + (
                f" / hint=--image-root {image_root_index.root}"
                if image_root_index is not None
                else " / hint=--image-root /path/to/photo/root"
            )
        ),
    }


def build_resolved_image_reference(*, path: Path, reason: str, embed_images: bool) -> Dict[str, Any]:
    resolved_path = path.resolve()
    image_uri = resolved_path.as_uri()
    resolved_reason = reason
    if embed_images:
        data_uri = build_data_uri_for_image(resolved_path)
        if data_uri:
            image_uri = data_uri
            resolved_reason = f"{reason} / embedded=data-uri" if reason else "embedded=data-uri"
        else:
            resolved_reason = f"{reason} / embed_failed=fallback_file_uri" if reason else "embed_failed=fallback_file_uri"

    return {
        "image_uri": image_uri,
        "image_path": str(resolved_path),
        "missing": False,
        "reason": resolved_reason,
    }


def build_data_uri_for_image(path: Path) -> str:
    mime_type = guess_image_mime_type(path)
    if not mime_type:
        return ""
    try:
        encoded = base64.b64encode(path.read_bytes()).decode("ascii")
    except OSError:
        return ""
    return f"data:{mime_type};base64,{encoded}"


def guess_image_mime_type(path: Path) -> str:
    suffix = path.suffix.lower()
    explicit = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".bmp": "image/bmp",
        ".heic": "image/heic",
        ".heif": "image/heif",
    }
    if suffix in explicit:
        return explicit[suffix]
    guessed, _ = mimetypes.guess_type(path.name)
    return guessed or ""


def build_image_root_index(image_root: Optional[Path]) -> Optional[ImageRootIndex]:
    if image_root is None:
        return None

    by_relative_lower: Dict[str, Path] = {}
    by_name_lower: Dict[str, List[Path]] = {}
    for path in sorted(candidate for candidate in image_root.rglob("*") if candidate.is_file()):
        try:
            relative = path.relative_to(image_root).as_posix().lower()
        except ValueError:
            relative = path.name.lower()
        by_relative_lower[relative] = path
        by_name_lower.setdefault(path.name.lower(), []).append(path)

    return ImageRootIndex(
        root=image_root,
        by_relative_lower=by_relative_lower,
        by_name_lower=by_name_lower,
    )


def find_indexed_image_match(
    *,
    source_path: str,
    image_root_index: Optional[ImageRootIndex],
) -> Optional[Tuple[Path, str]]:
    if image_root_index is None:
        return None

    lowered_source = source_path.lower()
    exact_relative = image_root_index.by_relative_lower.get(lowered_source)
    if exact_relative is not None and exact_relative.is_file():
        return exact_relative, f"--image-root exact relative match: {exact_relative.relative_to(image_root_index.root)}"

    basename_matches = image_root_index.by_name_lower.get(Path(source_path).name.lower(), [])
    if not basename_matches:
        return None

    if len(basename_matches) == 1:
        path = basename_matches[0]
        return path, f"--image-root basename match: {path.relative_to(image_root_index.root)}"

    sorted_matches = sorted(
        basename_matches,
        key=lambda path: (len(path.relative_to(image_root_index.root).parts), path.relative_to(image_root_index.root).as_posix().lower()),
    )
    path = sorted_matches[0]
    return path, (
        "--image-root basename match (multiple candidates, selected shortest path): "
        f"{path.relative_to(image_root_index.root)}"
    )


def normalize_filter_values(values: Sequence[str]) -> List[str]:
    normalized: List[str] = []
    for value in values:
        cleaned = normalize_scalar(value)
        if cleaned == "missing" or cleaned in normalized:
            continue
        normalized.append(cleaned)
    return normalized


def normalize_candidate_group_filters(values: Sequence[str]) -> List[str]:
    normalized: List[str] = []
    for value in values:
        cleaned = normalize_scalar(value)
        if cleaned == "missing" or cleaned == "all":
            continue
        if cleaned not in GROUP_ORDER or cleaned in normalized:
            continue
        normalized.append(cleaned)
    return normalized


def filter_records(records: Sequence[Dict[str, Any]], filters: Dict[str, Any]) -> List[Dict[str, Any]]:
    primary_dish_keys = set(filters["primary_dish_keys"])
    review_reasons = set(filters["review_reasons"])
    candidate_groups = set(filters["candidate_groups"])

    filtered: List[Dict[str, Any]] = []
    for record in records:
        if primary_dish_keys and record["primary_dish_key"] not in primary_dish_keys:
            continue
        if review_reasons and not review_reasons.intersection(record["review_reasons"]):
            continue
        if candidate_groups and not candidate_groups.intersection(record["candidate_groups"]):
            continue
        filtered.append(record)

    return filtered


def sort_records_for_limit(records: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(
        records,
        key=lambda record: (
            record["group_priority"],
            record["analysis_confidence"],
            record["image_id"].lower(),
            record["source_path"].lower(),
        ),
    )


def sort_records_for_all_section(records: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    return sorted(records, key=lambda record: record["all_sort_key"])


def build_page_data(
    *,
    selection: SourceSelection,
    output_html: Path,
    filters: Dict[str, Any],
    load_result: Dict[str, Any],
    review_records: Sequence[Dict[str, Any]],
    summary_records: Sequence[Dict[str, Any]],
    display_records: Sequence[Dict[str, Any]],
    candidate_csvs: Dict[str, Path],
    provisional_path: Optional[Path],
    include_all_records: bool,
    include_review_targets: bool,
    embed_images: bool,
) -> Dict[str, Any]:
    selected_candidate_groups = filters["candidate_groups"]
    section_groups = selected_candidate_groups or list(DEFAULT_FOCUS_GROUPS)
    if not selected_candidate_groups and include_review_targets:
        section_groups.append("review")
    focus_sections: List[Dict[str, Any]] = []
    for group in section_groups:
        if group == "review" and not include_review_targets:
            continue
        section_records = [
            record for record in display_records if group in record["candidate_groups"]
        ]
        if selected_candidate_groups and group not in selected_candidate_groups:
            continue
        focus_sections.append(
            {
                "group": group,
                "section_id": f"section-{group}",
                "title": GROUP_METADATA[group]["section_title"],
                "description": GROUP_METADATA[group]["description"],
                "records": sort_records_for_limit(section_records),
            }
        )

    summary = build_summary(
        selection=selection,
        load_result=load_result,
        summary_records=summary_records,
        display_records=display_records,
        filters=filters,
        candidate_csvs=candidate_csvs,
        provisional_path=provisional_path,
        include_all_records=include_all_records,
        include_review_targets=include_review_targets,
        embed_images=embed_images,
    )
    storage_key = build_storage_key(
        selection=selection,
        output_html=output_html,
        display_records=display_records,
    )
    record_index = {
        record["record_key"]: {
            "record_key": record["record_key"],
            "image_id": record["image_id"],
            "source_path": record["source_path"],
            "predicted_primary_dish_key": record["primary_dish_key"],
            "predicted_training_class": record["mediapipe_training_class_coarse"],
            "candidate_groups": record["candidate_groups"],
            "review_flags": record["review_flags"],
            "review_priority": record["review_priority"],
            "review_priority_bucket": record["review_priority_bucket"],
        }
        for record in display_records
    }
    known_primary_keys = sorted(
        {
            candidate["key"]
            for record in display_records
            for candidate in record["primary_dish_candidates"]
            if candidate["key"] != "missing"
        }
        | {
            record["primary_dish_key"]
            for record in display_records
            if record["primary_dish_key"] != "missing"
        }
    )

    return {
        "title": "Gemma 4 Review Gallery",
        "summary": summary,
        "focus_sections": focus_sections,
        "all_records": sort_records_for_all_section(display_records) if include_all_records else [],
        "include_all_records": include_all_records,
        "section_index_items": build_section_index_items(
            focus_sections,
            include_all_records=include_all_records,
        ),
        "storage_key": storage_key,
        "record_index": record_index,
        "known_primary_keys": known_primary_keys,
        "known_training_classes": list(MEDIAPIPE_TRAINING_CLASSES),
        "input_metadata": {
            "input_path": str(selection.input_path),
            "resolved_kind": selection.kind,
            "resolved_description": selection.description,
            "output_html": str(output_html),
        },
    }


def build_section_index_items(
    focus_sections: Sequence[Dict[str, Any]],
    *,
    include_all_records: bool,
) -> List[Dict[str, str]]:
    items = [{"id": "section-summary", "label": "Summary"}]
    for section in focus_sections:
        items.append({"id": section["section_id"], "label": section["title"]})
    if include_all_records:
        items.append({"id": "section-all-records", "label": "All records"})
    return items


def build_summary(
    *,
    selection: SourceSelection,
    load_result: Dict[str, Any],
    summary_records: Sequence[Dict[str, Any]],
    display_records: Sequence[Dict[str, Any]],
    filters: Dict[str, Any],
    candidate_csvs: Dict[str, Path],
    provisional_path: Optional[Path],
    include_all_records: bool,
    include_review_targets: bool,
    embed_images: bool,
) -> Dict[str, Any]:
    primary_dish_counter = Counter(record["primary_dish_key"] for record in summary_records)
    review_reasons_counter = Counter(
        reason
        for record in summary_records
        for reason in record["review_reasons"]
    )
    scene_type_counter = Counter(record["scene_type"] for record in summary_records)
    broad_primary_key_counter = Counter(
        record["broad_primary_key"]
        for record in summary_records
        if record["broad_primary_key"]
    )
    candidate_group_counts = {
        group: sum(1 for record in summary_records if group in record["candidate_groups"])
        for group in GROUP_ORDER
    }
    review_priority_counter = Counter(
        record["review_priority_bucket"]
        for record in summary_records
        if record["review_priority_bucket"]
    )
    missing_image_count = sum(1 for record in summary_records if record["image_missing"])

    return {
        "input_path": str(selection.input_path),
        "resolved_description": selection.description,
        "resolved_kind": selection.kind,
        "total_records_seen": (
            len(load_result["records"])
            + load_result["broken_json_count"]
            + load_result["invalid_record_shape_count"]
        ),
        "loaded_records": len(load_result["records"]),
        "filtered_records": len(summary_records),
        "displayed_records": len(display_records),
        "broken_json_count": load_result["broken_json_count"],
        "invalid_record_shape_count": load_result["invalid_record_shape_count"],
        "missing_image_count": missing_image_count,
        "top_primary_dish_key": counter_to_items(primary_dish_counter, 8),
        "top_review_reasons": counter_to_items(review_reasons_counter, 8),
        "top_scene_type": counter_to_items(scene_type_counter, 8),
        "top_broad_primary_key": counter_to_items(broad_primary_key_counter, 8),
        "candidate_group_counts": candidate_group_counts,
        "review_priority_counts": review_priority_counter_to_items(review_priority_counter),
        "review_status_counts": {
            "unreviewed": len(display_records),
            "correct": 0,
            "incorrect": 0,
        },
        "filters": {
            "primary_dish_keys": list(filters["primary_dish_keys"]),
            "review_reasons": list(filters["review_reasons"]),
            "candidate_groups": list(filters["candidate_groups"]),
            "limit": filters["limit"],
        },
        "output_options": {
            "image_mode": "embedded data URI" if embed_images else "file URI",
            "all_records_section": "included" if include_all_records else "omitted",
            "review_targets_section": "included" if include_review_targets else "omitted",
        },
        "candidate_csvs": {group: str(path) for group, path in candidate_csvs.items()},
        "provisional_jsonl": str(provisional_path) if provisional_path is not None else "",
        "error_samples": list(load_result["error_samples"]),
    }


def build_storage_key(
    *,
    selection: SourceSelection,
    output_html: Path,
    display_records: Sequence[Dict[str, Any]],
) -> str:
    fingerprint = {
        "input_path": str(selection.input_path),
        "selection_kind": selection.kind,
        "output_html": str(output_html),
        "record_keys": [record["record_key"] for record in display_records],
    }
    digest = hashlib.sha1(
        json.dumps(fingerprint, ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()[:16]
    return f"gemma4-review-gallery::{digest}"


def write_provisional_jsonl(path: Path, records: Sequence[LoadedRecord]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record.payload, ensure_ascii=False) + "\n")


def render_gallery_html(page_data: Dict[str, Any]) -> str:
    section_index_html = render_section_index(page_data["section_index_items"])
    summary_html = render_summary(page_data["summary"])
    focus_sections_html = "\n".join(render_focus_section(section) for section in page_data["focus_sections"])
    all_records_html = (
        render_all_records_section(page_data["all_records"])
        if page_data["include_all_records"]
        else ""
    )
    datalist_html = (
        render_primary_key_datalist(page_data["known_primary_keys"])
        + render_training_class_datalist(page_data["known_training_classes"])
    )
    app_data_json = serialize_json_for_script(
        {
            "storage_key": page_data["storage_key"],
            "record_index": page_data["record_index"],
            "input_metadata": page_data["input_metadata"],
        }
    )

    return f"""<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>{escape_html(page_data["title"])}</title>
  <style>
    :root {{
      color-scheme: light;
      --bg: #f4f1ea;
      --panel: #fffdfa;
      --panel-strong: #f8f4ec;
      --ink: #231f1a;
      --ink-soft: #62594d;
      --line: #ddd2c2;
      --accent: #0d5c63;
      --accent-soft: #dff1f2;
      --danger: #a6293a;
      --danger-soft: #fde6ea;
      --warn: #b65a14;
      --warn-soft: #fff0df;
      --good: #2f7d4e;
      --good-soft: #e3f5e8;
      --shadow: 0 18px 40px rgba(57, 42, 20, 0.12);
      --radius-lg: 22px;
      --radius-md: 16px;
      --radius-sm: 12px;
      --mono: "SFMono-Regular", "Menlo", "Monaco", monospace;
      --sans: "Hiragino Sans", "Yu Gothic", "Noto Sans JP", sans-serif;
    }}

    * {{
      box-sizing: border-box;
    }}

    body {{
      margin: 0;
      font-family: var(--sans);
      background:
        radial-gradient(circle at top right, rgba(13, 92, 99, 0.12), transparent 28%),
        radial-gradient(circle at top left, rgba(182, 90, 20, 0.10), transparent 24%),
        var(--bg);
      color: var(--ink);
      line-height: 1.55;
    }}

    a {{
      color: var(--accent);
    }}

    .page {{
      width: min(1440px, calc(100vw - 32px));
      margin: 0 auto;
      padding: 28px 0 56px;
    }}

    .hero,
    .panel {{
      background: rgba(255, 253, 250, 0.92);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(221, 210, 194, 0.9);
      box-shadow: var(--shadow);
      border-radius: var(--radius-lg);
    }}

    .hero {{
      padding: 28px;
      margin-bottom: 22px;
    }}

    .hero h1 {{
      margin: 0 0 10px;
      font-size: clamp(1.9rem, 4vw, 3rem);
      line-height: 1.04;
      letter-spacing: -0.04em;
    }}

    .hero p {{
      margin: 0;
      color: var(--ink-soft);
      max-width: 920px;
    }}

    .quick-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 18px;
    }}

    .section-index {{
      margin-top: 18px;
      padding: 16px 18px;
      background: linear-gradient(135deg, rgba(13, 92, 99, 0.08), rgba(182, 90, 20, 0.08));
      border: 1px solid rgba(13, 92, 99, 0.12);
      border-radius: var(--radius-md);
    }}

    .section-index h2 {{
      margin: 0 0 10px;
      font-size: 1rem;
      color: var(--ink);
    }}

    .section-index-links {{
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }}

    .section-index-link {{
      display: inline-flex;
      align-items: center;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid rgba(13, 92, 99, 0.15);
      background: rgba(255, 255, 255, 0.88);
      text-decoration: none;
      font-weight: 700;
      color: var(--accent);
    }}

    .metric {{
      background: var(--panel-strong);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      padding: 14px 16px;
    }}

    .metric-label {{
      display: block;
      font-size: 0.82rem;
      color: var(--ink-soft);
      margin-bottom: 4px;
    }}

    .metric-value {{
      font-size: 1.45rem;
      font-weight: 700;
    }}

    .toolbar {{
      display: grid;
      grid-template-columns: minmax(220px, 1fr) repeat(4, auto);
      gap: 12px;
      align-items: end;
      margin-top: 20px;
    }}

    .toolbar-group {{
      display: flex;
      flex-direction: column;
      gap: 6px;
    }}

    label {{
      font-size: 0.88rem;
      font-weight: 700;
      color: var(--ink-soft);
    }}

    input[type="text"],
    textarea,
    select {{
      width: 100%;
      font: inherit;
      color: var(--ink);
      background: #fff;
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 11px 12px;
    }}

    textarea {{
      min-height: 88px;
      resize: vertical;
    }}

    button {{
      font: inherit;
      cursor: pointer;
      border: 1px solid transparent;
      border-radius: 999px;
      padding: 11px 14px;
      font-weight: 700;
      transition: transform 120ms ease, opacity 120ms ease, background 120ms ease;
    }}

    button:hover {{
      transform: translateY(-1px);
    }}

    .button-secondary {{
      background: #fff;
      color: var(--ink);
      border-color: var(--line);
    }}

    .button-primary {{
      background: var(--accent);
      color: white;
    }}

    .button-danger {{
      background: var(--danger-soft);
      color: var(--danger);
      border-color: rgba(166, 41, 58, 0.2);
    }}

    .status-line {{
      margin-top: 12px;
      font-size: 0.9rem;
      color: var(--ink-soft);
      min-height: 1.4em;
    }}

    .panel {{
      padding: 22px;
      margin-bottom: 18px;
    }}

    .panel h2 {{
      margin: 0 0 8px;
      font-size: 1.45rem;
      letter-spacing: -0.03em;
    }}

    .panel p.section-copy {{
      margin: 0 0 18px;
      color: var(--ink-soft);
    }}

    .summary-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }}

    .summary-box {{
      background: var(--panel-strong);
      border: 1px solid var(--line);
      border-radius: var(--radius-md);
      padding: 14px 16px;
    }}

    .summary-box h3 {{
      margin: 0 0 10px;
      font-size: 0.98rem;
      color: var(--ink-soft);
    }}

    .summary-list,
    .meta-list {{
      list-style: none;
      margin: 0;
      padding: 0;
      display: grid;
      gap: 7px;
    }}

    .summary-item,
    .meta-item {{
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: baseline;
      border-bottom: 1px dashed rgba(98, 89, 77, 0.18);
      padding-bottom: 7px;
    }}

    .summary-item:last-child,
    .meta-item:last-child {{
      border-bottom: none;
      padding-bottom: 0;
    }}

    .summary-item code,
    .meta-item code {{
      font-family: var(--mono);
      font-size: 0.84rem;
    }}

    .focus-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(340px, 1fr));
      gap: 18px;
    }}

    .all-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
      gap: 14px;
    }}

    .card {{
      border: 1px solid var(--line);
      border-radius: var(--radius-lg);
      background: #fff;
      overflow: hidden;
      display: grid;
      min-width: 0;
    }}

    .card.highlight-kept-broad {{
      border-color: #b45309;
      box-shadow: inset 4px 0 0 #f59e0b;
    }}

    .card.highlight-crop-rejected {{
      border-color: #7c3aed;
      box-shadow: inset 4px 0 0 #a78bfa;
    }}

    .card.highlight-priority-broad {{
      background: #fffaf0;
    }}

    .card.focus-card {{
      grid-template-rows: minmax(260px, auto) auto;
    }}

    .card.compact-card {{
      grid-template-rows: minmax(160px, auto) auto;
      border-radius: var(--radius-md);
    }}

    .image-frame {{
      position: relative;
      background: linear-gradient(180deg, #f2ebdf, #f8f6f1);
      border-bottom: 1px solid var(--line);
      min-height: 160px;
    }}

    .focus-card .image-frame {{
      min-height: 260px;
    }}

    .image-frame img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
      background: #ede6d8;
    }}

    .placeholder {{
      position: absolute;
      inset: 0;
      display: flex;
      flex-direction: column;
      gap: 8px;
      justify-content: center;
      align-items: center;
      text-align: center;
      padding: 18px;
      color: var(--ink-soft);
      background:
        linear-gradient(135deg, rgba(13, 92, 99, 0.07), rgba(182, 90, 20, 0.08));
    }}

    .placeholder strong {{
      color: var(--ink);
    }}

    .card-body {{
      padding: 16px;
      display: grid;
      gap: 12px;
    }}

    .card-header {{
      display: flex;
      flex-direction: column;
      gap: 8px;
    }}

    .card-title-row {{
      display: flex;
      gap: 10px;
      justify-content: space-between;
      align-items: start;
      flex-wrap: wrap;
    }}

    .title-block {{
      min-width: 0;
    }}

    .title-block h3,
    .title-block h4 {{
      margin: 0;
      font-size: 1.12rem;
      line-height: 1.16;
      word-break: break-word;
    }}

    .compact-card .title-block h4 {{
      font-size: 1rem;
    }}

    .title-block .subtext {{
      display: block;
      margin-top: 4px;
      color: var(--ink-soft);
      font-size: 0.88rem;
      word-break: break-all;
    }}

    .badge-row {{
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }}

    .badge {{
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      border-radius: 999px;
      font-size: 0.75rem;
      font-weight: 800;
      letter-spacing: 0.02em;
      border: 1px solid transparent;
      white-space: nowrap;
    }}

    .badge-unknown {{
      background: var(--danger-soft);
      color: var(--danger);
      border-color: rgba(166, 41, 58, 0.16);
    }}

    .badge-broad {{
      background: var(--warn-soft);
      color: var(--warn);
      border-color: rgba(182, 90, 20, 0.18);
    }}

    .badge-low-confidence {{
      background: #fff4cf;
      color: #7c6100;
      border-color: rgba(124, 97, 0, 0.18);
    }}

    .badge-scene {{
      background: #eef0ff;
      color: #4355a5;
      border-color: rgba(67, 85, 165, 0.18);
    }}

    .badge-side-item {{
      background: #f0efff;
      color: #5a47ad;
      border-color: rgba(90, 71, 173, 0.18);
    }}

    .badge-review-target {{
      background: var(--accent-soft);
      color: var(--accent);
      border-color: rgba(13, 92, 99, 0.18);
    }}

    .badge-status-unreviewed {{
      background: #f2ece2;
      color: var(--ink-soft);
      border-color: rgba(98, 89, 77, 0.14);
    }}

    .badge-status-correct {{
      background: var(--good-soft);
      color: var(--good);
      border-color: rgba(47, 125, 78, 0.18);
    }}

    .badge-status-incorrect {{
      background: var(--danger-soft);
      color: var(--danger);
      border-color: rgba(166, 41, 58, 0.18);
    }}

    .meta-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px 14px;
    }}

    .meta-card {{
      background: var(--panel-strong);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 11px 12px;
    }}

    .meta-card strong {{
      display: block;
      margin-bottom: 4px;
      font-size: 0.82rem;
      color: var(--ink-soft);
    }}

    .meta-card code,
    .meta-card span {{
      word-break: break-word;
      font-family: var(--mono);
      font-size: 0.84rem;
    }}

    .focus-card .review-form {{
      border-top: 1px solid var(--line);
      padding-top: 12px;
    }}

    .review-form {{
      display: grid;
      gap: 10px;
    }}

    .form-row {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 10px;
    }}

    .input-caption {{
      font-size: 0.8rem;
      color: var(--ink-soft);
    }}

    details.compact-details {{
      background: var(--panel-strong);
      border: 1px solid var(--line);
      border-radius: 14px;
      padding: 10px 12px;
    }}

    details.compact-details summary {{
      cursor: pointer;
      font-weight: 700;
    }}

    .empty-state {{
      padding: 18px;
      background: var(--panel-strong);
      border: 1px dashed var(--line);
      border-radius: var(--radius-md);
      color: var(--ink-soft);
    }}

    .foot-note {{
      margin-top: 12px;
      font-size: 0.84rem;
      color: var(--ink-soft);
    }}

    @media (max-width: 900px) {{
      .page {{
        width: min(100vw - 18px, 100%);
        padding-top: 18px;
      }}

      .hero,
      .panel {{
        padding: 16px;
      }}

      .toolbar {{
        grid-template-columns: 1fr;
      }}
    }}
  </style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <h1>Gemma 4 Review Gallery</h1>
      <p>
        写真と分類結果を見比べながら、人手レビューをその場で記録するためのローカル HTML レビュー画面です。
        review 入力はブラウザ内 <code>localStorage</code> に自動保存され、JSON / CSV export と JSON import に対応しています。
      </p>
      {section_index_html}
      {summary_html}
      <div class="toolbar">
        <div class="toolbar-group">
          <label for="reviewer-input">Reviewer</label>
          <input id="reviewer-input" type="text" placeholder="reviewer name / initials">
        </div>
        <button id="export-json-button" class="button-primary" type="button">Export review JSON</button>
        <button id="export-csv-button" class="button-secondary" type="button">Export review CSV</button>
        <button id="import-json-button" class="button-secondary" type="button">Import review JSON</button>
        <button id="clear-state-button" class="button-danger" type="button">Clear saved state</button>
      </div>
      <input id="import-json-input" type="file" accept="application/json" hidden>
      <div id="status-line" class="status-line"></div>
    </section>

    {focus_sections_html}
    {all_records_html}
    {datalist_html}
  </main>

  <script>
  const APP_DATA = {app_data_json};

  const STATUS_LABELS = {{
    unreviewed: '未判定',
    ok: 'OK',
    wrong_primary: 'wrong_primary',
    exclude_non_food: 'exclude_non_food',
    exclude_menu_or_text: 'exclude_menu_or_text',
    exclude_packaged: 'exclude_packaged',
    correct: 'OK',
    incorrect: 'wrong_primary',
  }};

  const state = loadState();
  bootstrap();

  function bootstrap() {{
    applyStateToAllCards();
    bindControls();
    updateSummaryReviewCounts();
    setStatusLine('localStorage から review 状態を復元しました。');
  }}

  function loadState() {{
    const emptyState = {{ reviewer: '', reviews: {{}} }};
    try {{
      const raw = localStorage.getItem(APP_DATA.storage_key);
      if (!raw) {{
        return emptyState;
      }}
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') {{
        return emptyState;
      }}
      return {{
        reviewer: typeof parsed.reviewer === 'string' ? parsed.reviewer : '',
        reviews: parsed.reviews && typeof parsed.reviews === 'object' ? parsed.reviews : {{}},
      }};
    }} catch (error) {{
      console.warn('Failed to load saved state', error);
      return emptyState;
    }}
  }}

  function saveState() {{
    localStorage.setItem(APP_DATA.storage_key, JSON.stringify(state));
  }}

  function bindControls() {{
    const reviewerInput = document.getElementById('reviewer-input');
    reviewerInput.value = state.reviewer || '';
    reviewerInput.addEventListener('input', (event) => {{
      state.reviewer = event.target.value || '';
      forEachReview((review) => {{
        if (review.human_judgment && review.human_judgment !== 'unreviewed') {{
          review.reviewer = state.reviewer;
        }}
      }});
      saveState();
    }});

    document.querySelectorAll('[data-review-input]').forEach((input) => {{
      input.addEventListener('input', onReviewInputChanged);
      input.addEventListener('change', onReviewInputChanged);
    }});

    document.getElementById('export-json-button').addEventListener('click', exportReviewJson);
    document.getElementById('export-csv-button').addEventListener('click', exportReviewCsv);
    document.getElementById('import-json-button').addEventListener('click', () => {{
      document.getElementById('import-json-input').click();
    }});
    document.getElementById('import-json-input').addEventListener('change', importReviewJson);
    document.getElementById('clear-state-button').addEventListener('click', clearSavedState);
  }}

  function onReviewInputChanged(event) {{
    const input = event.target;
    const recordKey = input.dataset.recordKey;
    const field = input.dataset.reviewField;
    if (!recordKey || !field) {{
      return;
    }}
    const review = getReview(recordKey);
    if (field === 'human_judgment') {{
      review.human_judgment = normalizeHumanJudgment(input.value || 'unreviewed');
    }} else if (field === 'corrected_training_class') {{
      review.corrected_training_class = input.value || '';
    }} else if (field === 'corrected_primary_dish_key') {{
      review.corrected_primary_dish_key = input.value || '';
    }} else if (field === 'review_note') {{
      review.review_note = input.value || '';
    }}

    if (isReviewed(review)) {{
      review.reviewed_at = new Date().toISOString();
      review.reviewer = state.reviewer || review.reviewer || '';
    }}

    state.reviews[recordKey] = review;
    saveState();
    syncRecordCards(recordKey);
    updateSummaryReviewCounts();
  }}

  function getReview(recordKey) {{
    const current = state.reviews[recordKey];
    if (current && typeof current === 'object') {{
      return {{
        human_judgment: normalizeHumanJudgment(current.human_judgment || 'unreviewed'),
        corrected_training_class: current.corrected_training_class || '',
        corrected_primary_dish_key: current.corrected_primary_dish_key || '',
        review_note: current.review_note || '',
        reviewed_at: current.reviewed_at || '',
        reviewer: current.reviewer || '',
      }};
    }}
    return {{
      human_judgment: 'unreviewed',
      corrected_training_class: '',
      corrected_primary_dish_key: '',
      review_note: '',
      reviewed_at: '',
      reviewer: '',
    }};
  }}

  function forEachReview(callback) {{
    Object.keys(state.reviews).forEach((recordKey) => {{
      const review = getReview(recordKey);
      callback(review, recordKey);
      state.reviews[recordKey] = review;
    }});
  }}

  function applyStateToAllCards() {{
    Object.keys(APP_DATA.record_index).forEach(syncRecordCards);
  }}

  function syncRecordCards(recordKey) {{
    const review = getReview(recordKey);
    document.querySelectorAll(`[data-record-key="${{cssEscape(recordKey)}}"]`).forEach((card) => {{
      const judgmentInput = card.querySelector('[data-review-field="human_judgment"]');
      const correctedTrainingInput = card.querySelector('[data-review-field="corrected_training_class"]');
      const correctedInput = card.querySelector('[data-review-field="corrected_primary_dish_key"]');
      const noteInput = card.querySelector('[data-review-field="review_note"]');
      if (judgmentInput) {{
        judgmentInput.value = review.human_judgment || 'unreviewed';
      }}
      if (correctedTrainingInput) {{
        correctedTrainingInput.value = review.corrected_training_class || '';
      }}
      if (correctedInput) {{
        correctedInput.value = review.corrected_primary_dish_key || '';
      }}
      if (noteInput) {{
        noteInput.value = review.review_note || '';
      }}

      const statusBadge = card.querySelector('[data-review-status-badge]');
      if (statusBadge) {{
        const status = normalizeReviewStatus(review);
        statusBadge.textContent = STATUS_LABELS[review.human_judgment] || STATUS_LABELS[status];
        statusBadge.className = `badge ${{statusBadge.dataset.baseClass}} badge-status-${{status}}`;
      }}

      const reviewedMeta = card.querySelector('[data-reviewed-meta]');
      if (reviewedMeta) {{
        if (isReviewed(review)) {{
          const reviewer = review.reviewer || state.reviewer || '(anonymous)';
          reviewedMeta.textContent = `reviewed_at: ${{review.reviewed_at || '(unknown)'}} / reviewer: ${{reviewer}}`;
        }} else {{
          reviewedMeta.textContent = '未レビュー';
        }}
      }}
    }});
  }}

  function normalizeReviewStatus(review) {{
    const judgment = normalizeHumanJudgment(review.human_judgment || 'unreviewed');
    if (judgment === 'ok') {{
      return 'correct';
    }}
    if (judgment && judgment !== 'unreviewed') {{
      return 'incorrect';
    }}
    return 'unreviewed';
  }}

  function normalizeHumanJudgment(value) {{
    if (value === 'correct') {{
      return 'ok';
    }}
    if (value === 'incorrect') {{
      return 'wrong_primary';
    }}
    return value || 'unreviewed';
  }}

  function isReviewed(review) {{
    return Boolean(
      (review.human_judgment && review.human_judgment !== 'unreviewed') ||
      review.corrected_training_class ||
      review.corrected_primary_dish_key ||
      review.review_note
    );
  }}

  function updateSummaryReviewCounts() {{
    let correct = 0;
    let incorrect = 0;
    let unreviewed = 0;

    Object.keys(APP_DATA.record_index).forEach((recordKey) => {{
      const status = normalizeReviewStatus(getReview(recordKey));
      if (status === 'correct') {{
        correct += 1;
      }} else if (status === 'incorrect') {{
        incorrect += 1;
      }} else {{
        unreviewed += 1;
      }}
    }});

    setText('summary-review-unreviewed', String(unreviewed));
    setText('summary-review-correct', String(correct));
    setText('summary-review-incorrect', String(incorrect));
  }}

  function exportReviewJson() {{
    const payload = buildExportPayload();
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], {{ type: 'application/json' }}),
      buildFilename('review-results', 'json')
    );
    setStatusLine(`JSON export complete: ${{payload.records.length}} records`);
  }}

  function exportReviewCsv() {{
    const payload = buildExportPayload();
    const header = [
      'image_id',
      'source_path',
      'predicted_primary_dish_key',
      'predicted_training_class',
      'human_judgment',
      'corrected_training_class',
      'corrected_primary_dish_key',
      'review_note',
      'review_flags',
      'candidate_groups',
      'review_priority',
      'review_priority_bucket',
      'reviewed_at',
      'reviewer',
    ];
    const rows = [header.join(',')];
    payload.records.forEach((record) => {{
      rows.push([
        record.image_id,
        record.source_path,
        record.predicted_primary_dish_key,
        record.predicted_training_class,
        record.human_judgment,
        record.corrected_training_class,
        record.corrected_primary_dish_key,
        record.review_note,
        (record.review_flags || []).join(';'),
        (record.candidate_groups || []).join(';'),
        record.review_priority || '',
        record.review_priority_bucket || '',
        record.reviewed_at || '',
        record.reviewer || '',
      ].map(csvEscape).join(','));
    }});
    downloadBlob(
      new Blob([rows.join('\\n') + '\\n'], {{ type: 'text/csv;charset=utf-8' }}),
      buildFilename('review-results', 'csv')
    );
    setStatusLine(`CSV export complete: ${{payload.records.length}} records`);
  }}

  function buildExportPayload() {{
    const exportedAt = new Date().toISOString();
    const records = Object.keys(APP_DATA.record_index).sort().map((recordKey) => {{
      const base = APP_DATA.record_index[recordKey];
      const review = getReview(recordKey);
      return {{
        image_id: base.image_id,
        source_path: base.source_path,
        predicted_primary_dish_key: base.predicted_primary_dish_key,
        predicted_training_class: base.predicted_training_class || '',
        human_judgment: review.human_judgment || 'unreviewed',
        corrected_training_class: review.corrected_training_class || '',
        corrected_primary_dish_key: review.corrected_primary_dish_key || '',
        review_note: review.review_note || '',
        review_flags: base.review_flags || [],
        candidate_groups: base.candidate_groups || [],
        review_priority: base.review_priority || '',
        review_priority_bucket: base.review_priority_bucket || '',
        reviewed_at: review.reviewed_at || '',
        reviewer: review.reviewer || state.reviewer || '',
      }};
    }});
    return {{
      version: 1,
      reviewer: state.reviewer || '',
      exported_at: exportedAt,
      input_metadata: APP_DATA.input_metadata,
      records,
    }};
  }}

  function importReviewJson(event) {{
    const file = event.target.files && event.target.files[0];
    if (!file) {{
      return;
    }}
    const reader = new FileReader();
    reader.onload = () => {{
      try {{
        const parsed = JSON.parse(String(reader.result || ''));
        let matched = 0;
        let skipped = 0;
        if (parsed && typeof parsed.reviewer === 'string') {{
          state.reviewer = parsed.reviewer;
          document.getElementById('reviewer-input').value = state.reviewer;
        }}
        const records = Array.isArray(parsed.records) ? parsed.records : [];
        records.forEach((record) => {{
          const imageId = typeof record.image_id === 'string' ? record.image_id : '';
          const sourcePath = typeof record.source_path === 'string' ? record.source_path : '';
          const recordKey = `${{imageId}}::${{sourcePath}}`;
          if (!APP_DATA.record_index[recordKey]) {{
            skipped += 1;
            return;
          }}
          state.reviews[recordKey] = {{
            human_judgment: normalizeHumanJudgment(record.human_judgment || 'unreviewed'),
            corrected_training_class: record.corrected_training_class || record.training_class || record.mediapipe_training_class || '',
            corrected_primary_dish_key: record.corrected_primary_dish_key || '',
            review_note: record.review_note || '',
            reviewed_at: record.reviewed_at || '',
            reviewer: record.reviewer || state.reviewer || '',
          }};
          matched += 1;
        }});
        saveState();
        applyStateToAllCards();
        updateSummaryReviewCounts();
        setStatusLine(`Imported review JSON: matched=${{matched}} skipped=${{skipped}}`);
      }} catch (error) {{
        console.error(error);
        setStatusLine(`Import failed: ${{error.message}}`);
      }} finally {{
        event.target.value = '';
      }}
    }};
    reader.readAsText(file);
  }}

  function clearSavedState() {{
    if (!window.confirm('この HTML 用に保存された review 状態を削除します。よろしいですか？')) {{
      return;
    }}
    localStorage.removeItem(APP_DATA.storage_key);
    state.reviewer = '';
    state.reviews = {{}};
    document.getElementById('reviewer-input').value = '';
    applyStateToAllCards();
    updateSummaryReviewCounts();
    setStatusLine('Saved state cleared.');
  }}

  function downloadBlob(blob, filename) {{
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }}

  function buildFilename(prefix, extension) {{
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `${{prefix}}-${{stamp}}.${{extension}}`;
  }}

  function csvEscape(value) {{
    const text = String(value == null ? '' : value);
    return `"${{text.replace(/"/g, '""')}}"`;
  }}

  function setStatusLine(message) {{
    setText('status-line', message);
  }}

  function setText(id, value) {{
    const node = document.getElementById(id);
    if (node) {{
      node.textContent = value;
    }}
  }}

  function cssEscape(value) {{
    if (window.CSS && typeof window.CSS.escape === 'function') {{
      return window.CSS.escape(value);
    }}
    return String(value).replace(/(["\\\\#.:;,!?+<>=~*^$|%&@`])/g, '\\\\$1');
  }}
  </script>
</body>
</html>
"""


def render_summary(summary: Dict[str, Any]) -> str:
    quick_metrics = [
        ("総件数", summary["total_records_seen"]),
        ("読み込み成功件数", summary["loaded_records"]),
        ("filter 適用件数", summary["filtered_records"]),
        ("表示件数", summary["displayed_records"]),
        ("壊れた JSON 件数", summary["broken_json_count"]),
        ("missing image 件数", summary["missing_image_count"]),
    ]
    summary_grid = [
        render_summary_box("Top primary_dish_key", summary["top_primary_dish_key"]),
        render_summary_box("Top review_reasons", summary["top_review_reasons"]),
        render_summary_box("Top scene_type", summary["top_scene_type"]),
        render_summary_box("Top broad_primary_key", summary["top_broad_primary_key"]),
        render_summary_box(
            "Candidate group counts",
            [
                {"value": GROUP_METADATA[group]["label"], "count": summary["candidate_group_counts"][group]}
                for group in GROUP_ORDER
            ],
        ),
        render_summary_box("Review priority counts", summary["review_priority_counts"]),
        render_meta_box(
            "Review status counts",
            [
                ("未判定", '<span id="summary-review-unreviewed">0</span>'),
                ("合っている", '<span id="summary-review-correct">0</span>'),
                ("間違っている", '<span id="summary-review-incorrect">0</span>'),
            ],
            trusted_html=True,
        ),
        render_meta_box(
            "Input / Filters",
            [
                ("input_path", escape_code(summary["input_path"])),
                ("resolved", escape_code(summary["resolved_description"])),
                (
                    "primary_dish_key",
                    escape_code(", ".join(summary["filters"]["primary_dish_keys"]) or "(none)"),
                ),
                (
                    "review_reason",
                    escape_code(", ".join(summary["filters"]["review_reasons"]) or "(none)"),
                ),
                (
                    "candidate_group",
                    escape_code(
                        ", ".join(summary["filters"]["candidate_groups"])
                        or "(default focus sections)"
                    ),
                ),
                ("limit", escape_code(str(summary["filters"]["limit"]))),
            ],
            trusted_html=True,
        ),
        render_meta_box(
            "Output options",
            [
                ("image_mode", escape_code(summary["output_options"]["image_mode"])),
                (
                    "all_records_section",
                    escape_code(summary["output_options"]["all_records_section"]),
                ),
                (
                    "review_targets_section",
                    escape_code(summary["output_options"]["review_targets_section"]),
                ),
            ],
            trusted_html=True,
        ),
        render_meta_box(
            "Candidate CSV / Provisional",
            [
                ("provisional_jsonl", escape_code(summary["provisional_jsonl"] or "(not written)")),
                (
                    "candidate_csvs",
                    escape_code(
                        ", ".join(
                            f"{group}:{Path(path).name}"
                            for group, path in summary["candidate_csvs"].items()
                        )
                        or "(not found)"
                    ),
                ),
            ],
            trusted_html=True,
        ),
    ]

    return (
        f'<div class="quick-grid">{"".join(render_metric(label, value) for label, value in quick_metrics)}</div>'
        f'<section id="section-summary" class="panel" style="margin-top: 18px;">'
        f'<h2>Summary</h2>'
        f'<p class="section-copy">1 つの HTML に重点候補セクションと全件一覧をまとめています。review の進捗はこのページ内で更新されます。</p>'
        f'<div class="summary-grid">{"".join(summary_grid)}</div>'
        f'{render_error_samples(summary["error_samples"])}'
        f'</section>'
    )


def render_section_index(items: Sequence[Dict[str, str]]) -> str:
    links = "".join(
        f'<a class="section-index-link" href="#{escape_attr(item["id"])}">{escape_html(item["label"])}</a>'
        for item in items
    )
    return (
        '<nav class="section-index" aria-label="Section index">'
        '<h2>Section index</h2>'
        f'<div class="section-index-links">{links}</div>'
        '</nav>'
    )


def render_metric(label: str, value: Any) -> str:
    return (
        '<div class="metric">'
        f'<span class="metric-label">{escape_html(label)}</span>'
        f'<span class="metric-value">{escape_html(str(value))}</span>'
        '</div>'
    )


def render_summary_box(title: str, items: Sequence[Dict[str, Any]]) -> str:
    if not items:
        body = '<li class="summary-item"><code>(none)</code><strong>0</strong></li>'
    else:
        body = "".join(
            '<li class="summary-item">'
            f'<code>{escape_html(str(item["value"]))}</code>'
            f'<strong>{escape_html(str(item["count"]))}</strong>'
            '</li>'
            for item in items
        )
    return (
        '<div class="summary-box">'
        f'<h3>{escape_html(title)}</h3>'
        f'<ul class="summary-list">{body}</ul>'
        '</div>'
    )


def render_meta_box(title: str, items: Sequence[Tuple[str, str]], *, trusted_html: bool = False) -> str:
    body = "".join(
        '<li class="meta-item">'
        f'<strong>{escape_html(label)}</strong>'
        f'<span>{value if trusted_html else escape_html(value)}</span>'
        '</li>'
        for label, value in items
    )
    return (
        '<div class="summary-box">'
        f'<h3>{escape_html(title)}</h3>'
        f'<ul class="meta-list">{body}</ul>'
        '</div>'
    )


def render_error_samples(error_samples: Sequence[Dict[str, str]]) -> str:
    if not error_samples:
        return '<p class="foot-note">壊れた JSON や shape 不正がなければ、そのまま review を開始できます。</p>'

    items = "".join(
        '<li class="meta-item">'
        f'<strong>{escape_html(sample["kind"])}</strong>'
        f'<span>{escape_html(sample["source"])} - {escape_html(sample["message"])}</span>'
        '</li>'
        for sample in error_samples[:6]
    )
    return (
        '<div class="summary-box" style="margin-top: 16px;">'
        '<h3>Broken / Invalid samples</h3>'
        f'<ul class="meta-list">{items}</ul>'
        '</div>'
    )


def render_focus_section(section: Dict[str, Any]) -> str:
    cards = section["records"]
    body = "".join(render_record_card(record, compact=False) for record in cards)
    if not body:
        body = '<div class="empty-state">該当レコードはありません。</div>'
    return (
        f'<section id="{escape_attr(section["section_id"])}" class="panel">'
        f'<h2>{escape_html(section["title"])}</h2>'
        f'<p class="section-copy">{escape_html(section["description"])}</p>'
        f'<div class="focus-grid">{body}</div>'
        '</section>'
    )


def render_all_records_section(records: Sequence[Dict[str, Any]]) -> str:
    if not records:
        body = '<div class="empty-state">表示対象の record はありません。</div>'
    else:
        body = "".join(render_record_card(record, compact=True) for record in records)
    return (
        '<section id="section-all-records" class="panel">'
        '<h2>All records</h2>'
        '<p class="section-copy">全件を小さめサムネイル中心で一覧表示します。必要なものだけ details を開いて review 入力できます。</p>'
        f'<div class="all-grid">{body}</div>'
        '</section>'
    )


def render_record_card(record: Dict[str, Any], *, compact: bool) -> str:
    card_classes = "card compact-card" if compact else "card focus-card"
    if record["broad_refinement_status"] == "kept_broad":
        card_classes += " highlight-kept-broad"
    if record["crop_refinement_triggered"] and not record["crop_refinement_applied"]:
        card_classes += " highlight-crop-rejected"
    if record["primary_dish_key"] in BROAD_PRIMARY_KEYS:
        card_classes += " highlight-priority-broad"
    title_tag = "h4" if compact else "h3"
    predicted_label = f'{record["display_primary_dish_key"]} / {record["display_primary_dish_label_ja"]}'
    group_badges = "".join(render_group_badge(group) for group in record["candidate_groups"])
    diagnostic_badges = "".join(render_diagnostic_badges(record))
    reason_badges = "".join(
        render_reason_badge(reason)
        for reason in record["review_reasons"]
    )
    review_status_badge = (
        '<span class="badge badge-status-unreviewed" data-base-class="badge" data-review-status-badge>'
        '未判定'
        '</span>'
    )
    image_html = render_image_block(record)
    meta_grid = render_record_meta_grid(record)
    review_form = render_review_form(record, compact=compact)
    reviewed_meta = '<div class="input-caption" data-reviewed-meta>未レビュー</div>'

    if compact:
        details_block = (
            '<details class="compact-details">'
            '<summary>詳細を開く</summary>'
            f'{meta_grid}'
            f'{review_form}'
            f'{reviewed_meta}'
            '</details>'
        )
        return (
            f'<article class="{card_classes}" data-record-key="{escape_attr(record["record_key"])}">'
            f'{image_html}'
            '<div class="card-body">'
            '<div class="card-header">'
            '<div class="card-title-row">'
            '<div class="title-block">'
            f'<{title_tag}>{escape_html(predicted_label)}</{title_tag}>'
            f'<span class="subtext">{escape_html(record["image_id"])}</span>'
            '</div>'
            f'{review_status_badge}'
            '</div>'
            f'<div class="badge-row">{group_badges}{diagnostic_badges}{reason_badges}</div>'
            '</div>'
            f'{details_block}'
            '</div>'
            '</article>'
        )

    return (
        f'<article class="{card_classes}" data-record-key="{escape_attr(record["record_key"])}">'
        f'{image_html}'
        '<div class="card-body">'
        '<div class="card-header">'
        '<div class="card-title-row">'
        '<div class="title-block">'
        f'<{title_tag}>{escape_html(predicted_label)}</{title_tag}>'
        f'<span class="subtext">{escape_html(record["image_id"])} / {escape_html(record["source_path"])}</span>'
        '</div>'
        f'{review_status_badge}'
        '</div>'
        f'<div class="badge-row">{group_badges}{diagnostic_badges}{reason_badges}</div>'
        '</div>'
        f'{meta_grid}'
        f'{review_form}'
        f'{reviewed_meta}'
        '</div>'
        '</article>'
    )


def render_group_badge(group: str) -> str:
    metadata = GROUP_METADATA[group]
    return (
        f'<span class="badge {escape_attr(metadata["badge_class"])}">'
        f'{escape_html(metadata["label"])}'
        '</span>'
    )


def render_reason_badge(reason: str) -> str:
    normalized = normalize_scalar(reason)
    badge_class = "badge-review-target"
    if normalized == "unknown_primary":
        badge_class = "badge-unknown"
    elif normalized == "broad_primary":
        badge_class = "badge-broad"
    elif normalized == "low_confidence":
        badge_class = "badge-low-confidence"
    elif normalized == "scene_dominant":
        badge_class = "badge-scene"
    elif normalized == "side_item_primary":
        badge_class = "badge-side-item"
    return f'<span class="badge {badge_class}">{escape_html(reason)}</span>'


def render_diagnostic_badges(record: Dict[str, Any]) -> List[str]:
    badges: List[str] = []
    if record["broad_refinement_status"] == "kept_broad":
        badges.append('<span class="badge badge-broad">kept_broad</span>')
    elif record["broad_refinement_status"] == "resolved":
        badges.append('<span class="badge badge-review-target">broad_resolved</span>')

    if record["crop_refinement_status"] != "missing" and record["crop_refinement_status"] != "not_triggered":
        badges.append(
            f'<span class="badge badge-scene">crop_{escape_html(record["crop_refinement_status"])}</span>'
        )
    if record["crop_refinement_triggered"] and not record["crop_refinement_applied"]:
        badges.append('<span class="badge badge-low-confidence">crop_not_applied</span>')
    return badges


def render_image_block(record: Dict[str, Any]) -> str:
    if record["image_missing"] or not record["image_uri"]:
        return (
            '<div class="image-frame">'
            '<div class="placeholder">'
            '<strong>画像未解決</strong>'
            f'<span>{escape_html(record["image_missing_reason"] or "画像が見つかりませんでした。")}</span>'
            '</div>'
            '</div>'
        )
    return (
        '<div class="image-frame">'
        f'<img src="{escape_attr(record["image_uri"])}" alt="{escape_attr(record["image_id"])}">'
        '</div>'
    )


def render_record_meta_grid(record: Dict[str, Any]) -> str:
    items = [
        ("image_id", escape_code(record["image_id"])),
        ("source_path", escape_code(record["source_path"])),
        ("coarse_primary_dish_key", escape_code(record["coarse_primary_dish_key"])),
        ("final_primary_dish_key", escape_code(record["primary_dish_key"])),
        ("final_primary_dish_label_ja", escape_html(record["primary_dish_label_ja"])),
        ("mediapipe_training_class_coarse", escape_code(record["mediapipe_training_class_coarse"])),
        ("review_priority_bucket", escape_code(record["review_priority_bucket"] or "(none)")),
    ]
    if record["display_primary_overridden"]:
        items.extend(
            [
                ("display_primary_dish_key", escape_code(record["display_primary_dish_key"])),
                ("display_primary_dish_label_ja", escape_html(record["display_primary_dish_label_ja"])),
                ("raw_primary_dish_key", escape_code(record["primary_dish_key"])),
                ("raw_primary_dish_label_ja", escape_html(record["primary_dish_label_ja"])),
            ]
        )
    else:
        items.extend([])
    items.extend(
        [
            ("primary_dish_candidates", escape_code(record["primary_dish_candidates_display"])),
            ("best_concrete_candidate_key", escape_code(record["best_concrete_candidate_key"] or "(none)")),
            ("top1", escape_code(format_candidate_score_pair(record["top1_key"], record["top1_score_display"]))),
            ("top1_key", escape_code(record["top1_key"] or "(none)")),
            ("top1_score", escape_code(record["top1_score_display"])),
            ("top2", escape_code(format_candidate_score_pair(record["top2_key"], record["top2_score_display"]))),
            ("top2_key", escape_code(record["top2_key"] or "(none)")),
            ("top2_score", escape_code(record["top2_score_display"])),
            ("score_gap", escape_code(record["score_gap_display"])),
            ("supporting_items", escape_code(record["supporting_items_display"])),
            ("scene_type", escape_code(record["scene_type"])),
            ("cuisine_type", escape_code(record["cuisine_type"])),
            ("meal_style", escape_code(record["meal_style"])),
            ("serving_style", escape_code(record["serving_style"])),
            ("analysis_confidence", escape_code(record["analysis_confidence_display"])),
            ("broad_refinement_status", escape_code(record["broad_refinement_status"])),
            ("crop_refinement_status", escape_code(record["crop_refinement_status"])),
            ("crop_refinement_triggered", escape_code(str(record["crop_refinement_triggered"]).lower())),
            ("crop_refinement_applied", escape_code(str(record["crop_refinement_applied"]).lower())),
            ("crop_refinement_trigger_reason", escape_code(record["crop_refinement_trigger_reason"] or "(none)")),
            ("crop_refinement_skip_reason", escape_code(record["crop_refinement_skip_reason"] or "(none)")),
            ("crop_refinement_reject_reason", escape_code(record["crop_refinement_reject_reason"] or "(none)")),
            ("review_reasons", escape_code(record["review_reasons_display"])),
            ("review_note_ja", escape_html(record["review_note_ja"] or "(none)")),
        ]
    )
    if record["broad_refinement_compare_keys"]:
        items.append(
            (
                "broad_refinement_compare_keys",
                escape_code(record["broad_refinement_compare_keys_display"]),
            )
        )
    if record["display_primary_overridden"] or record["container_hint"] not in {"missing", "none"}:
        items.append(("container_hint", escape_code(record["container_hint"])))
    if record["display_primary_overridden"] or record["review_bucket"] not in {"missing", "normal"}:
        items.append(("review_bucket", escape_code(record["review_bucket"])))
    if record["broad_primary_key"]:
        items.append(("broad_primary_key", escape_code(record["broad_primary_key"])))
    if record["broad_primary_concrete_candidate_key"]:
        items.append(
            (
                "broad_primary_concrete_candidate_key",
                escape_code(record["broad_primary_concrete_candidate_key"]),
            )
        )

    for group in record["candidate_groups"]:
        reasons = "; ".join(record["candidate_group_reasons"].get(group, []))
        items.append((f"{group}_reason", escape_code(reasons or "(none)")))

    body = "".join(
        '<div class="meta-card">'
        f'<strong>{escape_html(label)}</strong>'
        f'<span>{value}</span>'
        '</div>'
        for label, value in items
    )
    return f'<div class="meta-grid">{body}</div>'


def render_review_form(record: Dict[str, Any], *, compact: bool) -> str:
    judgment_options = [
        ("unreviewed", "未判定"),
        ("ok", "OK"),
        ("wrong_primary", "wrong_primary"),
        ("exclude_non_food", "exclude_non_food"),
        ("exclude_menu_or_text", "exclude_menu_or_text"),
        ("exclude_packaged", "exclude_packaged"),
    ]
    select_html = (
        f'<select data-review-input data-record-key="{escape_attr(record["record_key"])}" '
        'data-review-field="human_judgment">'
        + "".join(
            f'<option value="{escape_attr(value)}">{escape_html(label)}</option>'
            for value, label in judgment_options
        )
        + "</select>"
    )
    review_form_class = "review-form" if not compact else "review-form"
    return (
        f'<div class="{review_form_class}">'
        '<div class="form-row">'
        '<div class="toolbar-group">'
        '<label>判定</label>'
        f'{select_html}'
        '</div>'
        '<div class="toolbar-group">'
        '<label>corrected_training_class</label>'
        f'<input type="text" list="known-training-classes" '
        f'data-review-input data-record-key="{escape_attr(record["record_key"])}" '
        'data-review-field="corrected_training_class" '
        'placeholder="例: fish_dish">'
        '<span class="input-caption">空欄なら corrected_primary_dish_key か予測 class を使います。</span>'
        '</div>'
        '<div class="toolbar-group">'
        '<label>corrected_primary_dish_key</label>'
        f'<input type="text" list="known-primary-dish-keys" '
        f'data-review-input data-record-key="{escape_attr(record["record_key"])}" '
        'data-review-field="corrected_primary_dish_key" '
        'placeholder="例: grilled_fish">'
        '<span class="input-caption">自由入力可。既知 key を datalist で補助します。</span>'
        '</div>'
        '</div>'
        '<div class="toolbar-group">'
        '<label>review_note</label>'
        f'<textarea data-review-input data-record-key="{escape_attr(record["record_key"])}" '
        'data-review-field="review_note" '
        'placeholder="なぜ correct / incorrect と判断したか、補足メモを書く"></textarea>'
        '</div>'
        '</div>'
    )


def render_primary_key_datalist(known_primary_keys: Sequence[str]) -> str:
    options = "".join(
        f'<option value="{escape_attr(value)}"></option>'
        for value in known_primary_keys
    )
    return f'<datalist id="known-primary-dish-keys">{options}</datalist>'


def render_training_class_datalist(known_training_classes: Sequence[str]) -> str:
    options = "".join(
        f'<option value="{escape_attr(value)}"></option>'
        for value in known_training_classes
    )
    return f'<datalist id="known-training-classes">{options}</datalist>'


def serialize_json_for_script(value: Any) -> str:
    return (
        json.dumps(value, ensure_ascii=False, sort_keys=True)
        .replace("<", "\\u003c")
        .replace(">", "\\u003e")
        .replace("&", "\\u0026")
    )


def counter_to_items(counter: Counter, top_n: int) -> List[Dict[str, Any]]:
    return [{"value": value, "count": count} for value, count in counter.most_common(top_n)]


def review_priority_counter_to_items(counter: Counter) -> List[Dict[str, Any]]:
    return [
        {"value": value, "count": counter[value]}
        for value in sorted(counter, key=lambda item: (review_priority_rank(item), item))
    ]


def derive_image_id_from_source(source_path: str) -> str:
    cleaned = clean_text(source_path)
    if not cleaned:
        return hashlib.sha1(source_path.encode("utf-8")).hexdigest()[:16]
    return cleaned.replace("/", "__")


def build_record_key(image_id: str, source_path: str) -> str:
    return f"{image_id}::{source_path}"


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


def normalize_optional_scalar(value: Any) -> str:
    normalized = normalize_scalar(value)
    return "" if normalized == "missing" else normalized


def detect_crop_refinement_triggered(payload: Dict[str, Any]) -> bool:
    explicit = payload.get("crop_refinement_triggered")
    if explicit is not None:
        return coerce_bool(explicit)
    crop_refinement_status = normalize_scalar(payload.get("crop_refinement_status"))
    return crop_refinement_status not in {"missing", "not_triggered"}


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    return re.sub(r"\s+", " ", value).strip()


def parse_semicolon_list(value: Any) -> List[str]:
    if not isinstance(value, str):
        return []
    parts = [part.strip() for part in value.split(";")]
    return [part for part in parts if part]


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
                "label_ja": clean_text(item.get("label_ja")) or "",
                "score": coerce_confidence(item.get("score")),
            }
        )
    return candidates


def format_primary_dish_candidates(candidates: Sequence[Dict[str, Any]]) -> str:
    if not candidates:
        return "(none)"
    formatted = []
    for candidate in candidates:
        label = candidate["label_ja"] or "(no_label)"
        formatted.append(f'{candidate["key"]}|{label}|{format_confidence(candidate["score"])}')
    return "; ".join(formatted)


def format_list_for_display(values: Sequence[str]) -> str:
    if not values:
        return "(none)"
    return "; ".join(values)


def format_confidence(value: float) -> str:
    return f"{value:.4f}"


def format_candidate_score_pair(candidate_key: str, score_display: str) -> str:
    return f"{candidate_key or '(none)'}|{score_display}"


def compute_group_priority(candidate_groups: Sequence[str], review_reasons: Sequence[str], review_priority: int = 99) -> Tuple[int, int, int]:
    group_ranks = [GROUP_ORDER.index(group) for group in candidate_groups if group in GROUP_ORDER]
    reason_ranks = [REVIEW_REASON_SORT_ORDER[reason] for reason in review_reasons if reason in REVIEW_REASON_SORT_ORDER]
    return (
        review_priority,
        min(group_ranks) if group_ranks else len(GROUP_ORDER) + 1,
        min(reason_ranks) if reason_ranks else len(REVIEW_REASON_SORT_ORDER) + 1,
    )


def unique_paths(paths: Iterable[Path]) -> List[Path]:
    unique: List[Path] = []
    seen = set()
    for path in paths:
        string_value = str(path)
        if string_value in seen:
            continue
        seen.add(string_value)
        unique.append(path)
    return unique


def escape_html(value: str) -> str:
    return html.escape(value, quote=False)


def escape_attr(value: str) -> str:
    return html.escape(value, quote=True)


def escape_code(value: str) -> str:
    return f"<code>{escape_html(value)}</code>"


if __name__ == "__main__":
    sys.exit(main())
