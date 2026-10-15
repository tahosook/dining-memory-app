#!/usr/bin/env python3
"""Unit and smoke tests for MediaPipe training script and Kaggle MobileNetV2 migration."""
from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

os.environ["TF_USE_LEGACY_KERAS"] = "1"
os.environ["MPLCONFIGDIR"] = "/tmp"

_REPO_ROOT = Path(__file__).resolve().parents[2]

try:
    import mediapipe_model_maker  # noqa: F401
    from mediapipe_model_maker import image_classifier
    from mediapipe_model_maker.python.vision.image_classifier import model_spec
    import tensorflow_hub as hub
    HAS_MEDIAPIPE = True
except ImportError:
    HAS_MEDIAPIPE = False

import importlib.util
train_script_path = _REPO_ROOT / "scripts" / "train-mediapipe-model.py"
spec = importlib.util.spec_from_file_location("train_mediapipe_model", train_script_path)
train_module = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(train_module)


@unittest.skipUnless(HAS_MEDIAPIPE, "mediapipe_model_maker required for training tests")
class TestTrainMediaPipeModel(unittest.TestCase):
    """Verifies MobileNetV2 model spec configuration, error handling, and training invocation."""

    def tearDown(self) -> None:
        # Restore default Kaggle URI after each test
        train_module.configure_mobilenet_v2_spec(train_module.KAGGLE_MOBILENET_V2_URI)

    def test_configure_mobilenet_v2_spec_defaults(self) -> None:
        configured_spec = train_module.configure_mobilenet_v2_spec()
        self.assertEqual(configured_spec.uri, train_module.KAGGLE_MOBILENET_V2_URI)
        self.assertEqual(configured_spec.name, "mobilenet_v2")
        self.assertEqual(configured_spec.input_image_shape, [224, 224])

        enum_spec = model_spec.SupportedModels.get(model_spec.SupportedModels.MOBILENET_V2)
        self.assertEqual(enum_spec.uri, train_module.KAGGLE_MOBILENET_V2_URI)

    def test_configure_mobilenet_v2_spec_custom_uri(self) -> None:
        custom_uri = "https://www.kaggle.com/models/google/mobilenet-v2/frameworks/TensorFlow2/variations/custom/versions/1"
        configured_spec = train_module.configure_mobilenet_v2_spec(custom_uri)
        self.assertEqual(configured_spec.uri, custom_uri)

        enum_spec = model_spec.SupportedModels.get(model_spec.SupportedModels.MOBILENET_V2)
        self.assertEqual(enum_spec.uri, custom_uri)

    def test_invalid_uri_layer_creation_error_handling(self) -> None:
        invalid_uri = "https://example.com/nonexistent_model_spec/invalid/1"
        with self.assertRaises(Exception):
            hub.KerasLayer(invalid_uri)

    def test_smoke_image_classifier_creation_with_synthetic_dataset(self) -> None:
        from PIL import Image

        train_module.configure_mobilenet_v2_spec()

        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            for split in ("train", "val"):
                for cls_name in ("class_a", "class_b"):
                    d = tmp_path / split / cls_name
                    d.mkdir(parents=True)
                    for i in range(2):
                        img = Image.new("RGB", (224, 224), color=(200 if cls_name == "class_a" else 50, 120, i * 40))
                        img.save(d / f"img_{i}.jpg")

            train_data = image_classifier.Dataset.from_folder(str(tmp_path / "train"))
            val_data = image_classifier.Dataset.from_folder(str(tmp_path / "val"))
            self.assertEqual(len(train_data), 4)
            self.assertEqual(len(val_data), 4)

            hparams = image_classifier.HParams(
                export_dir=str(tmp_path / "out"),
                epochs=1,
                batch_size=2,
            )
            options = image_classifier.ImageClassifierOptions(
                supported_model=image_classifier.SupportedModels.MOBILENET_V2,
                hparams=hparams,
            )
            model = image_classifier.ImageClassifier.create(
                train_data=train_data,
                validation_data=val_data,
                options=options,
            )
            self.assertIsNotNone(model)


if __name__ == "__main__":
    unittest.main()
