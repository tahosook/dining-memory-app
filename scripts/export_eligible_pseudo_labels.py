#!/usr/bin/env python3
"""Deterministic Export and Verification Pipeline for Eligible Pseudo-Labels.

Extracts only 'candidate_eligible' images (74 samples: curry_rice 34 + drink 40)
from pseudo_label_adoption_registry.csv based on the finalized two-tier gate results,
mechanically guarantees zero contamination of blocked classes and unaudited candidates,
and exports an immutable training candidate manifest and verification summary.

Invariants strictly enforced:
1. adoption_status == 'candidate_eligible'
2. class_gate_status == 'passed'
3. audit_is_uncertain == 'false'
4. mapped_class == audit_predicted_class
5. mapped_class in {'curry_rice', 'drink'}
6. audit_subset == 'sample_A' (unaudited candidates strictly excluded)
7. Exact count: exactly 74 records (curry_rice: 34, drink: 40) for real registry
8. Deterministic ordering: sorted by (mapped_class, image_id)
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
    assert_no_path_collision,
    atomic_directory_swap,
)
from scripts.validate_zip2_audit_manifest import compute_sha256

DEFAULT_REGISTRY_PATH = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-audit-manifest-20261009"
    / "pseudo_label_adoption_registry.csv"
)
DEFAULT_MANIFEST_PATH = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-audit-manifest-20261009"
    / "image_audit_manifest_remediated.csv"
)
DEFAULT_OUTPUT_DIR = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-audit-manifest-20261009"
    / "eligible_pseudo_labels_export"
)

ALLOWED_PASSED_CLASSES: Set[str] = {"curry_rice", "drink"}
BLOCKED_CLASSES: Set[str] = {
    "fish_dish",
    "fried_dish",
    "meat_dish",
    "simmered_dish",
    "stir_fry",
}

EXPECTED_REAL_ELIGIBLE_TOTAL = 74
EXPECTED_REAL_CLASS_COUNTS = {
    "curry_rice": 34,
    "drink": 40,
}


class ContaminationError(RuntimeError):
    """Raised when an ineligible, blocked, or unaudited sample violates adoption invariants."""


def load_and_filter_eligible_records(
    registry_path: Path,
    manifest_path: Optional[Path] = None,
    enforce_real_counts: bool = False,
) -> Tuple[List[Dict[str, str]], Dict[str, Any]]:
    """Loads adoption registry and extracts only candidate_eligible records with strict invariant checks.

    Args:
        registry_path: Path to pseudo_label_adoption_registry.csv.
        manifest_path: Optional path to image_audit_manifest_remediated.csv for metadata enrichment.
        enforce_real_counts: If True, asserts total == 74 (curry_rice: 34, drink: 40).

    Returns:
        A tuple of (sorted_eligible_records, extraction_metrics).
    """
    if not registry_path.is_file():
        raise FileNotFoundError(f"Adoption registry not found: {registry_path}")

    registry_sha256 = compute_sha256(registry_path)

    manifest_lookup: Dict[str, Dict[str, str]] = {}
    if manifest_path and manifest_path.is_file():
        with open(manifest_path, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                manifest_lookup[row["image_id"]] = row

    all_rows: List[Dict[str, str]] = []
    with open(registry_path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            all_rows.append(row)

    total_registry_count = len(all_rows)
    status_counts = Counter(r.get("adoption_status", "") for r in all_rows)
    gate_counts = Counter(r.get("class_gate_status", "") for r in all_rows)

    eligible_records: List[Dict[str, str]] = []
    seen_ids: Set[str] = set()

    for idx, row in enumerate(all_rows, start=2):
        image_id = row.get("image_id", "").strip()
        mapped_class = row.get("mapped_class", "").strip()
        adoption_status = row.get("adoption_status", "").strip()
        class_gate_status = row.get("class_gate_status", "").strip()
        audit_subset = row.get("audit_subset", "").strip()
        audit_pred = row.get("audit_predicted_class", "").strip()
        is_uncertain = row.get("audit_is_uncertain", "").strip().lower()

        if not image_id:
            raise ValueError(f"Line {idx}: empty image_id in registry.")

        if adoption_status == "candidate_eligible":
            # Strict Invariant 1: Duplicate check
            if image_id in seen_ids:
                raise ContaminationError(f"Line {idx}: Duplicate image_id '{image_id}' found in eligible set.")
            seen_ids.add(image_id)

            # Strict Invariant 2: Class Gate Status MUST be 'passed'
            if class_gate_status != "passed":
                raise ContaminationError(
                    f"Line {idx} ({image_id}): candidate_eligible marked but class_gate_status is '{class_gate_status}'"
                )

            # Strict Invariant 3: Audit Uncertainty MUST be 'false'
            if is_uncertain != "false":
                raise ContaminationError(
                    f"Line {idx} ({image_id}): candidate_eligible marked but audit_is_uncertain is '{is_uncertain}'"
                )

            # Strict Invariant 4: Inter-model Agreement (mapped_class == audit_predicted_class)
            if mapped_class != audit_pred:
                raise ContaminationError(
                    f"Line {idx} ({image_id}): candidate_eligible marked but mapped_class '{mapped_class}' != audit_predicted '{audit_pred}'"
                )

            # Strict Invariant 5: Allowed Classes only
            if mapped_class not in ALLOWED_PASSED_CLASSES:
                raise ContaminationError(
                    f"Line {idx} ({image_id}): candidate_eligible marked for forbidden/blocked class '{mapped_class}'"
                )

            # Strict Invariant 6: Must be audited Sample A (unaudited strictly prohibited)
            if audit_subset != "sample_A":
                raise ContaminationError(
                    f"Line {idx} ({image_id}): candidate_eligible marked but audit_subset is '{audit_subset}' (unaudited leak!)"
                )

            # Invariant 7: Blocked class explicit check
            if mapped_class in BLOCKED_CLASSES:
                raise ContaminationError(
                    f"Line {idx} ({image_id}): Critical violation! Blocked class '{mapped_class}' reached eligible set."
                )

            # Merge manifest metadata if available
            manifest_row = manifest_lookup.get(image_id, {})
            source_path = row.get("source_path", "").strip() or manifest_row.get("source_path", "")

            eligible_records.append({
                "image_id": image_id,
                "source_path": source_path,
                "mapped_class": mapped_class,
                "audit_predicted_class": audit_pred,
                "audit_is_uncertain": is_uncertain,
                "audit_reason_code": row.get("audit_reason_code", "").strip(),
                "class_gate_status": class_gate_status,
                "adoption_status": adoption_status,
                "rejection_reason": row.get("rejection_reason", "").strip(),
                "spec_version": row.get("spec_version", "v2").strip(),
                "original_primary_dish_key": manifest_row.get("primary_dish_key", ""),
                "original_analysis_confidence": manifest_row.get("analysis_confidence", ""),
            })

    # Sort deterministically by (mapped_class, image_id)
    eligible_records.sort(key=lambda r: (r["mapped_class"], r["image_id"]))

    class_distribution = Counter(r["mapped_class"] for r in eligible_records)

    # Invariant 8: Real counts assertion if requested
    if enforce_real_counts:
        if len(eligible_records) != EXPECTED_REAL_ELIGIBLE_TOTAL:
            raise ContaminationError(
                f"Expected exactly {EXPECTED_REAL_ELIGIBLE_TOTAL} eligible records, got {len(eligible_records)}"
            )
        for cls, expected_n in EXPECTED_REAL_CLASS_COUNTS.items():
            actual_n = class_distribution.get(cls, 0)
            if actual_n != expected_n:
                raise ContaminationError(
                    f"Class count mismatch for '{cls}': expected {expected_n}, got {actual_n}"
                )

    metrics = {
        "registry_sha256": registry_sha256,
        "total_registry_count": total_registry_count,
        "registry_adoption_status_counts": dict(status_counts),
        "registry_class_gate_counts": dict(gate_counts),
        "eligible_count": len(eligible_records),
        "class_distribution": dict(class_distribution),
        "blocked_classes_contamination_count": sum(class_distribution.get(c, 0) for c in BLOCKED_CLASSES),
        "unaudited_contamination_count": sum(1 for r in eligible_records if r.get("audit_subset") == "unaudited"),
    }

    return eligible_records, metrics


def export_eligible_pseudo_labels(
    registry_path: Path,
    manifest_path: Optional[Path],
    output_dir: Path,
    images_dir: Optional[Path] = None,
    copy_images: bool = False,
    enforce_real_counts: bool = False,
) -> Tuple[Path, Path, Optional[Path]]:
    """Exports eligible pseudo labels manifest and summary JSON, and optionally copies verified images.

    Returns:
        (manifest_csv_path, summary_json_path, exported_images_dir or None)
    """
    input_paths = [registry_path]
    if manifest_path:
        input_paths.append(manifest_path)
    if images_dir:
        input_paths.append(images_dir)
    assert_no_path_collision(input_paths, output_dir)

    eligible_records, metrics = load_and_filter_eligible_records(
        registry_path=registry_path,
        manifest_path=manifest_path,
        enforce_real_counts=enforce_real_counts,
    )

    exported_at = datetime.now(timezone.utc).isoformat()

    output_dir.parent.mkdir(parents=True, exist_ok=True)
    staging_dir = output_dir.parent / f".tmp_{output_dir.name}_{uuid.uuid4().hex[:8]}"
    staging_dir.mkdir(parents=True, exist_ok=False)

    try:
        # 1. Write Eligible Manifest CSV to staging
        manifest_csv_path = staging_dir / "eligible_pseudo_labels_manifest.csv"
        fieldnames = [
            "image_id",
            "source_path",
            "mapped_class",
            "audit_predicted_class",
            "audit_is_uncertain",
            "class_gate_status",
            "adoption_status",
            "original_primary_dish_key",
            "original_analysis_confidence",
            "spec_version",
            "exported_at",
        ]

        with open(manifest_csv_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            for r in eligible_records:
                writer.writerow({
                    "image_id": r["image_id"],
                    "source_path": r["source_path"],
                    "mapped_class": r["mapped_class"],
                    "audit_predicted_class": r["audit_predicted_class"],
                    "audit_is_uncertain": r["audit_is_uncertain"],
                    "class_gate_status": r["class_gate_status"],
                    "adoption_status": r["adoption_status"],
                    "original_primary_dish_key": r["original_primary_dish_key"],
                    "original_analysis_confidence": r["original_analysis_confidence"],
                    "spec_version": r["spec_version"],
                    "exported_at": exported_at,
                })

        manifest_sha256 = compute_sha256(manifest_csv_path)

        # 2. Copy and verify images if requested
        exported_images_dir: Optional[Path] = None
        copied_count = 0
        if copy_images and images_dir:
            exported_images_dir = staging_dir / "images"
            exported_images_dir.mkdir(parents=True, exist_ok=True)

            for r in eligible_records:
                source_file = images_dir / r["source_path"]
                if not source_file.is_file():
                    # Try finding by image_id or direct filename
                    alt_file = images_dir / f"{r['image_id']}.jpg"
                    if alt_file.is_file():
                        source_file = alt_file
                    else:
                        raise FileNotFoundError(
                            f"Image file not found for {r['image_id']}: checked {source_file} and {alt_file}"
                        )

                target_file = exported_images_dir / f"{r['image_id']}.jpg"
                shutil.copy2(source_file, target_file)

                # Verify hash match
                src_hash = compute_sha256(source_file)
                tgt_hash = compute_sha256(target_file)
                if src_hash != tgt_hash:
                    raise RuntimeError(
                        f"Image copy hash corruption for {r['image_id']}: {src_hash} != {tgt_hash}"
                    )
                copied_count += 1

            actual_copied_images = len(list(exported_images_dir.glob("*.jpg")))
            if actual_copied_images != len(eligible_records):
                raise RuntimeError(
                    f"Copied image count mismatch: expected {len(eligible_records)}, got {actual_copied_images}"
                )

        # 3. Write Export Summary JSON to staging
        summary_json_path = staging_dir / "export_summary.json"
        final_manifest_path = output_dir / "eligible_pseudo_labels_manifest.csv"
        summary_data = {
            "status": "success",
            "exported_at": exported_at,
            "manifest_path": str(
                final_manifest_path.relative_to(_REPO_ROOT)
                if final_manifest_path.is_relative_to(_REPO_ROOT)
                else final_manifest_path
            ),
            "manifest_sha256": manifest_sha256,
            "eligible_sample_count": len(eligible_records),
            "class_distribution": metrics["class_distribution"],
            "blocked_classes_contamination_count": metrics["blocked_classes_contamination_count"],
            "unaudited_contamination_count": metrics["unaudited_contamination_count"],
            "registry_source_sha256": metrics["registry_sha256"],
            "registry_total_candidates": metrics["total_registry_count"],
            "copied_images_count": copied_count if copy_images else 0,
            "invariants_enforced": [
                "adoption_status == candidate_eligible",
                "class_gate_status == passed",
                "audit_is_uncertain == false",
                "mapped_class == audit_predicted_class",
                "mapped_class in {curry_rice, drink}",
                "audit_subset == sample_A",
                "blocked_classes == 0",
                "deterministic_sort_by_class_and_id",
            ],
        }

        with open(summary_json_path, "w", encoding="utf-8") as f:
            json.dump(summary_data, f, indent=2, ensure_ascii=False)

        # 4. Atomic directory swap
        atomic_directory_swap(staging_dir, output_dir)
    finally:
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)

    final_manifest_csv = output_dir / "eligible_pseudo_labels_manifest.csv"
    final_summary_json = output_dir / "export_summary.json"
    final_images_dir = (output_dir / "images") if copy_images and images_dir else None
    return final_manifest_csv, final_summary_json, final_images_dir


def parse_args(argv: Optional[List[str]] = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Deterministic export pipeline for eligible pseudo-labels."
    )
    parser.add_argument(
        "--registry",
        type=Path,
        default=DEFAULT_REGISTRY_PATH,
        help="Path to pseudo_label_adoption_registry.csv",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=DEFAULT_MANIFEST_PATH,
        help="Path to image_audit_manifest_remediated.csv (optional for metadata)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help="Output directory for exported manifest and summary",
    )
    parser.add_argument(
        "--images-dir",
        type=Path,
        default=None,
        help="Source directory containing images (optional, for copy verification)",
    )
    parser.add_argument(
        "--copy-images",
        action="store_true",
        help="If set with --images-dir, copies images and verifies SHA-256",
    )
    parser.add_argument(
        "--enforce-real-counts",
        action="store_true",
        help="Strictly assert exactly 74 records (34 curry_rice + 40 drink)",
    )
    return parser.parse_args(argv)


def main(argv: Optional[List[str]] = None) -> int:
    args = parse_args(argv)

    print("=== Export Eligible Pseudo-Labels Pipeline ===")
    print(f"Registry:    {args.registry}")
    print(f"Manifest:    {args.manifest}")
    print(f"Output Dir:  {args.output_dir}")

    try:
        manifest_csv, summary_json, images_dir = export_eligible_pseudo_labels(
            registry_path=args.registry,
            manifest_path=args.manifest if args.manifest.is_file() else None,
            output_dir=args.output_dir,
            images_dir=args.images_dir,
            copy_images=args.copy_images,
            enforce_real_counts=args.enforce_real_counts,
        )

        with open(summary_json, "r", encoding="utf-8") as f:
            summary = json.load(f)

        print(f"\n[SUCCESS] Exported {summary['eligible_sample_count']} eligible records.")
        print(f"  - Manifest CSV:    {manifest_csv}")
        print(f"  - Manifest SHA256: {summary['manifest_sha256']}")
        print(f"  - Summary JSON:    {summary_json}")
        print(f"  - Class breakdown: {summary['class_distribution']}")
        print(f"  - Blocked classes contamination: {summary['blocked_classes_contamination_count']}")
        print(f"  - Unaudited contamination:       {summary['unaudited_contamination_count']}")
        if images_dir:
            print(f"  - Images copied:   {summary['copied_images_count']} to {images_dir}")
        return 0

    except Exception as e:
        print(f"\n[FATAL ERROR] Export failed: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
