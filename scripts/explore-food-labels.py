#!/usr/bin/env python3
from __future__ import annotations

import argparse
import base64
import contextlib
import datetime as dt
import hashlib
import json
import re
import subprocess
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.request
from concurrent.futures import Future, ThreadPoolExecutor, as_completed
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Sequence, Tuple


SCHEMA_VERSION = "food_label_exploration_v3"
PROMPT_VERSION = "food_label_exploration_prompt_v9"
BROAD_REFINEMENT_PROMPT_VERSION = "food_label_exploration_broad_refinement_prompt_v3"
OLLAMA_API_BASE_URL = "http://localhost:11434/api"
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}
LOW_CONFIDENCE_REVIEW_THRESHOLD = 0.5
MAX_PRIMARY_DISH_CANDIDATES = 3
MAX_SUPPORTING_ITEMS = 5
MAX_REVIEW_REASONS = 5
SPECIFIC_DISH_CONFIDENCE_FALLBACK = 0.72
BROAD_DISH_CONFIDENCE_FALLBACK = 0.58
WEAK_DISH_CONFIDENCE_FALLBACK = 0.4
FULL_IMAGE_MODE = "full_image"
MEAT_DISH_RESCUE_KEYS = {"stir_fry", "grilled_meat"}
MEAT_DISH_RESCUE_MIN_SCORE = 0.45
MEAT_DISH_RESCUE_MAX_SCORE_GAP = 0.10

SCENE_TYPE_OPTIONS = [
    "single_dish",
    "set_meal",
    "multi_dish_table",
    "dessert_and_drink",
    "drink_only",
    "bento",
    "packaged_food",
    "menu_or_text",
    "non_food",
    "unknown",
]
CUISINE_TYPE_OPTIONS = [
    "japanese",
    "chinese",
    "western",
    "italian",
    "french",
    "korean",
    "asian_other",
    "cafe",
    "dessert",
    "drink",
    "fast_food",
    "mixed",
    "unknown",
]
MEAL_STYLE_OPTIONS = [
    "single_item",
    "set_meal",
    "shared_table",
    "course_meal",
    "snack",
    "dessert",
    "drink",
    "bento",
    "packaged",
    "unknown",
]
SERVING_STYLE_OPTIONS = [
    "single_bowl",
    "single_plate",
    "tray",
    "table_with_multiple_items",
    "cup_or_glass",
    "boxed_meal",
    "package",
    "menu_page",
    "unknown",
]
REVIEW_REASON_OPTIONS = [
    "unknown_primary",
    "scene_dominant",
    "side_item_primary",
    "low_confidence",
    "candidate_split",
    "menu_or_text",
    "image_quality_issue",
    "broad_primary",
]
REVIEW_TRIGGER_REASONS = {
    "unknown_primary",
    "scene_dominant",
    "low_confidence",
    "candidate_split",
    "menu_or_text",
    "image_quality_issue",
    "broad_primary",
}
SCENE_DOMINANT_FALLBACK_REASONS = {
    "low_confidence",
    "candidate_split",
    "menu_or_text",
    "image_quality_issue",
}
SUPPORTING_ITEM_KEYS = {
    "rice",
    "soup",
    "miso_soup",
    "salad",
    "pickles",
    "sauce",
    "side_dish",
}
CONTEXTUAL_SUPPORTING_ITEM_KEYS = {
    "bread",
    "egg",
    "drink",
    "drinks",
}
SCENE_FALLBACK_PRIMARY_KEYS = {
    "set_meal",
    "multi_dish_table",
}
BROAD_PRIMARY_KEYS = {
    "meat_dish",
    "stew",
    "noodles",
}
SCENE_DOMINANT_PRIMARY_KEYS = {
    "set_meal",
    "multi_dish_table",
    "menu_or_text",
}
IMAGE_QUALITY_REASON_HINTS = {
    "blurry",
    "blur",
    "low_resolution",
    "occluded",
    "cropped",
    "dark",
    "glare",
    "motion_blur",
}
CONTAINER_HINT_BOTTLE_TOKENS = {
    "glass_bottle",
    "plastic_bottle",
    "pet_bottle",
    "bottle_drink",
    "beer_bottle",
    "sake_bottle",
}
CONTAINER_HINT_CAN_TOKENS = {
    "metal_can",
    "aluminum_can",
    "beverage_can",
    "can_drink",
    "beer_can",
}
CONTAINER_HINT_BOTTLE_NOTE_KEYWORDS = (
    "瓶",
    "ボトル",
)
CONTAINER_HINT_CAN_NOTE_KEYWORDS = ("缶",)
DEFAULT_LABEL_JA = {
    "unknown": "不明",
    "set_meal": "定食",
    "bento": "弁当",
    "dessert": "デザート",
    "drink": "ドリンク",
    "menu_or_text": "メニュー画像",
}
DEFAULT_REVIEW_NOTE_JA = {
    "unknown_primary": "主料理不明",
    "scene_dominant": "scene優勢",
    "low_confidence": "低信頼",
    "candidate_split": "候補割れ",
    "menu_or_text": "メニュー画像",
    "image_quality_issue": "画質要確認",
    "broad_primary": "主料理粒度要確認",
}
PRIMARY_FALLBACK_REVIEW_NOTE_JA = {
    "unknown": "主料理不明",
    "set_meal": "主料理特定困難",
}
BROAD_REFINEMENT_RULES: Dict[str, Dict[str, Any]] = {
    "stew": {
        "compare_keys": ["nimono", "curry_rice", "meat_and_potato_stew", "stew"],
        "comparison_notes": [
            "nimono: prefer this for Japanese simmered dishes where ingredients keep their shape, including small bowls or set-meal dishes that the coarse stage called stew.",
            "nimono: if the image has Japanese simmered-dish cues and nimono is moderately supported, choose nimono even when the sauce is thick or dark, or the ingredients are varied.",
            "curry_rice: looks like curry sauce or roux, often paired with rice, with a broad smooth sauce-like surface.",
            "meat_and_potato_stew: looks like nikujaga-style stew with visible chunks such as meat, potato, and onion.",
            "stew: keep only for generic stew-like dishes, sauce- or soup-heavy Western stew cues, or when nimono, curry_rice, and meat_and_potato_stew are all unsafe.",
        ],
    },
    "meat_dish": {
        "compare_keys": ["stir_fry", "grilled_meat", "meat_dish"],
        "comparison_notes": [
            "stir_fry: meat is mixed with vegetables or sauce, looks tossed or pan-fried together, and ingredients often spread across the plate with an overall stir-fried feel.",
            "stir_fry: for Japanese set meals or rice bowls, prefer this when cooked meat pieces are visible with sauce or pan-fried texture but no clear grill marks.",
            "grilled_meat: grilled or sauteed meat itself is the main subject, with clearer browned or charred surfaces, sliced meat or yakiniku-like pieces, and fewer mixed vegetables.",
            "grilled_meat: prefer this when sliced or chunked meat dominates and has visible browning, searing, or yakiniku/steak-like cues even if it is served with rice.",
            "meat_dish: use only when it is clearly a meat-centered dish, but it is still not safe to decide between stir_fry and grilled_meat.",
        ],
    },
    "noodles": {
        "compare_keys": ["pasta", "noodles"],
        "comparison_notes": [
            "pasta: Italian-style pasta noodles, often with sauce, cheese, or Western plating cues.",
            "noodles: use only when noodles are clear but it is not safe to call them pasta from the image.",
        ],
    },
}

FORMAT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "schema_version": {"type": "string"},
        "image_id": {"type": "string"},
        "source_path": {"type": "string"},
        "is_food_related": {"type": "boolean"},
        "analysis_confidence": {"type": "number"},
        "primary_dish_key": {"type": "string"},
        "primary_dish_label_ja": {"type": "string"},
        "primary_dish_candidates": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "key": {"type": "string"},
                    "label_ja": {"type": "string"},
                    "score": {"type": "number"},
                },
                "required": ["key", "label_ja", "score"],
                "additionalProperties": False,
            },
        },
        "supporting_items": {
            "type": "array",
            "items": {"type": "string"},
        },
        "scene_type": {"type": "string", "enum": SCENE_TYPE_OPTIONS},
        "cuisine_type": {"type": "string", "enum": CUISINE_TYPE_OPTIONS},
        "meal_style": {"type": "string", "enum": MEAL_STYLE_OPTIONS},
        "serving_style": {"type": "string", "enum": SERVING_STYLE_OPTIONS},
        "contains_multiple_dishes": {"type": "boolean"},
        "is_drink_only": {"type": "boolean"},
        "is_sweets_or_dessert": {"type": "boolean"},
        "is_packaged_food": {"type": "boolean"},
        "is_menu_or_text_only": {"type": "boolean"},
        "is_takeout_or_delivery": {"type": "boolean"},
        "visual_attributes": {"type": "array", "items": {"type": "string"}},
        "uncertainty_reasons": {"type": "array", "items": {"type": "string"}},
        "review_reasons": {"type": "array", "items": {"type": "string", "enum": REVIEW_REASON_OPTIONS}},
        "free_tags": {"type": "array", "items": {"type": "string"}},
        "review_note_ja": {"type": "string"},
        "needs_human_review": {"type": "boolean"},
    },
    "required": [
        "schema_version",
        "image_id",
        "source_path",
        "is_food_related",
        "analysis_confidence",
        "primary_dish_key",
        "primary_dish_label_ja",
        "primary_dish_candidates",
        "supporting_items",
        "scene_type",
        "cuisine_type",
        "meal_style",
        "serving_style",
        "contains_multiple_dishes",
        "is_drink_only",
        "is_sweets_or_dessert",
        "is_packaged_food",
        "is_menu_or_text_only",
        "is_takeout_or_delivery",
        "visual_attributes",
        "uncertainty_reasons",
        "review_reasons",
        "free_tags",
        "review_note_ja",
        "needs_human_review",
    ],
    "additionalProperties": False,
}
BROAD_REFINEMENT_FORMAT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "primary_dish_key": {"type": "string"},
        "primary_dish_label_ja": {"type": "string"},
        "primary_dish_candidates": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "key": {"type": "string"},
                    "label_ja": {"type": "string"},
                    "score": {"type": "number"},
                },
                "required": ["key", "label_ja", "score"],
                "additionalProperties": False,
            },
        },
        "analysis_confidence": {"type": "number"},
        "review_note_ja": {"type": "string"},
    },
    "required": [
        "primary_dish_key",
        "primary_dish_label_ja",
        "primary_dish_candidates",
        "analysis_confidence",
        "review_note_ja",
    ],
    "additionalProperties": False,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Gemma 4 on Ollama で食事写真をローカル一括ラベリングします。"
    )
    parser.add_argument("--input-dir", required=True, help="入力画像ディレクトリ")
    parser.add_argument("--output-dir", required=True, help="出力ディレクトリ")
    parser.add_argument(
        "--model",
        default="gemma4:e4b",
        help="Ollama model name (default: gemma4:e4b)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="skip 後に新規処理する件数の上限",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="既存の normalized JSON があっても再推論する",
    )
    parser.add_argument(
        "--timeout",
        type=float,
        default=180.0,
        help="1 リクエストあたりの timeout 秒数 (default: 180)",
    )
    parser.add_argument(
        "--sleep-seconds",
        type=float,
        default=0.0,
        help="画像ごとの sleep 秒数 (default: 0)",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=1,
        help="並列 worker 数 (default: 1)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_dir = Path(args.input_dir).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()

    if not input_dir.is_dir():
        print(f"Input directory not found: {input_dir}", file=sys.stderr)
        return 2

    if args.limit is not None and args.limit < 0:
        print("--limit must be 0 or greater.", file=sys.stderr)
        return 2

    if args.timeout <= 0:
        print("--timeout must be greater than 0.", file=sys.stderr)
        return 2

    if args.sleep_seconds < 0:
        print("--sleep-seconds must be 0 or greater.", file=sys.stderr)
        return 2

    if args.workers <= 0:
        print("--workers must be greater than 0.", file=sys.stderr)
        return 2

    normalized_root = output_dir / "normalized"
    raw_root = output_dir / "raw"
    errors_path = output_dir / "errors.jsonl"
    labels_path = output_dir / "labels.jsonl"

    normalized_root.mkdir(parents=True, exist_ok=True)
    raw_root.mkdir(parents=True, exist_ok=True)

    try:
        preflight_ollama(model=args.model, timeout=args.timeout)
    except Exception as error:
        print(f"Preflight failed: {error}", file=sys.stderr)
        return 1

    image_paths = collect_image_paths(input_dir)
    if not image_paths:
        print(f"No supported images found under {input_dir}.")
        rebuild_labels_jsonl(normalized_root=normalized_root, labels_path=labels_path)
        return 0

    print(f"Found {len(image_paths)} supported images under {input_dir}.")

    skipped = 0
    jobs: List[Dict[str, Any]] = []

    for image_path in image_paths:
        relative_path = image_path.relative_to(input_dir)
        source_path = relative_path.as_posix()
        image_id = build_image_id(relative_path)
        normalized_path = output_path_with_suffix(normalized_root, relative_path, ".json")
        raw_path = output_path_with_suffix(raw_root, relative_path, ".response.json")

        if normalized_path.exists() and not args.overwrite:
            skipped += 1
            print(f"[skip] {relative_path}")
            continue

        if args.limit is not None and len(jobs) >= args.limit:
            break

        jobs.append(
            {
                "image_path": image_path,
                "relative_path": relative_path,
                "image_id": image_id,
                "source_path": source_path,
                "normalized_path": normalized_path,
                "raw_path": raw_path,
            }
        )

    if not jobs:
        rebuild_labels_jsonl(normalized_root=normalized_root, labels_path=labels_path)
        print("")
        print("Done.")
        print("- processed: 0")
        print(f"- skipped: {skipped}")
        print("- failed: 0")
        print(f"- workers: {args.workers}")
        print(f"- labels_jsonl: {labels_path}")
        print(f"- normalized_dir: {normalized_root}")
        print(f"- raw_dir: {raw_root}")
        print(f"- errors_jsonl: {errors_path}")
        return 0

    workers_used = min(args.workers, len(jobs))
    print(f"Queueing {len(jobs)} new images with workers={workers_used}.")

    for job in jobs:
        print(f"[run ] {job['relative_path']}")

    processed = 0
    failed = 0
    future_to_job: Dict[Future[Optional[Dict[str, Any]]], Dict[str, Any]] = {}
    with ThreadPoolExecutor(max_workers=workers_used) as executor:
        for job in jobs:
            future = executor.submit(
                process_single_image_job,
                image_path=job["image_path"],
                relative_path=job["relative_path"],
                image_id=job["image_id"],
                source_path=job["source_path"],
                normalized_path=job["normalized_path"],
                raw_path=job["raw_path"],
                model=args.model,
                timeout=args.timeout,
                sleep_seconds=args.sleep_seconds,
            )
            future_to_job[future] = job

        total_jobs = len(jobs)
        for future in as_completed(future_to_job):
            job = future_to_job[future]
            relative_path = job["relative_path"]
            progress_done = processed + failed + 1
            progress_suffix = f"(completed={progress_done}/{total_jobs} processed={processed} failed={failed})"

            try:
                raw_response = future.result()
                if raw_response is not None:
                    processed += 1
                print(
                    f"[done] {relative_path} "
                    f"(completed={processed + failed}/{total_jobs} processed={processed} failed={failed})"
                )
            except StageError as error:
                failed += 1
                append_error(
                    errors_path=errors_path,
                    image_id=job["image_id"],
                    relative_path=relative_path,
                    stage=error.stage,
                    model=args.model,
                    error_type=type(error.__cause__ or error).__name__,
                    message=str(error.__cause__ or error),
                )
                print(f"[error] {relative_path} ({error.stage}) {progress_suffix}: {error}", file=sys.stderr)
            except Exception as error:
                failed += 1
                append_error(
                    errors_path=errors_path,
                    image_id=job["image_id"],
                    relative_path=relative_path,
                    stage="unknown",
                    model=args.model,
                    error_type=type(error).__name__,
                    message=str(error),
                )
                print(f"[error] {relative_path} (unknown) {progress_suffix}: {error}", file=sys.stderr)

    rebuild_labels_jsonl(normalized_root=normalized_root, labels_path=labels_path)

    print("")
    print("Done.")
    print(f"- processed: {processed}")
    print(f"- skipped: {skipped}")
    print(f"- failed: {failed}")
    print(f"- workers: {workers_used}")
    print(f"- labels_jsonl: {labels_path}")
    print(f"- normalized_dir: {normalized_root}")
    print(f"- raw_dir: {raw_root}")
    print(f"- errors_jsonl: {errors_path}")
    return 0


class StageError(RuntimeError):
    def __init__(self, stage: str, message: str, *, cause: Optional[BaseException] = None) -> None:
        super().__init__(message)
        self.stage = stage
        self.__cause__ = cause


def process_single_image_job(
    *,
    image_path: Path,
    relative_path: Path,
    image_id: str,
    source_path: str,
    normalized_path: Path,
    raw_path: Path,
    model: str,
    timeout: float,
    sleep_seconds: float,
) -> Optional[Dict[str, Any]]:
    try:
        return process_single_image(
            image_path=image_path,
            relative_path=relative_path,
            image_id=image_id,
            source_path=source_path,
            normalized_path=normalized_path,
            raw_path=raw_path,
            model=model,
            timeout=timeout,
        )
    finally:
        if sleep_seconds > 0:
            time.sleep(sleep_seconds)


def collect_image_paths(input_dir: Path) -> List[Path]:
    image_paths: List[Path] = []
    for path in input_dir.rglob("*"):
        if not path.is_file():
            continue
        if path.suffix.lower() not in SUPPORTED_EXTENSIONS:
            continue
        image_paths.append(path)

    return sorted(image_paths, key=lambda path: path.relative_to(input_dir).as_posix().lower())


def output_path_with_suffix(root_dir: Path, relative_path: Path, suffix: str) -> Path:
    parts = list(relative_path.parts)
    if not parts:
        raise ValueError("relative_path must not be empty")

    file_name = parts[-1] + suffix
    target = root_dir.joinpath(*parts[:-1], file_name)
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


def build_image_id(relative_path: Path) -> str:
    parts: List[str] = []
    for index, part in enumerate(relative_path.parts):
        slug = slugify_path_part(part, is_filename=index == len(relative_path.parts) - 1)
        parts.append(slug)

    image_id = "__".join(part for part in parts if part).lower()
    if image_id:
        return image_id

    return hashlib.sha1(relative_path.as_posix().encode("utf-8")).hexdigest()[:16]


def slugify_path_part(part: str, *, is_filename: bool) -> str:
    if is_filename:
        source = Path(part)
        stem_slug = slugify_ascii_token(source.stem)
        suffix_slug = slugify_ascii_token(source.suffix.lstrip("."))
        if stem_slug and suffix_slug:
            return f"{stem_slug}_{suffix_slug}"
        if stem_slug:
            return stem_slug
        if suffix_slug:
            stem_hash = hashlib.sha1(part.encode("utf-8")).hexdigest()[:8]
            return f"{stem_hash}_{suffix_slug}"
        return hashlib.sha1(part.encode("utf-8")).hexdigest()[:8]

    slug = slugify_ascii_token(part)
    if slug:
        return slug

    return hashlib.sha1(part.encode("utf-8")).hexdigest()[:8]


def slugify_ascii_token(value: Any) -> str:
    if not isinstance(value, str):
        return ""

    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    ascii_value = ascii_value.lower()
    ascii_value = re.sub(r"[^a-z0-9]+", "_", ascii_value)
    return ascii_value.strip("_")


def process_single_image(
    *,
    image_path: Path,
    relative_path: Path,
    image_id: str,
    source_path: str,
    normalized_path: Path,
    raw_path: Path,
    model: str,
    timeout: float,
) -> Optional[Dict[str, Any]]:
    try:
        with prepared_image_path(image_path) as prepared_path:
            try:
                coarse_stage = run_model_stage(
                    model=model,
                    format_schema=FORMAT_SCHEMA,
                    system_prompt=build_system_prompt(),
                    user_prompt=build_user_prompt(image_id=image_id, source_path=source_path),
                    prepared_image_path=prepared_path,
                    timeout=timeout,
                    image_mode=FULL_IMAGE_MODE,
                )
            except Exception as error:
                raise StageError("ollama_chat", f"Failed to analyze image with Ollama: {error}", cause=error) from error
    except Exception as error:
        raise StageError("prepare_image", f"Failed to prepare image: {error}", cause=error) from error

    raw_record = build_raw_record(
        image_id=image_id,
        relative_path=relative_path,
        model=model,
        prompt_version=PROMPT_VERSION,
        stage_result=coarse_stage,
    )
    persist_raw_record(raw_path=raw_path, raw_record=raw_record)

    try:
        coarse_raw_result = parse_model_json_object(coarse_stage["raw_message_content"])
    except Exception as error:
        raise StageError("parse_response", f"Failed to parse model JSON: {error}", cause=error) from error

    try:
        coarse_normalized = normalize_result(
            coarse_raw_result,
            image_id=image_id,
            source_path=source_path,
        )
    except Exception as error:
        raise StageError("normalize_result", f"Failed to normalize response: {error}", cause=error) from error

    final_normalized = apply_broad_refinement_metadata(
        coarse_normalized,
        coarse_normalized=coarse_normalized,
        status="not_applicable",
        compare_keys=[],
        image_mode=FULL_IMAGE_MODE,
        note_ja="",
    )

    if should_run_broad_refinement(coarse_normalized):
        broad_key = coarse_normalized["primary_dish_key"]
        compare_keys = list(BROAD_REFINEMENT_RULES[broad_key]["compare_keys"])
        broad_refinement_record: Dict[str, Any] = {
            "prompt_version": BROAD_REFINEMENT_PROMPT_VERSION,
            "image_mode": FULL_IMAGE_MODE,
            "compare_keys": compare_keys,
        }
        try:
            with prepared_image_path(image_path) as refinement_prepared_path:
                fine_stage = run_model_stage(
                    model=model,
                    format_schema=BROAD_REFINEMENT_FORMAT_SCHEMA,
                    system_prompt=build_system_prompt(),
                    user_prompt=build_broad_refinement_prompt(
                        image_id=image_id,
                        source_path=source_path,
                        coarse_normalized=coarse_normalized,
                    ),
                    prepared_image_path=refinement_prepared_path,
                    timeout=timeout,
                    image_mode=FULL_IMAGE_MODE,
                )
            broad_refinement_record.update(
                {
                    "request": fine_stage["request"],
                    "raw_message_content": fine_stage["raw_message_content"],
                    "response_json": fine_stage["response_json"],
                }
            )
            raw_record["broad_refinement"] = broad_refinement_record
            persist_raw_record(raw_path=raw_path, raw_record=raw_record)

            fine_raw_result = parse_model_json_object(fine_stage["raw_message_content"])
            merged_raw_result = merge_broad_refinement_into_raw_result(
                coarse_raw_result=coarse_raw_result,
                fine_raw_result=fine_raw_result,
                coarse_primary_dish_key=broad_key,
            )
            merged_raw_result = apply_conservative_meat_dish_candidate_rescue(
                merged_raw_result=merged_raw_result,
                coarse_primary_dish_key=broad_key,
            )
            final_normalized = normalize_result(
                merged_raw_result,
                image_id=image_id,
                source_path=source_path,
            )
            final_normalized = apply_broad_refinement_metadata(
                final_normalized,
                coarse_normalized=coarse_normalized,
                status=derive_broad_refinement_status(
                    coarse_primary_dish_key=broad_key,
                    final_primary_dish_key=final_normalized["primary_dish_key"],
                ),
                compare_keys=compare_keys,
                image_mode=FULL_IMAGE_MODE,
                note_ja=clean_short_text(merged_raw_result.get("broad_refinement_note_ja")),
            )
        except Exception as error:
            broad_refinement_record["error"] = str(error)
            raw_record["broad_refinement"] = broad_refinement_record
            persist_raw_record(raw_path=raw_path, raw_record=raw_record)
            final_normalized = apply_broad_refinement_metadata(
                coarse_normalized,
                coarse_normalized=coarse_normalized,
                status="failed",
                compare_keys=compare_keys,
                image_mode=FULL_IMAGE_MODE,
                note_ja="",
            )

    try:
        write_json_file(normalized_path, final_normalized)
    except Exception as error:
        raise StageError("write_normalized", f"Failed to write normalized JSON: {error}", cause=error) from error

    return final_normalized


def resolve_stage_image_path(*, prepared_image_path: Path, image_mode: str) -> Path:
    if image_mode != FULL_IMAGE_MODE:
        raise ValueError(f"Unsupported image_mode: {image_mode}")
    return prepared_image_path


def should_run_broad_refinement(coarse_normalized: Dict[str, Any]) -> bool:
    return coarse_normalized.get("primary_dish_key") in BROAD_PRIMARY_KEYS


def derive_broad_refinement_status(*, coarse_primary_dish_key: str, final_primary_dish_key: str) -> str:
    if final_primary_dish_key == coarse_primary_dish_key:
        return "kept_broad"
    return "resolved"


def build_raw_record(
    *,
    image_id: str,
    relative_path: Path,
    model: str,
    prompt_version: str,
    stage_result: Dict[str, Any],
) -> Dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "prompt_version": prompt_version,
        "image_id": image_id,
        "relative_path": relative_path.as_posix(),
        "model": model,
        "api_path": "/chat",
        "request": stage_result["request"],
        "raw_message_content": stage_result["raw_message_content"],
        "response_json": stage_result["response_json"],
    }


def persist_raw_record(*, raw_path: Path, raw_record: Dict[str, Any]) -> None:
    try:
        write_json_file(raw_path, raw_record)
    except Exception as error:
        raise StageError("write_raw_response", f"Failed to write raw response: {error}", cause=error) from error


def preflight_ollama(*, model: str, timeout: float) -> None:
    tags_response = get_json(path="/tags", timeout=timeout)
    models = []
    for item in ensure_list(tags_response.get("models") if isinstance(tags_response, dict) else None):
        if isinstance(item, dict):
            for key in ("name", "model"):
                value = item.get(key)
                if isinstance(value, str) and value.strip():
                    models.append(value.strip())

    available_models = sorted(set(models))
    if model not in available_models:
        preview = ", ".join(available_models[:10]) if available_models else "(none)"
        raise RuntimeError(
            f"Ollama model '{model}' was not found on {OLLAMA_API_BASE_URL}. "
            f"Available models: {preview}"
        )


def run_model_stage(
    *,
    model: str,
    format_schema: Dict[str, Any],
    system_prompt: str,
    user_prompt: str,
    prepared_image_path: Path,
    timeout: float,
    image_mode: str,
) -> Dict[str, Any]:
    stage_image_path = resolve_stage_image_path(
        prepared_image_path=prepared_image_path,
        image_mode=image_mode,
    )
    payload = build_chat_payload(
        model=model,
        format_schema=format_schema,
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        image_path=stage_image_path,
    )
    response_json = post_json(
        path="/chat",
        payload=payload,
        timeout=timeout,
    )
    raw_message_content = None
    if isinstance(response_json, dict):
        message = response_json.get("message")
        if isinstance(message, dict):
            raw_message_content = message.get("content")
    return {
        "request": {
            "model": model,
            "stream": False,
            "timeout_seconds": timeout,
            "format_schema": format_schema,
            "image_mode": image_mode,
            "messages": [
                {
                    "role": "system",
                    "content": system_prompt,
                },
                {
                    "role": "user",
                    "content": user_prompt,
                    "images": ["<omitted_base64_image>"],
                },
            ],
        },
        "raw_message_content": raw_message_content,
        "response_json": response_json,
    }


def build_chat_payload(
    *,
    model: str,
    format_schema: Dict[str, Any],
    system_prompt: str,
    user_prompt: str,
    image_path: Path,
) -> Dict[str, Any]:
    image_bytes = image_path.read_bytes()
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    return {
        "model": model,
        "stream": False,
        "format": format_schema,
        "options": {
            "temperature": 0,
        },
        "messages": [
            {
                "role": "system",
                "content": system_prompt,
            },
            {
                "role": "user",
                "content": user_prompt,
                "images": [image_b64],
            },
        ],
    }


def build_system_prompt() -> str:
    return "\n".join(
        [
            "You are labeling meal photos for dataset design.",
            "Your primary goal is NOT to describe the scene.",
            "Your primary goal is to identify the most representative MAIN DISH category in the photo.",
            "Choose the dish the user most likely wants to log.",
            "Return exactly one valid JSON object only.",
            "Do not include markdown.",
            "Do not include code fences.",
            "Do not include explanations.",
        ]
    )


def build_user_prompt(*, image_id: str, source_path: str) -> str:
    schema_summary = {
        "schema_version": SCHEMA_VERSION,
        "scene_type_options": SCENE_TYPE_OPTIONS,
        "cuisine_type_options": CUISINE_TYPE_OPTIONS,
        "meal_style_options": MEAL_STYLE_OPTIONS,
        "serving_style_options": SERVING_STYLE_OPTIONS,
        "review_reason_options": REVIEW_REASON_OPTIONS,
    }

    instructions = [
        "Important priorities:",
        "1. Prefer a MAIN DISH label over a scene label: if any representative dish is visible, choose specific dish > cooking-method dish > broad dish > set_meal > unknown.",
        "2. Use scene_type only as supporting context; it must not override a visible dish.",
        "3. Use supporting_items for rice, soup, miso_soup, salad, pickles, sauce, side_dish, bread, egg, drinks, and other accompaniments.",
        "4. Use set_meal as primary_dish_key ONLY when the main dish truly cannot be identified.",
        "5. Even if the photo shows multiple dishes, choose the most representative main dish category if possible.",
        "6. When choosing the main dish, use this order: specific dish > cooking-method dish > broad dish > set_meal or unknown.",
        "7. Do NOT use rice, soup, side_dish, pickles, salad, sauce, or other accompaniments as primary_dish_key unless the image genuinely centers on that food alone.",
        "8. multi_dish_table and set_meal are fallback labels for truly mixed or dish-less scenes, not default labels.",
        "9. If a meat dish is visible and you can roughly tell the style, prefer fried_cutlet, fried_chicken, grilled_meat, stir_fry, stew, or meat_and_potato_stew over meat_dish.",
        "10. Use meat_dish only as a last-resort broad fallback when no more specific dish-oriented label can be chosen reasonably.",
        "11. Use stew only as a last-resort broad fallback when you cannot safely choose nimono, curry_rice, or meat_and_potato_stew.",
        "12. Use noodles only as a fallback when noodles are visible but it is not safe to narrow them beyond noodles.",
        "13. A broad but usable dish label is still better than set_meal. Low confidence should be used only for real ambiguity, not by default.",
        "14. Only set needs_human_review=true when there is a real reason, such as unknown primary dish, very low confidence, strong ambiguity between candidates, menu/text image, or severe visibility issues.",
        "15. Do not include scene_dominant in review_reasons when primary_dish_key is a specific dish such as grilled_fish, fried_cutlet, stir_fry, grilled_meat, curry_rice, nimono, dessert, or drink.",
        "",
        "When choosing primary_dish_key:",
        '- First ask: "What is the main dish the user most likely wants to log?"',
        "- If visible, pick that dish.",
        "- If the exact dish name is unclear but the cooking method or family is visible, choose that more specific dish-oriented label.",
        "- If that is still unclear, choose a broader dish category.",
        "- Only if no main dish can be reasonably chosen, use set_meal or unknown.",
        "",
        "Good examples:",
        "- grilled fish set meal -> primary_dish_key = grilled_fish",
        "- curry with salad and soup -> primary_dish_key = curry_rice",
        "- fried chicken with rice and miso soup -> primary_dish_key = fried_chicken",
        "- pork cutlet set meal -> primary_dish_key = fried_cutlet",
        "- grilled meat plate with rice -> primary_dish_key = grilled_meat",
        "- meat and vegetables stir fry with rice -> primary_dish_key = stir_fry",
        "- stew with bread and salad -> primary_dish_key = stew",
        "- noodle bowl with side dishes -> primary_dish_key = noodles",
        "- only when the meal is too mixed or unclear -> primary_dish_key = set_meal",
        "",
        "Bad examples:",
        "- primary_dish_key = rice when rice is just part of a set",
        "- primary_dish_key = soup when soup is just part of a set",
        "- primary_dish_key = side_dish when a main dish is visible",
        "- primary_dish_key = set_meal when grilled_fish, curry_rice, fried_chicken, stew, noodles, or another dish is visible",
        "- primary_dish_key = meat_dish when fried_cutlet, fried_chicken, grilled_meat, stir_fry, or stew is reasonably visible",
        "",
        "Rules:",
        "- primary_dish_key is required",
        "- use snake_case English keys",
        "- use short natural Japanese for *_ja fields",
        "- primary_dish_candidates: up to 3",
        "- supporting_items: up to 5",
        "- review_reasons: up to 5",
        "- free_tags: up to 5",
        "- if uncertain, prefer a broader DISH label over a scene label",
        "- set_meal should be rare and used only as fallback",
        "- unknown should be used only when even a broad dish label cannot be chosen",
        "- if primary_dish_key is set_meal or unknown, explain briefly in review_note_ja",
        "- use visual_attributes for machine-readable appearance or container hints such as metal_can, glass_bottle, plastic_bottle, pet_bottle, label_visible, tall_container, cup, glass, plate, bowl, package",
        "- use free_tags for review-helpful exploration tags in snake_case English such as can_drink, bottle_drink, beer_can, beer_bottle, sake_bottle",
        "- if the food is unclear but the image mainly shows a can or bottle, mention that briefly in review_note_ja such as 缶飲料中心, 瓶飲料らしい, or 容器主体で料理不明",
        "- do not mark needs_human_review=true by default",
        "- if you provide confidence scores, use 0..1 and keep them moderate or high when a broad but usable dish label is still supported by the image",
        "",
        "Recommended dish-oriented labels when exact dish is unclear:",
        "- grilled_fish",
        "- fried_fish",
        "- grilled_meat",
        "- fried_chicken",
        "- fried_cutlet",
        "- meat_and_potato_stew",
        "- stew",
        "- nimono",
        "- stir_fry",
        "- noodles",
        "- curry_rice",
        "- sushi",
        "- pasta",
        "- bento",
        "- dessert",
        "- drink",
        "- meat_dish",
        "- set_meal",
        "- unknown",
        "",
        "Use only the structured JSON object defined by the response schema.",
        "review_reasons must use only these values: " + ", ".join(REVIEW_REASON_OPTIONS) + ".",
        f"image_id must be '{image_id}'.",
        f"source_path must be '{source_path}'.",
        "Available enum options:",
        json.dumps(schema_summary, ensure_ascii=False),
    ]
    return "\n".join(instructions)


def build_broad_refinement_prompt(
    *,
    image_id: str,
    source_path: str,
    coarse_normalized: Dict[str, Any],
) -> str:
    broad_key = coarse_normalized["primary_dish_key"]
    if broad_key not in BROAD_REFINEMENT_RULES:
        raise ValueError(f"Unsupported broad refinement key: {broad_key}")

    rules = BROAD_REFINEMENT_RULES[broad_key]
    compare_keys = rules["compare_keys"]
    comparison_notes = rules["comparison_notes"]
    candidates_preview = [
        f'{candidate["key"]}|{candidate["label_ja"]}|{round(candidate["score"], 4)}'
        for candidate in coarse_normalized.get("primary_dish_candidates", [])
    ]

    instructions = [
        "Refine a previously broad main-dish label.",
        f"The coarse stage selected '{broad_key}'.",
        f"Choose only from these compare keys: {', '.join(compare_keys)}.",
        "Prefer the most specific safe category.",
        f"Use '{broad_key}' only as the fallback when the more specific compare keys are not safe.",
        "",
        "Comparison rubric:",
    ]
    instructions.extend(f"- {note}" for note in comparison_notes)
    instructions.extend(
        [
            "",
            "Coarse-stage hints:",
            f"- coarse_primary_dish_key: {coarse_normalized['primary_dish_key']}",
            f"- coarse_primary_dish_label_ja: {coarse_normalized['primary_dish_label_ja']}",
            f"- coarse_primary_dish_candidates: {json.dumps(candidates_preview, ensure_ascii=False)}",
            f"- coarse_scene_type: {coarse_normalized['scene_type']}",
            f"- coarse_review_reasons: {json.dumps(coarse_normalized['review_reasons'], ensure_ascii=False)}",
            "",
            "Rules:",
            f"- primary_dish_key must be one of: {', '.join(compare_keys)}",
            "- primary_dish_label_ja must be short natural Japanese",
            f"- primary_dish_candidates: up to {len(compare_keys)} and only use compare keys",
            "- review_note_ja should be empty when the refinement resolves cleanly",
            f"- if you keep '{broad_key}', explain briefly in review_note_ja why it is still not safe to choose a more specific key",
            "- use confidence scores in 0..1",
            "- do not output scene labels or unrelated categories",
            "",
            "Use only the structured JSON object defined by the response schema.",
            f"image_id is '{image_id}' only for reference.",
            f"source_path is '{source_path}' only for reference.",
        ]
    )
    if broad_key == "meat_dish":
        instructions.extend(
            [
                "",
                "meat_dish-specific rule:",
                "- if stir_fry or grilled_meat is reasonably supported, choose that more specific key instead of meat_dish",
                "- for cooked meat served over or beside rice, prefer stir_fry unless clear browned or charred meat surfaces support grilled_meat",
                "- keep meat_dish only when the dish is meat-centered but the image still does not safely support either stir_fry or grilled_meat",
            ]
        )
    if broad_key == "stew":
        instructions.extend(
            [
                "",
                "stew-specific rule:",
                "- if nimono is reasonably supported by visible shaped ingredients and Japanese simmered-dish cues, choose nimono instead of stew",
                "- do not keep stew merely because the sauce is thick/dark or the ingredients are varied when Japanese nimono cues are visible",
                "- keep stew only for generic stew-like dishes or sauce/soup-heavy Western stew cues that do not safely fit nimono, curry_rice, or meat_and_potato_stew",
            ]
        )
    return "\n".join(instructions)


def get_json(*, path: str, timeout: float) -> Dict[str, Any]:
    return request_json(method="GET", path=path, payload=None, timeout=timeout)


def post_json(*, path: str, payload: Dict[str, Any], timeout: float) -> Dict[str, Any]:
    return request_json(method="POST", path=path, payload=payload, timeout=timeout)


def request_json(
    *,
    method: str,
    path: str,
    payload: Optional[Dict[str, Any]],
    timeout: float,
) -> Dict[str, Any]:
    body = None
    headers = {}
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        OLLAMA_API_BASE_URL + path,
        data=body,
        headers=headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as error:
        error_body = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"HTTP {error.code} {error.reason}: {error_body}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Could not reach Ollama local API at {OLLAMA_API_BASE_URL}: {error}") from error

    try:
        loaded = json.loads(raw_body)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Ollama API returned non-JSON body: {error}") from error

    if not isinstance(loaded, dict):
        raise RuntimeError("Ollama API returned a non-object JSON response.")

    return loaded


@contextlib.contextmanager
def prepared_image_path(image_path: Path) -> Iterator[Path]:
    if image_path.suffix.lower() != ".heic":
        yield image_path
        return

    with tempfile.TemporaryDirectory(prefix="food-label-heic-") as temp_dir:
        converted_path = Path(temp_dir) / f"{image_path.stem}.jpg"
        result = subprocess.run(
            [
                "/usr/bin/sips",
                "-s",
                "format",
                "jpeg",
                str(image_path),
                "--out",
                str(converted_path),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0 or not converted_path.exists():
            error_output = result.stderr.strip() or result.stdout.strip() or "unknown sips error"
            raise RuntimeError(f"sips failed to convert HEIC to JPEG: {error_output}")

        yield converted_path


def parse_model_json_object(raw_text: Any) -> Dict[str, Any]:
    if not isinstance(raw_text, str) or not raw_text.strip():
        raise ValueError("Model response content was empty.")

    cleaned = strip_code_fences(raw_text).strip()

    try:
        loaded = json.loads(cleaned)
        if isinstance(loaded, dict):
            return loaded
    except json.JSONDecodeError:
        pass

    extracted = extract_first_balanced_json_object(cleaned)
    try:
        loaded = json.loads(extracted)
    except json.JSONDecodeError as error:
        raise ValueError(f"Recovered JSON object could not be decoded: {error}") from error

    if not isinstance(loaded, dict):
        raise ValueError("Recovered JSON was not an object.")

    return loaded


def strip_code_fences(value: str) -> str:
    stripped = value.strip()
    if not stripped.startswith("```"):
        return stripped

    stripped = re.sub(r"^```(?:json)?\s*", "", stripped, count=1, flags=re.IGNORECASE)
    stripped = re.sub(r"\s*```$", "", stripped, count=1)
    return stripped.strip()


def extract_first_balanced_json_object(value: str) -> str:
    start_index = value.find("{")
    if start_index < 0:
        raise ValueError("No JSON object start token was found in the response.")

    depth = 0
    in_string = False
    escape = False
    for index in range(start_index, len(value)):
        character = value[index]
        if in_string:
            if escape:
                escape = False
                continue
            if character == "\\":
                escape = True
                continue
            if character == '"':
                in_string = False
            continue

        if character == '"':
            in_string = True
            continue

        if character == "{":
            depth += 1
            continue

        if character == "}":
            depth -= 1
            if depth == 0:
                return value[start_index:index + 1]

    first = value.find("{")
    last = value.rfind("}")
    if first >= 0 and last > first:
        return value[first:last + 1]

    raise ValueError("Could not recover a balanced JSON object from the response.")


def normalize_result(raw_result: Dict[str, Any], *, image_id: str, source_path: str) -> Dict[str, Any]:
    if not isinstance(raw_result, dict):
        raise ValueError("raw_result must be a dict.")

    contains_multiple_dishes = coerce_bool(raw_result.get("contains_multiple_dishes"), default=False)
    is_drink_only = coerce_bool(raw_result.get("is_drink_only"), default=False)
    is_sweets_or_dessert = coerce_bool(raw_result.get("is_sweets_or_dessert"), default=False)
    is_packaged_food = coerce_bool(raw_result.get("is_packaged_food"), default=False)
    is_menu_or_text_only = coerce_bool(raw_result.get("is_menu_or_text_only"), default=False)
    is_takeout_or_delivery = coerce_bool(raw_result.get("is_takeout_or_delivery"), default=False)

    primary_candidates = normalize_primary_dish_candidates(
        raw_result.get("primary_dish_candidates")
        or raw_result.get("possible_dish_keys")
        or raw_result.get("main_subjects")
    )
    supporting_items = normalize_supporting_items(
        raw_result.get("supporting_items") or raw_result.get("secondary_item_keys")
    )
    primary_candidates, supporting_items = move_support_items_out_of_candidates(
        primary_candidates,
        supporting_items,
    )

    primary_dish_key = normalize_machine_key(raw_result.get("primary_dish_key"), fallback="")
    primary_dish_label_ja = clean_short_text(raw_result.get("primary_dish_label_ja"))

    if not primary_dish_key and primary_candidates:
        primary_dish_key = primary_candidates[0]["key"]
        primary_dish_label_ja = primary_dish_label_ja or primary_candidates[0]["label_ja"]

    scene_type = infer_scene_type(
        raw_result=raw_result,
        contains_multiple_dishes=contains_multiple_dishes,
        is_drink_only=is_drink_only,
        is_packaged_food=is_packaged_food,
        primary_candidates=primary_candidates,
    )
    is_food_related = infer_is_food_related(raw_result=raw_result, scene_type=scene_type)
    cuisine_type = infer_cuisine_type(
        raw_result=raw_result,
        is_drink_only=is_drink_only,
        is_sweets_or_dessert=is_sweets_or_dessert,
        scene_type=scene_type,
    )
    meal_style = infer_meal_style(raw_result=raw_result, scene_type=scene_type, is_sweets_or_dessert=is_sweets_or_dessert)
    serving_style = infer_serving_style(raw_result=raw_result, scene_type=scene_type)

    if not primary_dish_key:
        primary_dish_key = infer_primary_dish_from_context(
            scene_type=scene_type,
            is_food_related=is_food_related,
            is_drink_only=is_drink_only,
            is_sweets_or_dessert=is_sweets_or_dessert,
            meal_style=meal_style,
        )

    if not primary_dish_label_ja:
        primary_dish_label_ja = resolve_primary_label(
            primary_dish_key=primary_dish_key,
            primary_candidates=primary_candidates,
        )

    visual_attributes = normalize_machine_string_list(raw_result.get("visual_attributes"))
    uncertainty_reasons = normalize_machine_string_list(raw_result.get("uncertainty_reasons"))
    free_tags = normalize_machine_string_list(raw_result.get("free_tags"))
    review_reasons = normalize_review_reasons(raw_result.get("review_reasons"))

    # Keep dish discovery primary by demoting obvious accompaniments out of the main slot.
    if primary_dish_key in SUPPORTING_ITEM_KEYS:
        supporting_items = append_unique_limited(supporting_items, primary_dish_key, limit=MAX_SUPPORTING_ITEMS)
        promoted_candidate = find_primary_replacement_candidate(
            primary_candidates,
            scene_type=scene_type,
            meal_style=meal_style,
            is_drink_only=is_drink_only,
            allow_contextual=True,
        )
        review_reasons = append_reason(review_reasons, "side_item_primary")
        if promoted_candidate is not None:
            primary_dish_key = promoted_candidate["key"]
            primary_dish_label_ja = promoted_candidate["label_ja"]
        else:
            primary_dish_key = "unknown"
            primary_dish_label_ja = resolve_default_label("unknown")

    if primary_dish_key in SCENE_FALLBACK_PRIMARY_KEYS:
        promoted_candidate = find_primary_replacement_candidate(
            primary_candidates,
            scene_type=scene_type,
            meal_style=meal_style,
            is_drink_only=is_drink_only,
            allow_contextual=True,
        )
        if promoted_candidate is not None:
            primary_dish_key = promoted_candidate["key"]
            primary_dish_label_ja = promoted_candidate["label_ja"]

    if primary_dish_key in CONTEXTUAL_SUPPORTING_ITEM_KEYS and should_demote_contextual_primary(
        primary_dish_key=primary_dish_key,
        primary_candidates=primary_candidates,
        scene_type=scene_type,
        meal_style=meal_style,
        is_drink_only=is_drink_only,
    ):
        supporting_items = append_unique_limited(supporting_items, primary_dish_key, limit=MAX_SUPPORTING_ITEMS)
        promoted_candidate = find_primary_replacement_candidate(
            primary_candidates,
            scene_type=scene_type,
            meal_style=meal_style,
            is_drink_only=is_drink_only,
            allow_contextual=False,
        )
        review_reasons = append_reason(review_reasons, "side_item_primary")
        if promoted_candidate is not None:
            primary_dish_key = promoted_candidate["key"]
            primary_dish_label_ja = promoted_candidate["label_ja"]

    analysis_confidence, confidence_source = resolve_analysis_confidence(
        raw_result=raw_result,
        primary_candidates=primary_candidates,
        primary_dish_key=primary_dish_key,
        scene_type=scene_type,
        is_menu_or_text_only=is_menu_or_text_only,
        uncertainty_reasons=uncertainty_reasons,
    )

    if primary_dish_key == "unknown":
        review_reasons = append_reason(review_reasons, "unknown_primary")

    if should_add_low_confidence(
        analysis_confidence=analysis_confidence,
        confidence_source=confidence_source,
        primary_dish_key=primary_dish_key,
        scene_type=scene_type,
        is_menu_or_text_only=is_menu_or_text_only,
        uncertainty_reasons=uncertainty_reasons,
    ):
        review_reasons = append_reason(review_reasons, "low_confidence")
    else:
        review_reasons = remove_reason(review_reasons, "low_confidence")

    if has_candidate_split(primary_candidates):
        review_reasons = append_reason(review_reasons, "candidate_split")

    if is_menu_or_text_only or scene_type == "menu_or_text":
        review_reasons = append_reason(review_reasons, "menu_or_text")

    if has_image_quality_issue(uncertainty_reasons):
        review_reasons = append_reason(review_reasons, "image_quality_issue")

    if should_keep_scene_dominant_review_reason(
        primary_dish_key=primary_dish_key,
        primary_candidates=primary_candidates,
        scene_type=scene_type,
        meal_style=meal_style,
        is_drink_only=is_drink_only,
        review_reasons=review_reasons,
    ):
        review_reasons = append_reason(review_reasons, "scene_dominant")
    else:
        review_reasons = remove_reason(review_reasons, "scene_dominant")

    review_reasons = reconcile_broad_primary_review_reason(
        review_reasons=review_reasons,
        primary_dish_key=primary_dish_key,
    )

    review_reasons = review_reasons[:MAX_REVIEW_REASONS]
    needs_human_review = any(reason in REVIEW_TRIGGER_REASONS for reason in review_reasons)

    broad_refinement_note_ja = clean_short_text(raw_result.get("broad_refinement_note_ja"))
    review_note_ja = clean_short_text(raw_result.get("review_note_ja"))
    if primary_dish_key in BROAD_PRIMARY_KEYS and broad_refinement_note_ja:
        review_note_ja = broad_refinement_note_ja
    elif not review_note_ja and primary_dish_key in PRIMARY_FALLBACK_REVIEW_NOTE_JA:
        review_note_ja = PRIMARY_FALLBACK_REVIEW_NOTE_JA[primary_dish_key]
    elif not review_note_ja and review_reasons:
        review_note_ja = DEFAULT_REVIEW_NOTE_JA.get(review_reasons[0], "")
    if primary_dish_key in BROAD_PRIMARY_KEYS and not review_note_ja:
        review_note_ja = DEFAULT_REVIEW_NOTE_JA["broad_primary"]

    container_hint = infer_container_hint(
        visual_attributes=visual_attributes,
        free_tags=free_tags,
        review_note_ja=review_note_ja,
    )
    contains_can_or_bottle = container_hint in {"can", "bottle"}
    review_bucket = infer_review_bucket(
        needs_human_review=needs_human_review,
        container_hint=container_hint,
    )

    primary_candidates = prioritize_primary_candidate(primary_candidates, primary_dish_key)

    normalized = {
        "schema_version": SCHEMA_VERSION,
        "image_id": image_id,
        "source_path": source_path,
        "is_food_related": is_food_related,
        "analysis_confidence": round(analysis_confidence, 4),
        "primary_dish_key": primary_dish_key or "unknown",
        "primary_dish_label_ja": primary_dish_label_ja or resolve_default_label(primary_dish_key or "unknown"),
        "primary_dish_candidates": serialize_primary_dish_candidates(primary_candidates[:MAX_PRIMARY_DISH_CANDIDATES]),
        "supporting_items": supporting_items[:MAX_SUPPORTING_ITEMS],
        "scene_type": scene_type,
        "cuisine_type": cuisine_type,
        "meal_style": meal_style,
        "serving_style": serving_style,
        "contains_multiple_dishes": contains_multiple_dishes,
        "is_drink_only": is_drink_only,
        "is_sweets_or_dessert": is_sweets_or_dessert,
        "is_packaged_food": is_packaged_food,
        "is_menu_or_text_only": is_menu_or_text_only,
        "is_takeout_or_delivery": is_takeout_or_delivery,
        "visual_attributes": visual_attributes,
        "uncertainty_reasons": uncertainty_reasons,
        "review_reasons": review_reasons,
        "free_tags": free_tags,
        "review_note_ja": review_note_ja,
        "needs_human_review": needs_human_review,
        "container_hint": container_hint,
        "contains_can_or_bottle": contains_can_or_bottle,
        "review_bucket": review_bucket,
    }
    return normalized


def merge_broad_refinement_into_raw_result(
    *,
    coarse_raw_result: Dict[str, Any],
    fine_raw_result: Dict[str, Any],
    coarse_primary_dish_key: str,
) -> Dict[str, Any]:
    if coarse_primary_dish_key not in BROAD_REFINEMENT_RULES:
        raise ValueError(f"Unsupported broad refinement key: {coarse_primary_dish_key}")

    compare_keys = set(BROAD_REFINEMENT_RULES[coarse_primary_dish_key]["compare_keys"])
    fine_primary_dish_key = normalize_machine_key(fine_raw_result.get("primary_dish_key"), fallback="")
    if fine_primary_dish_key not in compare_keys:
        raise ValueError(
            f"Broad refinement returned unsupported key '{fine_primary_dish_key}' for coarse '{coarse_primary_dish_key}'."
        )

    fine_candidates = [
        candidate
        for candidate in normalize_primary_dish_candidates(fine_raw_result.get("primary_dish_candidates"))
        if candidate["key"] in compare_keys
    ]
    if fine_primary_dish_key and not any(candidate["key"] == fine_primary_dish_key for candidate in fine_candidates):
        fine_candidates.insert(
            0,
            {
                "key": fine_primary_dish_key,
                "label_ja": clean_short_text(fine_raw_result.get("primary_dish_label_ja")) or resolve_default_label(fine_primary_dish_key),
                "score": round(clamp_score(fine_raw_result.get("analysis_confidence")) or 0.0, 4),
                "_score_present": clamp_score(fine_raw_result.get("analysis_confidence")) is not None,
            },
        )

    merged_raw_result = dict(coarse_raw_result)
    merged_raw_result["primary_dish_key"] = fine_primary_dish_key
    merged_raw_result["primary_dish_label_ja"] = (
        clean_short_text(fine_raw_result.get("primary_dish_label_ja")) or resolve_default_label(fine_primary_dish_key)
    )
    merged_raw_result["primary_dish_candidates"] = serialize_primary_dish_candidates(
        prioritize_primary_candidate(fine_candidates, fine_primary_dish_key)[:MAX_PRIMARY_DISH_CANDIDATES]
    )
    if clamp_score(fine_raw_result.get("analysis_confidence")) is not None:
        merged_raw_result["analysis_confidence"] = round(clamp_score(fine_raw_result.get("analysis_confidence")) or 0.0, 4)
    fine_note_ja = clean_short_text(fine_raw_result.get("review_note_ja"))
    merged_raw_result["review_note_ja"] = fine_note_ja
    merged_raw_result["broad_refinement_note_ja"] = fine_note_ja
    merged_raw_result["review_reasons"] = []
    merged_raw_result["needs_human_review"] = False
    return merged_raw_result


def apply_broad_refinement_metadata(
    final_normalized: Dict[str, Any],
    *,
    coarse_normalized: Dict[str, Any],
    status: str,
    compare_keys: Sequence[str],
    image_mode: str,
    note_ja: str,
) -> Dict[str, Any]:
    normalized = dict(final_normalized)
    cleaned_note_ja = clean_short_text(note_ja)
    normalized["coarse_primary_dish_key"] = coarse_normalized["primary_dish_key"]
    normalized["coarse_primary_dish_label_ja"] = coarse_normalized["primary_dish_label_ja"]
    normalized["broad_refinement_status"] = status
    normalized["broad_refinement_compare_keys"] = list(compare_keys)
    normalized["broad_refinement_note_ja"] = cleaned_note_ja
    normalized["broad_refinement_image_mode"] = image_mode
    if normalized["primary_dish_key"] in BROAD_PRIMARY_KEYS:
        if cleaned_note_ja:
            normalized["review_note_ja"] = cleaned_note_ja
        elif not normalized["review_note_ja"]:
            normalized["review_note_ja"] = DEFAULT_REVIEW_NOTE_JA["broad_primary"]
    return normalized


def apply_conservative_meat_dish_candidate_rescue(
    *,
    merged_raw_result: Dict[str, Any],
    coarse_primary_dish_key: str,
) -> Dict[str, Any]:
    if coarse_primary_dish_key != "meat_dish":
        return dict(merged_raw_result)

    final_primary_dish_key = normalize_machine_key(merged_raw_result.get("primary_dish_key"), fallback="")
    if final_primary_dish_key != "meat_dish":
        return dict(merged_raw_result)

    candidates = normalize_primary_dish_candidates(merged_raw_result.get("primary_dish_candidates"))
    rescue_candidate = find_more_specific_broad_candidate(
        primary_dish_key="meat_dish",
        candidates=candidates,
    )
    if rescue_candidate is None or rescue_candidate["key"] not in MEAT_DISH_RESCUE_KEYS:
        return dict(merged_raw_result)

    broad_candidate = next((candidate for candidate in candidates if candidate["key"] == "meat_dish"), None)
    if broad_candidate is None or not broad_candidate.get("_score_present") or not rescue_candidate.get("_score_present"):
        return dict(merged_raw_result)

    broad_score = clamp_score(broad_candidate.get("score"))
    rescue_score = clamp_score(rescue_candidate.get("score"))
    if broad_score is None or rescue_score is None:
        return dict(merged_raw_result)
    if rescue_score < MEAT_DISH_RESCUE_MIN_SCORE:
        return dict(merged_raw_result)
    if broad_score - rescue_score > MEAT_DISH_RESCUE_MAX_SCORE_GAP:
        return dict(merged_raw_result)

    rescued_raw_result = dict(merged_raw_result)
    rescued_raw_result["primary_dish_key"] = rescue_candidate["key"]
    rescued_raw_result["primary_dish_label_ja"] = rescue_candidate["label_ja"] or resolve_default_label(rescue_candidate["key"])
    rescued_raw_result["primary_dish_candidates"] = serialize_primary_dish_candidates(
        prioritize_primary_candidate(candidates, rescue_candidate["key"])[:MAX_PRIMARY_DISH_CANDIDATES]
    )
    rescued_raw_result["review_note_ja"] = ""
    rescued_raw_result["broad_refinement_note_ja"] = ""
    return rescued_raw_result


def normalize_primary_dish_candidates(value: Any) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    seen = set()
    for item in ensure_list(value):
        candidate = normalize_primary_dish_candidate(item)
        if candidate is None:
            continue
        dedupe_key = candidate["key"]
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        normalized.append(candidate)
    return normalized


def normalize_primary_dish_candidate(value: Any) -> Optional[Dict[str, Any]]:
    if isinstance(value, str):
        key = normalize_machine_key(value, fallback="")
        if not key:
            return None
        return {
            "key": key,
            "label_ja": resolve_default_label(key),
            "score": 0.0,
            "_score_present": False,
        }

    if not isinstance(value, dict):
        return None

    key_source = value.get("key") or value.get("label_ja") or value.get("label")
    key = normalize_machine_key(key_source, fallback="")
    if not key:
        return None

    label_ja = clean_short_text(value.get("label_ja") or value.get("label")) or resolve_default_label(key)
    score = clamp_score(value.get("score"))

    return {
        "key": key,
        "label_ja": label_ja,
        "score": round(score, 4) if score is not None else 0.0,
        "_score_present": score is not None,
    }


def serialize_primary_dish_candidates(candidates: Sequence[Dict[str, Any]]) -> List[Dict[str, Any]]:
    serialized: List[Dict[str, Any]] = []
    for candidate in candidates:
        serialized.append(
            {
                "key": candidate["key"],
                "label_ja": candidate["label_ja"],
                "score": round(clamp_score(candidate.get("score")) or 0.0, 4),
            }
        )
    return serialized


def normalize_supporting_items(value: Any) -> List[str]:
    normalized: List[str] = []
    seen = set()
    for item in ensure_list(value):
        if isinstance(item, dict):
            normalized_value = normalize_machine_key(item.get("key") or item.get("label") or item.get("label_ja"), fallback="")
        else:
            normalized_value = normalize_machine_key(item, fallback="")
        if not normalized_value or normalized_value in seen:
            continue
        seen.add(normalized_value)
        normalized.append(normalized_value)
        if len(normalized) >= MAX_SUPPORTING_ITEMS:
            break
    return normalized


def move_support_items_out_of_candidates(
    candidates: Sequence[Dict[str, Any]],
    supporting_items: Sequence[str],
) -> Tuple[List[Dict[str, Any]], List[str]]:
    normalized_candidates: List[Dict[str, Any]] = []
    normalized_supporting_items = list(supporting_items)
    for candidate in candidates:
        if candidate["key"] in SUPPORTING_ITEM_KEYS:
            normalized_supporting_items = append_unique_limited(
                normalized_supporting_items,
                candidate["key"],
                limit=MAX_SUPPORTING_ITEMS,
            )
            continue
        normalized_candidates.append(candidate)
    return normalized_candidates, normalized_supporting_items[:MAX_SUPPORTING_ITEMS]


def infer_scene_type(
    *,
    raw_result: Dict[str, Any],
    contains_multiple_dishes: bool,
    is_drink_only: bool,
    is_packaged_food: bool,
    primary_candidates: Sequence[Dict[str, Any]],
) -> str:
    scene_type = normalize_enum(raw_result.get("scene_type"), SCENE_TYPE_OPTIONS)
    if scene_type is not None:
        return scene_type

    if coerce_bool(raw_result.get("is_menu_or_text_only"), default=False):
        return "menu_or_text"
    if is_packaged_food:
        return "packaged_food"
    if is_drink_only:
        return "drink_only"
    if normalize_enum(raw_result.get("meal_style"), MEAL_STYLE_OPTIONS) == "bento":
        return "bento"
    if normalize_enum(raw_result.get("meal_style"), MEAL_STYLE_OPTIONS) == "set_meal":
        return "set_meal"
    if contains_multiple_dishes:
        return "multi_dish_table"
    if primary_candidates:
        return "single_dish"
    return "unknown"


def infer_is_food_related(*, raw_result: Dict[str, Any], scene_type: str) -> bool:
    is_food_related = coerce_bool(raw_result.get("is_food_related"), default=None)
    if is_food_related is not None:
        return is_food_related
    return scene_type != "non_food"


def infer_cuisine_type(
    *,
    raw_result: Dict[str, Any],
    is_drink_only: bool,
    is_sweets_or_dessert: bool,
    scene_type: str,
) -> str:
    cuisine_type = normalize_enum(raw_result.get("cuisine_type"), CUISINE_TYPE_OPTIONS)
    if cuisine_type is not None:
        return cuisine_type

    if is_drink_only:
        return "drink"
    if is_sweets_or_dessert:
        return "dessert"
    if scene_type == "packaged_food":
        return "mixed"
    return "unknown"


def infer_meal_style(*, raw_result: Dict[str, Any], scene_type: str, is_sweets_or_dessert: bool) -> str:
    meal_style = normalize_enum(raw_result.get("meal_style"), MEAL_STYLE_OPTIONS)
    if meal_style is not None:
        return meal_style

    if scene_type == "bento":
        return "bento"
    if scene_type == "set_meal":
        return "set_meal"
    if scene_type == "multi_dish_table":
        return "shared_table"
    if scene_type == "drink_only":
        return "drink"
    if scene_type == "dessert_and_drink" or is_sweets_or_dessert:
        return "dessert"
    if scene_type == "packaged_food":
        return "packaged"
    if scene_type == "single_dish":
        return "single_item"
    return "unknown"


def infer_serving_style(*, raw_result: Dict[str, Any], scene_type: str) -> str:
    serving_style = normalize_enum(raw_result.get("serving_style"), SERVING_STYLE_OPTIONS)
    if serving_style is not None:
        return serving_style

    if scene_type == "set_meal":
        return "tray"
    if scene_type == "multi_dish_table":
        return "table_with_multiple_items"
    if scene_type == "drink_only":
        return "cup_or_glass"
    if scene_type == "bento":
        return "boxed_meal"
    if scene_type == "packaged_food":
        return "package"
    if scene_type == "menu_or_text":
        return "menu_page"
    return "unknown"


def infer_primary_dish_from_context(
    *,
    scene_type: str,
    is_food_related: bool,
    is_drink_only: bool,
    is_sweets_or_dessert: bool,
    meal_style: str,
) -> str:
    if not is_food_related:
        return "unknown"
    if is_drink_only:
        return "drink"
    if is_sweets_or_dessert:
        return "dessert"
    if scene_type == "bento" or meal_style == "bento":
        return "bento"
    if scene_type == "set_meal" or meal_style == "set_meal":
        return "set_meal"
    return "unknown"


def resolve_primary_label(
    *,
    primary_dish_key: str,
    primary_candidates: Sequence[Dict[str, Any]],
) -> str:
    for candidate in primary_candidates:
        if candidate["key"] == primary_dish_key:
            return candidate["label_ja"]
    return resolve_default_label(primary_dish_key)


def resolve_default_label(key: str) -> str:
    if key in DEFAULT_LABEL_JA:
        return DEFAULT_LABEL_JA[key]
    return key or DEFAULT_LABEL_JA["unknown"]


def resolve_analysis_confidence(
    *,
    raw_result: Dict[str, Any],
    primary_candidates: Sequence[Dict[str, Any]],
    primary_dish_key: str,
    scene_type: str,
    is_menu_or_text_only: bool,
    uncertainty_reasons: Sequence[str],
) -> Tuple[float, str]:
    candidate_scores = [
        candidate["score"]
        for candidate in primary_candidates
        if candidate.get("_score_present") and isinstance(candidate.get("score"), (int, float))
        and candidate["score"] > 0
    ]
    if candidate_scores:
        return round(max(candidate_scores), 4), "candidate_scores"

    top_level = clamp_score(raw_result.get("analysis_confidence"))
    if top_level is not None:
        return round(top_level, 4), "top_level"
    return (
        round(
            estimate_analysis_confidence(
                primary_dish_key=primary_dish_key,
                scene_type=scene_type,
                is_menu_or_text_only=is_menu_or_text_only,
                uncertainty_reasons=uncertainty_reasons,
            ),
            4,
        ),
        "heuristic",
    )


def estimate_analysis_confidence(
    *,
    primary_dish_key: str,
    scene_type: str,
    is_menu_or_text_only: bool,
    uncertainty_reasons: Sequence[str],
) -> float:
    if is_menu_or_text_only or scene_type == "menu_or_text":
        return WEAK_DISH_CONFIDENCE_FALLBACK
    if primary_dish_key in {"unknown", "set_meal"}:
        return WEAK_DISH_CONFIDENCE_FALLBACK
    if has_image_quality_issue(uncertainty_reasons):
        return WEAK_DISH_CONFIDENCE_FALLBACK
    if primary_dish_key in BROAD_PRIMARY_KEYS:
        return BROAD_DISH_CONFIDENCE_FALLBACK
    if primary_dish_key in SCENE_DOMINANT_PRIMARY_KEYS:
        return WEAK_DISH_CONFIDENCE_FALLBACK
    return SPECIFIC_DISH_CONFIDENCE_FALLBACK


def should_add_low_confidence(
    *,
    analysis_confidence: float,
    confidence_source: str,
    primary_dish_key: str,
    scene_type: str,
    is_menu_or_text_only: bool,
    uncertainty_reasons: Sequence[str],
) -> bool:
    if confidence_source in {"candidate_scores", "top_level"}:
        return analysis_confidence < LOW_CONFIDENCE_REVIEW_THRESHOLD
    if is_menu_or_text_only or scene_type == "menu_or_text":
        return True
    if primary_dish_key in {"unknown", "set_meal"}:
        return True
    if has_image_quality_issue(uncertainty_reasons):
        return True
    return analysis_confidence < LOW_CONFIDENCE_REVIEW_THRESHOLD


def normalize_review_reasons(value: Any) -> List[str]:
    normalized: List[str] = []
    seen = set()
    for item in ensure_list(value):
        reason = normalize_machine_key(item, fallback="")
        if reason not in REVIEW_REASON_OPTIONS or reason in seen:
            continue
        seen.add(reason)
        normalized.append(reason)
        if len(normalized) >= MAX_REVIEW_REASONS:
            break
    return normalized


def infer_container_hint(
    *,
    visual_attributes: Sequence[str],
    free_tags: Sequence[str],
    review_note_ja: str,
) -> str:
    hint_tokens = set(visual_attributes) | set(free_tags)
    if hint_tokens & CONTAINER_HINT_BOTTLE_TOKENS:
        return "bottle"
    if any(keyword in review_note_ja for keyword in CONTAINER_HINT_BOTTLE_NOTE_KEYWORDS):
        return "bottle"
    if hint_tokens & CONTAINER_HINT_CAN_TOKENS:
        return "can"
    if any(keyword in review_note_ja for keyword in CONTAINER_HINT_CAN_NOTE_KEYWORDS):
        return "can"
    return "none"


def infer_review_bucket(*, needs_human_review: bool, container_hint: str) -> str:
    if not needs_human_review:
        return "normal"
    if container_hint == "bottle":
        return "unknown_likely_bottle"
    if container_hint == "can":
        return "unknown_likely_can"
    return "unknown_other"


def has_single_item_primary_context(*, scene_type: str, meal_style: str, is_drink_only: bool) -> bool:
    if is_drink_only:
        return True
    if scene_type in {"single_dish", "drink_only", "dessert_and_drink"}:
        return True
    if meal_style in {"single_item", "drink", "dessert"}:
        return True
    return False


def find_primary_replacement_candidate(
    candidates: Sequence[Dict[str, Any]],
    *,
    scene_type: str,
    meal_style: str,
    is_drink_only: bool,
    allow_contextual: bool,
) -> Optional[Dict[str, Any]]:
    for candidate in candidates:
        key = candidate["key"]
        if key in SUPPORTING_ITEM_KEYS or key in SCENE_DOMINANT_PRIMARY_KEYS or key == "unknown":
            continue
        if key in CONTEXTUAL_SUPPORTING_ITEM_KEYS:
            continue
        return candidate

    if allow_contextual and has_single_item_primary_context(
        scene_type=scene_type,
        meal_style=meal_style,
        is_drink_only=is_drink_only,
    ):
        for candidate in candidates:
            if candidate["key"] in CONTEXTUAL_SUPPORTING_ITEM_KEYS:
                return candidate

    return None


def should_demote_contextual_primary(
    *,
    primary_dish_key: str,
    primary_candidates: Sequence[Dict[str, Any]],
    scene_type: str,
    meal_style: str,
    is_drink_only: bool,
) -> bool:
    if primary_dish_key not in CONTEXTUAL_SUPPORTING_ITEM_KEYS:
        return False
    if has_single_item_primary_context(
        scene_type=scene_type,
        meal_style=meal_style,
        is_drink_only=is_drink_only,
    ):
        return False
    return (
        find_primary_replacement_candidate(
            primary_candidates,
            scene_type=scene_type,
            meal_style=meal_style,
            is_drink_only=is_drink_only,
            allow_contextual=False,
        )
        is not None
    )


def prioritize_primary_candidate(
    candidates: Sequence[Dict[str, Any]],
    primary_dish_key: str,
) -> List[Dict[str, Any]]:
    prioritized: List[Dict[str, Any]] = []
    seen = set()
    for candidate in candidates:
        if candidate["key"] == primary_dish_key and candidate["key"] not in seen:
            prioritized.append(candidate)
            seen.add(candidate["key"])
    for candidate in candidates:
        if candidate["key"] in seen:
            continue
        prioritized.append(candidate)
        seen.add(candidate["key"])
    return prioritized


def has_candidate_split(candidates: Sequence[Dict[str, Any]]) -> bool:
    if len(candidates) < 2:
        return False

    if not candidates[0].get("_score_present") or not candidates[1].get("_score_present"):
        return False

    first = clamp_score(candidates[0].get("score"))
    second = clamp_score(candidates[1].get("score"))
    if first is None or second is None:
        return False

    return first < 0.75 and second >= 0.35 and abs(first - second) <= 0.08


def should_keep_scene_dominant_review_reason(
    *,
    primary_dish_key: str,
    primary_candidates: Sequence[Dict[str, Any]],
    scene_type: str,
    meal_style: str,
    is_drink_only: bool,
    review_reasons: Sequence[str],
) -> bool:
    if primary_dish_key not in SCENE_DOMINANT_PRIMARY_KEYS:
        return False
    if any(reason in SCENE_DOMINANT_FALLBACK_REASONS for reason in review_reasons):
        return False
    return (
        find_primary_replacement_candidate(
            primary_candidates,
            scene_type=scene_type,
            meal_style=meal_style,
            is_drink_only=is_drink_only,
            allow_contextual=True,
        )
        is None
    )


def reconcile_broad_primary_review_reason(
    *,
    review_reasons: Sequence[str],
    primary_dish_key: str,
) -> List[str]:
    normalized = [reason for reason in review_reasons if reason != "broad_primary"]
    if primary_dish_key not in BROAD_PRIMARY_KEYS:
        return normalized[:MAX_REVIEW_REASONS]
    if len(normalized) >= MAX_REVIEW_REASONS:
        normalized = normalized[:MAX_REVIEW_REASONS - 1]
    normalized.append("broad_primary")
    return normalized


def find_more_specific_broad_candidate(
    *,
    primary_dish_key: str,
    candidates: Sequence[Dict[str, Any]],
) -> Optional[Dict[str, Any]]:
    if primary_dish_key not in BROAD_PRIMARY_KEYS:
        return None

    for candidate in candidates:
        key = candidate["key"]
        if key == primary_dish_key:
            continue
        if key in SUPPORTING_ITEM_KEYS or key in CONTEXTUAL_SUPPORTING_ITEM_KEYS:
            continue
        if key in SCENE_DOMINANT_PRIMARY_KEYS or key == "unknown":
            continue
        if key in BROAD_PRIMARY_KEYS:
            continue
        return candidate

    return None


def has_image_quality_issue(uncertainty_reasons: Sequence[str]) -> bool:
    return any(reason in IMAGE_QUALITY_REASON_HINTS for reason in uncertainty_reasons)


def append_reason(reasons: Sequence[str], reason: str) -> List[str]:
    if reason not in REVIEW_REASON_OPTIONS:
        return list(reasons)
    return append_unique_limited(list(reasons), reason, limit=MAX_REVIEW_REASONS)


def remove_reason(reasons: Sequence[str], reason: str) -> List[str]:
    return [item for item in reasons if item != reason]


def append_unique_limited(values: Sequence[str], item: str, *, limit: int) -> List[str]:
    normalized = list(values)
    if item and item not in normalized:
        normalized.append(item)
    return normalized[:limit]


def ensure_list(value: Any) -> List[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, tuple):
        return list(value)
    return [value]


def normalize_machine_string_list(value: Any) -> List[str]:
    normalized: List[str] = []
    seen = set()
    for item in ensure_list(value):
        normalized_value = normalize_machine_key(item, fallback="")
        if not normalized_value or normalized_value in seen:
            continue
        seen.add(normalized_value)
        normalized.append(normalized_value)
    return normalized


def normalize_machine_key(value: Any, *, fallback: str) -> str:
    if isinstance(value, (int, float)):
        value = str(value)

    if not isinstance(value, str):
        return fallback

    normalized = unicodedata.normalize("NFKD", value)
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii").lower()
    ascii_value = re.sub(r"[^a-z0-9]+", "_", ascii_value)
    ascii_value = ascii_value.strip("_")
    return ascii_value or fallback


def normalize_enum(value: Any, allowed: Sequence[str]) -> Optional[str]:
    if not isinstance(value, str):
        return None
    candidate = value.strip().lower()
    if candidate in allowed:
        return candidate
    return None


def clean_short_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return re.sub(r"\s+", " ", value).strip()


def coerce_bool(value: Any, *, default: Optional[bool]) -> Optional[bool]:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and value in (0, 1):
        return bool(value)
    if isinstance(value, str):
        candidate = value.strip().lower()
        if candidate in {"true", "1", "yes", "y"}:
            return True
        if candidate in {"false", "0", "no", "n"}:
            return False
    return default


def clamp_score(value: Any) -> Optional[float]:
    if isinstance(value, bool):
        return None

    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if number < 0:
        number = 0.0
    if number > 1:
        number = 1.0
    return float(number)


def write_json_file(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    serialized = json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True)
    temp_path: Optional[Path] = None
    try:
        with tempfile.NamedTemporaryFile(
            "w",
            encoding="utf-8",
            dir=path.parent,
            prefix=f".{path.name}.",
            suffix=".tmp",
            delete=False,
        ) as handle:
            handle.write(serialized)
            handle.write("\n")
            temp_path = Path(handle.name)

        temp_path.replace(path)
    finally:
        if temp_path is not None and temp_path.exists():
            with contextlib.suppress(FileNotFoundError):
                temp_path.unlink()


def append_error(
    *,
    errors_path: Path,
    image_id: str,
    relative_path: Path,
    stage: str,
    model: str,
    error_type: str,
    message: str,
) -> None:
    errors_path.parent.mkdir(parents=True, exist_ok=True)
    record = {
        "timestamp": dt.datetime.now(dt.timezone.utc).isoformat(),
        "image_id": image_id,
        "relative_path": relative_path.as_posix(),
        "stage": stage,
        "model": model,
        "error_type": error_type,
        "message": message,
    }
    with errors_path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def rebuild_labels_jsonl(*, normalized_root: Path, labels_path: Path) -> None:
    rows: List[Path] = []
    if normalized_root.exists():
        rows = sorted(
            normalized_root.rglob("*.json"),
            key=lambda path: path.relative_to(normalized_root).as_posix().lower(),
        )

    labels_path.parent.mkdir(parents=True, exist_ok=True)
    with labels_path.open("w", encoding="utf-8") as handle:
        for path in rows:
            content = path.read_text(encoding="utf-8")
            payload = json.loads(content)
            handle.write(json.dumps(payload, ensure_ascii=False) + "\n")


if __name__ == "__main__":
    sys.exit(main())
