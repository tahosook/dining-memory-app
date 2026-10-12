#!/usr/bin/env python3
"""
Automated Verification Script for MediaPipe Golden Test Set v2.

Verifies:
1. Manifest integrity:
   - Both JSONL and CSV exist and contain expected sample count (default: 106).
   - Records in JSONL and CSV match bidirectionally across golden_id, candidate_id, confirmed_label, sha256, filename.
2. Canonical labels.txt:
   - Exists and strictly matches the canonical 9 classes (no duplicate, missing, or extraneous classes).
3. Image file existence and bidirectional reconciliation:
   - All manifest images exist in test/<class>/ directories.
   - No extraneous images exist in test/ directories (exact set match).
   - Valid JPEG file structure (non-corrupted images).
4. Path safety:
   - Validates class labels, golden_id, and filenames to prevent path traversal outside test_dir.
5. Training data zero leakage (Fail-closed):
   - All expected baseline training partitions exist and contain expected count (default: 349).
   - 0 SHA-256 collision between Golden images and baseline training images.
6. Class count boundaries:
   - <= 20 per class, expected total count.

Usage:
    python3 scripts/verify-golden-dataset-v2.py
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any

CANONICAL_CLASSES = {
    "curry_rice",
    "drink",
    "fish_dish",
    "fried_dish",
    "meat_dish",
    "noodles",
    "other_or_exclude",
    "simmered_dish",
    "stir_fry",
}

SAFE_COMPONENT_PATTERN = re.compile(r"^[a-zA-Z0-9_\-\.]+$")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Verify Golden Test Set v2 integrity and zero leakage."
    )
    parser.add_argument(
        "--dataset-dir",
        type=str,
        default="state/mediapipe-dataset/golden_eval_v2",
        help="Path to Golden Test Set v2 directory (default: state/mediapipe-dataset/golden_eval_v2)",
    )
    parser.add_argument(
        "--expected-count",
        type=int,
        default=106,
        help="Expected total number of samples (default: 106)",
    )
    parser.add_argument(
        "--expected-train-count",
        type=int,
        default=349,
        help="Expected total unique training hashes (default: 349; set -1 to skip count check)",
    )
    parser.add_argument(
        "--allow-empty-classes",
        action="store_true",
        help="Allow classes with zero samples (useful for synthetic unit tests)",
    )
    parser.add_argument(
        "--skip-train-leak-check",
        action="store_true",
        help="Skip baseline training set leakage check (useful for isolated unit tests)",
    )
    return parser.parse_args()


def validate_path_safety(base_dir: Path, *components: str) -> tuple[bool, str]:
    """Ensure all components are safe and do not escape base_dir."""
    for c in components:
        if not c or not SAFE_COMPONENT_PATTERN.match(c) or ".." in c:
            return False, f"Unsafe path component detected: {c!r}"
    try:
        resolved_base = base_dir.resolve()
        target = (base_dir / Path(*components)).resolve()
        # Ensure target is strictly within resolved_base
        target.relative_to(resolved_base)
        return True, ""
    except Exception as e:
        return False, f"Path escape detected: {e}"


def verify_jpeg_health(path: Path) -> tuple[bool, str]:
    """Check if the JPEG file is valid and uncorrupted."""
    try:
        size = path.stat().st_size
        if size < 100:
            return False, f"File too small ({size} bytes)"
        with open(path, "rb") as f:
            header = f.read(2)
            if header != b"\xff\xd8":
                return False, "Invalid SOI marker (not JPEG)"
            f.seek(-2, os.SEEK_END)
            footer = f.read(2)
            if footer != b"\xff\xd9":
                return False, "Invalid EOI marker (truncated JPEG)"
        return True, "OK"
    except Exception as e:
        return False, f"Read error: {e}"


def collect_training_hashes(
    repo_root: Path, expected_count: int = 349
) -> tuple[dict[str, str], list[str]]:
    """Collect SHA-256 hashes of all known training images fail-closed.

    Returns (hashes_dict, error_list).
    """
    errors: list[str] = []
    train_dirs = [
        repo_root / "state/mediapipe-dataset/batch250_plus_agreed54/train",
        repo_root / "state/mediapipe-dataset/batch250_plus_pseudo74/train",
        repo_root / "state/mediapipe_labeling_runs/zip2-batch250/exported_dataset/train",
        repo_root / "state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset/train",
    ]

    for td in train_dirs:
        if not td.exists() or not td.is_dir():
            errors.append(f"Required baseline training directory missing: {td}")

    train_hashes: dict[str, str] = {}
    for td in train_dirs:
        if td.exists() and td.is_dir():
            for p in td.rglob("*.jpg"):
                sha = hashlib.sha256(p.read_bytes()).hexdigest()
                try:
                    rel_p = str(p.relative_to(repo_root))
                except ValueError:
                    rel_p = str(p)
                train_hashes[sha] = rel_p

    if expected_count >= 0 and len(train_hashes) != expected_count:
        errors.append(
            f"Baseline training hash count mismatch: expected {expected_count}, got {len(train_hashes)}. "
            "Fail-closed: cannot verify zero leakage without complete training baseline."
        )

    return train_hashes, errors


def verify_labels_txt(labels_path: Path) -> list[str]:
    """Verify that labels.txt matches CANONICAL_CLASSES exactly."""
    errors: list[str] = []
    if not labels_path.exists():
        return [f"Missing labels.txt at {labels_path}"]

    try:
        content = labels_path.read_text(encoding="utf-8").splitlines()
        labels = [line.strip() for line in content if line.strip()]
    except Exception as e:
        return [f"Failed to read labels.txt: {e}"]

    if len(labels) != len(set(labels)):
        duplicates = [l for l in labels if labels.count(l) > 1]
        errors.append(f"Duplicate classes in labels.txt: {sorted(set(duplicates))}")

    labels_set = set(labels)
    missing = CANONICAL_CLASSES - labels_set
    extraneous = labels_set - CANONICAL_CLASSES

    if missing:
        errors.append(f"labels.txt missing canonical classes: {sorted(missing)}")
    if extraneous:
        errors.append(f"labels.txt contains extraneous classes: {sorted(extraneous)}")

    return errors


def reconcile_manifests(
    records_jsonl: list[dict[str, Any]], records_csv: list[dict[str, str]]
) -> list[str]:
    """Bidirectionally reconcile records between JSONL and CSV."""
    errors: list[str] = []

    # Detect duplicate golden_ids within JSONL
    jsonl_by_id: dict[str, dict[str, Any]] = {}
    jsonl_duplicates: set[str] = set()
    for r in records_jsonl:
        gid = r.get("golden_id")
        if not gid:
            continue
        if gid in jsonl_by_id:
            jsonl_duplicates.add(gid)
        else:
            jsonl_by_id[gid] = r

    if jsonl_duplicates:
        errors.append(f"Duplicate golden_id found in JSONL manifest: {sorted(jsonl_duplicates)}")

    # Detect duplicate golden_ids within CSV
    csv_by_id: dict[str, dict[str, str]] = {}
    csv_duplicates: set[str] = set()
    for r in records_csv:
        gid = r.get("golden_id")
        if not gid:
            continue
        if gid in csv_by_id:
            csv_duplicates.add(gid)
        else:
            csv_by_id[gid] = r

    if csv_duplicates:
        errors.append(f"Duplicate golden_id found in CSV manifest: {sorted(csv_duplicates)}")

    jsonl_ids = set(jsonl_by_id.keys())
    csv_ids = set(csv_by_id.keys())

    missing_in_csv = jsonl_ids - csv_ids
    if missing_in_csv:
        errors.append(f"Records present in JSONL but missing in CSV: {sorted(missing_in_csv)}")

    missing_in_jsonl = csv_ids - jsonl_ids
    if missing_in_jsonl:
        errors.append(f"Records present in CSV but missing in JSONL: {sorted(missing_in_jsonl)}")

    fields_to_compare = ["candidate_id", "confirmed_label", "sha256", "filename"]
    for gid in sorted(jsonl_ids & csv_ids):
        r_json = jsonl_by_id[gid]
        r_csv = csv_by_id[gid]
        for field in fields_to_compare:
            v_json = str(r_json.get(field, "")).strip()
            v_csv = str(r_csv.get(field, "")).strip()
            if v_json != v_csv:
                errors.append(
                    f"{gid}: Mismatch in field {field!r} between JSONL ({v_json!r}) and CSV ({v_csv!r})"
                )

    return errors


def main() -> int:
    args = parse_args()
    repo_root = Path(__file__).resolve().parent.parent
    dataset_dir = repo_root / args.dataset_dir

    print("=" * 70)
    print("MediaPipe Golden Test Set v2 Verification")
    print(f"Target directory: {dataset_dir}")
    print("=" * 70)

    if not dataset_dir.exists():
        print(f"FAIL: Golden Test Set directory not found at: {dataset_dir}")
        return 1

    manifest_jsonl = dataset_dir / "manifest.jsonl"
    manifest_csv = dataset_dir / "manifest.csv"
    labels_txt = dataset_dir / "labels.txt"
    test_dir = dataset_dir / "test"

    errors: list[str] = []

    # 1. Manifest and label existence
    if not manifest_jsonl.exists():
        errors.append(f"Missing {manifest_jsonl}")
    if not manifest_csv.exists():
        errors.append(f"Missing {manifest_csv}")
    if not labels_txt.exists():
        errors.append(f"Missing {labels_txt}")
    if not test_dir.exists():
        errors.append(f"Missing test directory at {test_dir}")

    if errors:
        for err in errors:
            print(f"FAIL: {err}")
        return 1

    # 2. labels.txt validation against CANONICAL_CLASSES
    label_errors = verify_labels_txt(labels_txt)
    if label_errors:
        errors.extend(label_errors)
    else:
        print("✓ labels.txt matches canonical 9 classes exactly")

    # 3. Load manifests
    records_jsonl: list[dict[str, Any]] = []
    with open(manifest_jsonl, "r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, 1):
            line = line.strip()
            if not line:
                continue
            try:
                records_jsonl.append(json.loads(line))
            except json.JSONDecodeError as e:
                errors.append(f"JSON decode error in manifest.jsonl line {line_num}: {e}")

    records_csv: list[dict[str, str]] = []
    with open(manifest_csv, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        records_csv = list(reader)

    if len(records_jsonl) != args.expected_count:
        errors.append(
            f"Record count mismatch in JSONL: expected {args.expected_count}, got {len(records_jsonl)}"
        )
    if len(records_csv) != args.expected_count:
        errors.append(
            f"Record count mismatch in CSV: expected {args.expected_count}, got {len(records_csv)}"
        )

    # Reconcile JSONL vs CSV content
    manifest_content_errors = reconcile_manifests(records_jsonl, records_csv)
    if manifest_content_errors:
        errors.extend(manifest_content_errors)
    else:
        print(f"✓ Manifest files loaded and reconciled: {len(records_jsonl)} records")

    # 4. Check training leakage (Fail-closed)
    train_hashes: dict[str, str] = {}
    if not args.skip_train_leak_check:
        train_hashes, train_errors = collect_training_hashes(repo_root, args.expected_train_count)
        if train_errors:
            errors.extend(train_errors)
        else:
            print(f"✓ Collected {len(train_hashes)} unique training image hashes from baseline pools")
    else:
        print("ℹ Training set leak check skipped via --skip-train-leak-check")

    # 5. Verify images, path safety, and hash integrity
    class_counts = Counter()
    seen_shas = set()
    seen_gids = set()
    expected_image_paths: set[Path] = set()

    for r in records_jsonl:
        gid = r.get("golden_id", "")
        cid = r.get("candidate_id", "")
        lbl = r.get("confirmed_label", "")
        sha = r.get("sha256", "")
        fname = r.get("filename", "")

        # Check duplicate golden_id in records
        if gid:
            if gid in seen_gids:
                errors.append(f"{gid}: Duplicate golden_id in records")
            seen_gids.add(gid)

        # Path safety validation
        safe, safe_reason = validate_path_safety(test_dir, lbl, f"{gid}_{fname}")
        if not safe:
            errors.append(f"{gid}: {safe_reason}")
            continue

        # Check label validity
        if lbl not in CANONICAL_CLASSES:
            errors.append(f"{gid}: Invalid class '{lbl}'")
        class_counts[lbl] += 1

        # Check duplicate sha in Golden
        if sha in seen_shas:
            errors.append(f"{gid}: Duplicate SHA-256 within Golden set ({sha})")
        seen_shas.add(sha)

        # Check training leakage
        if not args.skip_train_leak_check and sha in train_hashes:
            errors.append(
                f"{gid}: DATA LEAKAGE! SHA-256 {sha} matches training image {train_hashes[sha]}"
            )

        # Check image existence on disk
        img_file = (test_dir / lbl / f"{gid}_{fname}").resolve()
        expected_image_paths.add(img_file)
        if not img_file.exists():
            errors.append(f"{gid}: Image file missing at {img_file}")
            continue

        # Check SHA-256 matches actual file on disk
        file_sha = hashlib.sha256(img_file.read_bytes()).hexdigest()
        if file_sha != sha:
            errors.append(f"{gid}: SHA-256 mismatch! Manifest={sha}, Actual={file_sha}")

        # Check JPEG validity
        healthy, reason = verify_jpeg_health(img_file)
        if not healthy:
            errors.append(f"{gid}: Corrupted image {img_file}: {reason}")

    # 6. Reconcile image files on disk against manifest (detect extraneous files)
    actual_image_files: set[Path] = set()
    for p in test_dir.rglob("*"):
        if p.is_file():
            actual_image_files.add(p.resolve())

    extraneous_files = actual_image_files - expected_image_paths
    if extraneous_files:
        errors.append(
            f"Extraneous files found in test directory not in manifest: "
            f"{[str(p.name) for p in sorted(extraneous_files)]}"
        )

    # 7. Check class counts
    print("\n--- Golden Test Set v2 Class Distribution ---")
    for c in sorted(CANONICAL_CLASSES):
        cnt = class_counts[c]
        print(f"  {c:<20}: {cnt:>2} / 20")
        if cnt > 20:
            errors.append(f"Class '{c}' exceeds maximum cap of 20 (got {cnt})")
        if cnt == 0 and not args.allow_empty_classes:
            errors.append(f"Class '{c}' has 0 samples")

    print("-" * 45)
    print(f"  {'TOTAL':<20}: {sum(class_counts.values())} / {args.expected_count}")

    if errors:
        print(f"\nFAILED: {len(errors)} error(s) detected:")
        for err in errors:
            print(f"  [ERROR] {err}")
        return 1

    print("\n========================================================")
    print("SUCCESS: Golden Test Set v2 passed all integrity checks!")
    print(f"- {len(records_jsonl)} verified images across 9 classes")
    print(f"- 100% SHA-256 match")
    print(f"- 0% training set leakage")
    print(f"- 0 extraneous or missing image files")
    print(f"- 0 corrupted images")
    print("========================================================")
    return 0


if __name__ == "__main__":
    sys.exit(main())
