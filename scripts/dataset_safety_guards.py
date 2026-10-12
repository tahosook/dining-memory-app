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


def assert_no_path_collision(input_paths: List[Path], output_path: Path) -> None:
    """Verifies that output_path does not collide with or contain any input_paths.

    Prevents disastrous in-place destruction or recursive copy loops.
    """
    out_resolved = output_path.resolve()
    for inp in input_paths:
        if not inp:
            continue
        try:
            inp_resolved = inp.resolve()
        except Exception:
            continue

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


def collect_golden_hashes_dual(
    golden_test_dir: Path,
    manifest_csv: Optional[Path] = None,
) -> Set[str]:
    """Collects both raw and EXIF-stripped SHA-256 hashes of all images in the Golden Test Set.

    Also extracts raw_image_sha256 from manifest_csv if available.
    """
    if not golden_test_dir.is_dir():
        raise FileNotFoundError(f"Golden test directory not found: {golden_test_dir}")

    golden_hashes: Set[str] = set()
    golden_files: List[Path] = []
    for p in golden_test_dir.rglob("*.*"):
        if p.is_file() and p.suffix.lower() in [".jpg", ".jpeg", ".png", ".webp"] and not p.name.startswith("."):
            golden_files.append(p)

    if len(golden_files) == 0:
        raise ValueError(f"Golden test directory contains zero images: {golden_test_dir}")

    golden_basenames = {p.name for p in golden_files}

    for gf in golden_files:
        raw_bytes = gf.read_bytes()
        raw_hash = hashlib.sha256(raw_bytes).hexdigest()
        golden_hashes.add(raw_hash)

        # In-memory EXIF stripped hash
        stripped_bytes = strip_jpeg_bytes(raw_bytes)
        stripped_hash = hashlib.sha256(stripped_bytes).hexdigest()
        golden_hashes.add(stripped_hash)

    # If manifest_csv is available, enrich with raw_image_sha256 for protected evaluation rows
    if manifest_csv and manifest_csv.is_file():
        try:
            with open(manifest_csv, "r", encoding="utf-8") as f:
                reader = csv.DictReader(f)
                for r in reader:
                    role = r.get("assigned_role", "")
                    sp = Path(r.get("source_path", "")).name
                    if role == "protected_evaluation" or sp in golden_basenames:
                        raw_h = r.get("raw_image_sha256") or r.get("image_sha256")
                        if raw_h:
                            golden_hashes.add(raw_h)
        except Exception:
            pass

    return golden_hashes


def check_dual_image_leakage(
    golden_hashes: Set[str],
    image_id: str,
    raw_sha256: Optional[str] = None,
    stripped_sha256: Optional[str] = None,
    image_path: Optional[Path] = None,
) -> None:
    """Verifies that an image does not match any Golden Test Set hashes under any representation."""
    hashes_to_check: Set[str] = set()
    if raw_sha256:
        hashes_to_check.add(raw_sha256)
    if stripped_sha256:
        hashes_to_check.add(stripped_sha256)

    if image_path and image_path.is_file():
        file_bytes = image_path.read_bytes()
        hashes_to_check.add(hashlib.sha256(file_bytes).hexdigest())
        hashes_to_check.add(hashlib.sha256(strip_jpeg_bytes(file_bytes)).hexdigest())

    for h in hashes_to_check:
        if h in golden_hashes:
            raise LeakageError(
                f"CRITICAL LEAKAGE DETECTED: Data leakage detected! Image '{image_id}' (hash: {h}) matches protected Golden Test Set!"
            )


def atomic_directory_swap(staging_dir: Path, target_dir: Path) -> None:
    """Safely swaps staging_dir into target_dir without leaving incomplete output on failure."""
    if not staging_dir.is_dir():
        raise FileNotFoundError(f"Staging directory not found: {staging_dir}")

    target_parent = target_dir.parent
    target_parent.mkdir(parents=True, exist_ok=True)

    backup_dir: Optional[Path] = None
    if target_dir.exists():
        backup_name = f".backup_{target_dir.name}_{os.getpid()}_{int(datetime.now().timestamp() * 1000)}"
        backup_dir = target_parent / backup_name
        shutil.move(str(target_dir), str(backup_dir))

    try:
        shutil.move(str(staging_dir), str(target_dir))
        # Successful move: clean up backup
        if backup_dir and backup_dir.exists():
            shutil.rmtree(backup_dir, ignore_errors=True)
    except Exception as e:
        # Rollback
        if backup_dir and backup_dir.exists() and not target_dir.exists():
            shutil.move(str(backup_dir), str(target_dir))
        raise SafetyError(f"Failed to atomically swap directory to {target_dir}: {e}") from e
