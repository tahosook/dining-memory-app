#!/usr/bin/env python3
"""Independent validation script for MediaPipe food dataset audit manifest (zip2).

Verifies the integrity of image_audit_manifest.csv against raw images,
labels.jsonl, batch250 dataset, and golden eval dataset.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import os
import re
import struct
import sys
import tempfile
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Any

ALLOWED_ROLES = {
    "protected_evaluation",
    "protected_baseline_train",
    "quarantine_candidate",
    "excluded_pending_review",
    "audit_rare_boundary",
    "audit_random_major",
    "reserve_pool",
    "pseudo_label_candidate",
}

EVAL_TIME_THRESHOLDS_SEC = [60.0, 300.0, 1800.0, 3600.0]


def extract_exif_dates(jpeg_path: Path) -> dict[str, str]:
    """Extract DateTime tags from JPEG Exif APP1 segment without external libraries."""
    try:
        with open(jpeg_path, "rb") as f:
            data = f.read(131072)
    except Exception:
        return {}

    if len(data) < 4 or data[:2] != b"\xff\xd8":
        return {}

    idx = 2
    app1_data = None
    while idx < len(data) - 4:
        if data[idx] != 0xFF:
            break
        marker = data[idx + 1]
        idx += 2
        if marker in (0xD9, 0xDA):
            break
        if idx + 2 > len(data):
            break
        length = struct.unpack(">H", data[idx : idx + 2])[0]
        if marker == 0xE1:
            segment = data[idx + 2 : idx + length]
            if segment.startswith(b"Exif\x00\x00"):
                app1_data = segment[6:]
                break
        idx += length

    if not app1_data or len(app1_data) < 8:
        return {}

    endian_flag = app1_data[:2]
    if endian_flag == b"II":
        endian = "<"
    elif endian_flag == b"MM":
        endian = ">"
    else:
        return {}

    magic = struct.unpack(endian + "H", app1_data[2:4])[0]
    if magic != 42:
        return {}
    ifd0_offset = struct.unpack(endian + "I", app1_data[4:8])[0]

    dates: dict[str, str] = {}
    exif_ifd_offset = None

    def read_ifd(offset: int) -> None:
        nonlocal exif_ifd_offset
        if offset + 2 > len(app1_data):
            return
        num_entries = struct.unpack(endian + "H", app1_data[offset : offset + 2])[0]
        curr = offset + 2
        for _ in range(num_entries):
            if curr + 12 > len(app1_data):
                break
            tag, tag_type, count, val_offset = struct.unpack(
                endian + "HHII", app1_data[curr : curr + 12]
            )
            curr += 12
            if tag == 0x8769:  # Exif IFD Pointer
                exif_ifd_offset = val_offset
            elif tag in (0x0132, 0x9003, 0x9004):
                # ASCII string
                if count > 0:
                    if count <= 4:
                        s_bytes = app1_data[curr - 4 : curr - 4 + count]
                    elif val_offset + count <= len(app1_data):
                        s_bytes = app1_data[val_offset : val_offset + count]
                    else:
                        continue
                    s = s_bytes.split(b"\x00")[0].decode("ascii", errors="ignore").strip()
                    tag_name = {
                        0x0132: "DateTime",
                        0x9003: "DateTimeOriginal",
                        0x9004: "DateTimeDigitized",
                    }[tag]
                    dates[tag_name] = s

    read_ifd(ifd0_offset)
    if exif_ifd_offset is not None:
        read_ifd(exif_ifd_offset)
    return dates


def parse_exif_timestamp(date_str: str) -> float | None:
    """Parse 'YYYY:MM:DD HH:MM:SS' into Unix timestamp."""
    try:
        dt = datetime.strptime(date_str, "%Y:%m:%d %H:%M:%S")
        return dt.timestamp()
    except Exception:
        return None


def parse_filename_timestamp(filename: str) -> float | None:
    """Parse timestamp from filename patterns like MESHI_YYYYMMDD_HHMMSS or meal-<ms>."""
    m = re.match(r"MESHI_(\d{8})_(\d{6})", filename)
    if m:
        try:
            dt = datetime.strptime(m.group(1) + m.group(2), "%Y%m%d%H%M%S")
            return dt.timestamp()
        except Exception:
            pass

    m2 = re.match(r"meal-(\d+)", filename)
    if m2:
        try:
            return float(m2.group(1)) / 1000.0
        except Exception:
            pass

    return None


def compute_sha256(path: Path) -> str:
    """Compute SHA-256 hash of a file."""
    hasher = hashlib.sha256()
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


class AuditValidator:
    """Independent validator for MediaPipe audit manifest."""

    def __init__(
        self,
        zip2_dir: Path,
        labels_jsonl: Path,
        manifest_csv: Path,
        validation_json: Path | None = None,
        batch250_dir: Path | None = None,
        golden_eval_dir: Path | None = None,
    ):
        self.zip2_dir = zip2_dir
        self.labels_jsonl = labels_jsonl
        self.manifest_csv = manifest_csv
        self.validation_json = validation_json
        self.batch250_dir = batch250_dir
        self.golden_eval_dir = golden_eval_dir

        self.report: dict[str, Any] = {}

    def run_validation(self) -> dict[str, Any]:
        items: dict[str, Any] = {}

        # 1. Dataset Correspondence
        item1 = self._validate_dataset_correspondence()
        items["dataset_correspondence"] = item1

        # 2. Benchmark & Golden Eval Membership & Protection
        item2 = self._validate_benchmark_and_eval_members()
        items["benchmark_eval_membership"] = item2

        # 3. Roles and Protection
        item3 = self._validate_roles_and_protection(item2)
        items["roles_and_protection"] = item3

        # 4. Time Proximity & Proximity Leakage
        item4 = self._validate_time_proximity(item2)
        items["time_proximity"] = item4

        # 5. EXIF Timestamp Availability & Safety
        item5 = self._validate_exif_safety()
        items["exif_timestamp_safety"] = item5

        # 6. CSV vs Validation JSON Comparison
        item6 = self._validate_csv_json_consistency()
        items["csv_json_consistency"] = item6

        # 7. Seed 42 Reproducibility
        item7 = self._validate_seed_reproducibility()
        items["seed_42_reproducibility"] = item7

        # Determine overall status
        # If any mandatory check is FAIL -> FAIL
        # If no FAIL, but any mandatory check is NOT_VERIFIED -> NOT_VERIFIED
        # If all PASS -> PASS
        statuses = [it["status"] for it in items.values()]
        if "FAIL" in statuses:
            overall_status = "FAIL"
        elif "NOT_VERIFIED" in statuses:
            overall_status = "NOT_VERIFIED"
        else:
            overall_status = "PASS"

        self.report = {
            "validator_version": "1.0.0",
            "evaluated_at": datetime.utcnow().isoformat() + "Z",
            "manifest_path": str(self.manifest_csv),
            "overall_status": overall_status,
            "summary": {
                "total_items": len(items),
                "passed": sum(1 for s in statuses if s == "PASS"),
                "failed": sum(1 for s in statuses if s == "FAIL"),
                "not_verified": sum(1 for s in statuses if s == "NOT_VERIFIED"),
            },
            "items": items,
        }
        return self.report

    def _validate_dataset_correspondence(self) -> dict[str, Any]:
        """Verify 1-to-1 match between raw images, labels.jsonl, and manifest CSV."""
        errors: list[str] = []

        if not self.zip2_dir.is_dir():
            return {
                "status": "FAIL",
                "reason": f"zip2_dir not found: {self.zip2_dir}",
                "evidence": {},
            }
        if not self.labels_jsonl.is_file():
            return {
                "status": "FAIL",
                "reason": f"labels_jsonl not found: {self.labels_jsonl}",
                "evidence": {},
            }
        if not self.manifest_csv.is_file():
            return {
                "status": "FAIL",
                "reason": f"manifest_csv not found: {self.manifest_csv}",
                "evidence": {},
            }

        # Scan raw images
        raw_images = [
            f for f in os.listdir(self.zip2_dir)
            if f.lower().endswith((".jpg", ".jpeg", ".png"))
        ]
        raw_images_set = set(raw_images)

        # Check case folding collision in raw images
        lower_map: dict[str, str] = {}
        case_collisions = []
        for img in raw_images:
            low = img.lower()
            if low in lower_map:
                case_collisions.append((img, lower_map[low]))
            lower_map[low] = img
        if case_collisions:
            errors.append(f"Case collisions detected: {case_collisions}")

        # Load labels.jsonl
        labels = []
        with open(self.labels_jsonl, "r", encoding="utf-8") as f:
            for line_no, line in enumerate(f, 1):
                if line.strip():
                    try:
                        labels.append(json.loads(line))
                    except Exception as e:
                        errors.append(f"Invalid JSON at line {line_no}: {e}")

        labels_sp = [r.get("source_path") for r in labels if "source_path" in r]
        labels_sp_set = set(labels_sp)

        # Load manifest CSV
        with open(self.manifest_csv, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            manifest_rows = list(reader)

        manifest_sp = [r.get("source_path") for r in manifest_rows if "source_path" in r]
        manifest_sp_set = set(manifest_sp)

        # Discrepancies
        missing_in_labels = list(raw_images_set - labels_sp_set)
        missing_in_manifest = list(raw_images_set - manifest_sp_set)
        extra_in_labels = list(labels_sp_set - raw_images_set)
        extra_in_manifest = list(manifest_sp_set - raw_images_set)

        if missing_in_labels or missing_in_manifest or extra_in_labels or extra_in_manifest:
            errors.append("Discrepancy in file presence between zip2, labels, and manifest.")

        # Duplicate records
        dup_labels = len(labels_sp) - len(labels_sp_set)
        dup_manifest = len(manifest_sp) - len(manifest_sp_set)
        if dup_labels > 0:
            errors.append(f"Duplicate source_path in labels.jsonl: {dup_labels}")
        if dup_manifest > 0:
            errors.append(f"Duplicate source_path in manifest CSV: {dup_manifest}")

        # Compute SHA256 of raw images and detect duplicate image contents
        hashes: dict[str, str] = {}
        hash_to_files = defaultdict(list)
        for img in raw_images:
            h = compute_sha256(self.zip2_dir / img)
            hashes[img] = h
            hash_to_files[h].append(img)

        duplicate_hashes = {h: files for h, files in hash_to_files.items() if len(files) > 1}
        if duplicate_hashes:
            errors.append(f"Duplicate SHA-256 hashes found: {len(duplicate_hashes)}")

        status = "FAIL" if errors else "PASS"
        return {
            "status": status,
            "evidence": {
                "raw_image_count": len(raw_images),
                "labels_record_count": len(labels),
                "manifest_row_count": len(manifest_rows),
                "unique_raw_images": len(raw_images_set),
                "unique_labels_source_path": len(labels_sp_set),
                "unique_manifest_source_path": len(manifest_sp_set),
                "unique_sha256_count": len(hashes),
                "duplicate_sha256_count": len(duplicate_hashes),
                "case_collision_count": len(case_collisions),
                "missing_in_labels_count": len(missing_in_labels),
                "missing_in_manifest_count": len(missing_in_manifest),
                "extra_in_labels_count": len(extra_in_labels),
                "extra_in_manifest_count": len(extra_in_manifest),
            },
            "errors": errors,
        }

    def _validate_benchmark_and_eval_members(self) -> dict[str, Any]:
        """Validate batch250 and golden_eval membership via SHA256 against zip2 images."""
        errors: list[str] = []

        if not self.batch250_dir or not self.batch250_dir.is_dir():
            return {
                "status": "FAIL",
                "reason": f"batch250_dir not found: {self.batch250_dir}",
                "evidence": {},
            }
        if not self.golden_eval_dir or not self.golden_eval_dir.is_dir():
            return {
                "status": "FAIL",
                "reason": f"golden_eval_dir not found: {self.golden_eval_dir}",
                "evidence": {},
            }

        # Build raw images hash lookup
        raw_images = [
            f for f in os.listdir(self.zip2_dir)
            if f.lower().endswith((".jpg", ".jpeg", ".png"))
        ]
        hash_to_zip2 = {compute_sha256(self.zip2_dir / f): f for f in raw_images}

        # Golden eval images
        golden_files = list(self.golden_eval_dir.glob("test/*/*.jpg"))
        golden_unmatched = []
        golden_zip2_map = {}
        for p in golden_files:
            h = compute_sha256(p)
            if h in hash_to_zip2:
                golden_zip2_map[p.name] = hash_to_zip2[h]
            else:
                golden_unmatched.append(p.name)

        if golden_unmatched:
            errors.append(f"Golden eval files not matched in zip2 by SHA256: {golden_unmatched}")

        # Batch250 splits
        b250_splits: dict[str, dict[str, str]] = {"train": {}, "val": {}, "test": {}}
        b250_unmatched = []
        for split in ["train", "val", "test"]:
            sfiles = list((self.batch250_dir / split).glob("*/*.jpg"))
            for p in sfiles:
                h = compute_sha256(p)
                if h in hash_to_zip2:
                    b250_splits[split][p.name] = hash_to_zip2[h]
                else:
                    b250_unmatched.append(str(p))

        if b250_unmatched:
            errors.append(f"Batch250 files not matched in zip2: {len(b250_unmatched)}")

        eval_golden_zip2_names = set(golden_zip2_map.values())
        eval_b250_val_zip2_names = set(b250_splits["val"].values())
        eval_b250_test_zip2_names = set(b250_splits["test"].values())

        eval_total_zip2_names = (
            eval_golden_zip2_names | eval_b250_val_zip2_names | eval_b250_test_zip2_names
        )
        baseline_train_zip2_names = set(b250_splits["train"].values())

        # Check disjoint between eval and baseline train
        overlap = eval_total_zip2_names & baseline_train_zip2_names
        if overlap:
            errors.append(f"Overlap between eval sets and baseline train: {overlap}")

        status = "FAIL" if errors else "PASS"
        return {
            "status": status,
            "evidence": {
                "golden_eval_count": len(golden_files),
                "golden_eval_matched": len(golden_zip2_map),
                "batch250_train_count": len(b250_splits["train"]),
                "batch250_val_count": len(b250_splits["val"]),
                "batch250_test_count": len(b250_splits["test"]),
                "total_protected_eval_unique_images": len(eval_total_zip2_names),
                "total_protected_baseline_train_unique_images": len(baseline_train_zip2_names),
                "overlap_eval_and_baseline_train": len(overlap),
            },
            "eval_total_zip2_names": list(eval_total_zip2_names),
            "baseline_train_zip2_names": list(baseline_train_zip2_names),
            "golden_zip2_names": list(eval_golden_zip2_names),
            "b250_val_zip2_names": list(eval_b250_val_zip2_names),
            "b250_test_zip2_names": list(eval_b250_test_zip2_names),
            "errors": errors,
        }

    def _validate_roles_and_protection(self, item2: dict[str, Any]) -> dict[str, Any]:
        """Validate exclusive role assignments and protection of evaluation/baseline."""
        errors: list[str] = []

        with open(self.manifest_csv, "r", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))

        role_counts = Counter(r["assigned_role"] for r in rows)
        unknown_roles = set(role_counts.keys()) - ALLOWED_ROLES
        if unknown_roles:
            errors.append(f"Unknown assigned_role found: {unknown_roles}")

        # Check protected evaluation protection
        expected_eval = set(item2.get("eval_total_zip2_names", []))
        actual_eval = {r["source_path"] for r in rows if r["assigned_role"] == "protected_evaluation"}

        missing_eval_prot = expected_eval - actual_eval
        extra_eval_prot = actual_eval - expected_eval
        if missing_eval_prot:
            errors.append(f"Evaluation images not assigned protected_evaluation: {len(missing_eval_prot)}")
        if extra_eval_prot:
            errors.append(f"Extra images assigned protected_evaluation: {len(extra_eval_prot)}")

        # Check baseline train protection
        expected_train = set(item2.get("baseline_train_zip2_names", []))
        actual_train = {
            r["source_path"] for r in rows if r["assigned_role"] == "protected_baseline_train"
        }

        missing_train_prot = expected_train - actual_train
        extra_train_prot = actual_train - expected_train
        if missing_train_prot:
            errors.append(
                f"Baseline train images not assigned protected_baseline_train: {len(missing_train_prot)}"
            )
        if extra_train_prot:
            errors.append(
                f"Extra images assigned protected_baseline_train: {len(extra_train_prot)}"
            )

        # Check evaluation leak into training/candidate/reserve roles
        candidate_or_pool = {
            r["source_path"]
            for r in rows
            if r["assigned_role"] in ("pseudo_label_candidate", "reserve_pool", "audit_rare_boundary", "audit_random_major")
        }
        eval_leaks = expected_eval & candidate_or_pool
        if eval_leaks:
            errors.append(f"Evaluation images leaked into candidate/pool roles: {eval_leaks}")

        # Per-class counts for pseudo_label_candidate
        pseudo_rows = [r for r in rows if r["assigned_role"] == "pseudo_label_candidate"]
        pseudo_class_counts = dict(Counter(r["mapped_class"] for r in pseudo_rows))

        # Per-class counts for reserve_pool
        reserve_rows = [r for r in rows if r["assigned_role"] == "reserve_pool"]
        reserve_class_counts = dict(Counter(r["mapped_class"] for r in reserve_rows))

        status = "FAIL" if errors else "PASS"
        return {
            "status": status,
            "evidence": {
                "total_records": len(rows),
                "role_counts": dict(role_counts),
                "pseudo_class_counts": pseudo_class_counts,
                "reserve_class_counts": reserve_class_counts,
                "expected_eval_count": len(expected_eval),
                "actual_eval_count": len(actual_eval),
                "expected_baseline_train_count": len(expected_train),
                "actual_baseline_train_count": len(actual_train),
                "eval_leaks_count": len(eval_leaks),
            },
            "errors": errors,
        }

    def _validate_time_proximity(self, item2: dict[str, Any]) -> dict[str, Any]:
        """Compute minimum time difference to evaluation set independently.

        Evaluates multiple thresholds (60s, 300s, 1800s, 3600s).
        Reports FAIL for 3600s threshold if any images within 1 hour are in pseudo_label_candidate.
        """
        errors: list[str] = []
        eval_images = set(item2.get("eval_total_zip2_names", []))

        with open(self.manifest_csv, "r", encoding="utf-8") as f:
            manifest_rows = {r["source_path"]: r for r in csv.DictReader(f)}

        # Determine timestamps for evaluation images
        eval_timestamps: dict[str, float] = {}
        eval_no_time: list[str] = []
        for img in eval_images:
            img_path = self.zip2_dir / img
            exif_dates = extract_exif_dates(img_path)
            ts = None
            if "DateTimeOriginal" in exif_dates:
                ts = parse_exif_timestamp(exif_dates["DateTimeOriginal"])
            if ts is None and "DateTime" in exif_dates:
                ts = parse_exif_timestamp(exif_dates["DateTime"])
            if ts is None:
                ts = parse_filename_timestamp(img)
            if ts is not None:
                eval_timestamps[img] = ts
            else:
                eval_no_time.append(img)

        # For all non-eval images, compute min time difference to any eval image
        threshold_counts: dict[str, int] = {f"under_{int(t)}s": 0 for t in EVAL_TIME_THRESHOLDS_SEC}
        threshold_flagged: dict[str, list[dict[str, Any]]] = {
            f"under_{int(t)}s": [] for t in EVAL_TIME_THRESHOLDS_SEC
        }

        # Check candidates specifically within 3600s
        pseudo_label_within_3600s: list[dict[str, Any]] = []
        pseudo_label_within_60s: list[dict[str, Any]] = []

        all_time_diffs: dict[str, float] = {}

        for sp, r in manifest_rows.items():
            if sp in eval_images:
                continue

            img_path = self.zip2_dir / sp
            exif_dates = extract_exif_dates(img_path)
            ts = None
            if "DateTimeOriginal" in exif_dates:
                ts = parse_exif_timestamp(exif_dates["DateTimeOriginal"])
            if ts is None and "DateTime" in exif_dates:
                ts = parse_exif_timestamp(exif_dates["DateTime"])
            if ts is None:
                ts = parse_filename_timestamp(sp)

            if ts is None:
                continue

            # Find minimum time difference to any eval image
            min_diff = min(abs(ts - e_ts) for e_ts in eval_timestamps.values())
            all_time_diffs[sp] = min_diff

            for t in EVAL_TIME_THRESHOLDS_SEC:
                if min_diff <= t:
                    key = f"under_{int(t)}s"
                    threshold_counts[key] += 1
                    threshold_flagged[key].append({
                        "source_path": sp,
                        "time_diff_sec": min_diff,
                        "assigned_role": r["assigned_role"],
                        "mapped_class": r["mapped_class"],
                        "review_notes": r.get("review_notes", ""),
                    })

            if min_diff <= 60.0 and r["assigned_role"] == "pseudo_label_candidate":
                pseudo_label_within_60s.append({
                    "source_path": sp,
                    "time_diff_sec": min_diff,
                    "mapped_class": r["mapped_class"],
                })

            if min_diff <= 3600.0 and r["assigned_role"] == "pseudo_label_candidate":
                pseudo_label_within_3600s.append({
                    "source_path": sp,
                    "time_diff_sec": min_diff,
                    "mapped_class": r["mapped_class"],
                })

        # Evaluate rules:
        # 60s rule
        legacy_60s_passed = len(pseudo_label_within_60s) == 0
        # 3600s rule (conservative safe training standard)
        conservative_3600s_passed = len(pseudo_label_within_3600s) == 0

        if not conservative_3600s_passed:
            errors.append(
                f"Evaluation time proximity leak: {len(pseudo_label_within_3600s)} images "
                f"within 3600s (1h) are assigned to pseudo_label_candidate."
            )

        status = "FAIL" if not conservative_3600s_passed else "PASS"

        return {
            "status": status,
            "legacy_60s_status": "PASS" if legacy_60s_passed else "FAIL",
            "conservative_3600s_status": "PASS" if conservative_3600s_passed else "FAIL",
            "evidence": {
                "eval_images_with_timestamp": len(eval_timestamps),
                "eval_images_without_timestamp": len(eval_no_time),
                "threshold_counts": threshold_counts,
                "pseudo_label_within_60s_count": len(pseudo_label_within_60s),
                "pseudo_label_within_3600s_count": len(pseudo_label_within_3600s),
            },
            "flagged_pseudo_label_candidates_within_3600s": pseudo_label_within_3600s,
            "threshold_flagged": threshold_flagged,
            "errors": errors,
        }

    def _validate_exif_safety(self) -> dict[str, Any]:
        """Detect images missing EXIF DateTimeOriginal/DateTime.

        Images without EXIF dates cannot be verified for true shooting time.
        If included in pseudo_label_candidate -> FAIL.
        If in protected_baseline_train -> record warning/issue.
        """
        errors: list[str] = []

        with open(self.manifest_csv, "r", encoding="utf-8") as f:
            manifest_rows = {r["source_path"]: r for r in csv.DictReader(f)}

        missing_exif: list[dict[str, Any]] = []
        pseudo_label_missing_exif: list[dict[str, Any]] = []
        baseline_train_missing_exif: list[dict[str, Any]] = []

        for sp, r in manifest_rows.items():
            img_path = self.zip2_dir / sp
            exif_dates = extract_exif_dates(img_path)
            has_exif_dt = "DateTimeOriginal" in exif_dates or "DateTime" in exif_dates
            if not has_exif_dt:
                info = {
                    "source_path": sp,
                    "assigned_role": r["assigned_role"],
                    "mapped_class": r["mapped_class"],
                    "filename_estimated_timestamp": parse_filename_timestamp(sp),
                }
                missing_exif.append(info)
                if r["assigned_role"] == "pseudo_label_candidate":
                    pseudo_label_missing_exif.append(info)
                elif r["assigned_role"] == "protected_baseline_train":
                    baseline_train_missing_exif.append(info)

        if pseudo_label_missing_exif:
            errors.append(
                f"Images without EXIF shooting timestamp included in pseudo_label_candidate: "
                f"{len(pseudo_label_missing_exif)} images."
            )

        status = "FAIL" if pseudo_label_missing_exif else "PASS"

        return {
            "status": status,
            "evidence": {
                "total_missing_exif_count": len(missing_exif),
                "pseudo_label_missing_exif_count": len(pseudo_label_missing_exif),
                "baseline_train_missing_exif_count": len(baseline_train_missing_exif),
            },
            "pseudo_label_missing_exif": pseudo_label_missing_exif,
            "baseline_train_missing_exif": baseline_train_missing_exif,
            "missing_exif_samples": missing_exif[:10],
            "errors": errors,
        }

    def _validate_csv_json_consistency(self) -> dict[str, Any]:
        """Compare manifest CSV against validation_report.json.

        Distinguishes between summary-level consistency (counts) and
        record-level consistency (individual items).
        """
        if not self.validation_json or not self.validation_json.is_file():
            return {
                "status": "NOT_VERIFIED",
                "reason": "validation_report.json not provided or not found",
                "summary_level_status": "NOT_VERIFIED",
                "record_level_status": "NOT_VERIFIED",
                "evidence": {},
            }

        with open(self.validation_json, "r", encoding="utf-8") as f:
            v_json = json.load(f)

        with open(self.manifest_csv, "r", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))

        errors: list[str] = []

        # Summary-level checks
        json_total = v_json.get("total_images")
        csv_total = len(rows)
        if json_total != csv_total:
            errors.append(f"Total count mismatch: JSON={json_total}, CSV={csv_total}")

        json_role_counts = v_json.get("role_counts", {})
        csv_role_counts = dict(Counter(r["assigned_role"] for r in rows))
        if json_role_counts != csv_role_counts:
            errors.append(
                f"Role counts mismatch: JSON={json_role_counts}, CSV={csv_role_counts}"
            )

        summary_status = "FAIL" if errors else "PASS"

        # Record-level checks:
        # validation_report.json only contains aggregates and does NOT contain per-record IDs/roles.
        # Thus, record-level matching is explicitly NOT_VERIFIED.
        record_status = "NOT_VERIFIED"

        return {
            "status": "NOT_VERIFIED" if record_status == "NOT_VERIFIED" and summary_status == "PASS" else summary_status,
            "summary_level_status": summary_status,
            "record_level_status": record_status,
            "record_level_reason": "Existing validation_report.json contains only summary aggregates, not per-record identifiers",
            "evidence": {
                "csv_total_images": csv_total,
                "json_total_images": json_total,
                "csv_role_counts": csv_role_counts,
                "json_role_counts": json_role_counts,
            },
            "errors": errors,
        }

    def _validate_seed_reproducibility(self) -> dict[str, Any]:
        """Verify deterministic sampling with seed 42.

        If original extraction code/specification (filtering order, candidate pool, PRNG)
        is unavailable, mark as NOT_VERIFIED.
        """
        # We do not have the generation script in repo history or specs.
        # Marking as NOT_VERIFIED as required by specifications.
        return {
            "status": "NOT_VERIFIED",
            "reason": (
                "Original sampling specification, exact PRNG implementation, candidate pool "
                "ordering, and tie-breaking rules for seed 42 are not documented or preserved in the repository."
            ),
            "evidence": {
                "deterministic_seed_claimed": 42,
                "sampling_code_found": False,
            },
        }


def save_report_safely(report_data: dict[str, Any], output_path: Path, force: bool = False) -> None:
    """Save report safely using atomic temporary file write, protecting existing files."""
    if output_path.exists() and not force:
        raise FileExistsError(
            f"Output file already exists: {output_path}. Refusing to overwrite without --force."
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_dir = output_path.parent
    fd, temp_file_path = tempfile.mkstemp(prefix=".tmp_report_", suffix=".json", dir=temp_dir)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(report_data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        os.replace(temp_file_path, output_path)
    except Exception:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
        raise


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Independently validate MediaPipe zip2 audit manifest against ground truth and raw assets."
    )
    parser.add_argument(
        "--zip2-dir",
        type=Path,
        default=Path(os.path.expanduser("~/Downloads/zip2")),
        help="Path to directory containing raw zip2 JPEG images",
    )
    parser.add_argument(
        "--labels-jsonl",
        type=Path,
        default=Path(os.path.expanduser("~/Downloads/zip2_output4/labels.jsonl")),
        help="Path to raw labels.jsonl",
    )
    parser.add_argument(
        "--manifest-csv",
        type=Path,
        default=Path("state/mediapipe_labeling_runs/zip2-audit-manifest-20261009/image_audit_manifest.csv"),
        help="Path to image_audit_manifest.csv",
    )
    parser.add_argument(
        "--validation-json",
        type=Path,
        default=Path("state/mediapipe_labeling_runs/zip2-audit-manifest-20261009/validation_report.json"),
        help="Path to existing validation_report.json",
    )
    parser.add_argument(
        "--batch250-dir",
        type=Path,
        default=Path("state/mediapipe_labeling_runs/zip2-batch250/exported_dataset"),
        help="Path to batch250 exported_dataset",
    )
    parser.add_argument(
        "--golden-eval-dir",
        type=Path,
        default=Path("state/mediapipe-dataset/golden_eval"),
        help="Path to golden_eval dataset",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("state/mediapipe_labeling_runs/zip2-audit-manifest-20261009/independent_validation_report.json"),
        help="Output path for independent validation report JSON",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite output file if it already exists",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)

    validator = AuditValidator(
        zip2_dir=args.zip2_dir,
        labels_jsonl=args.labels_jsonl,
        manifest_csv=args.manifest_csv,
        validation_json=args.validation_json,
        batch250_dir=args.batch250_dir,
        golden_eval_dir=args.golden_eval_dir,
    )

    print("Running independent audit manifest validation...")
    report = validator.run_validation()

    print(f"Overall status: {report['overall_status']}")
    print(f"Summary: {report['summary']}")

    for name, item in report["items"].items():
        print(f" - [{item['status']}] {name}")
        if item.get("errors"):
            for err in item["errors"]:
                print(f"     ! {err}")

    if args.output:
        try:
            save_report_safely(report, args.output, force=args.force)
            print(f"Independent validation report saved to: {args.output}")
        except FileExistsError as e:
            print(f"Error saving report: {e}", file=sys.stderr)
            return 1
        except Exception as e:
            print(f"Unexpected error saving report: {e}", file=sys.stderr)
            return 1

    # Exit code: 0 if PASS, 1 if FAIL, 2 if NOT_VERIFIED
    if report["overall_status"] == "PASS":
        return 0
    elif report["overall_status"] == "FAIL":
        return 1
    else:
        return 2


if __name__ == "__main__":
    sys.exit(main())
