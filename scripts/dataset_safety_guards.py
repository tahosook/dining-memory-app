#!/usr/bin/env python3
"""Shared Safety and Integrity Guards for MediaPipe Dataset Pipelines.

Provides reusable, fail-closed validation utilities for:
1. Input/Output path collision and containment prevention
2. Dual-hash leakage detection (raw original hash vs stripped/anonymous hash)
3. Atomic directory swap with rollback to prevent data loss on mid-process failure
"""

from __future__ import annotations

import csv
import hashlib
import json
import os
import shutil
import struct
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

_REPO_ROOT = Path(__file__).resolve().parent.parent


class SafetyError(RuntimeError):
    """Base error for safety and integrity violations."""


class LeakageError(SafetyError):
    """Raised when an integrated sample matches protected Golden Test data."""


def strip_jpeg_bytes(data: bytes) -> bytes:
    """Strip APP1-APP15 and COM metadata markers from JPEG bytes in-memory."""
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        return data

    output = bytearray(b"\xff\xd8")
    idx = 2
    length_data = len(data)

    while idx < length_data - 1:
        if data[idx] != 0xFF:
            output.extend(data[idx:])
            break

        while idx < length_data - 1 and data[idx] == 0xFF:
            idx += 1
        marker = data[idx]
        idx += 1

        if marker == 0xD9:  # EOI
            output.extend(b"\xff\xd9")
            break
        elif marker in (0xD0, 0xD1, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0x01):
            output.extend(bytes([0xFF, marker]))
            continue

        if idx + 2 > length_data:
            break
        seg_len = struct.unpack(">H", data[idx : idx + 2])[0]

        is_metadata = (0xE1 <= marker <= 0xEF) or (marker == 0xFE)
        if not is_metadata:
            output.extend(bytes([0xFF, marker]))
            output.extend(data[idx : idx + seg_len])

        idx += seg_len

        if marker == 0xDA:  # SOS
            output.extend(data[idx:])
            break

    return bytes(output)


def validate_sha256_format(sha_str: Any, field_name: str = "sha256") -> str:
    """Validates that sha_str is a non-empty, 64-character lowercase hexadecimal SHA-256 string."""
    if not isinstance(sha_str, str):
        raise SafetyError(f"Field '{field_name}' must be a string, got {type(sha_str).__name__}")
    sha_clean = sha_str.strip()
    if len(sha_clean) != 64 or not all(c in "0123456789abcdef" for c in sha_clean):
        raise SafetyError(
            f"Invalid SHA-256 format for '{field_name}': expected 64 lowercase hex characters, got '{sha_str}'"
        )
    return sha_clean


def assert_path_within_directory(child_path: Path, base_dir: Path) -> Path:
    """Ensures that child_path resolves to a location within base_dir.

    Prevents directory traversal, absolute path injection, or symlink escape.
    Returns the resolved child path.
    """
    try:
        base_resolved = base_dir.resolve()
        child_resolved = child_path.resolve()
    except Exception as e:
        raise SafetyError(f"Failed to resolve path: child='{child_path}', base='{base_dir}': {e}") from e

    try:
        if not child_resolved.is_relative_to(base_resolved):
            raise SafetyError(
                f"Path traversal detected: path '{child_path}' ({child_resolved}) "
                f"is outside base directory '{base_dir}' ({base_resolved})"
            )
    except AttributeError:
        try:
            child_resolved.relative_to(base_resolved)
        except ValueError:
            raise SafetyError(
                f"Path traversal detected: path '{child_path}' ({child_resolved}) "
                f"is outside base directory '{base_dir}' ({base_resolved})"
            )
    return child_resolved


def assert_no_path_collision(input_paths: List[Path], output_path: Path) -> None:
    """Verifies that output_path does not collide with or contain any input_paths.

    Prevents disastrous in-place destruction or recursive copy loops.
    Fail-closed: raises ValueError if any path cannot be resolved.
    """
    if not output_path:
        raise ValueError("output_path cannot be empty or None")
    try:
        out_resolved = output_path.resolve()
    except Exception as e:
        raise ValueError(f"Failed to resolve output path '{output_path}': {e}") from e

    for inp in input_paths:
        if not inp:
            raise ValueError(f"Input path cannot be empty or None: {input_paths}")
        try:
            inp_resolved = inp.resolve()
        except Exception as e:
            raise ValueError(f"Failed to resolve input path '{inp}': {e}") from e

        if inp_resolved == out_resolved:
            raise ValueError(
                f"Path collision detected: input path '{inp}' is identical to output path '{output_path}'."
            )

        # Check if output_path is an ancestor of input_path or vice versa
        if inp_resolved in out_resolved.parents:
            raise ValueError(
                f"Path containment violation: output path '{output_path}' is inside input path '{inp}'."
            )
        if out_resolved in inp_resolved.parents:
            raise ValueError(
                f"Path containment violation: input path '{inp}' is inside output path '{output_path}'."
            )


class GoldenTestHashes:
    """Container separating raw Golden Test hashes from stripped/metadata-cleaned hashes."""

    def __init__(self, raw_hashes: Set[str], stripped_hashes: Set[str]) -> None:
        self.raw_hashes: Set[str] = set(raw_hashes)
        self.stripped_hashes: Set[str] = set(stripped_hashes)
        self.all_hashes: Set[str] = self.raw_hashes | self.stripped_hashes

    def __contains__(self, item: str) -> bool:
        return item in self.all_hashes

    def __len__(self) -> int:
        return len(self.all_hashes)

    def __iter__(self):
        return iter(self.all_hashes)

    def __repr__(self) -> str:
        return f"GoldenTestHashes(raw={len(self.raw_hashes)}, stripped={len(self.stripped_hashes)})"


def collect_golden_hashes_dual(
    golden_test_dir: Path,
    manifest_csv: Optional[Path] = None,
) -> GoldenTestHashes:
    """Collects both raw and EXIF-stripped SHA-256 hashes of all images in the Golden Test Set.

    Fail-closed: raises SafetyError or FileNotFoundError if reading fails.
    """
    if not golden_test_dir.is_dir():
        raise FileNotFoundError(f"Golden test directory not found: {golden_test_dir}")

    raw_hashes: Set[str] = set()
    stripped_hashes: Set[str] = set()
    golden_files: List[Path] = []
    for p in golden_test_dir.rglob("*.*"):
        if p.is_file() and p.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"] and not p.name.startswith("."):
            golden_files.append(p)

    if len(golden_files) == 0:
        raise ValueError(f"Golden test directory contains zero images: {golden_test_dir}")

    golden_basenames = {p.name for p in golden_files}

    for gf in golden_files:
        try:
            raw_bytes = gf.read_bytes()
        except Exception as e:
            raise SafetyError(f"Failed to read Golden Test image '{gf}': {e}") from e

        raw_hash = hashlib.sha256(raw_bytes).hexdigest()
        raw_hashes.add(raw_hash)

        # In-memory EXIF stripped hash
        stripped_bytes = strip_jpeg_bytes(raw_bytes)
        stripped_hash = hashlib.sha256(stripped_bytes).hexdigest()
        stripped_hashes.add(stripped_hash)

    # If manifest_csv is provided, read and enrich with raw_image_sha256 for protected evaluation rows
    if manifest_csv is not None:
        if not manifest_csv.is_file():
            raise FileNotFoundError(f"Manifest CSV not found: {manifest_csv}")
        try:
            with open(manifest_csv, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for r in reader:
                    role = r.get("assigned_role", "")
                    sp_str = r.get("source_path", "")
                    sp_name = Path(sp_str).name if sp_str else ""
                    if role == "protected_evaluation" or sp_name in golden_basenames:
                        raw_h = r.get("raw_image_sha256") or r.get("image_sha256")
                        if raw_h:
                            validated = validate_sha256_format(raw_h, "manifest.raw_image_sha256")
                            raw_hashes.add(validated)
        except SafetyError:
            raise
        except Exception as e:
            raise SafetyError(f"Failed to parse or process manifest CSV '{manifest_csv}': {e}") from e

    return GoldenTestHashes(raw_hashes=raw_hashes, stripped_hashes=stripped_hashes)


def check_dual_image_leakage(
    golden_hashes: GoldenTestHashes | Set[str],
    image_id: str,
    raw_sha256: Optional[str] = None,
    stripped_sha256: Optional[str] = None,
    image_path: Optional[Path] = None,
) -> None:
    """Verifies that an image does not match any Golden Test Set hashes under any representation."""
    raw_candidates: Set[str] = set()
    stripped_candidates: Set[str] = set()

    if raw_sha256:
        val_raw = validate_sha256_format(raw_sha256, "raw_sha256")
        raw_candidates.add(val_raw)
    if stripped_sha256:
        val_stripped = validate_sha256_format(stripped_sha256, "stripped_sha256")
        stripped_candidates.add(val_stripped)

    if image_path and image_path.is_file():
        file_bytes = image_path.read_bytes()
        raw_candidates.add(hashlib.sha256(file_bytes).hexdigest())
        stripped_candidates.add(hashlib.sha256(strip_jpeg_bytes(file_bytes)).hexdigest())

    # Check raw hashes against raw golden set (and all)
    all_golden = golden_hashes if isinstance(golden_hashes, set) else golden_hashes.all_hashes
    raw_golden = golden_hashes.raw_hashes if isinstance(golden_hashes, GoldenTestHashes) else all_golden
    stripped_golden = golden_hashes.stripped_hashes if isinstance(golden_hashes, GoldenTestHashes) else all_golden

    for h in raw_candidates:
        if h in raw_golden or h in all_golden:
            raise LeakageError(
                f"CRITICAL LEAKAGE DETECTED: Data leakage detected! Raw image '{image_id}' (hash: {h}) matches protected Golden Test Set!"
            )

    for h in stripped_candidates:
        if h in stripped_golden or h in all_golden:
            raise LeakageError(
                f"CRITICAL LEAKAGE DETECTED: Data leakage detected! Stripped image '{image_id}' (hash: {h}) matches protected Golden Test Set!"
            )


def verify_candidate_record_integrity(
    manifest_row: Dict[str, str],
    mapping_record: Dict[str, Any],
    allowed_classes: Optional[Set[str]] = None,
) -> None:
    """Verifies consistency between candidate manifest row and private mapping record."""
    manifest_id = manifest_row.get("image_id", "").strip()
    mapping_id = str(mapping_record.get("image_id", "")).strip()
    if not manifest_id or not mapping_id:
        raise SafetyError("Missing image_id in manifest row or mapping record")
    if manifest_id != mapping_id:
        raise SafetyError(f"image_id mismatch: manifest '{manifest_id}' vs mapping '{mapping_id}'")

    manifest_class = manifest_row.get("mapped_class", "").strip()
    mapping_class = str(mapping_record.get("mapped_class", "")).strip()
    if not manifest_class or not mapping_class:
        raise SafetyError(f"Missing mapped_class for image '{manifest_id}'")
    if manifest_class != mapping_class:
        raise SafetyError(
            f"mapped_class mismatch for '{manifest_id}': manifest '{manifest_class}' vs mapping '{mapping_class}'"
        )
    if allowed_classes and manifest_class not in allowed_classes:
        raise SafetyError(f"Invalid class '{manifest_class}' for image '{manifest_id}'")

    # source_path is strictly required on both sides and must match exactly
    manifest_sp = str(manifest_row.get("source_path", "")).strip()
    mapping_sp = str(mapping_record.get("source_path", "")).strip()
    if not manifest_sp:
        raise SafetyError(f"Missing source_path in manifest row for image '{manifest_id}'")
    if not mapping_sp:
        raise SafetyError(f"Missing source_path in mapping record for image '{manifest_id}'")
    if manifest_sp != mapping_sp:
        raise SafetyError(
            f"source_path mismatch for '{manifest_id}': manifest '{manifest_sp}' vs mapping '{mapping_sp}'"
        )

    # Hashes are required in mapping_record and strictly validated
    mapping_raw = str(mapping_record.get("raw_image_sha256", "")).strip()
    mapping_stripped = str(mapping_record.get("stripped_image_sha256", "")).strip()
    if not mapping_raw:
        raise SafetyError(f"Missing required 'raw_image_sha256' in mapping record for '{manifest_id}'")
    if not mapping_stripped:
        raise SafetyError(f"Missing required 'stripped_image_sha256' in mapping record for '{manifest_id}'")
    validate_sha256_format(mapping_raw, f"mapping.raw_image_sha256 for '{manifest_id}'")
    validate_sha256_format(mapping_stripped, f"mapping.stripped_image_sha256 for '{manifest_id}'")

    # If manifest contains hashes, they must match mapping hashes
    manifest_raw = str(manifest_row.get("raw_image_sha256", "")).strip()
    if manifest_raw:
        validate_sha256_format(manifest_raw, f"manifest.raw_image_sha256 for '{manifest_id}'")
        if manifest_raw != mapping_raw:
            raise SafetyError(
                f"raw_image_sha256 mismatch for '{manifest_id}': manifest '{manifest_raw}' vs mapping '{mapping_raw}'"
            )

    manifest_stripped = str(manifest_row.get("stripped_image_sha256", "")).strip()
    if manifest_stripped:
        validate_sha256_format(manifest_stripped, f"manifest.stripped_image_sha256 for '{manifest_id}'")
        if manifest_stripped != mapping_stripped:
            raise SafetyError(
                f"stripped_image_sha256 mismatch for '{manifest_id}': manifest '{manifest_stripped}' vs mapping '{mapping_stripped}'"
            )


def load_and_validate_mapping(mapping_path: Path) -> Dict[str, Dict[str, Any]]:
    """Loads private reconciliation mapping and strictly validates against missing or duplicate IDs.

    Fail-closed: raises FileNotFoundError, SafetyError, or ValueError on any irregularity.
    """
    if not mapping_path.is_file():
        raise FileNotFoundError(f"Blind mapping file not found: {mapping_path}")

    try:
        with open(mapping_path, "r", encoding="utf-8") as f:
            mapping_data = json.load(f)
    except Exception as e:
        raise SafetyError(f"Failed to parse mapping JSON '{mapping_path}': {e}") from e

    records = mapping_data.get("records")
    if not isinstance(records, list):
        raise SafetyError(f"Mapping JSON '{mapping_path}' must contain a 'records' list.")
    if len(records) == 0:
        raise SafetyError(f"Mapping records in '{mapping_path}' is empty.")

    img_by_id: Dict[str, Dict[str, Any]] = {}
    seen_ids: Set[str] = set()

    for idx, r in enumerate(records):
        if not isinstance(r, dict):
            raise SafetyError(f"Record at index {idx} in mapping '{mapping_path}' is not an object.")
        img_id = r.get("image_id")
        if not img_id or not str(img_id).strip():
            raise SafetyError(f"Record at index {idx} in mapping '{mapping_path}' is missing 'image_id'.")
        clean_id = str(img_id).strip()
        if clean_id in seen_ids:
            raise SafetyError(
                f"Duplicate image_id '{clean_id}' detected in mapping '{mapping_path}' at index {idx}."
            )
        seen_ids.add(clean_id)
        img_by_id[clean_id] = r

    return img_by_id


def atomic_directory_swap(staging_dir: Path, target_dir: Path) -> Dict[str, Any]:
    """Safely swaps staging_dir into target_dir without leaving incomplete output on failure.

    Distinguishes new output swap success from backup cleanup success.
    Returns a dictionary reporting swap_success, backup_cleaned, and backup_path.
    """
    if not staging_dir.is_dir():
        raise FileNotFoundError(f"Staging directory not found: {staging_dir}")

    target_parent = target_dir.parent
    target_parent.mkdir(parents=True, exist_ok=True)

    backup_dir: Optional[Path] = None
    if target_dir.exists():
        backup_name = f".backup_{target_dir.name}_{os.getpid()}_{int(datetime.now().timestamp() * 1000)}"
        backup_dir = target_parent / backup_name
        try:
            shutil.move(str(target_dir), str(backup_dir))
        except Exception as e:
            raise SafetyError(
                f"Failed to move existing target '{target_dir}' to backup '{backup_dir}': {e}. "
                "Aborting swap; existing data left intact."
            ) from e

    try:
        shutil.move(str(staging_dir), str(target_dir))
    except Exception as e:
        # Rollback attempt
        rollback_success = False
        cleanup_partial_err = None

        # If a partial target_dir was created during the failed move, clean it up before restoring backup
        if target_dir.exists():
            try:
                if target_dir.is_dir():
                    shutil.rmtree(target_dir)
                else:
                    target_dir.unlink()
            except Exception as clean_err:
                cleanup_partial_err = clean_err

        if backup_dir and backup_dir.exists() and not target_dir.exists():
            try:
                shutil.move(str(backup_dir), str(target_dir))
                rollback_success = True
            except Exception as rb_err:
                raise SafetyError(
                    f"FATAL: Atomic swap failed AND rollback failed!\n"
                    f"Target directory: {target_dir}\n"
                    f"Backup directory preserved at: {backup_dir}\n"
                    f"Staging directory preserved at: {staging_dir}\n"
                    f"Manual recovery: restore backup by renaming '{backup_dir}' to '{target_dir}'.\n"
                    f"Original swap error: {e}\n"
                    f"Rollback error: {rb_err}"
                ) from rb_err

        error_msg = f"Failed to atomically swap staging '{staging_dir}' to target '{target_dir}': {e}."
        if rollback_success:
            error_msg += f" Successfully cleaned partial target and rolled back target from '{backup_dir}'."
        elif backup_dir and backup_dir.exists():
            error_msg += (
                f" Existing target data preserved at '{backup_dir}'."
                + (f" (Could not clean partial target: {cleanup_partial_err})" if cleanup_partial_err else "")
            )
        raise SafetyError(error_msg) from e

    # Successful move of staging into target: clean up backup safely without ignoring errors
    backup_cleaned = True
    cleanup_error_msg: Optional[str] = None
    if backup_dir and backup_dir.exists():
        try:
            shutil.rmtree(backup_dir)
        except Exception as cleanup_err:
            backup_cleaned = False
            cleanup_error_msg = str(cleanup_err)
            import sys
            print(
                f"WARNING: Swap succeeded for '{target_dir}', but failed to remove backup directory '{backup_dir}': {cleanup_err}. "
                f"Residual backup directory left at: {backup_dir} (note: data within backup may be partially deleted)",
                file=sys.stderr,
            )

    return {
        "swap_success": True,
        "backup_cleaned": backup_cleaned,
        "backup_path": str(backup_dir) if (backup_dir and not backup_cleaned) else None,
        "target_path": str(target_dir),
        "cleanup_error": cleanup_error_msg,
    }
