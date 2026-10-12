#!/usr/bin/env python3
"""
Automated Verification Script for MediaPipe Golden Test Set v2.

Verifies:
1. Manifest integrity (both JSONL and CSV exist and contain 106 records).
2. Image file existence for all samples in test/<class>/ directories.
3. SHA-256 checksum integrity against manifest records.
4. Valid JPEG file structure (non-corrupted images).
5. Zero leakage / zero overlap against all baseline training data splits (349 images).
6. Label validity against the canonical 9 classes.
7. Class count boundaries (<= 20 per class, exactly 106 total).

Usage:
    python3 scripts/verify-golden-dataset-v2.py
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import sys
from collections import Counter
from pathlib import Path

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
        "--allow-empty-classes",
        action="store_true",
        help="Allow classes with zero samples (useful for synthetic unit tests)",
    )
    return parser.parse_args()


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


def collect_training_hashes(repo_root: Path) -> dict[str, str]:
    """Collect SHA-256 hashes of all known training images in the repo."""
    train_dirs = [
        repo_root / "state/mediapipe-dataset/batch250_plus_agreed54/train",
        repo_root / "state/mediapipe-dataset/batch250_plus_pseudo74/train",
        repo_root / "state/mediapipe_labeling_runs/zip2-batch250/exported_dataset/train",
        repo_root / "state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset/train",
    ]
    train_hashes = {}
    for td in train_dirs:
        if td.exists():
            for p in td.rglob("*.jpg"):
                sha = hashlib.sha256(p.read_bytes()).hexdigest()
                train_hashes[sha] = str(p.relative_to(repo_root))
    return train_hashes


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

    # 1. Manifest existence
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

    # Load JSONL manifest
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

    # Load CSV manifest
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

    print(f"✓ Manifest files loaded: {len(records_jsonl)} records")

    # 2. Check training leakage
    train_hashes = collect_training_hashes(repo_root)
    print(f"✓ Collected {len(train_hashes)} unique training image hashes from baseline pools")

    # 3. Verify each image
    class_counts = Counter()
    seen_shas = set()

    for r in records_jsonl:
        gid = r.get("golden_id", "")
        cid = r.get("candidate_id", "")
        lbl = r.get("confirmed_label", "")
        sha = r.get("sha256", "")
        fname = r.get("filename", "")

        # Check label validity
        if lbl not in CANONICAL_CLASSES:
            errors.append(f"{gid}: Invalid class '{lbl}'")
        class_counts[lbl] += 1

        # Check duplicate sha in Golden
        if sha in seen_shas:
            errors.append(f"{gid}: Duplicate SHA-256 within Golden set ({sha})")
        seen_shas.add(sha)

        # Check training leakage
        if sha in train_hashes:
            errors.append(
                f"{gid}: DATA LEAKAGE! SHA-256 {sha} matches training image {train_hashes[sha]}"
            )

        # Check image existence on disk
        img_file = test_dir / lbl / f"{gid}_{fname}"
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

    # 4. Check class counts
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
    print(f"- 106 verified images across 9 classes")
    print(f"- 100% SHA-256 match")
    print(f"- 0% training set leakage")
    print(f"- 0 corrupted images")
    print("========================================================")
    return 0


if __name__ == "__main__":
    sys.exit(main())
