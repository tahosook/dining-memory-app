#!/usr/bin/env python3
"""Unit tests for dataset safety guards module."""

from __future__ import annotations

import shutil
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

    def test_path_collision_invalid_input_path_raises(self) -> None:
        """Regression test 1: assert_no_path_collision must not suppress path resolution failures."""
        out = self.root / "output"
        out.mkdir()
        with self.assertRaises(ValueError) as ctx:
            assert_no_path_collision([None], out)  # type: ignore[list-item]
        self.assertIn("cannot be empty or None", str(ctx.exception))

        with self.assertRaises(ValueError) as ctx:
            assert_no_path_collision([], None)  # type: ignore[arg-type]
        self.assertIn("output_path cannot be empty or None", str(ctx.exception))

    def test_collect_golden_hashes_dual_manifest_failure_raises(self) -> None:
        """Regression test 2: collect_golden_hashes_dual must fail-closed on manifest read failure."""
        golden_dir = self.root / "golden_dir"
        golden_dir.mkdir()
        img = golden_dir / "g.jpg"
        img.write_bytes(make_valid_dummy_jpeg("2024:01:01 12:00:00", b"data"))

        # Missing manifest
        missing_csv = self.root / "nonexistent.csv"
        with self.assertRaises(FileNotFoundError):
            collect_golden_hashes_dual(golden_dir, manifest_csv=missing_csv)

    def test_collect_golden_hashes_dual_separates_raw_and_stripped(self) -> None:
        """Regression test 3: collect_golden_hashes_dual separates raw and stripped hashes."""
        golden_dir = self.root / "golden_dir_2"
        golden_dir.mkdir()
        raw_bytes = make_valid_dummy_jpeg("2024:01:01 12:00:00", b"unique_pixels_test")
        img = golden_dir / "g2.jpg"
        img.write_bytes(raw_bytes)

        res = collect_golden_hashes_dual(golden_dir)
        import hashlib
        expected_raw = hashlib.sha256(raw_bytes).hexdigest()
        expected_stripped = hashlib.sha256(strip_jpeg_bytes(raw_bytes)).hexdigest()

        self.assertIn(expected_raw, res.raw_hashes)
        self.assertIn(expected_stripped, res.stripped_hashes)
        self.assertIn(expected_raw, res.all_hashes)
        self.assertIn(expected_stripped, res.all_hashes)
        # Verify container supports `in` operator directly
        self.assertIn(expected_raw, res)
        self.assertIn(expected_stripped, res)

    def test_validate_sha256_format(self) -> None:
        """Regression test 4: validate_sha256_format rejects non-64 hex or uppercase."""
        from scripts.dataset_safety_guards import validate_sha256_format

        valid_hash = "a" * 64
        self.assertEqual(validate_sha256_format(valid_hash), valid_hash)

        # Uppercase rejected
        with self.assertRaises(SafetyError) as ctx:
            validate_sha256_format("A" * 64)
        self.assertIn("expected 64 lowercase hex", str(ctx.exception))

        # Too short / too long
        with self.assertRaises(SafetyError):
            validate_sha256_format("a" * 63)
        with self.assertRaises(SafetyError):
            validate_sha256_format("a" * 65)

        # None / invalid types
        with self.assertRaises(SafetyError):
            validate_sha256_format(None)
        with self.assertRaises(SafetyError):
            validate_sha256_format(12345)

    def test_assert_path_within_directory(self) -> None:
        """Regression test 5: assert_path_within_directory detects traversal attempts."""
        from scripts.dataset_safety_guards import assert_path_within_directory

        base_dir = self.root / "base"
        base_dir.mkdir()
        safe_child = base_dir / "sub" / "file.txt"

        # Traversal attempt with ..
        evil_child = base_dir / "sub" / ".." / ".." / "escaped.txt"
        with self.assertRaises(SafetyError) as ctx:
            assert_path_within_directory(evil_child, base_dir)
        self.assertIn("Path traversal detected", str(ctx.exception))

        # Absolute outside path
        outside_path = self.root / "outside.txt"
        with self.assertRaises(SafetyError) as ctx:
            assert_path_within_directory(outside_path, base_dir)
        self.assertIn("Path traversal detected", str(ctx.exception))

    def test_atomic_directory_swap_preserves_backup_on_rollback_failure(self) -> None:
        """Regression test 6: atomic_directory_swap preserves backup directory and info on failure."""
        target_dir = self.root / "target"
        target_dir.mkdir()
        (target_dir / "keep_me.txt").write_text("critical", encoding="utf-8")

        staging_dir = self.root / "staging"
        staging_dir.mkdir()

        # Simulate catastrophic swap failure where target move succeeds, staging move fails, and rollback fails
        import unittest.mock as mock
        original_move = shutil.move

        def fail_on_staging_and_rollback(src: str, dst: str, **kwargs):
            if str(src) == str(staging_dir):
                raise OSError("Disk failure during staging move")
            if ".backup" in str(src):
                raise OSError("Rollback also failed due to permissions")
            return original_move(src, dst, **kwargs)

        with mock.patch("shutil.move", side_effect=fail_on_staging_and_rollback):
            with self.assertRaises(SafetyError) as ctx:
                atomic_directory_swap(staging_dir, target_dir)
            err_msg = str(ctx.exception)
            self.assertIn("FATAL: Atomic swap failed AND rollback failed", err_msg)
            self.assertIn("Backup directory preserved at:", err_msg)
            self.assertIn("Manual recovery:", err_msg)

    def test_verify_candidate_record_integrity_source_path_required_and_matched(self) -> None:
        """Issue 1: verify_candidate_record_integrity requires source_path on both sides and exact match."""
        from scripts.dataset_safety_guards import verify_candidate_record_integrity

        valid_raw = "a" * 64
        valid_stripped = "b" * 64

        # 1. Missing in manifest
        m_row_no_sp = {
            "image_id": "img_01",
            "mapped_class": "curry_rice",
            "source_path": "",
        }
        rec = {
            "image_id": "img_01",
            "mapped_class": "curry_rice",
            "source_path": "img_01.jpg",
            "raw_image_sha256": valid_raw,
            "stripped_image_sha256": valid_stripped,
        }
        with self.assertRaises(SafetyError) as ctx:
            verify_candidate_record_integrity(m_row_no_sp, rec)
        self.assertIn("Missing source_path in manifest", str(ctx.exception))

        # 2. Missing in mapping
        m_row = {
            "image_id": "img_01",
            "mapped_class": "curry_rice",
            "source_path": "img_01.jpg",
        }
        rec_no_sp = {
            "image_id": "img_01",
            "mapped_class": "curry_rice",
            "source_path": "",
            "raw_image_sha256": valid_raw,
            "stripped_image_sha256": valid_stripped,
        }
        with self.assertRaises(SafetyError) as ctx:
            verify_candidate_record_integrity(m_row, rec_no_sp)
        self.assertIn("Missing source_path in mapping", str(ctx.exception))

        # 3. Mismatched source_path
        rec_diff_sp = {
            "image_id": "img_01",
            "mapped_class": "curry_rice",
            "source_path": "other.jpg",
            "raw_image_sha256": valid_raw,
            "stripped_image_sha256": valid_stripped,
        }
        with self.assertRaises(SafetyError) as ctx:
            verify_candidate_record_integrity(m_row, rec_diff_sp)
        self.assertIn("source_path mismatch", str(ctx.exception))

    def test_verify_candidate_record_integrity_hashes_required_and_matched(self) -> None:
        """Issue 1: verify_candidate_record_integrity requires hashes and verifies cross-record equality."""
        from scripts.dataset_safety_guards import verify_candidate_record_integrity

        valid_raw = "a" * 64
        valid_stripped = "b" * 64
        other_hash = "c" * 64

        m_row = {
            "image_id": "img_01",
            "mapped_class": "curry_rice",
            "source_path": "img_01.jpg",
        }

        # 1. Missing raw_image_sha256 in mapping
        rec_no_raw = {
            "image_id": "img_01",
            "mapped_class": "curry_rice",
            "source_path": "img_01.jpg",
            "raw_image_sha256": "",
            "stripped_image_sha256": valid_stripped,
        }
        with self.assertRaises(SafetyError) as ctx:
            verify_candidate_record_integrity(m_row, rec_no_raw)
        self.assertIn("raw_image_sha256", str(ctx.exception))

        # 2. Missing stripped_image_sha256 in mapping
        rec_no_stripped = {
            "image_id": "img_01",
            "mapped_class": "curry_rice",
            "source_path": "img_01.jpg",
            "raw_image_sha256": valid_raw,
            "stripped_image_sha256": "",
        }
        with self.assertRaises(SafetyError) as ctx:
            verify_candidate_record_integrity(m_row, rec_no_stripped)
        self.assertIn("stripped_image_sha256", str(ctx.exception))

        # 3. Hash mismatch when manifest has hash
        m_row_diff_raw = {
            "image_id": "img_01",
            "mapped_class": "curry_rice",
            "source_path": "img_01.jpg",
            "raw_image_sha256": other_hash,
        }
        rec = {
            "image_id": "img_01",
            "mapped_class": "curry_rice",
            "source_path": "img_01.jpg",
            "raw_image_sha256": valid_raw,
            "stripped_image_sha256": valid_stripped,
        }
        with self.assertRaises(SafetyError) as ctx:
            verify_candidate_record_integrity(m_row_diff_raw, rec)
        self.assertIn("raw_image_sha256 mismatch", str(ctx.exception))

    def test_load_and_validate_mapping_rejects_missing_and_duplicate_ids(self) -> None:
        """Issue 2: load_and_validate_mapping rejects mappings with missing or duplicate IDs."""
        import json
        from scripts.dataset_safety_guards import load_and_validate_mapping

        mapping_file = self.root / "test_mapping.json"

        # Missing ID
        bad_missing = {"records": [{"image_id": "", "image_file": "a.jpg"}]}
        mapping_file.write_text(json.dumps(bad_missing), encoding="utf-8")
        with self.assertRaises(SafetyError) as ctx:
            load_and_validate_mapping(mapping_file)
        self.assertIn("missing 'image_id'", str(ctx.exception))

        # Duplicate ID
        bad_dup = {
            "records": [
                {"image_id": "dup_01", "image_file": "a.jpg"},
                {"image_id": "dup_01", "image_file": "b.jpg"},
            ]
        }
        mapping_file.write_text(json.dumps(bad_dup), encoding="utf-8")
        with self.assertRaises(SafetyError) as ctx:
            load_and_validate_mapping(mapping_file)
        self.assertIn("Duplicate image_id 'dup_01'", str(ctx.exception))

    def test_atomic_directory_swap_recovers_when_partial_target_created(self) -> None:
        """Issue 3: atomic_directory_swap cleans up partial target and recovers backup when move fails mid-way."""
        target_dir = self.root / "existing_target"
        target_dir.mkdir()
        (target_dir / "precious.txt").write_text("original_precious_data", encoding="utf-8")

        staging_dir = self.root / "staging_partial_fail"
        staging_dir.mkdir()
        (staging_dir / "new.txt").write_text("new_data", encoding="utf-8")

        import unittest.mock as mock
        original_move = shutil.move

        def simulate_partial_move_failure(src: str, dst: str, **kwargs):
            if str(src) == str(staging_dir):
                # Simulate move that partially created dst (target_dir) before failing
                Path(dst).mkdir(parents=True, exist_ok=True)
                (Path(dst) / "corrupt_partial.txt").write_text("partial", encoding="utf-8")
                raise OSError("Partial write failure during move")
            return original_move(src, dst, **kwargs)

        with mock.patch("shutil.move", side_effect=simulate_partial_move_failure):
            with self.assertRaises(SafetyError) as ctx:
                atomic_directory_swap(staging_dir, target_dir)
            self.assertIn("Successfully cleaned partial target and rolled back target", str(ctx.exception))

        # Target directory must have been cleanly restored to its original state!
        self.assertTrue(target_dir.is_dir())
        self.assertTrue((target_dir / "precious.txt").is_file())
        self.assertEqual((target_dir / "precious.txt").read_text(encoding="utf-8"), "original_precious_data")
        self.assertFalse((target_dir / "corrupt_partial.txt").exists())

    def test_atomic_directory_swap_reports_backup_cleanup_failure(self) -> None:
        """Issue 2: atomic_directory_swap distinguishes swap success from backup cleanup failure and reports backup path."""
        target_dir = self.root / "existing_target_cleanup_fail"
        target_dir.mkdir()
        (target_dir / "old.txt").write_text("old_data", encoding="utf-8")

        staging_dir = self.root / "staging_cleanup_fail"
        staging_dir.mkdir()
        (staging_dir / "new.txt").write_text("new_data", encoding="utf-8")

        import unittest.mock as mock
        original_rmtree = shutil.rmtree

        def simulate_backup_rmtree_failure(path: Any, **kwargs):
            if ".backup_" in str(path):
                raise PermissionError(f"Permission denied deleting backup: {path}")
            return original_rmtree(path, **kwargs)

        with mock.patch("shutil.rmtree", side_effect=simulate_backup_rmtree_failure):
            result = atomic_directory_swap(staging_dir, target_dir)

        # 1. Target directory must be swapped successfully
        self.assertTrue(target_dir.is_dir())
        self.assertTrue((target_dir / "new.txt").is_file())
        self.assertEqual((target_dir / "new.txt").read_text(encoding="utf-8"), "new_data")

        # 2. Swap result must distinguish swap success and backup cleanup failure
        self.assertIsNotNone(result)
        self.assertTrue(result["swap_success"])
        self.assertFalse(result["backup_cleaned"])
        self.assertIsNotNone(result["backup_path"])
        # 3. The actual backup path must still exist on disk
        backup_path = Path(result["backup_path"])
        self.assertTrue(backup_path.is_dir())
        self.assertTrue((backup_path / "old.txt").is_file())
        self.assertEqual((backup_path / "old.txt").read_text(encoding="utf-8"), "old_data")

    def test_atomic_directory_swap_handles_partial_backup_deletion_failure(self) -> None:
        """Verify atomic_directory_swap behavior when backup cleanup fails mid-deletion (partial deletion)."""
        import io
        import unittest.mock as mock

        target_dir = self.root / "existing_target_partial_del"
        target_dir.mkdir()
        (target_dir / "file1.txt").write_text("old_file1", encoding="utf-8")
        (target_dir / "file2.txt").write_text("old_file2", encoding="utf-8")

        staging_dir = self.root / "staging_partial_del"
        staging_dir.mkdir()
        (staging_dir / "new.txt").write_text("new_data", encoding="utf-8")

        original_rmtree = shutil.rmtree

        def simulate_partial_rmtree_failure(path: Any, **kwargs):
            p = Path(path)
            if ".backup_" in str(path):
                # 1. Partially delete: remove file1.txt from backup
                f1 = p / "file1.txt"
                if f1.exists():
                    f1.unlink()
                # 2. Raise exception mid-cleanup
                raise OSError(f"Simulated mid-cleanup failure on backup: {path}")
            return original_rmtree(path, **kwargs)

        with mock.patch("shutil.rmtree", side_effect=simulate_partial_rmtree_failure), \
             mock.patch("sys.stderr", new_callable=io.StringIO) as mock_stderr:
            result = atomic_directory_swap(staging_dir, target_dir)

        # 1. New output directory swap succeeded
        self.assertTrue(target_dir.is_dir())
        self.assertTrue((target_dir / "new.txt").is_file())
        self.assertEqual((target_dir / "new.txt").read_text(encoding="utf-8"), "new_data")

        # 2. Swap result contracts
        self.assertIsNotNone(result)
        self.assertTrue(result["swap_success"])
        self.assertFalse(result["backup_cleaned"])

        # 3. backup_path identifies the residual directory
        self.assertIsNotNone(result["backup_path"])
        residual_backup = Path(result["backup_path"])
        self.assertTrue(residual_backup.is_dir())

        # 4. cleanup_error contains error info
        self.assertIsNotNone(result["cleanup_error"])
        self.assertIn("Simulated mid-cleanup failure on backup", result["cleanup_error"])

        # 5. stderr logs cleanup failure and backup path
        stderr_log = mock_stderr.getvalue()
        self.assertIn("failed to remove backup directory", stderr_log)
        self.assertIn(str(residual_backup), stderr_log)
        self.assertIn("(note: data within backup may be partially deleted)", stderr_log)

        # 6 & 7. Verify partial state: file1.txt was deleted, file2.txt remains
        self.assertFalse((residual_backup / "file1.txt").exists())
        self.assertTrue((residual_backup / "file2.txt").is_file())
        self.assertEqual((residual_backup / "file2.txt").read_text(encoding="utf-8"), "old_file2")


if __name__ == "__main__":
    unittest.main()
