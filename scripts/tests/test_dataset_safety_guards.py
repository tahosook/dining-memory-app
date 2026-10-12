#!/usr/bin/env python3
"""Unit tests for dataset safety guards module."""

from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from scripts.dataset_safety_guards import (
    LeakageError,
    SafetyError,
    assert_no_path_collision,
    atomic_directory_swap,
    check_dual_image_leakage,
    collect_golden_hashes_dual,
    strip_jpeg_bytes,
)
from scripts.tests.test_build_sample_a_audit_package import make_valid_dummy_jpeg


class TestDatasetSafetyGuards(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.root = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def test_path_collision_identical(self) -> None:
        p1 = self.root / "data"
        p1.mkdir()
        with self.assertRaises(ValueError) as ctx:
            assert_no_path_collision([p1], p1)
        self.assertIn("identical", str(ctx.exception))

    def test_path_collision_containment(self) -> None:
        parent = self.root / "dataset"
        parent.mkdir()
        child = parent / "subset"
        child.mkdir()

        # output is child of input
        with self.assertRaises(ValueError) as ctx:
            assert_no_path_collision([parent], child)
        self.assertIn("containment", str(ctx.exception))

        # input is child of output
        with self.assertRaises(ValueError) as ctx:
            assert_no_path_collision([child], parent)
        self.assertIn("containment", str(ctx.exception))

    def test_path_collision_valid_disjoint(self) -> None:
        p1 = self.root / "input_data"
        p2 = self.root / "output_data"
        p1.mkdir()
        p2.mkdir()
        # Should not raise
        assert_no_path_collision([p1], p2)

    def test_dual_leakage_detection(self) -> None:
        golden_dir = self.root / "golden"
        golden_dir.mkdir()

        # Create dummy golden image with EXIF
        raw_bytes = make_valid_dummy_jpeg("2024:01:01 12:00:00", b"secret_golden_pixels")
        golden_img = golden_dir / "golden_001.jpg"
        golden_img.write_bytes(raw_bytes)

        golden_hashes = collect_golden_hashes_dual(golden_dir)
        self.assertGreaterEqual(len(golden_hashes), 2)  # raw hash and stripped hash

        # Test case 1: Raw hash matches
        with self.assertRaises(LeakageError) as ctx:
            check_dual_image_leakage(
                golden_hashes=golden_hashes,
                image_id="test_01",
                raw_sha256=list(golden_hashes)[0],
            )
        self.assertIn("CRITICAL LEAKAGE", str(ctx.exception))

        # Test case 2: Image with different EXIF but same stripped content matches
        diff_exif_bytes = make_valid_dummy_jpeg("2025:12:31 23:59:59", b"secret_golden_pixels")
        candidate_img = self.root / "cand_diff_exif.jpg"
        candidate_img.write_bytes(diff_exif_bytes)

        # Raw hashes differ because EXIF dates are different
        self.assertNotEqual(raw_bytes, diff_exif_bytes)

        with self.assertRaises(LeakageError) as ctx:
            check_dual_image_leakage(
                golden_hashes=golden_hashes,
                image_id="test_02",
                image_path=candidate_img,
            )
        self.assertIn("CRITICAL LEAKAGE", str(ctx.exception))

        # Test case 3: Unrelated image passes
        safe_bytes = make_valid_dummy_jpeg("2024:05:05 10:00:00", b"completely_different_pixels")
        safe_img = self.root / "safe.jpg"
        safe_img.write_bytes(safe_bytes)

        # Should not raise
        check_dual_image_leakage(
            golden_hashes=golden_hashes,
            image_id="safe_01",
            image_path=safe_img,
        )

    def test_atomic_directory_swap(self) -> None:
        target_dir = self.root / "final_output"
        target_dir.mkdir()
        (target_dir / "old_file.txt").write_text("old_data", encoding="utf-8")

        staging_dir = self.root / "staging"
        staging_dir.mkdir()
        (staging_dir / "new_file.txt").write_text("new_data", encoding="utf-8")

        atomic_directory_swap(staging_dir, target_dir)

        self.assertTrue(target_dir.is_dir())
        self.assertTrue((target_dir / "new_file.txt").is_file())
        self.assertFalse((target_dir / "old_file.txt").exists())
        self.assertFalse(staging_dir.exists())


if __name__ == "__main__":
    unittest.main()
