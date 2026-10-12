#!/usr/bin/env python3
"""Deterministic sampling and metadata stripping for MediaPipe Gemini Audit Phase 1.

Extracts a balanced, deterministic 70-image sample (10 per class x 7 classes)
from image_audit_manifest_remediated.csv, verifies against evaluation dataset leaks,
and prepares privacy-safe (EXIF-stripped) JPEG images for local inspection.

NOTE: This script does NOT send any data to external APIs.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import random
import struct
import subprocess
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.validate_zip2_audit_manifest import (
    compute_sha256,
    extract_exif_dates,
)

EXPECTED_REMEDIATED_MANIFEST_SHA256 = (
    "ef66c8df690ba558d3f7cf08e75746a155608af0cff643a480df85aa3482cc30"
)

TARGET_CLASSES = [
    "curry_rice",
    "drink",
    "fish_dish",
    "fried_dish",
    "meat_dish",
    "simmered_dish",
    "stir_fry",
]


def strip_jpeg_metadata(input_path: Path, output_path: Path) -> None:
    """Read a JPEG image, strip all APP1-APP15 and COM metadata, and write clean JPEG."""
    data = input_path.read_bytes()
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        raise ValueError(f"Not a valid JPEG file: {input_path}")

    output = bytearray(b"\xff\xd8")
    idx = 2
    length_data = len(data)

    while idx < length_data - 1:
        if data[idx] != 0xFF:
            # Reached entropy-coded scan data after SOS
            output.extend(data[idx:])
            break

        # Skip repeated 0xFF padding
        while idx < length_data - 1 and data[idx] == 0xFF:
            idx += 1
        marker = data[idx]
        idx += 1

        if marker == 0xD9:  # EOI
            output.extend(b"\xff\xd9")
            break
        elif marker in (0xD0, 0xD1, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0x01):  # RST or TEM
            output.extend(bytes([0xFF, marker]))
            continue

        if idx + 2 > length_data:
            break
        seg_len = struct.unpack(">H", data[idx : idx + 2])[0]

        # Metadata markers to strip:
        # APP1 (0xE1: Exif, XMP), APP2..APP15 (0xE2..0xEF), COM (0xFE)
        is_metadata = (0xE1 <= marker <= 0xEF) or (marker == 0xFE)

        if not is_metadata:
            output.extend(bytes([0xFF, marker]))
            output.extend(data[idx : idx + seg_len])

        idx += seg_len

        if marker == 0xDA:  # SOS (Start of Scan) - rest is entropy data
            output.extend(data[idx:])
            break

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_bytes(output)


def get_git_info() -> tuple[str | None, bool | None]:
    """Retrieve current Git commit hash and dirty status safely."""
    commit_sha = None
    is_dirty = None
    try:
        res = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            check=True,
        )
        commit_sha = res.stdout.strip()
    except Exception:
        commit_sha = None

    try:
        status_res = subprocess.run(
            ["git", "status", "--porcelain"],
            capture_output=True,
            text=True,
            check=True,
        )
        is_dirty = len(status_res.stdout.strip()) > 0
    except Exception:
        is_dirty = None

    return commit_sha, is_dirty


EXPECTED_GOLDEN_EVAL_COUNT = 7
EXPECTED_BATCH250_VAL_COUNT = 33
EXPECTED_BATCH250_TEST_COUNT = 33
EXPECTED_PROTECTED_EVAL_COUNT = 73
EXPECTED_BASELINE_TRAIN_COUNT = 190


class GeminiAuditSampler:
    """Deterministic sampler and preparation tool for MediaPipe Gemini audit."""

    def __init__(
        self,
        manifest_csv: Path,
        image_dir: Path,
        batch250_dir: Path | None = None,
        golden_eval_dir: Path | None = None,
        expected_manifest_sha256: str = EXPECTED_REMEDIATED_MANIFEST_SHA256,
        expected_golden_count: int | None = None,
        expected_val_count: int | None = None,
        expected_test_count: int | None = None,
        expected_eval_count: int | None = None,
        expected_baseline_train_count: int | None = None,
        samples_per_class: int = 10,
        seed: int = 20261010,
    ):
        self.manifest_csv = manifest_csv
        self.image_dir = image_dir
        self.batch250_dir = batch250_dir
        self.golden_eval_dir = golden_eval_dir
        self.expected_manifest_sha256 = expected_manifest_sha256
        self.expected_golden_count = expected_golden_count
        self.expected_val_count = expected_val_count
        self.expected_test_count = expected_test_count
        self.expected_eval_count = expected_eval_count
        self.expected_baseline_train_count = expected_baseline_train_count
        self.samples_per_class = samples_per_class
        self.seed = seed

    def sample(self, require_leak_check: bool = True) -> dict[str, Any]:
        """Perform verified deterministic sampling."""
        # 1. Verify manifest SHA256
        if not self.manifest_csv.is_file():
            raise FileNotFoundError(f"Manifest not found: {self.manifest_csv}")

        actual_manifest_sha256 = compute_sha256(self.manifest_csv)
        if self.expected_manifest_sha256 and actual_manifest_sha256 != self.expected_manifest_sha256:
            raise ValueError(
                f"Manifest SHA-256 mismatch!\n"
                f"Expected: {self.expected_manifest_sha256}\n"
                f"Actual:   {actual_manifest_sha256}"
            )

        # 2. Collect evaluation & baseline protected files and hashes to prevent leak
        golden_files: list[Path] = []
        val_files: list[Path] = []
        test_files: list[Path] = []
        baseline_train_files: list[Path] = []

        golden_hashes: set[str] = set()
        val_hashes: set[str] = set()
        test_hashes: set[str] = set()
        baseline_train_hashes: set[str] = set()

        if self.golden_eval_dir and self.golden_eval_dir.is_dir():
            golden_files = sorted(self.golden_eval_dir.glob("test/*/*.jpg"))
            for p in golden_files:
                try:
                    golden_hashes.add(compute_sha256(p))
                except Exception as e:
                    raise RuntimeError(f"Failed to read/hash golden eval image {p}: {e}") from e

        if self.batch250_dir and self.batch250_dir.is_dir():
            val_files = sorted((self.batch250_dir / "val").glob("*/*.jpg"))
            for p in val_files:
                try:
                    val_hashes.add(compute_sha256(p))
                except Exception as e:
                    raise RuntimeError(f"Failed to read/hash batch250 val image {p}: {e}") from e
            test_files = sorted((self.batch250_dir / "test").glob("*/*.jpg"))
            for p in test_files:
                try:
                    test_hashes.add(compute_sha256(p))
                except Exception as e:
                    raise RuntimeError(f"Failed to read/hash batch250 test image {p}: {e}") from e
            baseline_train_files = sorted((self.batch250_dir / "train").glob("*/*.jpg"))
            for p in baseline_train_files:
                try:
                    baseline_train_hashes.add(compute_sha256(p))
                except Exception as e:
                    raise RuntimeError(f"Failed to read/hash baseline train image {p}: {e}") from e

        eval_hashes = golden_hashes | val_hashes | test_hashes
        eval_files_count = len(golden_files) + len(val_files) + len(test_files)

        if require_leak_check:
            if not self.golden_eval_dir or not self.golden_eval_dir.is_dir() or len(eval_hashes) == 0:
                raise RuntimeError(
                    f"Golden evaluation dataset missing or empty: {self.golden_eval_dir}. "
                    "Fail-closed: cannot verify anti-leak protection without valid evaluation images."
                )
            if not self.batch250_dir or not self.batch250_dir.is_dir() or len(baseline_train_hashes) == 0:
                raise RuntimeError(
                    f"Baseline dataset missing or empty: {self.batch250_dir}. "
                    "Fail-closed: cannot verify anti-leak protection without baseline images."
                )
            if not self.image_dir or not self.image_dir.is_dir():
                raise FileNotFoundError(
                    f"Candidate image directory missing or inaccessible: {self.image_dir}. "
                    "Fail-closed: real image verification requires valid image directory."
                )

            if self.expected_golden_count is not None:
                if len(golden_files) != self.expected_golden_count:
                    raise RuntimeError(
                        f"Golden evaluation dataset count mismatch: expected {self.expected_golden_count}, "
                        f"got {len(golden_files)} files (file count mismatch). "
                        "Fail-closed: all golden evaluation images must be present without missing or extraneous files."
                    )
                if len(golden_hashes) != len(golden_files):
                    raise RuntimeError(
                        f"Duplicate files detected in Golden evaluation dataset: "
                        f"{len(golden_files)} files found but only {len(golden_hashes)} unique SHA-256 hashes. "
                        "Fail-closed: duplicate images are strictly rejected."
                    )
                if len(golden_hashes) != self.expected_golden_count:
                    raise RuntimeError(
                        f"Golden evaluation dataset count mismatch: expected {self.expected_golden_count}, "
                        f"got {len(golden_hashes)} unique hashes. "
                        "Fail-closed: all golden evaluation images must be present."
                    )

            if self.expected_val_count is not None:
                if len(val_files) != self.expected_val_count:
                    raise RuntimeError(
                        f"batch250 validation dataset count mismatch: expected {self.expected_val_count}, "
                        f"got {len(val_files)} files (file count mismatch). "
                        "Fail-closed: all batch250 validation images must be present without missing or extraneous files."
                    )
                if len(val_hashes) != len(val_files):
                    raise RuntimeError(
                        f"Duplicate files detected in batch250 validation dataset: "
                        f"{len(val_files)} files found but only {len(val_hashes)} unique SHA-256 hashes. "
                        "Fail-closed: duplicate images are strictly rejected."
                    )
                if len(val_hashes) != self.expected_val_count:
                    raise RuntimeError(
                        f"batch250 validation dataset count mismatch: expected {self.expected_val_count}, "
                        f"got {len(val_hashes)} unique hashes. "
                        "Fail-closed: all batch250 validation images must be present."
                    )

            if self.expected_test_count is not None:
                if len(test_files) != self.expected_test_count:
                    raise RuntimeError(
                        f"batch250 test dataset count mismatch: expected {self.expected_test_count}, "
                        f"got {len(test_files)} files (file count mismatch). "
                        "Fail-closed: all batch250 test images must be present without missing or extraneous files."
                    )
                if len(test_hashes) != len(test_files):
                    raise RuntimeError(
                        f"Duplicate files detected in batch250 test dataset: "
                        f"{len(test_files)} files found but only {len(test_hashes)} unique SHA-256 hashes. "
                        "Fail-closed: duplicate images are strictly rejected."
                    )
                if len(test_hashes) != self.expected_test_count:
                    raise RuntimeError(
                        f"batch250 test dataset count mismatch: expected {self.expected_test_count}, "
                        f"got {len(test_hashes)} unique hashes. "
                        "Fail-closed: all batch250 test images must be present."
                    )

            if self.expected_eval_count is not None:
                if eval_files_count != self.expected_eval_count:
                    raise RuntimeError(
                        f"Protected evaluation dataset count mismatch: expected {self.expected_eval_count}, "
                        f"got {eval_files_count} files (file count mismatch). "
                        "Fail-closed: all protected evaluation images must be present."
                    )
                if len(eval_hashes) != self.expected_eval_count:
                    raise RuntimeError(
                        f"Protected evaluation dataset count mismatch: expected {self.expected_eval_count}, "
                        f"got {len(eval_hashes)} unique hashes. "
                        "Fail-closed: all protected evaluation images must be present."
                    )

            if self.expected_baseline_train_count is not None:
                if len(baseline_train_files) != self.expected_baseline_train_count:
                    raise RuntimeError(
                        f"Baseline training dataset count mismatch: expected {self.expected_baseline_train_count}, "
                        f"got {len(baseline_train_files)} files (file count mismatch). "
                        "Fail-closed: all baseline training images must be present without missing or extraneous files."
                    )
                if len(baseline_train_hashes) != len(baseline_train_files):
                    raise RuntimeError(
                        f"Duplicate files detected in baseline training dataset: "
                        f"{len(baseline_train_files)} files found but only {len(baseline_train_hashes)} unique SHA-256 hashes. "
                        "Fail-closed: duplicate images are strictly rejected."
                    )
                if len(baseline_train_hashes) != self.expected_baseline_train_count:
                    raise RuntimeError(
                        f"Baseline training dataset count mismatch: expected {self.expected_baseline_train_count}, "
                        f"got {len(baseline_train_hashes)} unique hashes. "
                        "Fail-closed: all baseline training images must be present."
                    )

        # 3. Read manifest and filter candidate pool
        with open(self.manifest_csv, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            fieldnames = list(reader.fieldnames or [])
            all_rows = list(reader)

        # Strict candidate filtering
        candidate_rows = [
            r for r in all_rows if r.get("assigned_role") == "pseudo_label_candidate"
        ]

        class_pools: dict[str, list[dict[str, str]]] = defaultdict(list)
        for r in candidate_rows:
            cls_name = r.get("mapped_class", "")
            if cls_name in TARGET_CLASSES:
                class_pools[cls_name].append(r)

        population_counts = {cls_name: len(class_pools[cls_name]) for cls_name in TARGET_CLASSES}

        # Check sufficiency
        for cls_name in TARGET_CLASSES:
            if len(class_pools[cls_name]) < self.samples_per_class:
                raise ValueError(
                    f"Insufficient candidates for class '{cls_name}': "
                    f"available {len(class_pools[cls_name])}, required {self.samples_per_class}"
                )

        # 4. Deterministic Stratified Sampling
        # Initialize PRNG with fixed seed
        rng = random.Random(self.seed)

        sampled_rows: list[dict[str, str]] = []

        # Sort classes alphabetically to ensure fixed execution order across platforms
        for cls_name in sorted(TARGET_CLASSES):
            pool = class_pools[cls_name]
            # Deterministic sorting within pool using unique tuple
            pool_sorted = sorted(pool, key=lambda x: (x["image_id"], x["source_path"]))
            # Sample exactly samples_per_class items
            selected = rng.sample(pool_sorted, self.samples_per_class)
            sampled_rows.extend(selected)

        # 5. Anti-leak verification against real files
        sampled_hashes: dict[str, str] = {}
        leak_check_performed = False

        if self.image_dir and self.image_dir.is_dir():
            for r in sampled_rows:
                sp = r["source_path"]
                img_path = self.image_dir / sp
                if not img_path.is_file():
                    if require_leak_check:
                        raise FileNotFoundError(f"Required candidate image missing: {img_path}")
                    continue
                h = compute_sha256(img_path)
                sampled_hashes[sp] = h
                if len(eval_hashes) > 0 and h in eval_hashes:
                    raise RuntimeError(
                        f"CRITICAL LEAK: Sampled image {sp} (SHA: {h}) matches protected evaluation dataset!"
                    )
                if len(baseline_train_hashes) > 0 and h in baseline_train_hashes:
                    raise RuntimeError(
                        f"CRITICAL LEAK: Sampled image {sp} (SHA: {h}) matches baseline train dataset!"
                    )
            leak_check_performed = (len(sampled_hashes) == len(sampled_rows)) and (len(eval_hashes) > 0)

        # Check total count and uniqueness
        assert len(sampled_rows) == len(TARGET_CLASSES) * self.samples_per_class
        unique_sp = {r["source_path"] for r in sampled_rows}
        assert len(unique_sp) == len(sampled_rows), "Duplicate images in sample!"

        # Assign deterministic 1-based sequential blind IDs: blind_001 .. blind_070
        for idx, r in enumerate(sampled_rows, 1):
            r["blind_id"] = f"blind_{idx:03d}"
            r["blind_image_file"] = f"blind_{idx:03d}.jpg"

        git_commit, is_git_dirty = get_git_info()

        return {
            "fieldnames": fieldnames,
            "sampled_rows": sampled_rows,
            "population_counts": population_counts,
            "sampled_hashes": sampled_hashes,
            "manifest_sha256": actual_manifest_sha256,
            "git_commit": git_commit,
            "is_git_dirty": is_git_dirty,
            "leak_check_performed": leak_check_performed,
        }

    def export(
        self,
        output_dir: Path,
        strip_images: bool = True,
        force: bool = False,
        require_leak_check: bool = True,
    ) -> dict[str, Any]:
        """Sample and export CSV, JSONL, metadata, and optional stripped images."""
        if output_dir.exists() and any(output_dir.iterdir()) and not force:
            raise FileExistsError(
                f"Output directory {output_dir} is not empty. Refusing to overwrite without --force."
            )

        output_dir.mkdir(parents=True, exist_ok=True)

        sample_res = self.sample(require_leak_check=require_leak_check)
        sampled_rows = sample_res["sampled_rows"]
        fieldnames = sample_res["fieldnames"]

        # 1. Output sample_manifest.csv (internal management manifest)
        csv_out_path = output_dir / "sample_manifest.csv"
        with open(csv_out_path, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            # Write rows with original fieldnames (exclude extra helper keys)
            writer.writerows([{k: r.get(k, "") for k in fieldnames} for r in sampled_rows])
        csv_sha256 = compute_sha256(csv_out_path)

        # 2. Output sample_manifest.jsonl (internal management jsonl)
        jsonl_out_path = output_dir / "sample_manifest.jsonl"
        with open(jsonl_out_path, "w", encoding="utf-8") as f:
            for r in sampled_rows:
                rec = {
                    "image_id": r["image_id"],
                    "source_path": r["source_path"],
                    "mapped_class": r["mapped_class"],
                    "primary_dish_key": r.get("primary_dish_key", ""),
                    "analysis_confidence": float(r.get("analysis_confidence", 0.0) or 0.0),
                    "assigned_role": r["assigned_role"],
                    "image_sha256": sample_res["sampled_hashes"].get(r["source_path"], ""),
                }
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        jsonl_sha256 = compute_sha256(jsonl_out_path)

        # 3. Output blind_request_inputs.jsonl (minimal, blind request format)
        # MUST NOT contain mapped_class, primary_dish_key, source_path, image_id, timestamps!
        blind_inputs_path = output_dir / "blind_request_inputs.jsonl"
        with open(blind_inputs_path, "w", encoding="utf-8") as f:
            for r in sampled_rows:
                blind_rec = {
                    "blind_id": r["blind_id"],
                    "image_file": r["blind_image_file"],
                }
                f.write(json.dumps(blind_rec, ensure_ascii=False) + "\n")
        blind_inputs_sha256 = compute_sha256(blind_inputs_path)

        # 4. Output blind_id_mapping.private.json (isolated local reconciliation mapping)
        mapping_records = []
        for r in sampled_rows:
            mapping_records.append({
                "blind_id": r["blind_id"],
                "blind_image_file": r["blind_image_file"],
                "image_id": r["image_id"],
                "source_path": r["source_path"],
                "mapped_class": r["mapped_class"],
                "primary_dish_key": r.get("primary_dish_key", ""),
                "analysis_confidence": float(r.get("analysis_confidence", 0.0) or 0.0),
                "assigned_role": r["assigned_role"],
                "image_sha256": sample_res["sampled_hashes"].get(r["source_path"], ""),
            })

        mapping_out_path = output_dir / "blind_id_mapping.private.json"
        mapping_data = {
            "mapping_version": "1.0.0",
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "total_records": len(mapping_records),
            "records": mapping_records,
        }
        mapping_out_path.write_text(
            json.dumps(mapping_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        mapping_sha256 = compute_sha256(mapping_out_path)

        # 5. Output stripped images (internal naming) and blind images (anonymous naming)
        stripped_count = 0
        blind_images_count = 0
        blind_images_sha256_manifest: dict[str, str] = {}

        if strip_images and self.image_dir.is_dir():
            stripped_dir = output_dir / "stripped_images"
            stripped_dir.mkdir(parents=True, exist_ok=True)

            blind_dir = output_dir / "blind_images"
            blind_dir.mkdir(parents=True, exist_ok=True)

            for r in sampled_rows:
                sp = r["source_path"]
                src_img = self.image_dir / sp
                dst_img = stripped_dir / f"{r['image_id']}.jpg"
                strip_jpeg_metadata(src_img, dst_img)

                # Verify that no EXIF dates exist in stripped image
                exif_dates = extract_exif_dates(dst_img)
                if exif_dates:
                    raise RuntimeError(
                        f"Failed to completely strip metadata from {dst_img}: remaining EXIF: {exif_dates}"
                    )
                stripped_count += 1

                # Create blind image (identical stripped content, anonymous name blind_XXX.jpg)
                blind_dst_img = blind_dir / r["blind_image_file"]
                blind_dst_img.write_bytes(dst_img.read_bytes())
                blind_h = compute_sha256(blind_dst_img)
                blind_images_sha256_manifest[r["blind_id"]] = blind_h
                blind_images_count += 1

        # 6. Output provenance_metadata.json
        meta = {
            "metadata_version": "1.1.0",
            "generated_at": datetime.utcnow().isoformat() + "Z",
            "git_commit": sample_res["git_commit"],
            "is_git_dirty": sample_res["is_git_dirty"],
            "python_version": sys.version.split()[0],
            "input_manifest": {
                "path": str(self.manifest_csv),
                "sha256": sample_res["manifest_sha256"],
            },
            "sampling_parameters": {
                "seed": self.seed,
                "prng_type": "python_standard_random_Random",
                "sorting_keys": ["mapped_class_alphabetical", "image_id", "source_path"],
                "target_classes": TARGET_CLASSES,
                "samples_per_class": self.samples_per_class,
                "total_samples": len(sampled_rows),
            },
            "population_counts": sample_res["population_counts"],
            "output_artifacts": {
                "csv_path": "sample_manifest.csv",
                "csv_sha256": csv_sha256,
                "jsonl_path": "sample_manifest.jsonl",
                "jsonl_sha256": jsonl_sha256,
                "blind_request_inputs_path": "blind_request_inputs.jsonl",
                "blind_request_inputs_sha256": blind_inputs_sha256,
                "blind_id_mapping_path": "blind_id_mapping.private.json",
                "blind_id_mapping_sha256": mapping_sha256,
                "stripped_images_count": stripped_count,
                "blind_images_count": blind_images_count,
                "blind_images_sha256_manifest": blind_images_sha256_manifest,
            },
            "safety_verification": {
                "eval_leak_check_passed": bool(sample_res.get("leak_check_performed", False)),
                "baseline_leak_check_passed": bool(sample_res.get("leak_check_performed", False)),
                "exif_stripping_verified": bool(strip_images and stripped_count == len(sampled_rows) and stripped_count > 0),
                "blind_separation_verified": True,
            },
        }

        meta_out_path = output_dir / "provenance_metadata.json"
        meta_out_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

        return {
            "output_dir": output_dir,
            "total_sampled": len(sampled_rows),
            "csv_sha256": csv_sha256,
            "jsonl_sha256": jsonl_sha256,
            "blind_inputs_sha256": blind_inputs_sha256,
            "mapping_sha256": mapping_sha256,
            "metadata_path": meta_out_path,
        }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Prepare deterministic 70-sample batch for MediaPipe Gemini Audit Phase 1."
    )
    parser.add_argument(
        "--manifest-csv",
        type=Path,
        default=Path("state/mediapipe_labeling_runs/zip2-audit-manifest-20261009/image_audit_manifest_remediated.csv"),
        help="Path to remediated manifest CSV",
    )
    parser.add_argument(
        "--expected-manifest-sha256",
        type=str,
        default=EXPECTED_REMEDIATED_MANIFEST_SHA256,
        help="Expected SHA-256 of the remediated manifest CSV",
    )
    parser.add_argument(
        "--image-dir",
        type=Path,
        default=Path(os.path.expanduser("~/Downloads/zip2")),
        help="Path to raw image directory",
    )
    parser.add_argument(
        "--batch250-dir",
        type=Path,
        default=Path("state/mediapipe_labeling_runs/zip2-batch250/exported_dataset"),
        help="Path to batch250 dataset",
    )
    parser.add_argument(
        "--golden-eval-dir",
        type=Path,
        default=Path("state/mediapipe-dataset/golden_eval"),
        help="Path to golden_eval dataset",
    )
    parser.add_argument(
        "--samples-per-class",
        type=int,
        default=10,
        help="Number of samples per class (default: 10)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=20261010,
        help="Deterministic random seed (default: 20261010)",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("state/mediapipe_labeling_runs/zip2-audit-manifest-20261009/gemini_audit_sample_70"),
        help="Output directory for sample artifacts",
    )
    parser.add_argument(
        "--no-strip-images",
        action="store_true",
        help="Skip image metadata stripping export",
    )
    parser.add_argument(
        "--expected-golden-count",
        type=int,
        default=EXPECTED_GOLDEN_EVAL_COUNT,
        help="Expected golden evaluation image count (default: 7)",
    )
    parser.add_argument(
        "--expected-val-count",
        type=int,
        default=EXPECTED_BATCH250_VAL_COUNT,
        help="Expected batch250 validation image count (default: 33)",
    )
    parser.add_argument(
        "--expected-test-count",
        type=int,
        default=EXPECTED_BATCH250_TEST_COUNT,
        help="Expected batch250 test image count (default: 33)",
    )
    parser.add_argument(
        "--expected-eval-count",
        type=int,
        default=EXPECTED_PROTECTED_EVAL_COUNT,
        help="Expected total protected evaluation image count (default: 73)",
    )
    parser.add_argument(
        "--expected-baseline-train-count",
        type=int,
        default=EXPECTED_BASELINE_TRAIN_COUNT,
        help="Expected baseline training image count (default: 190)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite output directory if it exists",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    sampler = GeminiAuditSampler(
        manifest_csv=args.manifest_csv,
        image_dir=args.image_dir,
        batch250_dir=args.batch250_dir,
        golden_eval_dir=args.golden_eval_dir,
        expected_manifest_sha256=args.expected_manifest_sha256,
        expected_golden_count=args.expected_golden_count,
        expected_val_count=args.expected_val_count,
        expected_test_count=args.expected_test_count,
        expected_eval_count=args.expected_eval_count,
        expected_baseline_train_count=args.expected_baseline_train_count,
        samples_per_class=args.samples_per_class,
        seed=args.seed,
    )

    print("Running deterministic Gemini audit sampling...")
    try:
        res = sampler.export(
            output_dir=args.output_dir,
            strip_images=not args.no_strip_images,
            force=args.force,
        )
        print(f"Sampling completed successfully!")
        print(f"Total samples: {res['total_sampled']}")
        print(f"Output directory: {res['output_dir']}")
        print(f"sample_manifest.csv SHA-256: {res['csv_sha256']}")
        print(f"sample_manifest.jsonl SHA-256: {res['jsonl_sha256']}")
        print(f"Provenance metadata: {res['metadata_path']}")
        return 0
    except Exception as e:
        print(f"Error during sampling preparation: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
