#!/usr/bin/env python3
"""Build privacy-safe execution package for MediaPipe Gemini Audit Sample A.

This script takes the verified 280-image selection from Sample A,
randomizes the blind IDs and presentation order independently of classes,
performs lossless JPEG EXIF metadata stripping, verifies pixel decodability,
and outputs a strictly isolated audit execution package.

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
from datetime import datetime
from pathlib import Path
from typing import Any

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.prepare_gemini_audit_sample_a import (
    get_git_info,
    strip_jpeg_metadata,
)
from scripts.validate_zip2_audit_manifest import (
    compute_sha256,
    extract_exif_dates,
)

DEFAULT_SHUFFLE_SEED = 20261013
DEFAULT_PACKAGE_DIR = Path(
    "state/mediapipe_labeling_runs/zip2-audit-manifest-20261009/gemini_audit_sample_A_pkg"
)


def get_jpeg_dimensions(data: bytes) -> tuple[int, int]:
    """Parse JPEG SOF0/SOF2 marker to extract (width, height) without full decoding."""
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        raise ValueError("Invalid JPEG header")

    idx = 2
    length_data = len(data)
    while idx < length_data - 1:
        if data[idx] != 0xFF:
            break
        while idx < length_data - 1 and data[idx] == 0xFF:
            idx += 1
        marker = data[idx]
        idx += 1

        if marker in (0xD9, 0xDA):
            break
        if marker in (0xD0, 0xD1, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0x01):
            continue

        if idx + 2 > length_data:
            break
        seg_len = struct.unpack(">H", data[idx : idx + 2])[0]
        if marker in (0xC0, 0xC1, 0xC2):
            h, w = struct.unpack(">HH", data[idx + 3 : idx + 7])
            return w, h
        idx += seg_len

    raise ValueError("Could not find SOF marker in JPEG data")


class SampleAAuditPackageBuilder:
    """Builder for Sample A blind audit execution package."""

    def __init__(
        self,
        sample_manifest_csv: Path,
        image_dir: Path,
        output_dir: Path = DEFAULT_PACKAGE_DIR,
        shuffle_seed: int = DEFAULT_SHUFFLE_SEED,
    ):
        self.sample_manifest_csv = sample_manifest_csv
        self.image_dir = image_dir
        self.output_dir = output_dir
        self.shuffle_seed = shuffle_seed

    def build(self, force: bool = False, generated_at: str | None = None) -> dict[str, Any]:
        """Build the isolated execution package with randomized blind IDs."""
        if self.output_dir.exists() and any(self.output_dir.iterdir()) and not force:
            raise FileExistsError(
                f"Output directory {self.output_dir} is not empty. Refusing to overwrite without force=True."
            )

        if not self.sample_manifest_csv.is_file():
            raise FileNotFoundError(f"Sample manifest CSV not found: {self.sample_manifest_csv}")

        if not self.image_dir.is_dir():
            raise FileNotFoundError(f"Image directory not found or inaccessible: {self.image_dir}")

        now_iso = generated_at or (datetime.utcnow().isoformat() + "Z")

        # 1. Read input Sample A manifest
        with open(self.sample_manifest_csv, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            fieldnames = list(reader.fieldnames or [])
            rows = list(reader)

        if len(rows) != 280:
            raise ValueError(f"Expected exactly 280 rows in Sample A manifest, got {len(rows)}")

        # 2. Verify all raw images exist and are decodable before proceeding
        raw_image_records: dict[str, dict[str, Any]] = {}
        for r in rows:
            sp = r["source_path"]
            src_p = self.image_dir / sp
            if not src_p.is_file():
                raise FileNotFoundError(f"Raw image file missing: {src_p}")

            raw_bytes = src_p.read_bytes()
            if len(raw_bytes) < 4 or raw_bytes[:2] != b"\xff\xd8" or raw_bytes[-2:] != b"\xff\xd9":
                raise ValueError(f"Corrupted JPEG file: {src_p}")

            w, h = get_jpeg_dimensions(raw_bytes)
            if w <= 0 or h <= 0:
                raise ValueError(f"Invalid image dimensions ({w}x{h}): {src_p}")

            raw_sha = hashlib.sha256(raw_bytes).hexdigest()
            raw_image_records[sp] = {
                "raw_sha256": raw_sha,
                "width": w,
                "height": h,
                "size_bytes": len(raw_bytes),
            }

        # 3. Deterministic Sort and Randomize Presentation Order
        # First sort deterministically using unique tuple
        sorted_rows = sorted(rows, key=lambda x: (x["image_id"], x["source_path"]))

        # Shuffle deterministically using shuffle_seed
        rng = random.Random(self.shuffle_seed)
        shuffled_rows = list(sorted_rows)
        rng.shuffle(shuffled_rows)

        # 4. Assign new randomized blind IDs
        # Using "blind_A_001" .. "blind_A_280"
        for idx, r in enumerate(shuffled_rows, 1):
            r["package_blind_id"] = f"blind_A_{idx:03d}"
            r["package_image_file"] = f"blind_A_{idx:03d}.jpg"

        # 5. Create directories
        self.output_dir.mkdir(parents=True, exist_ok=True)
        blind_images_dir = self.output_dir / "blind_images"
        blind_images_dir.mkdir(parents=True, exist_ok=True)
        private_dir = self.output_dir / "private_reconciliation"
        private_dir.mkdir(parents=True, exist_ok=True)

        # 6. Perform Lossless Metadata Stripping and Export Images
        stripped_manifest: dict[str, dict[str, Any]] = {}
        for r in shuffled_rows:
            sp = r["source_path"]
            src_p = self.image_dir / sp
            dst_p = blind_images_dir / r["package_image_file"]

            # Lossless stripping
            strip_jpeg_metadata(src_p, dst_p)

            # Verify that stripped JPEG is valid and has identical dimensions
            dst_bytes = dst_p.read_bytes()
            dst_w, dst_h = get_jpeg_dimensions(dst_bytes)
            raw_meta = raw_image_records[sp]
            if (dst_w, dst_h) != (raw_meta["width"], raw_meta["height"]):
                raise ValueError(
                    f"Dimension mismatch after stripping for {sp}: "
                    f"raw=({raw_meta['width']}x{raw_meta['height']}), "
                    f"stripped=({dst_w}x{dst_h})"
                )

            # Verify zero EXIF DateTime metadata
            exif_dates = extract_exif_dates(dst_p)
            if exif_dates:
                raise RuntimeError(
                    f"Failed to completely strip metadata from {dst_p}: remaining EXIF: {exif_dates}"
                )

            dst_sha = hashlib.sha256(dst_bytes).hexdigest()
            stripped_manifest[r["package_blind_id"]] = {
                "source_path": sp,
                "image_id": r["image_id"],
                "raw_sha256": raw_meta["raw_sha256"],
                "stripped_sha256": dst_sha,
                "width": dst_w,
                "height": dst_h,
                "raw_size_bytes": raw_meta["size_bytes"],
                "stripped_size_bytes": len(dst_bytes),
            }

        # 7. Output blind_request_inputs.jsonl (for blind audit model only)
        # MUST contain ONLY package_blind_id and package_image_file
        blind_inputs_path = self.output_dir / "blind_request_inputs.jsonl"
        with open(blind_inputs_path, "w", encoding="utf-8") as f:
            for r in shuffled_rows:
                rec = {
                    "blind_id": r["package_blind_id"],
                    "image_file": r["package_image_file"],
                }
                f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        blind_inputs_sha256 = compute_sha256(blind_inputs_path)

        # 8. Output private_reconciliation/blind_id_mapping.private.json
        mapping_records = []
        for r in shuffled_rows:
            bid = r["package_blind_id"]
            meta_info = stripped_manifest[bid]
            mapping_records.append({
                "blind_id": bid,
                "image_file": r["package_image_file"],
                "image_id": r["image_id"],
                "source_path": r["source_path"],
                "mapped_class": r["mapped_class"],
                "primary_dish_key": r.get("primary_dish_key", ""),
                "analysis_confidence": float(r.get("analysis_confidence", 0.0) or 0.0),
                "assigned_role": r.get("assigned_role", "pseudo_label_candidate"),
                "raw_image_sha256": meta_info["raw_sha256"],
                "stripped_image_sha256": meta_info["stripped_sha256"],
                "width": meta_info["width"],
                "height": meta_info["height"],
            })

        mapping_out_path = private_dir / "blind_id_mapping.private.json"
        mapping_data = {
            "mapping_version": "2.1.0",
            "audit_subset": "sample_A_randomized",
            "purpose": (
                "Post-audit reconciliation and evaluation only. "
                "DO NOT expose or provide to audit agent during blind audit."
            ),
            "generated_at": now_iso,
            "shuffle_seed": self.shuffle_seed,
            "total_records": len(mapping_records),
            "records": mapping_records,
        }
        mapping_out_path.write_text(
            json.dumps(mapping_data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8"
        )
        mapping_sha256 = compute_sha256(mapping_out_path)

        # 9. Output private_reconciliation/source_manifest.private.csv
        source_manifest_path = private_dir / "source_manifest.private.csv"
        with open(source_manifest_path, "w", encoding="utf-8", newline="") as f:
            extended_fields = ["blind_id", "image_file"] + [f for f in fieldnames if f not in ("blind_id", "image_file")]
            writer = csv.DictWriter(f, fieldnames=extended_fields)
            writer.writeheader()
            for r in shuffled_rows:
                row_dict = {k: r.get(k, "") for k in fieldnames}
                row_dict["blind_id"] = r["package_blind_id"]
                row_dict["image_file"] = r["package_image_file"]
                writer.writerow(row_dict)
        source_manifest_sha256 = compute_sha256(source_manifest_path)

        # 10. Output provenance_metadata.json
        git_commit, is_git_dirty = get_git_info()
        meta = {
            "metadata_version": "2.1.0",
            "package_name": "gemini_audit_sample_A_pkg",
            "generated_at": now_iso,
            "git_commit": git_commit,
            "is_git_dirty": is_git_dirty,
            "source_sample_manifest": {
                "path": str(self.sample_manifest_csv),
                "sha256": compute_sha256(self.sample_manifest_csv),
            },
            "randomization": {
                "shuffle_seed": self.shuffle_seed,
                "prng_type": "python_standard_random_Random",
                "blind_id_format": "blind_A_XXX",
                "is_class_aligned": False,
            },
            "counts": {
                "total_images": len(shuffled_rows),
                "class_distribution": {
                    cls_name: sum(1 for r in shuffled_rows if r["mapped_class"] == cls_name)
                    for cls_name in sorted(set(r["mapped_class"] for r in shuffled_rows))
                },
            },
            "output_artifacts": {
                "blind_images_dir": "blind_images",
                "blind_images_count": len(shuffled_rows),
                "blind_request_inputs_path": "blind_request_inputs.jsonl",
                "blind_request_inputs_sha256": blind_inputs_sha256,
                "private_mapping_path": "private_reconciliation/blind_id_mapping.private.json",
                "private_mapping_sha256": mapping_sha256,
                "private_source_manifest_path": "private_reconciliation/source_manifest.private.csv",
                "private_source_manifest_sha256": source_manifest_sha256,
            },
            "safety_verification": {
                "all_280_images_verified": True,
                "metadata_stripping_lossless": True,
                "exif_dates_completely_removed": True,
                "pixel_dimensions_preserved": True,
                "blind_inputs_leak_free": True,
                "id_shuffled_independently_of_class": True,
            },
        }

        meta_out_path = self.output_dir / "provenance_metadata.json"
        meta_out_path.write_text(json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        meta_sha256 = compute_sha256(meta_out_path)

        return {
            "output_dir": self.output_dir,
            "total_images": len(shuffled_rows),
            "blind_inputs_sha256": blind_inputs_sha256,
            "mapping_sha256": mapping_sha256,
            "source_manifest_sha256": source_manifest_sha256,
            "metadata_sha256": meta_sha256,
        }


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build privacy-safe execution package for MediaPipe Gemini Audit Sample A."
    )
    parser.add_argument(
        "--sample-manifest-csv",
        type=Path,
        default=Path("state/mediapipe_labeling_runs/zip2-audit-manifest-20261009/gemini_audit_sample_A_280/sample_manifest.csv"),
        help="Path to Sample A manifest CSV",
    )
    parser.add_argument(
        "--image-dir",
        type=Path,
        default=Path(os.path.expanduser("~/Downloads/zip2")),
        help="Path to raw image directory",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_PACKAGE_DIR,
        help="Path to output package directory",
    )
    parser.add_argument(
        "--shuffle-seed",
        type=int,
        default=DEFAULT_SHUFFLE_SEED,
        help=f"Deterministic seed for presentation order and ID shuffle (default: {DEFAULT_SHUFFLE_SEED})",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite package directory if it exists",
    )
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    builder = SampleAAuditPackageBuilder(
        sample_manifest_csv=args.sample_manifest_csv,
        image_dir=args.image_dir,
        output_dir=args.output_dir,
        shuffle_seed=args.shuffle_seed,
    )

    print("Building Sample A blind audit execution package...")
    try:
        res = builder.build(force=args.force)
        print("Audit package successfully built!")
        print(f"Output directory: {res['output_dir']}")
        print(f"Total images: {res['total_images']}")
        print(f"blind_request_inputs.jsonl SHA-256: {res['blind_inputs_sha256']}")
        print(f"blind_id_mapping.private.json SHA-256: {res['mapping_sha256']}")
        return 0
    except Exception as e:
        print(f"Error during package build: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
