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
from pathlib import Path
from typing import Any, Dict, Iterator, List, Optional, Sequence


SCHEMA_VERSION = "food_label_exploration_v2"
PROMPT_VERSION = "food_label_exploration_prompt_v1"
OLLAMA_API_BASE_URL = "http://localhost:11434/api"
SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic"}

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
LABEL_GRANULARITY_OPTIONS = [
    "specific_dish",
    "broad_dish_type",
    "meal_set",
    "scene_level",
    "unknown",
]

FORMAT_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {
        "schema_version": {"type": "string"},
        "image_id": {"type": "string"},
        "is_food_related": {"type": "boolean"},
        "analysis_confidence": {"type": "number"},
        "scene_type": {"type": "string", "enum": SCENE_TYPE_OPTIONS},
        "main_subjects": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "key": {"type": "string"},
                    "label_ja": {"type": "string"},
                    "score": {"type": "number"},
                    "role": {"type": "string"},
                },
                "required": ["key", "label_ja", "score", "role"],
                "additionalProperties": False,
            },
        },
        "possible_dish_keys": {
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
        "secondary_item_keys": {
            "type": "array",
            "items": {"type": "string"},
        },
        "cuisine_type": {"type": "string", "enum": CUISINE_TYPE_OPTIONS},
        "meal_style": {"type": "string", "enum": MEAL_STYLE_OPTIONS},
        "serving_style": {"type": "string", "enum": SERVING_STYLE_OPTIONS},
        "label_granularity": {"type": "string", "enum": LABEL_GRANULARITY_OPTIONS},
        "contains_multiple_dishes": {"type": "boolean"},
        "is_drink_only": {"type": "boolean"},
        "is_sweets_or_dessert": {"type": "boolean"},
        "is_packaged_food": {"type": "boolean"},
        "is_menu_or_text_only": {"type": "boolean"},
        "is_takeout_or_delivery": {"type": "boolean"},
        "visual_attributes": {"type": "array", "items": {"type": "string"}},
        "uncertainty_reasons": {"type": "array", "items": {"type": "string"}},
        "free_tags": {"type": "array", "items": {"type": "string"}},
        "review_note_ja": {"type": "string"},
        "needs_human_review": {"type": "boolean"},
    },
    "required": [
        "schema_version",
        "image_id",
        "is_food_related",
        "analysis_confidence",
        "scene_type",
        "main_subjects",
        "possible_dish_keys",
        "secondary_item_keys",
        "cuisine_type",
        "meal_style",
        "serving_style",
        "label_granularity",
        "contains_multiple_dishes",
        "is_drink_only",
        "is_sweets_or_dessert",
        "is_packaged_food",
        "is_menu_or_text_only",
        "is_takeout_or_delivery",
        "visual_attributes",
        "uncertainty_reasons",
        "free_tags",
        "review_note_ja",
        "needs_human_review",
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

    attempted_new = 0
    succeeded = 0
    skipped = 0
    error_count = 0

    for image_path in image_paths:
        relative_path = image_path.relative_to(input_dir)
        image_id = build_image_id(relative_path)
        normalized_path = output_path_with_suffix(normalized_root, relative_path, ".json")
        raw_path = output_path_with_suffix(raw_root, relative_path, ".response.json")

        if normalized_path.exists() and not args.overwrite:
            skipped += 1
            print(f"[skip] {relative_path}")
            continue

        if args.limit is not None and attempted_new >= args.limit:
            break

        attempted_new += 1
        print(f"[run ] {relative_path}")

        try:
            raw_response = process_single_image(
                image_path=image_path,
                relative_path=relative_path,
                image_id=image_id,
                normalized_path=normalized_path,
                raw_path=raw_path,
                model=args.model,
                timeout=args.timeout,
            )
            if raw_response is not None:
                succeeded += 1
        except StageError as error:
            error_count += 1
            append_error(
                errors_path=errors_path,
                image_id=image_id,
                relative_path=relative_path,
                stage=error.stage,
                model=args.model,
                error_type=type(error.__cause__ or error).__name__,
                message=str(error.__cause__ or error),
            )
            print(f"[error] {relative_path} ({error.stage}): {error}", file=sys.stderr)
        except Exception as error:
            error_count += 1
            append_error(
                errors_path=errors_path,
                image_id=image_id,
                relative_path=relative_path,
                stage="unknown",
                model=args.model,
                error_type=type(error).__name__,
                message=str(error),
            )
            print(f"[error] {relative_path} (unknown): {error}", file=sys.stderr)

        if args.sleep_seconds > 0:
            time.sleep(args.sleep_seconds)

    rebuild_labels_jsonl(normalized_root=normalized_root, labels_path=labels_path)

    print("")
    print("Done.")
    print(f"- attempted_new: {attempted_new}")
    print(f"- succeeded: {succeeded}")
    print(f"- skipped: {skipped}")
    print(f"- errors: {error_count}")
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
    normalized_path: Path,
    raw_path: Path,
    model: str,
    timeout: float,
) -> Optional[Dict[str, Any]]:
    try:
        with prepared_image_path(image_path) as prepared_path:
            payload = build_chat_payload(
                model=model,
                image_id=image_id,
                image_path=prepared_path,
            )
    except Exception as error:
        raise StageError("prepare_image", f"Failed to prepare image: {error}", cause=error) from error

    try:
        response_json = post_json(
            path="/chat",
            payload=payload,
            timeout=timeout,
        )
    except Exception as error:
        raise StageError("ollama_chat", f"Failed to analyze image with Ollama: {error}", cause=error) from error

    raw_message_content = None
    if isinstance(response_json, dict):
        message = response_json.get("message")
        if isinstance(message, dict):
            raw_message_content = message.get("content")

    raw_record = {
        "schema_version": SCHEMA_VERSION,
        "prompt_version": PROMPT_VERSION,
        "image_id": image_id,
        "relative_path": relative_path.as_posix(),
        "model": model,
        "api_path": "/chat",
        "request": {
            "model": model,
            "stream": False,
            "timeout_seconds": timeout,
            "format_schema": FORMAT_SCHEMA,
            "messages": [
                {
                    "role": "system",
                    "content": payload["messages"][0]["content"],
                },
                {
                    "role": "user",
                    "content": payload["messages"][1]["content"],
                    "images": ["<omitted_base64_image>"],
                },
            ],
        },
        "raw_message_content": raw_message_content,
        "response_json": response_json,
    }

    try:
        write_json_file(raw_path, raw_record)
    except Exception as error:
        raise StageError("write_raw_response", f"Failed to write raw response: {error}", cause=error) from error

    try:
        parsed_object = parse_model_json_object(raw_message_content)
    except Exception as error:
        raise StageError("parse_response", f"Failed to parse model JSON: {error}", cause=error) from error

    try:
        normalized_result = normalize_result(parsed_object, image_id=image_id)
    except Exception as error:
        raise StageError("normalize_result", f"Failed to normalize response: {error}", cause=error) from error

    try:
        write_json_file(normalized_path, normalized_result)
    except Exception as error:
        raise StageError("write_normalized", f"Failed to write normalized JSON: {error}", cause=error) from error

    return normalized_result


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


def build_chat_payload(*, model: str, image_id: str, image_path: Path) -> Dict[str, Any]:
    image_bytes = image_path.read_bytes()
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    return {
        "model": model,
        "stream": False,
        "format": FORMAT_SCHEMA,
        "options": {
            "temperature": 0,
        },
        "messages": [
            {
                "role": "system",
                "content": build_system_prompt(),
            },
            {
                "role": "user",
                "content": build_user_prompt(image_id=image_id),
                "images": [image_b64],
            },
        ],
    }


def build_system_prompt() -> str:
    return (
        "あなたは食事写真のラベル発掘器です。"
        "最終分類器ではなく、後でカテゴリ設計に使える半構造化 JSON を返してください。"
        "JSON オブジェクト以外は返さないでください。"
    )


def build_user_prompt(*, image_id: str) -> str:
    schema_summary = {
        "schema_version": SCHEMA_VERSION,
        "scene_type_options": SCENE_TYPE_OPTIONS,
        "cuisine_type_options": CUISINE_TYPE_OPTIONS,
        "meal_style_options": MEAL_STYLE_OPTIONS,
        "serving_style_options": SERVING_STYLE_OPTIONS,
        "label_granularity_options": LABEL_GRANULARITY_OPTIONS,
    }

    instructions = [
        "目的: 料理分類器ではなく、食事カテゴリ発掘のためのラベル発掘器として振る舞ってください。",
        "単品料理に無理に押し込まず、定食、複数皿、デザート+ドリンク、パッケージ食品、メニュー画像、非料理画像も正直に表現してください。",
        "狭すぎる断定より、少し広くても正しいラベルを優先してください。",
        "machine-readable な key / tag は snake_case の英語にしてください。",
        "label_ja と review_note_ja は短い日本語にしてください。",
        "低信頼・複数皿・曖昧画像では needs_human_review=true にしてください。",
        "空欄にせず、判断不能な enum は unknown を使ってください。",
        f"image_id は '{image_id}' を返してください。",
        "返答は JSON オブジェクトのみ。説明文、前置き、コードブロックは禁止です。",
        "利用できる enum 候補:",
        json.dumps(schema_summary, ensure_ascii=False),
    ]
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


def normalize_result(raw_result: Dict[str, Any], *, image_id: str) -> Dict[str, Any]:
    if not isinstance(raw_result, dict):
        raise ValueError("raw_result must be a dict.")

    contains_multiple_dishes = coerce_bool(raw_result.get("contains_multiple_dishes"), default=False)
    is_drink_only = coerce_bool(raw_result.get("is_drink_only"), default=False)
    is_sweets_or_dessert = coerce_bool(raw_result.get("is_sweets_or_dessert"), default=False)
    is_packaged_food = coerce_bool(raw_result.get("is_packaged_food"), default=False)
    is_menu_or_text_only = coerce_bool(raw_result.get("is_menu_or_text_only"), default=False)
    is_takeout_or_delivery = coerce_bool(raw_result.get("is_takeout_or_delivery"), default=False)

    main_subjects = normalize_main_subjects(raw_result.get("main_subjects"))
    possible_dish_keys = normalize_dish_candidates(raw_result.get("possible_dish_keys"))

    if not main_subjects and possible_dish_keys:
        first_candidate = possible_dish_keys[0]
        main_subjects = [
            {
                "key": first_candidate["key"],
                "label_ja": first_candidate["label_ja"],
                "score": first_candidate["score"],
                "role": "primary",
            }
        ]

    if not possible_dish_keys and main_subjects:
        possible_dish_keys = [
            {
                "key": subject["key"],
                "label_ja": subject["label_ja"],
                "score": subject["score"],
            }
            for subject in main_subjects[:3]
        ]

    secondary_item_keys = normalize_machine_string_list(raw_result.get("secondary_item_keys"))
    if not secondary_item_keys and len(main_subjects) > 1:
        secondary_item_keys = [subject["key"] for subject in main_subjects[1:] if subject["key"]]

    confidence_candidates = [
        item["score"] for item in main_subjects if isinstance(item.get("score"), (int, float))
    ] + [
        item["score"] for item in possible_dish_keys if isinstance(item.get("score"), (int, float))
    ]
    analysis_confidence = clamp_score(raw_result.get("analysis_confidence"))
    if analysis_confidence is None:
        analysis_confidence = round(max(confidence_candidates, default=0.0), 4)

    scene_type = normalize_enum(raw_result.get("scene_type"), SCENE_TYPE_OPTIONS)
    if scene_type is None:
        if is_menu_or_text_only:
            scene_type = "menu_or_text"
        elif is_packaged_food:
            scene_type = "packaged_food"
        elif is_drink_only:
            scene_type = "drink_only"
        elif contains_multiple_dishes:
            scene_type = "multi_dish_table"
        elif raw_result.get("meal_style") == "bento":
            scene_type = "bento"
        elif raw_result.get("meal_style") == "set_meal":
            scene_type = "set_meal"
        elif main_subjects:
            scene_type = "single_dish"
        else:
            scene_type = "unknown"

    is_food_related = coerce_bool(raw_result.get("is_food_related"), default=None)
    if is_food_related is None:
        is_food_related = scene_type != "non_food"

    cuisine_type = normalize_enum(raw_result.get("cuisine_type"), CUISINE_TYPE_OPTIONS)
    if cuisine_type is None:
        if is_drink_only:
            cuisine_type = "drink"
        elif is_sweets_or_dessert:
            cuisine_type = "dessert"
        elif scene_type == "packaged_food":
            cuisine_type = "mixed"
        else:
            cuisine_type = "unknown"

    meal_style = normalize_enum(raw_result.get("meal_style"), MEAL_STYLE_OPTIONS)
    if meal_style is None:
        if scene_type == "bento":
            meal_style = "bento"
        elif scene_type == "set_meal":
            meal_style = "set_meal"
        elif scene_type == "multi_dish_table":
            meal_style = "shared_table"
        elif scene_type == "drink_only":
            meal_style = "drink"
        elif scene_type == "dessert_and_drink" or is_sweets_or_dessert:
            meal_style = "dessert"
        elif scene_type == "packaged_food":
            meal_style = "packaged"
        elif scene_type == "single_dish":
            meal_style = "single_item"
        else:
            meal_style = "unknown"

    serving_style = normalize_enum(raw_result.get("serving_style"), SERVING_STYLE_OPTIONS)
    if serving_style is None:
        if scene_type == "set_meal":
            serving_style = "tray"
        elif scene_type == "multi_dish_table":
            serving_style = "table_with_multiple_items"
        elif scene_type == "drink_only":
            serving_style = "cup_or_glass"
        elif scene_type == "bento":
            serving_style = "boxed_meal"
        elif scene_type == "packaged_food":
            serving_style = "package"
        elif scene_type == "menu_or_text":
            serving_style = "menu_page"
        else:
            serving_style = "unknown"

    label_granularity = normalize_enum(
        raw_result.get("label_granularity"),
        LABEL_GRANULARITY_OPTIONS,
    )
    if label_granularity is None:
        if scene_type in {"set_meal", "bento"}:
            label_granularity = "meal_set"
        elif scene_type in {"multi_dish_table", "dessert_and_drink", "menu_or_text", "non_food", "unknown"}:
            label_granularity = "scene_level"
        elif possible_dish_keys:
            label_granularity = "broad_dish_type"
        else:
            label_granularity = "unknown"

    visual_attributes = normalize_machine_string_list(raw_result.get("visual_attributes"))
    uncertainty_reasons = normalize_machine_string_list(raw_result.get("uncertainty_reasons"))
    free_tags = normalize_machine_string_list(raw_result.get("free_tags"))

    heuristic_review = (
        analysis_confidence < 0.45
        or contains_multiple_dishes
        or scene_type in {"multi_dish_table", "menu_or_text", "unknown"}
        or bool(uncertainty_reasons)
    )
    needs_human_review = coerce_bool(raw_result.get("needs_human_review"), default=False) or heuristic_review

    review_note_ja = clean_short_text(raw_result.get("review_note_ja"))
    if not review_note_ja and needs_human_review:
        review_note_ja = "要確認"

    normalized = {
        "schema_version": SCHEMA_VERSION,
        "image_id": image_id,
        "is_food_related": is_food_related,
        "analysis_confidence": round(analysis_confidence, 4),
        "scene_type": scene_type,
        "main_subjects": main_subjects,
        "possible_dish_keys": possible_dish_keys,
        "secondary_item_keys": secondary_item_keys,
        "cuisine_type": cuisine_type,
        "meal_style": meal_style,
        "serving_style": serving_style,
        "label_granularity": label_granularity,
        "contains_multiple_dishes": contains_multiple_dishes,
        "is_drink_only": is_drink_only,
        "is_sweets_or_dessert": is_sweets_or_dessert,
        "is_packaged_food": is_packaged_food,
        "is_menu_or_text_only": is_menu_or_text_only,
        "is_takeout_or_delivery": is_takeout_or_delivery,
        "visual_attributes": visual_attributes,
        "uncertainty_reasons": uncertainty_reasons,
        "free_tags": free_tags,
        "review_note_ja": review_note_ja,
        "needs_human_review": needs_human_review,
    }
    return normalized


def normalize_main_subjects(value: Any) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    seen = set()
    for index, item in enumerate(ensure_list(value)):
        candidate = normalize_subject(item, index=index)
        if candidate is None:
            continue
        dedupe_key = (candidate["key"], candidate["label_ja"])
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        normalized.append(candidate)

    if normalized:
        normalized[0]["role"] = "primary"
        for item in normalized[1:]:
            if item["role"] == "primary":
                item["role"] = "secondary"

    return normalized


def normalize_subject(value: Any, *, index: int) -> Optional[Dict[str, Any]]:
    if isinstance(value, str):
        label_ja = clean_short_text(value)
        if not label_ja:
            return None
        key = normalize_machine_key(value, fallback="unknown")
        return {
            "key": key,
            "label_ja": label_ja,
            "score": 0.0,
            "role": "primary" if index == 0 else "secondary",
        }

    if not isinstance(value, dict):
        return None

    label_ja = clean_short_text(value.get("label_ja") or value.get("label"))
    key_source = value.get("key") or value.get("label_ja") or value.get("label")
    key = normalize_machine_key(key_source, fallback="unknown")
    score = clamp_score(value.get("score"))
    if score is None:
        score = 0.0

    role = clean_short_text(value.get("role")).lower()
    if not role:
        role = "primary" if index == 0 else "secondary"

    return {
        "key": key,
        "label_ja": label_ja or key,
        "score": round(score, 4),
        "role": role,
    }


def normalize_dish_candidates(value: Any) -> List[Dict[str, Any]]:
    normalized: List[Dict[str, Any]] = []
    seen = set()
    for item in ensure_list(value):
        candidate = normalize_dish_candidate(item)
        if candidate is None:
            continue
        dedupe_key = (candidate["key"], candidate["label_ja"])
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        normalized.append(candidate)
    return normalized


def normalize_dish_candidate(value: Any) -> Optional[Dict[str, Any]]:
    if isinstance(value, str):
        label_ja = clean_short_text(value)
        if not label_ja:
            return None
        key = normalize_machine_key(value, fallback="unknown")
        return {
            "key": key,
            "label_ja": label_ja,
            "score": 0.0,
        }

    if not isinstance(value, dict):
        return None

    label_ja = clean_short_text(value.get("label_ja") or value.get("label"))
    key_source = value.get("key") or value.get("label_ja") or value.get("label")
    key = normalize_machine_key(key_source, fallback="unknown")
    score = clamp_score(value.get("score"))
    if score is None:
        score = 0.0

    return {
        "key": key,
        "label_ja": label_ja or key,
        "score": round(score, 4),
    }


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
    path.write_text(serialized + "\n", encoding="utf-8")


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
