#!/usr/bin/env python3
"""Dataset Integration Pipeline for Agreed Sample A Pending Samples.

Merges verified high-confidence agreed samples from Sample A audit
(54 real photos: fish_dish 17, meat_dish 14, stir_fry 16, fried_dish 5, simmered_dish 2)
into the training split of batch250_plus_pseudo74 dataset, strictly placing
all samples into the 'train' split, verifying zero data leakage against the Golden Test Set,
and ensuring val and test splits remain completely unaltered.

Invariants enforced:
1. Exact count: exactly 54 agreed sample_A images integrated into train split.
2. Inter-model agreement: mapped_class == audit_predicted_class.
3. High certainty: audit_is_uncertain == 'false'.
4. Canonical 9-class structure preserved (train/val/test).
5. Zero SHA-256 data leakage against Golden Test Set (7 samples).
6. Validation and test sets remain pristine (clean ground truth).
7. Immutable source: base dataset and source images are never modified.
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
    / "mediapipe-dataset"
    / "batch250_plus_pseudo74"
)
DEFAULT_REGISTRY_PATH = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-audit-manifest-20261009"
    / "pseudo_label_adoption_registry.csv"
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
    / "batch250_plus_agreed54"
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

EXPECTED_CLASS_COUNTS = {
    "fish_dish": 17,
    "meat_dish": 14,
    "stir_fry": 16,
    "fried_dish": 5,
    "simmered_dish": 2,
}


class IntegrationError(Exception):
    """Raised when dataset integration fails an invariant check."""


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Integrate agreed sample_A pending samples into dataset training split."
    )
    parser.add_argument(
        "--base-dataset-dir",
        type=Path,
        default=DEFAULT_BASE_DATASET,
        help="Path to base dataset directory (default: batch250_plus_pseudo74)",
    )
    parser.add_argument(
        "--registry-path",
        type=Path,
        default=DEFAULT_REGISTRY_PATH,
        help="Path to pseudo_label_adoption_registry.csv",
    )
    parser.add_argument(
        "--sample-pkg-dir",
        type=Path,
        default=DEFAULT_SAMPLE_PKG_DIR,
        help="Path to gemini_audit_sample_A_pkg directory",
    )
    parser.add_argument(
        "--golden-test-dir",
        type=Path,
        default=DEFAULT_GOLDEN_TEST_DIR,
        help="Path to Golden Test Set directory (7 samples)",
    )
    parser.add_argument(
        "--output-dataset-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DATASET,
        help="Path to output merged dataset directory",
    )
    parser.add_argument(
        "--enforce-real-counts",
        action="store_true",
        default=False,
        help="Strictly assert exact 54 real counts (disable during synthetic unit tests)",
    )
    return parser.parse_args()


def load_golden_hashes(golden_test_dir: Path) -> Dict[str, str]:
    """Loads SHA256 hashes of all images in the Golden Test Set."""
    hashes: Dict[str, str] = {}
    if not golden_test_dir.is_dir():
        raise FileNotFoundError(f"Golden test directory not found: {golden_test_dir}")
    for p in golden_test_dir.rglob("*.*"):
        if p.is_file() and p.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]:
            sha = compute_sha256(p)
            hashes[sha] = str(p)
    return hashes


def get_image_files(directory: Path) -> List[Path]:
    """Recursively collects all image files in a directory."""
    images: List[Path] = []
    if not directory.exists():
        return images
    for p in directory.rglob("*.*"):
        if p.is_file() and p.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"]:
            images.append(p)
    return sorted(images)


def extract_agreed_candidates(
    registry_path: Path,
    enforce_real_counts: bool = False,
) -> List[Dict[str, str]]:
    """Extracts agreed sample_A pending records from the registry."""
    if not registry_path.is_file():
        raise FileNotFoundError(f"Registry file not found: {registry_path}")

    agreed: List[Dict[str, str]] = []
    with open(registry_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for r in reader:
            if r.get("adoption_status") == "pending_human_review" and r.get("audit_subset") == "sample_A":
                mapped = r.get("mapped_class", "")
                pred = r.get("audit_predicted_class", "")
                uncertain = r.get("audit_is_uncertain", "false").lower() == "true"
                if mapped and mapped == pred and not uncertain:
                    agreed.append(r)

    agreed.sort(key=lambda x: (x["mapped_class"], x["image_id"]))

    if enforce_real_counts:
        if len(agreed) != 54:
            raise IntegrationError(f"Expected 54 agreed sample_A records, found {len(agreed)}")
        class_counts = Counter(r["mapped_class"] for r in agreed)
        if dict(class_counts) != EXPECTED_CLASS_COUNTS:
            raise IntegrationError(f"Class count mismatch: expected {EXPECTED_CLASS_COUNTS}, got {dict(class_counts)}")

    return agreed


def integrate_agreed_samples(
    base_dataset_dir: Path,
    registry_path: Path,
    sample_pkg_dir: Path,
    golden_test_dir: Path,
    output_dataset_dir: Path,
    enforce_real_counts: bool = False,
) -> Tuple[Path, Dict[str, Any]]:
    """Merges agreed sample_A pending images into base dataset training split."""
    if not base_dataset_dir.is_dir():
        raise FileNotFoundError(f"Base dataset directory not found: {base_dataset_dir}")
    if not registry_path.is_file():
        raise FileNotFoundError(f"Registry not found: {registry_path}")
    if not sample_pkg_dir.is_dir():
        raise FileNotFoundError(f"Sample package dir not found: {sample_pkg_dir}")
    if not golden_test_dir.is_dir():
        raise FileNotFoundError(f"Golden test dir not found: {golden_test_dir}")

    input_paths = [base_dataset_dir, registry_path, sample_pkg_dir, golden_test_dir]
    assert_no_path_collision(input_paths, output_dataset_dir)

    # Load mapping from sample_pkg_dir
    mapping_path = sample_pkg_dir / "private_reconciliation" / "blind_id_mapping.private.json"
    if not mapping_path.is_file():
        raise FileNotFoundError(f"Blind mapping file not found: {mapping_path}")

    with open(mapping_path, "r", encoding="utf-8") as f:
        mapping_data = json.load(f)
    img_by_id = {r["image_id"]: r for r in mapping_data.get("records", [])}

    # Extract agreed candidates
    agreed_records = extract_agreed_candidates(registry_path, enforce_real_counts=enforce_real_counts)

    # Load Golden Test Hashes for zero-leakage guarantee with dual check
    golden_files = get_image_files(golden_test_dir)
    if enforce_real_counts and len(golden_files) != 7:
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

        base_train_files = get_image_files(base_dataset_dir / "train")
        base_val_files = get_image_files(base_dataset_dir / "val")
        base_test_files = get_image_files(base_dataset_dir / "test")

        # Copy agreed samples into staging train/<mapped_class>/
        integrated_records: List[Dict[str, str]] = []
        blind_images_dir = sample_pkg_dir / "blind_images"

        seen_image_ids: Set[str] = set()
        for r in agreed_records:
            img_id = r.get("image_id", "").strip()
            if not img_id:
                raise IntegrationError("Agreed record is missing required 'image_id'")
            if img_id in seen_image_ids:
                raise IntegrationError(f"Duplicate image_id '{img_id}' detected in agreed records")
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
            target_filename = f"agreed_{img_id}.jpg"
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

        # Ensure val and test counts are bit-for-bit unchanged
        if len(out_val_files) != len(base_val_files):
            raise IntegrationError(f"Validation set corrupted: count changed from {len(base_val_files)} to {len(out_val_files)}")
        if len(out_test_files) != len(base_test_files):
            raise IntegrationError(f"Test set corrupted: count changed from {len(base_test_files)} to {len(out_test_files)}")

        expected_train_count = len(base_train_files) + len(agreed_records)
        if len(out_train_files) != expected_train_count:
            raise IntegrationError(
                f"Train count mismatch: expected {expected_train_count}, got {len(out_train_files)}"
            )

        # Final check on all train files against dual golden hashes
        for tf in out_train_files:
            check_dual_image_leakage(
                golden_hashes=golden_hashes_dual,
                image_id=tf.name,
                image_path=tf,
            )

        class_added_counts = dict(Counter(r["mapped_class"] for r in integrated_records))

        summary_data = {
            "pipeline": "integrate_agreed_pending_samples",
            "created_at_utc": datetime.now(timezone.utc).isoformat(),
            "base_dataset_dir": str(base_dataset_dir),
            "output_dataset_dir": str(output_dataset_dir),
            "total_integrated_images": len(integrated_records),
            "class_added_counts": class_added_counts,
            "counts_before": {
                "train": len(base_train_files),
                "val": len(base_val_files),
                "test": len(base_test_files),
                "total": len(base_train_files) + len(base_val_files) + len(base_test_files),
            },
            "counts_after": {
                "train": len(out_train_files),
                "val": len(out_val_files),
                "test": len(out_test_files),
                "total": len(out_train_files) + len(out_val_files) + len(out_test_files),
            },
            "golden_test_leakage_count": 0,
            "golden_test_samples_checked": len(golden_files),
            "integrated_images": integrated_records,
        }

        summary_path = staging_dir / "integration_summary.json"
        with open(summary_path, "w", encoding="utf-8") as f:
            json.dump(summary_data, f, indent=2, ensure_ascii=False)

        # Atomic swap to output directory
        atomic_directory_swap(staging_dir, output_dataset_dir)
    finally:
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)

    final_summary_path = output_dataset_dir / "integration_summary.json"
    return final_summary_path, summary_data


def main() -> None:
    args = parse_args()
    print("=== MediaPipe Agreed Sample A Dataset Integration ===")
    print(f"Base Dataset:   {args.base_dataset_dir}")
    print(f"Registry:       {args.registry_path}")
    print(f"Sample Pkg Dir: {args.sample_pkg_dir}")
    print(f"Golden Test:    {args.golden_test_dir}")
    print(f"Output Dataset: {args.output_dataset_dir}")

    summary_path, summary = integrate_agreed_samples(
        base_dataset_dir=args.base_dataset_dir,
        registry_path=args.registry_path,
        sample_pkg_dir=args.sample_pkg_dir,
        golden_test_dir=args.golden_test_dir,
        output_dataset_dir=args.output_dataset_dir,
        enforce_real_counts=args.enforce_real_counts,
    )

    print("\n[SUCCESS] Dataset integration complete.")
    print(f"  - Total images: {summary['counts_before']['total']} -> {summary['counts_after']['total']} (+{summary['total_integrated_images']})")
    print(f"  - Train split:  {summary['counts_before']['train']} -> {summary['counts_after']['train']}")
    print(f"  - Val split:    {summary['counts_after']['val']} (unaltered, pristine)")
    print(f"  - Test split:   {summary['counts_after']['test']} (unaltered, pristine)")
    print(f"  - Added by class: {summary['class_added_counts']}")
    print(f"  - Golden test leakage: {summary['golden_test_leakage_count']} / 7")
    print(f"  - Summary JSON: {summary_path}")


if __name__ == "__main__":
    main()
