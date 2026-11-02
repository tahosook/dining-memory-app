#!/usr/bin/env python3
"""MediaPipe Image Classifier Training Pipeline for Refresh Step 2.

Trains 3 models x 2 backbones (Lite0 and Lite2) = 6 models:
1. universal_dining_23class (Lite0, Lite2)
2. personal_main_dish (Lite0, Lite2)
3. personal_side_dish (Lite0, Lite2)

Enforces:
- EfficientNet-Lite0 / Lite2 transfer learning (do_fine_tuning=False)
- Label smoothing 0.1
- Head dropout 0.25
- Balanced class weights for long-tail classes
- Dynamic range quantization at export time producing valid .task files
- Sequential progress reporting to progress_log.json
"""
from __future__ import annotations

import argparse
import json
import os
import shutil
import sys
import time
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

os.environ["TF_USE_LEGACY_KERAS"] = "1"
os.environ["MPLCONFIGDIR"] = "/tmp"

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train MediaPipe classifiers for Step 2.")
    parser.add_argument(
        "--datasets-dir",
        type=Path,
        default=_REPO_ROOT / "state" / "mediapipe_labeling_runs" / "open_observation_20261013" / "dataset_v2",
        help="Root directory containing universal_dining_23class, personal_main_dish, personal_side_dish",
    )
    parser.add_argument(
        "--models-dir",
        type=Path,
        default=_REPO_ROOT / "state" / "mediapipe_models" / "refresh_step2",
        help="Output directory to save trained .task models and checkpoints",
    )
    parser.add_argument(
        "--model-filter",
        type=str,
        default=None,
        choices=["universal", "main", "side"],
        help="Filter to train only a specific model category",
    )
    parser.add_argument(
        "--backbone-filter",
        type=str,
        default=None,
        choices=["lite0", "lite2"],
        help="Filter to train only a specific backbone",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=12,
        help="Number of epochs for training",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=16,
        help="Batch size for training",
    )
    parser.add_argument(
        "--learning-rate",
        type=float,
        default=0.002,
        help="Initial learning rate",
    )
    return parser.parse_args()


def calculate_class_weights(dataset_dir: Path, label_names: List[str]) -> Dict[int, float]:
    """Calculate balanced class weights from train folder counts with safe bounds [0.25, 4.0]."""
    train_dir = dataset_dir / "train"
    counts: Dict[str, int] = {}
    total = 0
    for name in label_names:
        c_dir = train_dir / name
        n = len(list(c_dir.glob("*.*"))) if c_dir.exists() else 0
        counts[name] = max(n, 1)
        total += max(n, 1)

    k = len(label_names)
    weights: Dict[int, float] = {}
    for idx, name in enumerate(label_names):
        n = counts[name]
        # balanced formula: total / (k * n)
        w = total / (k * n)
        # clip to prevent extreme instability
        clipped_w = max(0.25, min(4.0, w))
        weights[idx] = round(clipped_w, 4)

    return weights


def train_single_model(
    model_key: str,
    backbone_name: str,
    dataset_path: Path,
    output_dir: Path,
    epochs: int = 12,
    batch_size: int = 16,
    learning_rate: float = 0.002,
) -> Dict[str, Any]:
    """Trains a single model configuration and exports quantized .task."""
    import tensorflow as tf
    from mediapipe_model_maker import image_classifier, quantization

    print(f"\n{'='*70}")
    print(f"=== Starting Training: {model_key} [{backbone_name.upper()}] ===")
    print(f"Dataset path: {dataset_path}")
    print(f"Output path:  {output_dir}")
    print(f"Epochs: {epochs}, Batch size: {batch_size}, LR: {learning_rate}")
    print(f"{'='*70}\n")

    output_dir.mkdir(parents=True, exist_ok=True)
    checkpoint_dir = output_dir / "checkpoints"
    checkpoint_dir.mkdir(parents=True, exist_ok=True)

    # 1. Select backbone
    if backbone_name == "lite0":
        supported_model = image_classifier.SupportedModels.EFFICIENTNET_LITE0
    elif backbone_name == "lite2":
        supported_model = image_classifier.SupportedModels.EFFICIENTNET_LITE2
    else:
        raise ValueError(f"Unsupported backbone: {backbone_name}")

    # 2. Load dataset splits
    print("Loading dataset splits...")
    t0_data = time.perf_counter()
    train_data = image_classifier.Dataset.from_folder(str(dataset_path / "train"))
    val_data = image_classifier.Dataset.from_folder(str(dataset_path / "val"))
    t1_data = time.perf_counter()
    print(f"Data loaded in {t1_data - t0_data:.2f}s: train={len(train_data)}, val={len(val_data)}, classes={len(train_data.label_names)}")

    # 3. Class weights calculation
    class_weights = calculate_class_weights(dataset_path, list(train_data.label_names))
    print(f"Computed class weights range: min={min(class_weights.values()):.2f}, max={max(class_weights.values()):.2f}")

    # 4. Training Options
    hparams = image_classifier.HParams(
        export_dir=str(checkpoint_dir),
        epochs=epochs,
        batch_size=batch_size,
        learning_rate=learning_rate,
        do_fine_tuning=False,
        label_smoothing=0.1,
        class_weights=class_weights,
        do_data_augmentation=True,
    )
    model_options = image_classifier.ModelOptions(
        dropout_rate=0.25,
    )
    options = image_classifier.ImageClassifierOptions(
        supported_model=supported_model,
        hparams=hparams,
        model_options=model_options,
    )

    t0_train = time.perf_counter()
    classifier = image_classifier.ImageClassifier.create(
        train_data=train_data,
        validation_data=val_data,
        options=options,
    )
    total_train_sec = time.perf_counter() - t0_train
    print(f"Training finished in {total_train_sec:.2f}s ({total_train_sec/60:.2f} min)")

    # 5. Quantization and Export as .task
    task_name = f"{model_key}_{backbone_name}.task"
    task_path = output_dir / task_name
    print(f"\nExporting quantized model as '{task_name}'...")
    quant_config = quantization.QuantizationConfig.for_dynamic()
    classifier.export_model(
        model_name=task_name,
        quantization_config=quant_config,
    )

    if not task_path.exists():
        cand = checkpoint_dir / task_name
        if cand.exists():
            shutil.copy2(cand, task_path)

    if not task_path.exists():
        raise FileNotFoundError(f"Exported .task file not found at {task_path}")

    model_bytes = task_path.stat().st_size
    print(f"✓ Successfully exported: {task_path} ({model_bytes / (1024*1024):.2f} MB)")

    # Save summary metadata
    meta = {
        "model_key": model_key,
        "backbone": backbone_name,
        "classes": list(train_data.label_names),
        "num_classes": len(train_data.label_names),
        "task_path": str(task_path),
        "model_bytes": model_bytes,
        "training_time_sec": round(total_train_sec, 2),
        "epochs": epochs,
        "batch_size": batch_size,
        "learning_rate": learning_rate,
    }
    with open(output_dir / f"{model_key}_{backbone_name}_meta.json", "w", encoding="utf-8") as f:
        json.dump(meta, f, indent=2, ensure_ascii=False)

    return meta


def main() -> None:
    args = parse_args()
    datasets_dir = args.datasets_dir
    models_dir = args.models_dir
    models_dir.mkdir(parents=True, exist_ok=True)
    progress_file = models_dir / "training_progress.json"

    configs = [
        ("universal_dining_23class", datasets_dir / "universal_dining_23class", "universal"),
        ("personal_main_dish", datasets_dir / "personal_main_dish", "main"),
        ("personal_side_dish", datasets_dir / "personal_side_dish", "side"),
    ]

    backbones = ["lite0", "lite2"]

    # Load existing progress if any
    completed_trainings = []
    if progress_file.exists():
        try:
            with open(progress_file, "r", encoding="utf-8") as f:
                completed_trainings = json.load(f)
        except Exception:
            completed_trainings = []

    total_start = time.perf_counter()
    trained_count = 0

    for model_key, dataset_path, cat in configs:
        if args.model_filter and cat != args.model_filter:
            continue
        for bb in backbones:
            if args.backbone_filter and bb != args.backbone_filter:
                continue

            target_out = models_dir / model_key / bb
            task_file = target_out / f"{model_key}_{bb}.task"

            print(f"\n>>> Step {trained_count+1}/6: Preparing {model_key} [{bb}] <<<")
            try:
                res = train_single_model(
                    model_key=model_key,
                    backbone_name=bb,
                    dataset_path=dataset_path,
                    output_dir=target_out,
                    epochs=args.epochs,
                    batch_size=args.batch_size,
                    learning_rate=args.learning_rate,
                )
                completed_trainings.append(res)
                trained_count += 1
                with open(progress_file, "w", encoding="utf-8") as f:
                    json.dump(completed_trainings, f, indent=2, ensure_ascii=False)
                print(f">>> Completed {trained_count}/6 trainings. Progress saved to {progress_file} <<<\n")
            except Exception as e:
                print(f"ERROR training {model_key} [{bb}]: {e}", file=sys.stderr)
                import traceback
                traceback.print_exc()
                sys.exit(1)

    total_time = time.perf_counter() - total_start
    print(f"\n{'='*70}")
    print(f"All {trained_count} trainings completed successfully in {total_time/60:.2f} minutes!")
    print(f"{'='*70}\n")


if __name__ == "__main__":
    main()
