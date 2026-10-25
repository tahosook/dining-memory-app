#!/usr/bin/env python3
"""
scripts/tests/test_publish_mediapipe_model.py

Unit tests for MediaPipe Model Publishing & 4-file synchronization script.
"""
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.publish_mediapipe_model import (
    compute_sha256,
    update_build_android_release_sh,
    update_build_gradle,
    update_ensure_script_sh,
    update_model_config_ts,
    validate_model_file,
)


class TestPublishMediaPipeModel(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.test_dir = Path(self.temp_dir.name)

    def tearDown(self) -> None:
        self.temp_dir.cleanup()

    def create_dummy_task_file(self, filename: str, size_bytes: int = 2 * 1024 * 1024) -> Path:
        target = self.test_dir / filename
        with zipfile.ZipFile(target, "w") as z:
            z.writestr("model.tflite", b"dummy-tflite-model-data")
            z.writestr("labels.txt", "label1\nlabel2\n")
            # Pad size to meet minimum
            padding = max(0, size_bytes - 1000)
            z.writestr("padding.bin", b"0" * padding)
        return target

    def test_validate_model_file_success(self) -> None:
        task_path = self.create_dummy_task_file("universal_dining_23class.task")
        validate_model_file(task_path, "universal_dining_23class.task")

    def test_validate_model_file_not_found(self) -> None:
        with self.assertRaises(FileNotFoundError):
            validate_model_file(self.test_dir / "non_existent.task", "model.task")

    def test_validate_model_file_too_small(self) -> None:
        tiny_path = self.test_dir / "tiny.task"
        tiny_path.write_bytes(b"PK\x03\x04tiny")
        with self.assertRaises(ValueError) as ctx:
            validate_model_file(tiny_path, "tiny.task")
        self.assertIn("Invalid model file size", str(ctx.exception))

    def test_validate_model_file_invalid_signature(self) -> None:
        invalid_path = self.test_dir / "invalid.task"
        invalid_path.write_bytes(b"\x00" * (2 * 1024 * 1024))
        with self.assertRaises(ValueError) as ctx:
            validate_model_file(invalid_path, "invalid.task")
        self.assertIn("neither a valid TFLite model nor a MediaPipe task ZIP", str(ctx.exception))

    def test_update_model_config_ts(self) -> None:
        sample_ts = """
export const MEDIAPIPE_CLASSIFIER_MODELS = {
  universal_dining_23class: {
    id: 'universal_dining_23class',
    fileName: 'universal_dining_23class.task',
    sha256: '1111111111111111111111111111111111111111111111111111111111111111',
    available: true,
  },
  personal_multilabel_44tag: {
    id: 'personal_multilabel_44tag',
    fileName: 'personal_multilabel_44tag.task',
    sha256: '2222222222222222222222222222222222222222222222222222222222222222',
    available: true,
  },
};
"""
        ts_path = self.test_dir / "modelConfig.ts"
        ts_path.write_text(sample_ts, encoding="utf-8")

        new_sha = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        updated = update_model_config_ts(ts_path, "universal_dining_23class", new_sha)

        self.assertIn(f"sha256: '{new_sha}'", updated)
        # Ensure other model was NOT modified
        self.assertIn("sha256: '2222222222222222222222222222222222222222222222222222222222222222'", updated)

    def test_update_ensure_script_sh(self) -> None:
        sample_sh = """
MODEL_2_FILE="universal_dining_23class.task"
MODEL_2_SHA="${MEDIAPIPE_UNIVERSAL_MODEL_SHA256:-1111111111111111111111111111111111111111111111111111111111111111}"
"""
        sh_path = self.test_dir / "ensure-mediapipe-model.sh"
        sh_path.write_text(sample_sh, encoding="utf-8")

        new_sha = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        updated = update_ensure_script_sh(sh_path, "universal_dining_23class.task", new_sha)
        self.assertIn(f":-{new_sha}", updated)

    def test_update_build_android_release_sh(self) -> None:
        sample_sh = """
    "universal_dining_23class.task")
      echo "${MEDIAPIPE_UNIVERSAL_MODEL_SHA256:-1111111111111111111111111111111111111111111111111111111111111111}"
      ;;
"""
        sh_path = self.test_dir / "build-android-release.sh"
        sh_path.write_text(sample_sh, encoding="utf-8")

        new_sha = "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        updated = update_build_android_release_sh(sh_path, "universal_dining_23class.task", new_sha)
        self.assertIn(f":-{new_sha}", updated)

    def test_update_build_gradle(self) -> None:
        sample_gradle = """
    inputs.property("expectedShaUniversal", System.getenv("MEDIAPIPE_UNIVERSAL_MODEL_SHA256") ?: "1111111111111111111111111111111111111111111111111111111111111111")
    doLast {
        def requiredModels = [
            [
                name: "universal_dining_23class.task",
                expectedSha: System.getenv("MEDIAPIPE_UNIVERSAL_MODEL_SHA256") ?: "1111111111111111111111111111111111111111111111111111111111111111"
            ]
        ]
    }
"""
        gradle_path = self.test_dir / "build.gradle"
        gradle_path.write_text(sample_gradle, encoding="utf-8")

        new_sha = "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
        updated = update_build_gradle(gradle_path, "universal_dining_23class.task", "expectedShaUniversal", new_sha)
        self.assertEqual(updated.count(new_sha), 2)
        self.assertNotIn("1111111111111111111111111111111111111111111111111111111111111111", updated)


if __name__ == "__main__":
    unittest.main()
