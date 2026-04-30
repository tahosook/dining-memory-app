#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import datetime as dt
import hashlib
import json
import math
import os
import random
import re
import shutil
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

try:
    from food_label_taxonomy import (
        MEDIAPIPE_TRAINING_CLASSES,
        derive_mediapipe_training_class,
    )
except ImportError:
    from scripts.food_label_taxonomy import (
        MEDIAPIPE_TRAINING_CLASSES,
        derive_mediapipe_training_class,
    )


SPLITS = ("train", "val", "test")
REVIEW_CORRECTION_FIELDS = (
    "corrected_primary_dish_key",
    "final_primary_dish_key",
    "corrected_primary",
    "corrected_label",
    "final_label",
    "final_label_key",
    "mediapipe_training_class",
    "training_class",
)
REVIEW_JUDGMENT_FIELDS = (
    "human_judgment",
    "judgment",
    "review_judgment",
)
EXPLICIT_EXCLUDE_FIELDS = (
    "exclude",
    "excluded",
    "is_excluded",
    "skip",
    "should_exclude",
)
EXCLUDE_JUDGMENTS = {
    "exclude",
    "excluded",
    "ignore",
    "ignored",
    "non_food",
    "not_food",
    "reject",
    "rejected",
    "skip",
    "skipped",
}
INCORRECT_JUDGMENTS = {
    "false",
    "incorrect",
    "ng",
    "no",
    "wrong",
}
EXCLUDE_LABEL_VALUES = EXCLUDE_JUDGMENTS | {"not_a_meal"}


@dataclass
class LabelRecord:
    line_number: int
    payload: Dict[str, Any]
    image_id: str
    source_path: str
    record_key: str
    ai_label: str
    review_reasons: List[str]
    is_food_related: bool
    scene_type: str


@dataclass
class ReviewRecord:
    record_key: str
    source: str
    human_judgment: str
    corrected_label: str
    explicit_exclude: bool


@dataclass
class ImageRootIndex:
    root: Path
    by_name_lower: Dict[str, List[Path]]


class DatasetExportError(Exception):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="labels.jsonl と review correction から MediaPipe 用 class-directory dataset を作ります。"
    )
    parser.add_argument("--labels-jsonl", required=True, help="explore-food-labels.py が出力した labels.jsonl")
    parser.add_argument("--image-root", required=True, help="source_path を解決する画像ルートディレクトリ")
    parser.add_argument("--output-dir", required=True, help="dataset export の出力先")
    parser.add_argument("--review-json", default=None, help="build-review-gallery.py の review JSON export")
    parser.add_argument("--review-csv", default=None, help="build-review-gallery.py の review CSV export")
    parser.add_argument("--val-ratio", type=float, default=0.15, help="validation split ratio")
    parser.add_argument("--test-ratio", type=float, default=0.15, help="test split ratio")
    parser.add_argument("--seed", type=int, default=42, help="deterministic split seed")
    parser.add_argument(
        "--copy-mode",
        choices=("copy", "symlink"),
        default="copy",
        help="画像の配置方法",
    )
    parser.add_argument(
        "--min-class-count",
        type=int,
        default=0,
        help="この件数未満の class を excluded に回す",
    )
    parser.add_argument("--dry-run", action="store_true", help="metadata と summary だけを書き、画像は配置しない")
    parser.add_argument("--overwrite", action="store_true", help="既存 output-dir を削除して作り直す")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        export_dataset(args)
    except DatasetExportError as error:
        print(str(error), file=sys.stderr)
        return 2
    return 0


def export_dataset(args: argparse.Namespace) -> None:
    labels_jsonl = Path(args.labels_jsonl).expanduser().resolve()
    image_root = Path(args.image_root).expanduser().resolve()
    output_dir = Path(args.output_dir).expanduser().resolve()
    review_json = Path(args.review_json).expanduser().resolve() if args.review_json else None
    review_csv = Path(args.review_csv).expanduser().resolve() if args.review_csv else None

    validate_inputs(
        labels_jsonl=labels_jsonl,
        image_root=image_root,
        output_dir=output_dir,
        review_json=review_json,
        review_csv=review_csv,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        min_class_count=args.min_class_count,
        overwrite=args.overwrite,
    )
    prepare_output_dir(output_dir, overwrite=args.overwrite)

    load_result = load_label_records(labels_jsonl)
    reviews = load_review_records(review_json=review_json, review_csv=review_csv)
    image_root_index = build_image_root_index(image_root)

    candidates: List[Dict[str, Any]] = []
    excluded: List[Dict[str, Any]] = list(load_result["excluded"])
    for record in load_result["records"]:
        selected = select_training_label(record, reviews.get(record.record_key))
        if selected["excluded_reason"]:
            excluded.append(
                build_excluded_record(
                    record=record,
                    reason=selected["excluded_reason"],
                    source_label=selected["source_label"],
                    correction_source=selected["source_type"],
                    training_class=selected["training_class"],
                )
            )
            continue

        image_path, image_error = resolve_image_path(
            record.source_path,
            image_root=image_root,
            image_root_index=image_root_index,
        )
        if image_error:
            excluded.append(
                build_excluded_record(
                    record=record,
                    reason=image_error,
                    source_label=selected["source_label"],
                    correction_source=selected["source_type"],
                    training_class=selected["training_class"],
                )
            )
            continue

        assert image_path is not None
        candidates.append(
            {
                "record": record,
                "source_label": selected["source_label"],
                "source_type": selected["source_type"],
                "training_class": selected["training_class"],
                "source_image_path": image_path,
            }
        )

    included, min_class_excluded = apply_min_class_count(
        candidates,
        min_class_count=args.min_class_count,
    )
    excluded.extend(min_class_excluded)
    assignments = assign_splits(
        included,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        seed=args.seed,
    )
    assign_destination_names(assignments)

    if not args.dry_run:
        write_dataset_files(
            assignments,
            output_dir=output_dir,
            copy_mode=args.copy_mode,
        )

    summary = build_summary(
        labels_jsonl=labels_jsonl,
        image_root=image_root,
        output_dir=output_dir,
        review_json=review_json,
        review_csv=review_csv,
        load_result=load_result,
        reviews=reviews,
        assignments=assignments,
        excluded=excluded,
        min_class_count=args.min_class_count,
        val_ratio=args.val_ratio,
        test_ratio=args.test_ratio,
        seed=args.seed,
        copy_mode=args.copy_mode,
        dry_run=args.dry_run,
    )
    write_export_metadata(output_dir=output_dir, summary=summary, excluded=excluded)

    print(f"Input records: {summary['counts']['total_input_count']}")
    print(f"Included records: {summary['counts']['included_count']}")
    print(f"Excluded records: {summary['counts']['excluded_count']}")
    print(f"Output: {output_dir}")
    if args.dry_run:
        print("Dry run: image copy/symlink skipped")


def validate_inputs(
    *,
    labels_jsonl: Path,
    image_root: Path,
    output_dir: Path,
    review_json: Optional[Path],
    review_csv: Optional[Path],
    val_ratio: float,
    test_ratio: float,
    min_class_count: int,
    overwrite: bool,
) -> None:
    if not labels_jsonl.is_file():
        raise DatasetExportError(f"--labels-jsonl not found: {labels_jsonl}")
    if not image_root.is_dir():
        raise DatasetExportError(f"--image-root not found or not a directory: {image_root}")
    if review_json is not None and not review_json.is_file():
        raise DatasetExportError(f"--review-json not found: {review_json}")
    if review_csv is not None and not review_csv.is_file():
        raise DatasetExportError(f"--review-csv not found: {review_csv}")
    if output_dir.exists() and not overwrite:
        raise DatasetExportError(f"--output-dir already exists. Use --overwrite to replace it: {output_dir}")
    if not math.isfinite(val_ratio) or not 0 <= val_ratio < 1:
        raise DatasetExportError("--val-ratio must be between 0 and 1.")
    if not math.isfinite(test_ratio) or not 0 <= test_ratio < 1:
        raise DatasetExportError("--test-ratio must be between 0 and 1.")
    if val_ratio + test_ratio >= 1:
        raise DatasetExportError("--val-ratio + --test-ratio must be less than 1.")
    if min_class_count < 0:
        raise DatasetExportError("--min-class-count must be 0 or greater.")


def prepare_output_dir(output_dir: Path, *, overwrite: bool) -> None:
    if output_dir.exists() and overwrite:
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True, exist_ok=False)


def load_label_records(labels_jsonl: Path) -> Dict[str, Any]:
    records: List[LabelRecord] = []
    excluded: List[Dict[str, Any]] = []
    total_input_count = 0
    broken_json_count = 0
    invalid_record_shape_count = 0

    with labels_jsonl.open("r", encoding="utf-8") as handle:
        for line_number, line in enumerate(handle, start=1):
            if not line.strip():
                continue
            total_input_count += 1
            origin = f"{labels_jsonl.name}:{line_number}"
            try:
                payload = json.loads(line)
            except json.JSONDecodeError:
                broken_json_count += 1
                excluded.append(build_unloaded_excluded_record(origin=origin, reason="invalid_json"))
                continue

            if not isinstance(payload, dict):
                invalid_record_shape_count += 1
                excluded.append(build_unloaded_excluded_record(origin=origin, reason="invalid_record_shape"))
                continue

            source_path = clean_text(payload.get("source_path"))
            image_id = clean_text(payload.get("image_id")) or derive_image_id(source_path, fallback=f"line-{line_number}")
            ai_label = normalize_label_key(payload.get("primary_dish_key")) or "missing"
            review_reasons = normalize_string_list(payload.get("review_reasons"))
            scene_type = normalize_label_key(payload.get("scene_type"))
            records.append(
                LabelRecord(
                    line_number=line_number,
                    payload=payload,
                    image_id=image_id,
                    source_path=source_path,
                    record_key=build_record_key(image_id, source_path),
                    ai_label=ai_label,
                    review_reasons=review_reasons,
                    is_food_related=coerce_bool(payload.get("is_food_related"), default=True),
                    scene_type=scene_type,
                )
            )

    return {
        "records": records,
        "excluded": excluded,
        "total_input_count": total_input_count,
        "broken_json_count": broken_json_count,
        "invalid_record_shape_count": invalid_record_shape_count,
    }


def load_review_records(*, review_json: Optional[Path], review_csv: Optional[Path]) -> Dict[str, ReviewRecord]:
    reviews: Dict[str, ReviewRecord] = {}
    if review_csv is not None:
        reviews.update(load_review_csv(review_csv))
    if review_json is not None:
        reviews.update(load_review_json(review_json))
    return reviews


def load_review_json(path: Path) -> Dict[str, ReviewRecord]:
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        raise DatasetExportError(f"Could not parse --review-json: {path}: {error}") from error

    if isinstance(payload, dict):
        rows = payload.get("records", [])
    else:
        rows = payload
    if not isinstance(rows, list):
        raise DatasetExportError(f"--review-json records must be a list: {path}")

    reviews: Dict[str, ReviewRecord] = {}
    for row in rows:
        if not isinstance(row, dict):
            continue
        review = build_review_record(row, source="json")
        if review is not None:
            reviews[review.record_key] = review
    return reviews


def load_review_csv(path: Path) -> Dict[str, ReviewRecord]:
    reviews: Dict[str, ReviewRecord] = {}
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            review = build_review_record(row, source="csv")
            if review is not None:
                reviews[review.record_key] = review
    return reviews


def build_review_record(row: Dict[str, Any], *, source: str) -> Optional[ReviewRecord]:
    image_id = clean_text(row.get("image_id"))
    source_path = clean_text(row.get("source_path"))
    if not image_id or not source_path:
        return None

    human_judgment = first_normalized_field(row, REVIEW_JUDGMENT_FIELDS)
    corrected_label = first_normalized_field(row, REVIEW_CORRECTION_FIELDS)
    explicit_exclude = human_judgment in EXCLUDE_JUDGMENTS or corrected_label in EXCLUDE_LABEL_VALUES
    for field in EXPLICIT_EXCLUDE_FIELDS:
        if coerce_bool(row.get(field), default=False):
            explicit_exclude = True
            break

    return ReviewRecord(
        record_key=build_record_key(image_id, source_path),
        source=source,
        human_judgment=human_judgment,
        corrected_label=corrected_label,
        explicit_exclude=explicit_exclude,
    )


def select_training_label(record: LabelRecord, review: Optional[ReviewRecord]) -> Dict[str, str]:
    if review is not None and review.explicit_exclude:
        return {
            "source_label": review.corrected_label or record.ai_label,
            "source_type": "review_correction",
            "training_class": "",
            "excluded_reason": "review_excluded",
        }

    if review is not None and review.corrected_label:
        training_class = derive_mediapipe_training_class(
            review.corrected_label,
            review_reasons=[],
            is_food_related=record.is_food_related,
            scene_type=record.scene_type,
            allow_direct_training_class=True,
        )
        return {
            "source_label": review.corrected_label,
            "source_type": "review_correction",
            "training_class": training_class,
            "excluded_reason": "" if training_class else "unknown_correction_label",
        }

    if review is not None and review.human_judgment in INCORRECT_JUDGMENTS:
        return {
            "source_label": record.ai_label,
            "source_type": "review_correction",
            "training_class": "",
            "excluded_reason": "missing_correction_label",
        }

    training_class = derive_mediapipe_training_class(
        record.ai_label,
        review_reasons=record.review_reasons,
        is_food_related=record.is_food_related,
        scene_type=record.scene_type,
        allow_direct_training_class=True,
    )
    return {
        "source_label": record.ai_label,
        "source_type": "ai_label",
        "training_class": training_class,
        "excluded_reason": "" if training_class else derive_unmapped_reason(record),
    }


def derive_unmapped_reason(record: LabelRecord) -> str:
    if not record.is_food_related or record.scene_type == "non_food":
        return "non_food"
    if "side_item_primary" in record.review_reasons:
        return "side_item_primary"
    if record.ai_label in {"missing", "unknown"}:
        return "unknown_label"
    if record.ai_label == "menu_or_text":
        return "menu_or_text"
    return "unmapped_label"


def build_image_root_index(image_root: Path) -> ImageRootIndex:
    by_name_lower: Dict[str, List[Path]] = defaultdict(list)
    for path in sorted(image_root.rglob("*")):
        if path.is_file():
            by_name_lower[path.name.lower()].append(path.resolve())
    return ImageRootIndex(root=image_root, by_name_lower=dict(by_name_lower))


def resolve_image_path(
    source_path: str,
    *,
    image_root: Path,
    image_root_index: ImageRootIndex,
) -> Tuple[Optional[Path], str]:
    normalized_source = clean_text(source_path)
    if not normalized_source:
        return None, "missing_image"

    source = Path(normalized_source).expanduser()
    if source.is_absolute():
        return (source.resolve(), "") if source.is_file() else (None, "missing_image")

    rooted = image_root / normalized_source
    if rooted.is_file():
        return rooted.resolve(), ""

    basename = Path(normalized_source).name.lower()
    matches = image_root_index.by_name_lower.get(basename, [])
    if len(matches) == 1:
        return matches[0], ""
    if len(matches) > 1:
        return None, "ambiguous_image"
    return None, "missing_image"


def apply_min_class_count(
    candidates: Sequence[Dict[str, Any]],
    *,
    min_class_count: int,
) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]]]:
    if min_class_count <= 0:
        return list(candidates), []

    class_counts = Counter(candidate["training_class"] for candidate in candidates)
    removed_classes = {class_name for class_name, count in class_counts.items() if count < min_class_count}
    included: List[Dict[str, Any]] = []
    excluded: List[Dict[str, Any]] = []
    for candidate in candidates:
        record = candidate["record"]
        if candidate["training_class"] in removed_classes:
            excluded.append(
                build_excluded_record(
                    record=record,
                    reason="below_min_class_count",
                    source_label=candidate["source_label"],
                    correction_source=candidate["source_type"],
                    training_class=candidate["training_class"],
                )
            )
        else:
            included.append(dict(candidate))
    return included, excluded


def assign_splits(
    included: Sequence[Dict[str, Any]],
    *,
    val_ratio: float,
    test_ratio: float,
    seed: int,
) -> List[Dict[str, Any]]:
    by_class: Dict[str, List[Dict[str, Any]]] = defaultdict(list)
    for item in included:
        by_class[item["training_class"]].append(dict(item))

    assignments: List[Dict[str, Any]] = []
    for class_name in sorted(by_class):
        items = sorted(
            by_class[class_name],
            key=lambda item: (
                item["record"].record_key,
                str(item["source_image_path"]),
            ),
        )
        rng = random.Random(stable_class_seed(seed, class_name))
        rng.shuffle(items)
        val_count, test_count = compute_split_counts(
            len(items),
            val_ratio=val_ratio,
            test_ratio=test_ratio,
        )
        for index, item in enumerate(items):
            if index < val_count:
                split = "val"
            elif index < val_count + test_count:
                split = "test"
            else:
                split = "train"
            item["split"] = split
            assignments.append(item)

    return sorted(
        assignments,
        key=lambda item: (
            item["split"],
            item["training_class"],
            item["record"].record_key,
        ),
    )


def compute_split_counts(n: int, *, val_ratio: float, test_ratio: float) -> Tuple[int, int]:
    if n < 3:
        return 0, 0

    val_count = math.floor(n * val_ratio)
    test_count = math.floor(n * test_ratio)
    if val_ratio > 0:
        val_count = max(1, val_count)
    if test_ratio > 0:
        test_count = max(1, test_count)

    while val_count + test_count >= n:
        if val_count >= test_count and val_count > 0:
            val_count -= 1
        elif test_count > 0:
            test_count -= 1
        else:
            break
    return val_count, test_count


def stable_class_seed(seed: int, class_name: str) -> int:
    digest = hashlib.sha256(f"{seed}:{class_name}".encode("utf-8")).hexdigest()
    return int(digest[:16], 16)


def assign_destination_names(assignments: Sequence[Dict[str, Any]]) -> None:
    used_names: Dict[Tuple[str, str], set[str]] = defaultdict(set)
    for assignment in assignments:
        key = (assignment["split"], assignment["training_class"])
        destination_name = build_destination_name(assignment, used_names[key])
        assignment["destination_name"] = destination_name
        assignment["destination_relative_path"] = (
            Path(assignment["split"]) / assignment["training_class"] / destination_name
        ).as_posix()
        used_names[key].add(destination_name)


def build_destination_name(assignment: Dict[str, Any], used_names: set[str]) -> str:
    record = assignment["record"]
    source_image_path: Path = assignment["source_image_path"]
    image_id = sanitize_filename_part(record.image_id) or stable_short_hash(record.record_key)
    basename = sanitize_filename_part(source_image_path.name) or f"image{source_image_path.suffix.lower()}"
    candidate = f"{image_id}__{basename}"
    if candidate not in used_names:
        return candidate

    stem = Path(basename).stem
    suffix = Path(basename).suffix
    digest = stable_short_hash(f"{record.record_key}:{source_image_path}")
    candidate = f"{image_id}__{stem}__{digest}{suffix}"
    counter = 2
    while candidate in used_names:
        candidate = f"{image_id}__{stem}__{digest}_{counter}{suffix}"
        counter += 1
    return candidate


def write_dataset_files(
    assignments: Sequence[Dict[str, Any]],
    *,
    output_dir: Path,
    copy_mode: str,
) -> None:
    for assignment in assignments:
        destination_path = output_dir / assignment["destination_relative_path"]
        destination_path.parent.mkdir(parents=True, exist_ok=True)
        source_path: Path = assignment["source_image_path"]
        if copy_mode == "copy":
            shutil.copy2(source_path, destination_path)
        elif copy_mode == "symlink":
            os.symlink(str(source_path), str(destination_path))
        else:
            raise DatasetExportError(f"Unsupported copy mode: {copy_mode}")


def build_summary(
    *,
    labels_jsonl: Path,
    image_root: Path,
    output_dir: Path,
    review_json: Optional[Path],
    review_csv: Optional[Path],
    load_result: Dict[str, Any],
    reviews: Dict[str, ReviewRecord],
    assignments: Sequence[Dict[str, Any]],
    excluded: Sequence[Dict[str, Any]],
    min_class_count: int,
    val_ratio: float,
    test_ratio: float,
    seed: int,
    copy_mode: str,
    dry_run: bool,
) -> Dict[str, Any]:
    split_counts = Counter(assignment["split"] for assignment in assignments)
    class_counts = Counter(assignment["training_class"] for assignment in assignments)
    split_class_counts: Dict[str, Dict[str, int]] = {}
    for split in SPLITS:
        split_class_counts[split] = dict(
            sorted(
                Counter(
                    assignment["training_class"]
                    for assignment in assignments
                    if assignment["split"] == split
                ).items()
            )
        )

    excluded_reason_counts = Counter(item["reason"] for item in excluded)
    correction_applied_count = sum(1 for assignment in assignments if assignment["source_type"] == "review_correction")
    ai_label_used_count = sum(1 for assignment in assignments if assignment["source_type"] == "ai_label")
    source_label_mapping_counter = Counter(
        (
            assignment["source_label"],
            assignment["training_class"],
            assignment["source_type"],
        )
        for assignment in assignments
    )
    min_class_excluded_counter = Counter(
        item["training_class"]
        for item in excluded
        if item["reason"] == "below_min_class_count" and item.get("training_class")
    )
    label_map = build_label_map(class_counts)

    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "dry_run": dry_run,
        "copy_mode": copy_mode,
        "input": {
            "labels_jsonl": str(labels_jsonl),
            "image_root": str(image_root),
            "review_json": str(review_json) if review_json else "",
            "review_csv": str(review_csv) if review_csv else "",
            "output_dir": str(output_dir),
        },
        "options": {
            "val_ratio": val_ratio,
            "test_ratio": test_ratio,
            "seed": seed,
            "min_class_count": min_class_count,
        },
        "counts": {
            "total_input_count": load_result["total_input_count"],
            "parseable_label_count": len(load_result["records"]),
            "included_count": len(assignments),
            "excluded_count": len(excluded),
            "train_count": split_counts.get("train", 0),
            "val_count": split_counts.get("val", 0),
            "test_count": split_counts.get("test", 0),
            "correction_applied_count": correction_applied_count,
            "ai_label_used_count": ai_label_used_count,
            "review_records_loaded": len(reviews),
        },
        "class_counts": dict(sorted(class_counts.items())),
        "split_counts": {split: split_counts.get(split, 0) for split in SPLITS},
        "split_class_counts": split_class_counts,
        "excluded_reason_counts": dict(sorted(excluded_reason_counts.items())),
        "min_class_count_excluded_classes": [
            {"class": class_name, "count": count}
            for class_name, count in sorted(min_class_excluded_counter.items())
        ],
        "source_label_mapping_counts": [
            {
                "source_label": source_label,
                "training_class": training_class,
                "source": source_type,
                "count": count,
            }
            for (source_label, training_class, source_type), count in sorted(
                source_label_mapping_counter.items(),
                key=lambda item: (-item[1], item[0][0], item[0][1], item[0][2]),
            )
        ],
        "label_map": label_map,
        "errors": {
            "broken_json_count": load_result["broken_json_count"],
            "invalid_record_shape_count": load_result["invalid_record_shape_count"],
        },
    }


def build_label_map(class_counts: Counter) -> Dict[str, Any]:
    classes = sorted(class_counts)
    class_to_id = {class_name: index for index, class_name in enumerate(classes)}
    return {
        "version": 1,
        "class_to_id": class_to_id,
        "id_to_class": {str(index): class_name for class_name, index in class_to_id.items()},
        "class_counts": {class_name: class_counts[class_name] for class_name in classes},
        "available_training_classes": list(MEDIAPIPE_TRAINING_CLASSES),
    }


def write_export_metadata(
    *,
    output_dir: Path,
    summary: Dict[str, Any],
    excluded: Sequence[Dict[str, Any]],
) -> None:
    label_map = summary["label_map"]
    write_json(output_dir / "label_map.json", label_map)
    classes_by_id = [
        label_map["id_to_class"][str(index)]
        for index in range(len(label_map["class_to_id"]))
    ]
    (output_dir / "labels.txt").write_text("\n".join(classes_by_id) + ("\n" if classes_by_id else ""), encoding="utf-8")
    write_json(output_dir / "dataset_summary.json", summary)
    (output_dir / "dataset_summary.md").write_text(render_summary_markdown(summary), encoding="utf-8")

    excluded_dir = output_dir / "excluded"
    excluded_dir.mkdir(parents=True, exist_ok=True)
    with (excluded_dir / "excluded_manifest.jsonl").open("w", encoding="utf-8") as handle:
        for item in excluded:
            handle.write(json.dumps(item, ensure_ascii=False, sort_keys=True) + "\n")


def render_summary_markdown(summary: Dict[str, Any]) -> str:
    counts = summary["counts"]
    lines = [
        "# MediaPipe Dataset Summary",
        "",
        f"- Generated at: {summary['generated_at']}",
        f"- Dry run: {str(summary['dry_run']).lower()}",
        f"- Copy mode: {summary['copy_mode']}",
        "",
        "## Counts",
        "",
        "| Metric | Count |",
        "| --- | ---: |",
        f"| total input | {counts['total_input_count']} |",
        f"| included | {counts['included_count']} |",
        f"| excluded | {counts['excluded_count']} |",
        f"| train | {counts['train_count']} |",
        f"| val | {counts['val_count']} |",
        f"| test | {counts['test_count']} |",
        f"| correction applied | {counts['correction_applied_count']} |",
        f"| AI label used | {counts['ai_label_used_count']} |",
        "",
        "## Class Counts",
        "",
    ]
    lines.extend(render_count_table(summary["class_counts"], empty_label="No included classes."))
    lines.extend(
        [
            "",
            "## Excluded Reasons",
            "",
        ]
    )
    lines.extend(render_count_table(summary["excluded_reason_counts"], empty_label="No excluded records."))
    lines.extend(
        [
            "",
            "## Source Label Mapping",
            "",
            "| Source label | Training class | Source | Count |",
            "| --- | --- | --- | ---: |",
        ]
    )
    if summary["source_label_mapping_counts"]:
        for item in summary["source_label_mapping_counts"]:
            lines.append(
                f"| {item['source_label']} | {item['training_class']} | {item['source']} | {item['count']} |"
            )
    else:
        lines.append("| - | - | - | 0 |")
    lines.append("")
    return "\n".join(lines)


def render_count_table(counts: Dict[str, int], *, empty_label: str) -> List[str]:
    if not counts:
        return [empty_label]
    lines = ["| Value | Count |", "| --- | ---: |"]
    for value, count in counts.items():
        lines.append(f"| {value} | {count} |")
    return lines


def write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def build_excluded_record(
    *,
    record: LabelRecord,
    reason: str,
    source_label: str,
    correction_source: str,
    training_class: str,
) -> Dict[str, Any]:
    return {
        "record_key": record.record_key,
        "image_id": record.image_id,
        "source_path": record.source_path,
        "source_label": source_label,
        "training_class": training_class,
        "correction_source": correction_source,
        "reason": reason,
    }


def build_unloaded_excluded_record(*, origin: str, reason: str) -> Dict[str, Any]:
    return {
        "record_key": origin,
        "image_id": "",
        "source_path": "",
        "source_label": "",
        "training_class": "",
        "correction_source": "none",
        "reason": reason,
    }


def build_record_key(image_id: str, source_path: str) -> str:
    return f"{image_id}::{source_path}"


def derive_image_id(source_path: str, *, fallback: str) -> str:
    if source_path:
        stem = Path(source_path).stem
        if stem:
            return stem
    return fallback


def first_normalized_field(row: Dict[str, Any], fields: Sequence[str]) -> str:
    for field in fields:
        raw_value = clean_text(row.get(field))
        if not raw_value:
            continue
        value = normalize_label_key(raw_value)
        return value or raw_value
    return ""


def normalize_string_list(value: Any) -> List[str]:
    if value is None:
        return []
    if isinstance(value, str):
        parts = re.split(r"[;,]", value)
    elif isinstance(value, list):
        parts = value
    else:
        return []
    result: List[str] = []
    for item in parts:
        normalized = normalize_label_key(item)
        if normalized and normalized not in result:
            result.append(normalized)
    return result


def normalize_label_key(value: Any) -> str:
    text = clean_text(value).lower()
    if not text:
        return ""
    text = text.replace("-", "_").replace(" ", "_")
    text = re.sub(r"[^a-z0-9_]+", "_", text)
    text = re.sub(r"_+", "_", text).strip("_")
    return text


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    if not isinstance(value, str):
        value = str(value)
    return re.sub(r"\s+", " ", value).strip()


def coerce_bool(value: Any, *, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    text = clean_text(value).lower()
    if text in {"1", "true", "yes", "y", "on"}:
        return True
    if text in {"0", "false", "no", "n", "off"}:
        return False
    return default


def sanitize_filename_part(value: str) -> str:
    sanitized = re.sub(r"[^A-Za-z0-9._-]+", "_", value.strip())
    sanitized = re.sub(r"_+", "_", sanitized).strip("._-")
    return sanitized[:120]


def stable_short_hash(value: str) -> str:
    return hashlib.sha1(value.encode("utf-8")).hexdigest()[:10]


if __name__ == "__main__":
    sys.exit(main())
