#!/usr/bin/env python3
"""
MediaPipe Image Classifier Model Training Script

Usage:
    python3 scripts/train-mediapipe-model.py \
      --dataset-dir state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset \
      --output-dir state/mediapipe_models \
      --export-task-path android/app/src/main/assets/mediapipe/meal-input-assist.task
"""
from __future__ import annotations

import argparse
import os
import shutil
import sys
from pathlib import Path

os.environ["TF_USE_LEGACY_KERAS"] = "1"
os.environ["MPLCONFIGDIR"] = "/tmp"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Train a MediaPipe image classification model (.task) from an exported dataset."
    )
    parser.add_argument(
        "--dataset-dir",
        type=str,
        default="state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset",
        help="Path to exported MediaPipe dataset directory containing train/val/test splits",
    )
    parser.add_argument(
        "--output-dir",
        type=str,
        default="state/mediapipe_models",
        help="Directory to save training checkpoints and exported model",
    )
    parser.add_argument(
        "--export-task-path",
        type=str,
        default="android/app/src/main/assets/mediapipe/meal-input-assist.task",
        help="Optional path to copy the generated .task file",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=20,
        help="Number of training epochs (default: 20)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=8,
        help="Training batch size (default: 8)",
    )
    parser.add_argument(
        "--learning-rate",
        type=float,
        default=0.001,
        help="Learning rate (default: 0.001)",
    )
    return parser.parse_args()


def check_dependencies() -> None:
    try:
        import mediapipe_model_maker  # noqa: F401
    except ImportError:
        print(
            "ERROR: 'mediapipe-model-maker' is not installed in the current Python environment.\n\n"
            "To install the required dependencies, run:\n"
            "  pip install mediapipe-model-maker tensorflow\n",
            file=sys.stderr,
        )
        sys.exit(1)


def main() -> None:
    args = parse_args()
    check_dependencies()

    from mediapipe_model_maker import image_classifier

    dataset_dir = Path(args.dataset_dir).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    train_dir = dataset_dir / "train"
    val_dir = dataset_dir / "val"
    test_dir = dataset_dir / "test"

    print(f"Loading dataset from: {dataset_dir}")
    if train_dir.exists() and val_dir.exists():
        train_data = image_classifier.Dataset.from_folder(str(train_dir))
        val_data = image_classifier.Dataset.from_folder(str(val_dir))
        test_data = (
            image_classifier.Dataset.from_folder(str(test_dir))
            if test_dir.exists()
            else None
        )
    else:
        full_data = image_classifier.Dataset.from_folder(str(dataset_dir))
        train_data, rest_data = full_data.split(0.8)
        val_data, test_data = rest_data.split(0.5)

    print(f"Train samples: {len(train_data)}")
    print(f"Val samples:   {len(val_data)}")
    if test_data:
        print(f"Test samples:  {len(test_data)}")

    print(f"\nStarting training ({args.epochs} epochs, batch_size={args.batch_size})...")
    hparams = image_classifier.HParams(
        export_dir=str(output_dir),
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
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

    if test_data:
        print("\nEvaluating on test set...")
        loss, acc = model.evaluate(test_data)
        print(f"Test Loss: {loss:.4f}, Test Accuracy: {acc:.4f}")

    print("\nExporting model (.task)...")
    model.export_model()

    exported_model_files = list(output_dir.glob("*.task")) + list(output_dir.glob("*.tflite"))
    if not exported_model_files:
        model_file = output_dir / "model.tflite"
    else:
        model_file = exported_model_files[0]

    print(f"Exported model: {model_file}")

    if args.export_task_path:
        dest_path = Path(args.export_task_path).resolve()
        dest_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(model_file, dest_path)
        print(f"Copied .task model to target asset path: {dest_path}")

    print("\nTraining complete!")


if __name__ == "__main__":
    main()
