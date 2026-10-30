#!/usr/bin/env python3
"""MediaPipe Image Classifier Evaluation & Threshold Calibration for Refresh Step 2.

Evaluates quantized .task models on:
1. Test Split of each dataset
2. Human-confirmed Evaluation Set (deduped 362 photos from eval_excluded)

Computes:
- Top-1 Accuracy, Top-3 Accuracy, Macro-F1, Class-wise Precision/Recall/F1
- Confusion Matrix
- Threshold calibration curves on Validation Split (Main Dish Top-1, Side Dish Top-2)
- Comparative analysis between EfficientNet-Lite0 and Lite2
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

os.environ["TF_USE_LEGACY_KERAS"] = "1"
os.environ["MPLCONFIGDIR"] = "/tmp"

_REPO_ROOT = Path(__file__).resolve().parent.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from scripts.build_personal_dual_dataset import (
    PERSONAL_MAIN_16_CLASSES,
    PERSONAL_SIDE_15_CLASSES,
    UNIVERSAL_23_CLASSES,
    classify_universal_23class,
    load_blind_ext_lookup,
    resolve_image_path,
)


def load_eval_ground_truth(
    splits_manifest_path: Path,
    observations_jsonl_path: Path,
    blind_ext_path: Path,
    repo_root: Path,
) -> Dict[str, Any]:
    """Loads human-confirmed evaluation set (362 deduplicated photos from eval_excluded)."""
    with open(splits_manifest_path, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    # Filter eval_excluded items
    eval_splits = {
        item["image_id"]: item
        for item in manifest.get("splits", [])
        if item.get("split") == "eval_excluded"
    }

    # Load observations
    obs_map: Dict[str, Dict[str, Any]] = {}
    with open(observations_jsonl_path, "r", encoding="utf-8") as f:
        for line in f:
            if not line.strip():
                continue
            r = json.loads(line)
            iid = r.get("image_id")
            if iid and iid in eval_splits:
                obs_map[iid] = r

    ext_lookup = load_blind_ext_lookup(blind_ext_path)

    records: List[Dict[str, Any]] = []
    seen_photos: Set[str] = set()

    for iid, meta in sorted(eval_splits.items()):
        pk = meta.get("photo_key") or iid
        if pk in seen_photos:
            continue
        seen_photos.add(pk)

        obs = obs_map.get(iid)
        if not obs:
            continue

        img_path = resolve_image_path(obs, ext_lookup, repo_root)
        if not img_path or not img_path.exists():
            continue

        # Ground truths
        u_gt = classify_universal_23class(obs)
        is_main_target = meta.get("is_main_learning_target", False)
        main_gt = meta.get("main_class") if is_main_target else None

        meal_type = meta.get("meal_type")
        side_gt_list: List[str] = []
        if meal_type == "meal":
            raw_sides = [s for s in meta.get("side_classes", []) if s in PERSONAL_SIDE_15_CLASSES and s != "side_none"]
            side_gt_list = raw_sides if raw_sides else ["side_none"]

        records.append({
            "image_id": iid,
            "photo_key": pk,
            "image_path": img_path,
            "universal_gt": u_gt,
            "main_gt": main_gt,
            "is_main_target": is_main_target,
            "side_gt_list": side_gt_list,
            "meal_type": meal_type,
        })

    return {"total_records": len(records), "records": records}


def evaluate_model_on_folder(
    task_path: Path,
    dataset_split_dir: Path,
    all_classes: List[str],
    top_k: int = 5,
) -> Dict[str, Any]:
    """Evaluates .task model directly on a split folder (test or val)."""
    import mediapipe as mp

    if not task_path.exists():
        raise FileNotFoundError(f"Task file not found: {task_path}")
    if not dataset_split_dir.exists():
        raise FileNotFoundError(f"Dataset split dir not found: {dataset_split_dir}")

    BaseOptions = mp.tasks.BaseOptions
    ImageClassifier = mp.tasks.vision.ImageClassifier
    ImageClassifierOptions = mp.tasks.vision.ImageClassifierOptions

    options = ImageClassifierOptions(
        base_options=BaseOptions(model_asset_path=str(task_path)),
        max_results=top_k,
    )

    classifier = ImageClassifier.create_from_options(options)

    class_counts = Counter()
    top1_correct = 0
    top3_correct = 0
    total = 0

    per_class_tp = Counter()
    per_class_fp = Counter()
    per_class_fn = Counter()

    confusion_matrix = defaultdict(lambda: Counter())  # gt -> pred -> count
    predictions_log: List[Dict[str, Any]] = []

    for c_dir in sorted(dataset_split_dir.iterdir()):
        if not c_dir.is_dir():
            continue
        gt_class = c_dir.name
        for img_file in sorted(c_dir.glob("*.*")):
            if img_file.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
                continue

            mp_image = mp.Image.create_from_file(str(img_file))
            res = classifier.classify(mp_image)

            top_cats = []
            if res.classifications and res.classifications[0].categories:
                top_cats = res.classifications[0].categories

            top1_label = top_cats[0].category_name if len(top_cats) > 0 else "unknown"
            top1_score = float(top_cats[0].score) if len(top_cats) > 0 else 0.0

            top3_labels = [c.category_name for c in top_cats[:3]]
            top3_scores = [float(c.score) for c in top_cats[:3]]

            is_top1 = (top1_label == gt_class)
            is_top3 = (gt_class in top3_labels)

            total += 1
            class_counts[gt_class] += 1
            if is_top1:
                top1_correct += 1
                per_class_tp[gt_class] += 1
            else:
                per_class_fp[top1_label] += 1
                per_class_fn[gt_class] += 1

            if is_top3:
                top3_correct += 1

            confusion_matrix[gt_class][top1_label] += 1

            predictions_log.append({
                "image_name": img_file.name,
                "gt": gt_class,
                "top1_label": top1_label,
                "top1_score": round(top1_score, 4),
                "top3_labels": top3_labels,
                "top3_scores": [round(s, 4) for s in top3_scores],
                "is_top1": is_top1,
                "is_top3": is_top3,
            })

    # Metrics
    top1_acc = top1_correct / total if total > 0 else 0.0
    top3_acc = top3_correct / total if total > 0 else 0.0

    class_metrics: Dict[str, Dict[str, float]] = {}
    f1_list: List[float] = []

    for c in all_classes:
        tp = per_class_tp[c]
        fp = per_class_fp[c]
        fn = per_class_fn[c]
        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

        class_metrics[c] = {
            "samples": class_counts[c],
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
        }
        if class_counts[c] > 0:
            f1_list.append(f1)

    macro_f1 = sum(f1_list) / len(f1_list) if f1_list else 0.0

    return {
        "total_samples": total,
        "top1_accuracy": round(top1_acc, 4),
        "top3_accuracy": round(top3_acc, 4),
        "macro_f1": round(macro_f1, 4),
        "class_metrics": class_metrics,
        "confusion_matrix": {gt: dict(preds) for gt, preds in confusion_matrix.items()},
        "predictions": predictions_log,
    }


def evaluate_model_on_human_eval_set(
    task_path: Path,
    model_type: str,  # "universal", "main", or "side"
    eval_set: List[Dict[str, Any]],
    all_classes: List[str],
    top_k: int = 5,
) -> Dict[str, Any]:
    """Evaluates .task model on human-confirmed evaluation set (362 photos)."""
    import mediapipe as mp

    BaseOptions = mp.tasks.BaseOptions
    ImageClassifier = mp.tasks.vision.ImageClassifier
    ImageClassifierOptions = mp.tasks.vision.ImageClassifierOptions

    options = ImageClassifierOptions(
        base_options=BaseOptions(model_asset_path=str(task_path)),
        max_results=top_k,
    )
    classifier = ImageClassifier.create_from_options(options)

    total = 0
    top1_correct = 0
    top3_correct = 0

    per_class_tp = Counter()
    per_class_fp = Counter()
    per_class_fn = Counter()
    class_counts = Counter()
    confusion_matrix = defaultdict(lambda: Counter())

    predictions: List[Dict[str, Any]] = []

    for item in eval_set:
        img_p = item["image_path"]

        if model_type == "universal":
            gt = item["universal_gt"]
            if not gt:
                continue
            gt_is_multi = False
        elif model_type == "main":
            if not item["is_main_target"]:
                continue
            gt = item["main_gt"]
            if not gt:
                continue
            gt_is_multi = False
        elif model_type == "side":
            if item["meal_type"] != "meal":
                continue
            gt_list = item["side_gt_list"]
            if not gt_list:
                continue
            gt_is_multi = True
        else:
            raise ValueError(f"Unknown model_type: {model_type}")

        mp_image = mp.Image.create_from_file(str(img_p))
        res = classifier.classify(mp_image)

        top_cats = []
        if res.classifications and res.classifications[0].categories:
            top_cats = res.classifications[0].categories

        top1_label = top_cats[0].category_name if len(top_cats) > 0 else "unknown"
        top1_score = float(top_cats[0].score) if len(top_cats) > 0 else 0.0

        top3_labels = [c.category_name for c in top_cats[:3]]
        top3_scores = [float(c.score) for c in top_cats[:3]]

        total += 1

        if not gt_is_multi:
            # Single label evaluation (Universal or Main)
            class_counts[gt] += 1
            is_top1 = (top1_label == gt)
            is_top3 = (gt in top3_labels)

            if is_top1:
                top1_correct += 1
                per_class_tp[gt] += 1
            else:
                per_class_fp[top1_label] += 1
                per_class_fn[gt] += 1

            if is_top3:
                top3_correct += 1

            confusion_matrix[gt][top1_label] += 1
        else:
            # Multi-label evaluation for Side dish
            # Top-1 is correct if top1_label is in gt_list
            is_top1 = (top1_label in gt_list)
            # Top-3 has hit if any top3 label is in gt_list
            is_top3 = any(l in gt_list for l in top3_labels)

            if is_top1:
                top1_correct += 1
            if is_top3:
                top3_correct += 1

            # Precision/Recall for each tag in gt_list
            for g in gt_list:
                class_counts[g] += 1
                if g in top3_labels[:2]:  # Hit in Top-2
                    per_class_tp[g] += 1
                else:
                    per_class_fn[g] += 1

            if top1_label not in gt_list:
                per_class_fp[top1_label] += 1

            confusion_matrix[gt_list[0]][top1_label] += 1

        predictions.append({
            "image_id": item["image_id"],
            "photo_key": item["photo_key"],
            "gt": gt_list if gt_is_multi else gt,
            "top1_label": top1_label,
            "top1_score": round(top1_score, 4),
            "top3_labels": top3_labels,
            "top3_scores": [round(s, 4) for s in top3_scores],
            "is_top1": is_top1,
            "is_top3": is_top3,
        })

    top1_acc = top1_correct / total if total > 0 else 0.0
    top3_acc = top3_correct / total if total > 0 else 0.0

    class_metrics: Dict[str, Dict[str, float]] = {}
    f1_list: List[float] = []

    for c in all_classes:
        tp = per_class_tp[c]
        fp = per_class_fp[c]
        fn = per_class_fn[c]
        prec = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        rec = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = (2 * prec * rec) / (prec + rec) if (prec + rec) > 0 else 0.0

        class_metrics[c] = {
            "samples": class_counts[c],
            "tp": tp,
            "fp": fp,
            "fn": fn,
            "precision": round(prec, 4),
            "recall": round(rec, 4),
            "f1": round(f1, 4),
        }
        if class_counts[c] > 0:
            f1_list.append(f1)

    macro_f1 = sum(f1_list) / len(f1_list) if f1_list else 0.0

    return {
        "total_evaluated_samples": total,
        "top1_accuracy": round(top1_acc, 4),
        "top3_accuracy": round(top3_acc, 4),
        "macro_f1": round(macro_f1, 4),
        "class_metrics": class_metrics,
        "confusion_matrix": {gt: dict(preds) for gt, preds in confusion_matrix.items()},
        "predictions": predictions,
    }


def calibrate_thresholds(
    predictions: List[Dict[str, Any]],
    is_multi_label: bool = False,
) -> List[Dict[str, Any]]:
    """Sweeps confidence threshold from 0.1 to 0.95 and computes precision / coverage curve."""
    thresholds = [round(t * 0.05, 2) for t in range(2, 20)]  # 0.10 to 0.95
    curve = []

    total_samples = len(predictions)
    if total_samples == 0:
        return curve

    for th in thresholds:
        passed = [p for p in predictions if p["top1_score"] >= th]
        n_passed = len(passed)
        coverage = n_passed / total_samples

        if n_passed == 0:
            prec = 1.0
        else:
            if not is_multi_label:
                n_correct = sum(1 for p in passed if p["is_top1"])
            else:
                n_correct = sum(1 for p in passed if p["is_top1"])
            prec = n_correct / n_passed

        curve.append({
            "threshold": th,
            "passed_samples": n_passed,
            "coverage": round(coverage, 4),
            "precision": round(prec, 4),
        })

    return curve


def evaluate_old_44tag_model(
    task_path: Path,
    test_main_dir: Path,
    test_side_dir: Path,
    eval_set: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Evaluates legacy personal_multilabel_44tag.task on the same test and eval sets."""
    import mediapipe as mp

    if not task_path.exists():
        return {"available": False, "reason": f"File not found: {task_path}"}

    BaseOptions = mp.tasks.BaseOptions
    ImageClassifier = mp.tasks.vision.ImageClassifier
    ImageClassifierOptions = mp.tasks.vision.ImageClassifierOptions

    options = ImageClassifierOptions(
        base_options=BaseOptions(model_asset_path=str(task_path)),
        max_results=5,
    )
    classifier = ImageClassifier.create_from_options(options)

    # 1. Main Dish Test Split Evaluation
    main_total = 0
    main_top1_correct = 0
    main_top3_correct = 0

    for c_dir in sorted(test_main_dir.iterdir()):
        if not c_dir.is_dir():
            continue
        gt = c_dir.name
        for img_p in sorted(c_dir.glob("*.*")):
            if img_p.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
                continue
            mp_img = mp.Image.create_from_file(str(img_p))
            res = classifier.classify(mp_img)
            top_cats = res.classifications[0].categories if res.classifications else []
            top1 = top_cats[0].category_name if top_cats else ""
            top3 = [c.category_name for c in top_cats[:3]]

            # Note: Japanese noodles mapping handling
            gt_candidates = [gt]
            if gt == "main_japanese_noodles":
                gt_candidates = ["main_udon", "main_soba"]

            main_total += 1
            if top1 in gt_candidates:
                main_top1_correct += 1
            if any(g in top3 for g in gt_candidates):
                main_top3_correct += 1

    # 2. Side Dish Test Split Evaluation
    side_total = 0
    side_top1_correct = 0
    side_top3_correct = 0

    for c_dir in sorted(test_side_dir.iterdir()):
        if not c_dir.is_dir():
            continue
        gt = c_dir.name
        if gt == "side_none":
            continue
        for img_p in sorted(c_dir.glob("*.*")):
            if img_p.suffix.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
                continue
            mp_img = mp.Image.create_from_file(str(img_p))
            res = classifier.classify(mp_img)
            top_cats = res.classifications[0].categories if res.classifications else []
            top1 = top_cats[0].category_name if top_cats else ""
            top3 = [c.category_name for c in top_cats[:3]]

            side_total += 1
            if top1 == gt:
                side_top1_correct += 1
            if gt in top3:
                side_top3_correct += 1

    return {
        "available": True,
        "task_path": str(task_path),
        "model_bytes": task_path.stat().st_size,
        "main_test_top1": round(main_top1_correct / main_total, 4) if main_total > 0 else 0.0,
        "main_test_top3": round(main_top3_correct / main_total, 4) if main_total > 0 else 0.0,
        "side_test_top1": round(side_top1_correct / side_total, 4) if side_total > 0 else 0.0,
        "side_test_top3": round(side_top3_correct / side_total, 4) if side_total > 0 else 0.0,
    }


def parse_eval_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate MediaPipe Step 2 Models.")
    parser.add_argument(
        "--datasets-dir",
        type=Path,
        default=_REPO_ROOT / "state" / "mediapipe_labeling_runs" / "open_observation_20261013" / "dataset_v2",
    )
    parser.add_argument(
        "--models-dir",
        type=Path,
        default=_REPO_ROOT / "state" / "mediapipe_models" / "refresh_step2",
    )
    parser.add_argument(
        "--splits-manifest",
        type=Path,
        default=_REPO_ROOT / "state" / "mediapipe_labeling_runs" / "open_observation_20261013" / "session_splits_manifest.json",
    )
    parser.add_argument(
        "--observations-jsonl",
        type=Path,
        default=_REPO_ROOT / "state" / "mediapipe_labeling_runs" / "open_observation_20261013" / "observations_all_3391.jsonl",
    )
    parser.add_argument(
        "--blind-ext-mapping",
        type=Path,
        default=_REPO_ROOT / "state" / "mediapipe_labeling_runs" / "open_observation_20261013" / "blind_ext_mapping.json",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=_REPO_ROOT / "state" / "mediapipe_models" / "refresh_step2" / "evaluation_report",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_eval_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)

    print("Loading human-confirmed evaluation set...")
    eval_gt_data = load_eval_ground_truth(
        splits_manifest_path=args.splits_manifest,
        observations_jsonl_path=args.observations_jsonl,
        blind_ext_path=args.blind_ext_mapping,
        repo_root=_REPO_ROOT,
    )
    eval_records = eval_gt_data["records"]
    print(f"Loaded {len(eval_records)} evaluation records (deduped photos from eval_excluded).")

    models_config = [
        ("universal_dining_23class", "universal", UNIVERSAL_23_CLASSES),
        ("personal_main_dish", "main", PERSONAL_MAIN_16_CLASSES),
        ("personal_side_dish", "side", PERSONAL_SIDE_15_CLASSES),
    ]
    backbones = ["lite0", "lite2"]

    summary_results = []
    threshold_calibrations = {}

    for model_key, model_type, classes in models_config:
        for bb in backbones:
            task_path = args.models_dir / model_key / bb / f"{model_key}_{bb}.task"
            if not task_path.exists():
                print(f"Skipping {task_path} (not found)")
                continue

            print(f"\n{'='*70}")
            print(f"Evaluating: {model_key} [{bb.upper()}] ({task_path.name})")
            print(f"{'='*70}")

            model_bytes = task_path.stat().st_size
            ds_path = args.datasets_dir / model_key

            # 1. Test Split
            print("Evaluating on Test split...")
            test_res = evaluate_model_on_folder(
                task_path=task_path,
                dataset_split_dir=ds_path / "test",
                all_classes=list(classes),
            )

            # 2. Validation Split (for threshold calibration)
            print("Evaluating on Validation split for threshold calibration...")
            val_res = evaluate_model_on_folder(
                task_path=task_path,
                dataset_split_dir=ds_path / "val",
                all_classes=list(classes),
            )
            val_curve = calibrate_thresholds(val_res["predictions"], is_multi_label=(model_type == "side"))
            threshold_calibrations[f"{model_key}_{bb}"] = val_curve

            # 3. Human-Confirmed Evaluation Set
            print("Evaluating on Human-confirmed Evaluation Set (362 photos)...")
            eval_set_res = evaluate_model_on_human_eval_set(
                task_path=task_path,
                model_type=model_type,
                eval_set=eval_records,
                all_classes=list(classes),
            )

            row = {
                "model_key": model_key,
                "model_type": model_type,
                "backbone": bb,
                "task_size_mb": round(model_bytes / (1024 * 1024), 2),
                "test_top1": test_res["top1_accuracy"],
                "test_top3": test_res["top3_accuracy"],
                "test_macro_f1": test_res["macro_f1"],
                "val_top1": val_res["top1_accuracy"],
                "val_top3": val_res["top3_accuracy"],
                "val_macro_f1": val_res["macro_f1"],
                "eval_set_top1": eval_set_res["top1_accuracy"],
                "eval_set_top3": eval_set_res["top3_accuracy"],
                "eval_set_macro_f1": eval_set_res["macro_f1"],
                "test_confusion": test_res["confusion_matrix"],
                "test_class_metrics": test_res["class_metrics"],
                "eval_class_metrics": eval_set_res["class_metrics"],
            }
            summary_results.append(row)

    # 4. Old model evaluation
    old_task_path = _REPO_ROOT / "state" / "mediapipe_models" / "personal_multilabel_44tags" / "personal_multilabel_44tag.task"
    old_model_res = evaluate_old_44tag_model(
        task_path=old_task_path,
        test_main_dir=args.datasets_dir / "personal_main_dish" / "test",
        test_side_dir=args.datasets_dir / "personal_side_dish" / "test",
        eval_set=eval_records,
    )

    # Save full JSON
    full_output = {
        "summary": summary_results,
        "threshold_calibrations": threshold_calibrations,
        "old_model_comparison": old_model_res,
    }
    with open(args.output_dir / "evaluation_results.json", "w", encoding="utf-8") as f:
        json.dump(full_output, f, indent=2, ensure_ascii=False)

    print(f"\nEvaluation completed! Results written to: {args.output_dir / 'evaluation_results.json'}")


if __name__ == "__main__":
    main()
