#!/usr/bin/env python3
"""Dataset Integration Pipeline for Eligible Pseudo-Labels.

Merges verified eligible pseudo-labels (74 samples: curry_rice 34 + drink 40)
from Sample A Gemini audit into the canonical baseline training dataset (zip2-batch250),
strictly placing all pseudo-labels into the 'train' split, verifying zero data leakage
with the Golden Test Set, and updating dataset metadata.

Invariants enforced:
1. Exact count: exactly 74 pseudo-label images integrated into train split.
2. Canonical 9-class structure preserved (train/val/test).
3. Zero SHA-256 data leakage against Golden Test Set (7 samples).
4. Validation and test sets remain pristine (clean ground truth).
5. Immutable source: baseline dataset and source images are never modified.
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import sys
import uuid
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.dataset_safety_guards import (
    LeakageError,
    assert_no_path_collision,
    assert_path_within_directory,
    atomic_directory_swap,
    check_dual_image_leakage,
    collect_golden_hashes_dual,
    validate_sha256_format,
    verify_candidate_record_integrity,
)
from scripts.validate_zip2_audit_manifest import compute_sha256

DEFAULT_BASE_DATASET = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-batch250"
    / "exported_dataset"
)
DEFAULT_ELIGIBLE_MANIFEST = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-audit-manifest-20261009"
    / "eligible_pseudo_labels_export"
    / "eligible_pseudo_labels_manifest.csv"
)
DEFAULT_SAMPLE_PKG_DIR = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-audit-manifest-20261009"
    / "gemini_audit_sample_A_pkg"
)
DEFAULT_GOLDEN_TEST_DIR = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-even48-20260423"
    / "exported_dataset"
    / "test"
)
DEFAULT_OUTPUT_DATASET = (
    _REPO_ROOT
    / "state"
    / "mediapipe-dataset"
    / "batch250_plus_pseudo74"
)

CANONICAL_CLASSES = [
    "curry_rice",
    "drink",
    "fish_dish",
    "fried_dish",
    "meat_dish",
    "noodles",
    "other_or_exclude",
    "simmered_dish",
    "stir_fry",
]


class IntegrationError(RuntimeError):
    """Raised when integration fails invariant or structure checks."""


def get_image_files(directory: Path) -> List[Path]:
    """Recursively collect all image files in directory."""
    if not directory.is_dir():
        return []
    valid_exts = {".jpg", ".jpeg", ".png", ".webp"}
    return [
        p for p in directory.rglob("*")
        if p.is_file() and p.suffix.lower() in valid_exts and not p.name.startswith(".")
    ]


def load_golden_hashes(golden_test_dir: Path) -> Dict[str, Path]:
    """Loads sha256 hashes of all images in Golden Test Set."""
    golden_files = get_image_files(golden_test_dir)
    hashes: Dict[str, Path] = {}
    for gf in golden_files:
        hashes[compute_sha256(gf)] = gf
    return hashes


def integrate_pseudo_labels(
    base_dataset_dir: Path,
    eligible_manifest_path: Path,
    sample_pkg_dir: Path,
    golden_test_dir: Path,
    output_dataset_dir: Path,
    enforce_real_counts: bool = False,
) -> Tuple[Path, Dict[str, Any]]:
    """Merges eligible pseudo labels into base dataset training split.

    Returns:
        (summary_json_path, summary_data)
    """
    if not base_dataset_dir.is_dir():
        raise FileNotFoundError(f"Base dataset directory not found: {base_dataset_dir}")
    if not eligible_manifest_path.is_file():
        raise FileNotFoundError(f"Eligible manifest not found: {eligible_manifest_path}")
    if not sample_pkg_dir.is_dir():
        raise FileNotFoundError(f"Sample package dir not found: {sample_pkg_dir}")
    if not golden_test_dir.is_dir():
        raise FileNotFoundError(f"Golden test dir not found: {golden_test_dir}")

    input_paths = [base_dataset_dir, eligible_manifest_path, sample_pkg_dir, golden_test_dir]
    assert_no_path_collision(input_paths, output_dataset_dir)

    # Load mapping from sample_pkg_dir
    mapping_path = sample_pkg_dir / "private_reconciliation" / "blind_id_mapping.private.json"
    if not mapping_path.is_file():
        raise FileNotFoundError(f"Blind mapping file not found: {mapping_path}")

    with open(mapping_path, "r", encoding="utf-8") as f:
        mapping_data = json.load(f)
    img_by_id = {r["image_id"]: r for r in mapping_data.get("records", [])}

    # Load eligible manifest
    eligible_rows: List[Dict[str, str]] = []
    with open(eligible_manifest_path, "r", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            eligible_rows.append(r)

    if enforce_real_counts and len(eligible_rows) != 74:
        raise IntegrationError(f"Expected 74 eligible records, found {len(eligible_rows)}")

    # Load Golden Test Hashes with dual check for zero-leakage guarantee
    golden_files = get_image_files(golden_test_dir)
    if len(golden_files) != 7:
        raise IntegrationError(f"Expected exactly 7 Golden Test images, found {len(golden_files)}")
    golden_hashes_dual = collect_golden_hashes_dual(golden_test_dir)

    output_dataset_dir.parent.mkdir(parents=True, exist_ok=True)
    staging_dir = output_dataset_dir.parent / f".tmp_{output_dataset_dir.name}_{uuid.uuid4().hex[:8]}"
    staging_dir.mkdir(parents=True, exist_ok=False)

    try:
        # Copy base dataset splits to staging
        for split in ["train", "val", "test"]:
            src_split = base_dataset_dir / split
            dst_split = staging_dir / split
            if src_split.is_dir():
                shutil.copytree(src_split, dst_split)
            else:
                raise FileNotFoundError(f"Missing required split in base dataset: {src_split}")

        # Copy labels.txt and other metadata files
        for meta_file in ["labels.txt", "label_map.json"]:
            src_meta = base_dataset_dir / meta_file
            if src_meta.is_file():
                shutil.copy2(src_meta, staging_dir / meta_file)

        # Check baseline training files before integration
        base_train_files = get_image_files(base_dataset_dir / "train")
        base_val_files = get_image_files(base_dataset_dir / "val")
        base_test_files = get_image_files(base_dataset_dir / "test")
        base_total = len(base_train_files) + len(base_val_files) + len(base_test_files)

        # Copy pseudo-labels into staging train/<mapped_class>/
        integrated_records: List[Dict[str, str]] = []
        blind_images_dir = sample_pkg_dir / "blind_images"

        seen_image_ids: Set[str] = set()
        for r in eligible_rows:
            img_id = r.get("image_id", "").strip()
            if not img_id:
                raise IntegrationError("Eligible record is missing required 'image_id'")
            if img_id in seen_image_ids:
                raise IntegrationError(f"Duplicate image_id '{img_id}' detected in eligible manifest")
            seen_image_ids.add(img_id)

            mapped_class = r.get("mapped_class", "").strip()
            if mapped_class not in CANONICAL_CLASSES:
                raise IntegrationError(f"Invalid class '{mapped_class}' for image '{img_id}'")

            if img_id not in img_by_id:
                raise FileNotFoundError(f"Image ID '{img_id}' not found in private mapping records.")

            img_record = img_by_id[img_id]
            try:
                verify_candidate_record_integrity(r, img_record, allowed_classes=set(CANONICAL_CLASSES))
            except Exception as e:
                raise IntegrationError(f"Integrity check failed for image '{img_id}': {e}") from e

            image_file_name = img_record.get("image_file", "").strip()
            if not image_file_name:
                raise IntegrationError(f"Mapping record for '{img_id}' missing 'image_file'")

            src_image_file = blind_images_dir / image_file_name
            try:
                assert_path_within_directory(src_image_file, blind_images_dir)
            except Exception as e:
                raise IntegrationError(f"Path traversal detected in blind image path for '{img_id}': {e}") from e

            if not src_image_file.is_file():
                raise FileNotFoundError(f"Blind image file not found: {src_image_file}")

            raw_sha = img_record.get("raw_image_sha256", "").strip()
            stripped_sha = img_record.get("stripped_image_sha256", "").strip()
            if not raw_sha:
                raise IntegrationError(f"Missing required 'raw_image_sha256' for image '{img_id}'")
            if not stripped_sha:
                raise IntegrationError(f"Missing required 'stripped_image_sha256' for image '{img_id}'")

            try:
                validate_sha256_format(raw_sha, "raw_image_sha256")
                validate_sha256_format(stripped_sha, "stripped_image_sha256")
            except Exception as e:
                raise IntegrationError(f"Invalid SHA-256 hash for '{img_id}': {e}") from e

            actual_stripped_sha = compute_sha256(src_image_file)
            if actual_stripped_sha != stripped_sha:
                raise RuntimeError(
                    f"Stripped image SHA-256 mismatch for {img_id}: expected {stripped_sha}, got {actual_stripped_sha}"
                )

            # Dual leakage check against Golden Test Set
            check_dual_image_leakage(
                golden_hashes=golden_hashes_dual,
                image_id=img_id,
                raw_sha256=raw_sha,
                stripped_sha256=stripped_sha,
                image_path=src_image_file,
            )

            # Target file in staging / train / <mapped_class> / <filename>
            target_filename = f"pseudo_{img_id}.jpg"
            target_class_dir = staging_dir / "train" / mapped_class
            assert_path_within_directory(target_class_dir, staging_dir / "train")
            target_path = target_class_dir / target_filename
            assert_path_within_directory(target_path, staging_dir / "train")

            shutil.copy2(src_image_file, target_path)

            # Verify copy hash
            copied_hash = compute_sha256(target_path)
            if copied_hash != actual_stripped_sha:
                raise RuntimeError(f"Hash mismatch after copying {target_path}")

            integrated_records.append({
                "image_id": img_id,
                "mapped_class": mapped_class,
                "target_path": str(target_path.relative_to(staging_dir)),
                "sha256": copied_hash,
            })

        # Validate output dataset structure in staging
        out_train_files = get_image_files(staging_dir / "train")
        out_val_files = get_image_files(staging_dir / "val")
        out_test_files = get_image_files(staging_dir / "test")
        out_total = len(out_train_files) + len(out_val_files) + len(out_test_files)

        expected_integrated_count = len(eligible_rows)
        if len(out_train_files) != len(base_train_files) + expected_integrated_count:
            raise IntegrationError(
                f"Train split count mismatch: base {len(base_train_files)} + added {expected_integrated_count} != actual {len(out_train_files)}"
            )
        if len(out_val_files) != len(base_val_files):
            raise IntegrationError("Validation split count mutated during integration!")
        if len(out_test_files) != len(base_test_files):
            raise IntegrationError("Test split count mutated during integration!")

        # Verify 9 classes present in train
        train_class_dirs = [d.name for d in (staging_dir / "train").iterdir() if d.is_dir()]
        missing_classes = set(CANONICAL_CLASSES) - set(train_class_dirs)
        if missing_classes:
            raise IntegrationError(f"Missing classes in output train split: {missing_classes}")

        # Compute updated class distribution
        class_distribution = Counter()
        for f in out_train_files + out_val_files + out_test_files:
            class_distribution[f.parent.name] += 1

        added_by_class = Counter(r["mapped_class"] for r in integrated_records)

        summary_data = {
            "status": "success",
            "integrated_at": datetime.now(timezone.utc).isoformat(),
            "base_dataset_dir": str(base_dataset_dir),
            "output_dataset_dir": str(output_dataset_dir),
            "golden_test_dir": str(golden_test_dir),
            "counts": {
                "base_total": base_total,
                "base_train": len(base_train_files),
                "base_val": len(base_val_files),
                "base_test": len(base_test_files),
                "pseudo_labels_added": len(integrated_records),
                "output_total": out_total,
                "output_train": len(out_train_files),
                "output_val": len(out_val_files),
                "output_test": len(out_test_files),
            },
            "added_by_class": dict(added_by_class),
            "overall_class_distribution": dict(class_distribution),
            "golden_test_leakage_count": 0,
            "golden_test_samples_checked": len(golden_files),
            "invariants_verified": [
                "all_pseudo_labels_placed_in_train_split",
                "val_and_test_splits_unaltered",
                "canonical_9_classes_verified",
                "zero_leakage_against_golden_test_set_dual_check",
                "sha256_copy_integrity_verified",
            ],
        }

        summary_json_path = staging_dir / "dataset_summary.json"
        with open(summary_json_path, "w", encoding="utf-8") as f:
            json.dump(summary_data, f, indent=2, ensure_ascii=False)

        # Atomic swap to output directory
        atomic_directory_swap(staging_dir, output_dataset_dir)
    finally:
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)

    final_summary_json = output_dataset_dir / "dataset_summary.json"
    return final_summary_json, summary_data


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Dataset integration pipeline for eligible pseudo-labels."
    )
    parser.add_argument(
        "--base-dataset",
        type=Path,
        default=DEFAULT_BASE_DATASET,
        help="Path to canonical baseline dataset (zip2-batch250/exported_dataset)",
    )
    parser.add_argument(
        "--eligible-manifest",
        type=Path,
        default=DEFAULT_ELIGIBLE_MANIFEST,
        help="Path to eligible_pseudo_labels_manifest.csv",
    )
    parser.add_argument(
        "--sample-pkg-dir",
        type=Path,
        default=DEFAULT_SAMPLE_PKG_DIR,
        help="Path to gemini_audit_sample_A_pkg containing images and mapping",
    )
    parser.add_argument(
        "--golden-test-dir",
        type=Path,
        default=DEFAULT_GOLDEN_TEST_DIR,
        help="Path to Golden Test Set (7 samples)",
    )
    parser.add_argument(
        "--output-dataset",
        type=Path,
        default=DEFAULT_OUTPUT_DATASET,
        help="Output directory for integrated dataset",
    )
    parser.add_argument(
        "--enforce-real-counts",
        action="store_true",
        help="Strictly assert exactly 74 eligible records added",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)

    print("=== MediaPipe Pseudo-Label Dataset Integration ===")
    print(f"Base Dataset:       {args.base_dataset}")
    print(f"Eligible Manifest:  {args.eligible_manifest}")
    print(f"Sample Package:     {args.sample_pkg_dir}")
    print(f"Golden Test Dir:    {args.golden_test_dir}")
    print(f"Output Dataset:     {args.output_dataset}")

    try:
        summary_path, summary = integrate_pseudo_labels(
            base_dataset_dir=args.base_dataset,
            eligible_manifest_path=args.eligible_manifest,
            sample_pkg_dir=args.sample_pkg_dir,
            golden_test_dir=args.golden_test_dir,
            output_dataset_dir=args.output_dataset,
            enforce_real_counts=args.enforce_real_counts,
        )

        counts = summary["counts"]
        print("\n[SUCCESS] Dataset integration complete.")
        print(f"  - Total images: {counts['base_total']} -> {counts['output_total']} (+{counts['pseudo_labels_added']})")
        print(f"  - Train split:  {counts['base_train']} -> {counts['output_train']}")
        print(f"  - Val split:    {counts['base_val']} (unaltered)")
        print(f"  - Test split:   {counts['base_test']} (unaltered)")
        print(f"  - Added by class: {summary['added_by_class']}")
        print(f"  - Golden test leakage: {summary['golden_test_leakage_count']} / {summary['golden_test_samples_checked']}")
        print(f"  - Summary JSON: {summary_path}")
        return 0

    except Exception as e:
        print(f"\n[FATAL ERROR] Integration failed: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
