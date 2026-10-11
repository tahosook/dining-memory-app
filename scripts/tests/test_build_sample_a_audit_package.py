from __future__ import annotations

import csv
import json
import struct
import tempfile
import unittest
from pathlib import Path

from scripts.build_sample_a_audit_package import (
    SampleAAuditPackageBuilder,
    get_jpeg_dimensions,
)
from scripts.tests.test_validate_zip2_audit_manifest import make_dummy_jpeg
from scripts.validate_zip2_audit_manifest import extract_exif_dates


def make_valid_dummy_jpeg(exif_dt: str | None = None, content_seed: bytes = b"", width: int = 1024, height: int = 768) -> bytes:
    """Create a minimal valid JPEG image with SOF0 (dimensions) and optional Exif APP1."""
    # SOF0 segment: \xff\xc0, len=17 (0x0011), precision=8, height, width, components=3
    sof0 = b"\xff\xc0" + struct.pack(">H", 17) + bytes([8]) + struct.pack(">HH", height, width) + bytes([3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1])

    if not exif_dt:
        return b"\xff\xd8" + sof0 + content_seed + b"\xff\xd9"

    dt_bytes = exif_dt.encode("ascii") + b"\x00"
    if len(dt_bytes) < 20:
        dt_bytes += b"\x00" * (20 - len(dt_bytes))

    tiff = bytearray()
    tiff += b"MM\x00\x2a\x00\x00\x00\x08"
    tiff += struct.pack(">H", 1)
    tiff += struct.pack(">HHII", 0x9003, 2, 20, 26)
    tiff += struct.pack(">I", 0)
    tiff += dt_bytes

    app1_payload = b"Exif\x00\x00" + tiff
    length = len(app1_payload) + 2
    app1 = b"\xff\xe1" + struct.pack(">H", length) + app1_payload

    return b"\xff\xd8" + app1 + sof0 + content_seed + b"\xff\xd9"


class TestBuildSampleAAuditPackage(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

        self.image_dir = self.root / "images"
        self.image_dir.mkdir(parents=True)

        self.sample_manifest_csv = self.root / "sample_manifest.csv"
        self.output_dir = self.root / "output_package"

        self.classes = [
            "curry_rice",
            "drink",
            "fish_dish",
            "fried_dish",
            "meat_dish",
            "simmered_dish",
            "stir_fry",
        ]

        # Generate exactly 280 dummy items (40 per class) with EXIF dates and dimensions
        self.rows = []
        for cls_name in self.classes:
            for i in range(40):
                img_name = f"MESHI_{cls_name}_{i:03d}.jpg"
                img_data = make_valid_dummy_jpeg(
                    "2024:03:01 12:00:00",
                    f"content_{cls_name}_{i}".encode("ascii"),
                    width=1024,
                    height=768,
                )
                (self.image_dir / img_name).write_bytes(img_data)
                self.rows.append({
                    "image_id": f"meshi_{cls_name}_{i:03d}_jpg",
                    "source_path": img_name,
                    "mapped_class": cls_name,
                    "assigned_role": "pseudo_label_candidate",
                    "primary_dish_key": cls_name,
                    "analysis_confidence": "0.85",
                })

        with open(self.sample_manifest_csv, "w", encoding="utf-8", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=list(self.rows[0].keys()))
            writer.writeheader()
            writer.writerows(self.rows)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_package_build_and_randomized_blind_ids(self) -> None:
        """Verify package builds, IDs are shuffled, and dimensions/EXIF are valid."""
        builder = SampleAAuditPackageBuilder(
            sample_manifest_csv=self.sample_manifest_csv,
            image_dir=self.image_dir,
            output_dir=self.output_dir,
            shuffle_seed=20261013,
        )

        res = builder.build(force=False, generated_at="2026-10-13T00:00:00Z")
        self.assertEqual(res["total_images"], 280)

        # 1. Verify blind_request_inputs.jsonl
        blind_inputs_file = self.output_dir / "blind_request_inputs.jsonl"
        self.assertTrue(blind_inputs_file.is_file())
        with open(blind_inputs_file) as f:
            blind_lines = [json.loads(line) for line in f]

        self.assertEqual(len(blind_lines), 280)
        self.assertEqual(blind_lines[0]["blind_id"], "blind_A_001")
        self.assertEqual(blind_lines[0]["image_file"], "blind_A_001.jpg")
        self.assertEqual(blind_lines[-1]["blind_id"], "blind_A_280")
        self.assertEqual(blind_lines[-1]["image_file"], "blind_A_280.jpg")

        # Verify no leaks in blind inputs
        sensitive = ["curry", "drink", "fish", "meshi", "2024", "confidence"]
        for line in blind_lines:
            s = json.dumps(line).lower()
            for w in sensitive:
                self.assertNotIn(w, s)

        # 2. Verify private_reconciliation directory separation
        private_mapping_file = self.output_dir / "private_reconciliation" / "blind_id_mapping.private.json"
        self.assertTrue(private_mapping_file.is_file())
        with open(private_mapping_file) as f:
            mapping_data = json.load(f)

        records = mapping_data["records"]
        self.assertEqual(len(records), 280)

        # Verify ID presentation order is NOT aligned by class (shuffled)
        classes_in_order = [r["mapped_class"] for r in records]
        # First 40 should NOT all be 'curry_rice'
        first_40_classes = set(classes_in_order[:40])
        self.assertGreater(len(first_40_classes), 1, "IDs should be randomized and not grouped by class!")

        # 3. Verify images exist, have zero EXIF, and preserve dimensions
        blind_images_dir = self.output_dir / "blind_images"
        self.assertTrue(blind_images_dir.is_dir())

        for r in records:
            img_p = blind_images_dir / r["image_file"]
            self.assertTrue(img_p.is_file())

            # Check EXIF dates are gone
            exif_dates = extract_exif_dates(img_p)
            self.assertEqual(exif_dates, {}, f"Metadata was not stripped in {img_p}")

            # Check dimensions are valid
            w, h = get_jpeg_dimensions(img_p.read_bytes())
            self.assertEqual(w, r["width"])
            self.assertEqual(h, r["height"])

    def test_missing_image_fails_fast(self) -> None:
        """Verify builder aborts if a raw image is missing."""
        (self.image_dir / "MESHI_curry_rice_000.jpg").unlink()

        builder = SampleAAuditPackageBuilder(
            sample_manifest_csv=self.sample_manifest_csv,
            image_dir=self.image_dir,
            output_dir=self.output_dir,
            shuffle_seed=20261013,
        )

        with self.assertRaises(FileNotFoundError):
            builder.build()


if __name__ == "__main__":
    unittest.main()
