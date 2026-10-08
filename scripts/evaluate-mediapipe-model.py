#!/usr/bin/env python3
"""
MediaPipe Image Classifier Model Evaluation Script

Evaluates a trained .task / .tflite image classification model against
an exported dataset (train, val, test splits) and calculates:
- Top-1 & Top-3 Accuracy
- Average Confidence Score
- Class-wise Precision, Recall, and F1-Score
- Confusion Matrix
- Per-sample prediction breakdown

Usage:
    python3 scripts/evaluate-mediapipe-model.py \
      --model-path android/app/src/main/assets/mediapipe/meal-input-assist.task \
      --dataset-dir state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset \
      --output-md state/mediapipe_models/evaluation_report.md
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Any

os.environ["TF_USE_LEGACY_KERAS"] = "1"
os.environ["MPLCONFIGDIR"] = "/tmp"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Evaluate MediaPipe image classification model (.task) on dataset splits."
    )
    parser.add_argument(
        "--model-path",
        type=str,
        default="android/app/src/main/assets/mediapipe/meal-input-assist.task",
        help="Path to .task model file (default: android/app/src/main/assets/mediapipe/meal-input-assist.task)",
    )
    parser.add_argument(
        "--dataset-dir",
        type=str,
        default="state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset",
        help="Path to exported dataset directory containing train/val/test folders",
    )
    parser.add_argument(
        "--output-json",
        type=str,
        default=None,
        help="Optional path to write full evaluation results as JSON",
    )
    parser.add_argument(
        "--output-md",
        type=str,
        default=None,
        help="Optional path to write evaluation summary report as Markdown",
    )
    parser.add_argument(
        "--split",
        type=str,
        default="all",
        choices=["all", "test", "val", "train"],
        help="Which split to evaluate: 'all' (default), 'test', 'val', or 'train'",
    )
    return parser.parse_args()


def check_dependencies() -> None:
    try:
        import mediapipe  # noqa: F401
    except ImportError:
        print(
            "ERROR: 'mediapipe' is not installed in the current Python environment.\n"
            "Please use the project's virtual environment:\n"
            "  uv run --python .venv_mediapipe python scripts/evaluate-mediapipe-model.py ...\n",
            file=sys.stderr,
        )
        sys.exit(1)


def load_labels(dataset_path: Path) -> list[str]:
    labels_file = dataset_path / "labels.txt"
    if labels_file.exists():
        with open(labels_file, "r", encoding="utf-8") as f:
            return [line.strip() for line in f if line.strip()]
    label_map_file = dataset_path / "label_map.json"
    if label_map_file.exists():
        with open(label_map_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            return sorted(data.keys())
    # Fallback to directories
    train_dir = dataset_path / "train"
    if train_dir.exists():
        return sorted([d.name for d in train_dir.iterdir() if d.is_dir()])
    return []


def evaluate_split(classifier: Any, split_dir: Path) -> list[dict[str, Any]]:
    import mediapipe as mp

    results = []
    if not split_dir.exists():
        return results

    for class_dir in sorted(split_dir.iterdir()):
        if not class_dir.is_dir():
            continue
        ground_truth = class_dir.name
        for img_path in sorted(class_dir.glob("*.*")):
            if img_path.suffix.lower() not in [".jpg", ".jpeg", ".png", ".webp"]:
                continue

            mp_image = mp.Image.create_from_file(str(img_path))
            classification_result = classifier.classify(mp_image)

            top_categories = []
            if classification_result.classifications:
                top_categories = classification_result.classifications[0].categories

            top1_label = top_categories[0].category_name if len(top_categories) > 0 else "unknown"
            top1_score = float(top_categories[0].score) if len(top_categories) > 0 else 0.0

            top3_labels = [c.category_name for c in top_categories[:3]]

            is_top1 = (top1_label == ground_truth)
            is_top3 = (ground_truth in top3_labels)

            results.append({
                "image_name": img_path.name,
                "ground_truth": ground_truth,
                "top1_label": top1_label,
                "top1_score": round(top1_score, 4),
                "is_top1": is_top1,
                "is_top3": is_top3,
                "top_predictions": [
                    {"label": c.category_name, "score": round(float(c.score), 4)}
                    for c in top_categories[:3]
                ],
            })
    return results


def compute_metrics(results: list[dict[str, Any]], labels: list[str]) -> dict[str, Any]:
    if not results:
        return {
            "total": 0,
            "top1_correct": 0,
            "top1_accuracy": 0.0,
            "top3_correct": 0,
            "top3_accuracy": 0.0,
            "avg_confidence": 0.0,
            "macro_f1": 0.0,
            "class_metrics": {},
            "confusion_matrix": {},
        }

    total = len(results)
    top1_correct = sum(1 for r in results if r["is_top1"])
    top3_correct = sum(1 for r in results if r["is_top3"])
    avg_conf = sum(r["top1_score"] for r in results) / total

    class_stats = defaultdict(lambda: {"gt": 0, "pred": 0, "tp": 0})
    for r in results:
        gt = r["ground_truth"]
        pred = r["top1_label"]
        class_stats[gt]["gt"] += 1
        class_stats[pred]["pred"] += 1
        if gt == pred:
            class_stats[gt]["tp"] += 1

    # Include any labels present in ground_truth or prediction even if not in label list
    extra_labels = sorted(
        (set(class_stats.keys()) - set(labels))
    )
    all_classes = list(labels) + extra_labels

    class_metrics = {}
    f1_list_with_gt = []
    for lbl in all_classes:
        stat = class_stats[lbl]
        gt_cnt = stat["gt"]
        pred_cnt = stat["pred"]
        tp_cnt = stat["tp"]
        precision = (tp_cnt / pred_cnt) if pred_cnt > 0 else 0.0
        recall = (tp_cnt / gt_cnt) if gt_cnt > 0 else 0.0
        f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) > 0 else 0.0
        class_metrics[lbl] = {
            "samples": gt_cnt,
            "tp": tp_cnt,
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1": round(f1, 4),
        }
        if gt_cnt > 0:
            f1_list_with_gt.append(f1)

    macro_f1 = (sum(f1_list_with_gt) / len(f1_list_with_gt)) if f1_list_with_gt else 0.0

    conf_matrix = defaultdict(lambda: defaultdict(int))
    for r in results:
        conf_matrix[r["ground_truth"]][r["top1_label"]] += 1

    return {
        "total": total,
        "top1_correct": top1_correct,
        "top1_accuracy": round(top1_correct / total, 4),
        "top3_correct": top3_correct,
        "top3_accuracy": round(top3_correct / total, 4),
        "avg_confidence": round(avg_conf, 4),
        "macro_f1": round(macro_f1, 4),
        "evaluation_classes": all_classes,
        "class_metrics": class_metrics,
        "confusion_matrix": {gt: dict(preds) for gt, preds in conf_matrix.items()},
    }


def generate_markdown_report(data: dict[str, Any]) -> str:
    lines = []
    lines.append("# MediaPipe Model Evaluation Report\n")
    lines.append("## 1. Overall Performance\n")
    lines.append("| Split | Samples | Top-1 Accuracy | Top-3 Accuracy | Avg Confidence |")
    lines.append("|:---|:---:|:---:|:---:|:---:|")

    for split_name in ["test", "val", "train", "overall"]:
        if split_name in data and "metrics" in data[split_name] and data[split_name]["metrics"]:
            m = data[split_name]["metrics"]
            tot = m.get("total", 0)
            if tot > 0:
                lines.append(
                    f"| **{split_name.capitalize()}** | {tot} | "
                    f"{m['top1_accuracy']*100:.1f}% ({m['top1_correct']}/{tot}) | "
                    f"{m['top3_accuracy']*100:.1f}% ({m['top3_correct']}/{tot}) | "
                    f"{m['avg_confidence']*100:.1f}% |"
                )
            else:
                lines.append(f"| **{split_name.capitalize()}** | 0 | 0.0% (0/0) | 0.0% (0/0) | 0.0% |")
    lines.append("")

    if "overall" in data and "metrics" in data["overall"] and data["overall"]["metrics"].get("total", 0) > 0:
        lines.append("## 2. Class Metrics (Overall)\n")
        lines.append("| Class | Samples | Correct (TP) | Precision | Recall | F1-Score |")
        lines.append("|:---|:---:|:---:|:---:|:---:|:---:|")
        cm = data["overall"]["metrics"].get("class_metrics", {})
        for cls_name, stat in cm.items():
            lines.append(
                f"| `{cls_name}` | {stat['samples']} | {stat['tp']} | "
                f"{stat['precision']*100:.1f}% | {stat['recall']*100:.1f}% | {stat['f1']*100:.1f}% |"
            )
        lines.append("")

        lines.append("## 3. Confusion Matrix (Row: True, Col: Pred)\n")
        eval_classes = data["overall"]["metrics"].get("evaluation_classes", data.get("labels", []))
        short_labels = [l[:5] for l in eval_classes]
        header = "| True \\ Pred | " + " | ".join(short_labels) + " |"
        sep = "|:---|" + "|".join([":---:" for _ in short_labels]) + "|"
        lines.append(header)
        lines.append(sep)
        conf_mat = data["overall"]["metrics"].get("confusion_matrix", {})
        for true_l in eval_classes:
            row_vals = [str(conf_mat.get(true_l, {}).get(pred_l, 0)) for pred_l in eval_classes]
            lines.append(f"| `{true_l}` | " + " | ".join(row_vals) + " |")
        lines.append("")

    if "test" in data and "details" in data["test"] and data["test"]["details"]:
        lines.append("## 4. Test Set Predictions\n")
        lines.append("| Image | Ground Truth | Top-1 Pred | Match | Top-3 Candidates |")
        lines.append("|:---|:---|:---|:---:|:---|")
        for item in data["test"]["details"]:
            status = "✅ Top-1" if item["is_top1"] else ("🟡 Top-3" if item["is_top3"] else "❌ Miss")
            candidates = ", ".join([f"{c['label']} ({c['score']*100:.1f}%)" for c in item["top_predictions"]])
            lines.append(
                f"| `{item['image_name'][:25]}...` | `{item['ground_truth']}` | `{item['top1_label']}` | {status} | {candidates} |"
            )
        lines.append("")

    return "\n".join(lines)


def main() -> None:
    args = parse_args()
    check_dependencies()

    from mediapipe.tasks import python
    from mediapipe.tasks.python import vision

    model_path = Path(args.model_path).resolve()
    dataset_dir = Path(args.dataset_dir).resolve()

    if not model_path.exists():
        print(f"ERROR: Model file not found at: {model_path}", file=sys.stderr)
        sys.exit(1)
    if not dataset_dir.exists():
        print(f"ERROR: Dataset directory not found at: {dataset_dir}", file=sys.stderr)
        sys.exit(1)

    print(f"Loading model: {model_path}")
    base_options = python.BaseOptions(model_asset_path=str(model_path))
    options = vision.ImageClassifierOptions(base_options=base_options, max_results=5)
    classifier = vision.ImageClassifier.create_from_options(options)

    labels = load_labels(dataset_dir)
    print(f"Loaded {len(labels)} classes: {', '.join(labels)}")

    splits_to_run = ["test", "val", "train"] if args.split == "all" else [args.split]
    eval_data: dict[str, Any] = {"labels": labels}
    overall_results: list[dict[str, Any]] = []

    print("\n--- Running Evaluation ---")
    for s in splits_to_run:
        split_path = dataset_dir / s
        res = evaluate_split(classifier, split_path)
        metrics = compute_metrics(res, labels)
        eval_data[s] = {"metrics": metrics, "details": res}
        overall_results.extend(res)
        if metrics:
            print(
                f"[{s.upper():<5}] Top-1: {metrics['top1_accuracy']*100:>5.1f}% | "
                f"Top-3: {metrics['top3_accuracy']*100:>5.1f}% | "
                f"Avg Conf: {metrics['avg_confidence']*100:>5.1f}% | "
                f"Total: {metrics['total']}"
            )

    if args.split == "all" and overall_results:
        eval_data["overall"] = {
            "metrics": compute_metrics(overall_results, labels),
            "details": overall_results,
        }
        om = eval_data["overall"]["metrics"]
        print("-" * 50)
        print(
            f"[TOTAL] Top-1: {om['top1_accuracy']*100:>5.1f}% | "
            f"Top-3: {om['top3_accuracy']*100:>5.1f}% | "
            f"Avg Conf: {om['avg_confidence']*100:>5.1f}% | "
            f"Total: {om['total']}"
        )

    if args.output_json:
        out_json = Path(args.output_json).resolve()
        out_json.parent.mkdir(parents=True, exist_ok=True)
        with open(out_json, "w", encoding="utf-8") as f:
            json.dump(eval_data, f, indent=2, ensure_ascii=False)
        print(f"\nSaved evaluation JSON to: {out_json}")

    if args.output_md:
        out_md = Path(args.output_md).resolve()
        out_md.parent.mkdir(parents=True, exist_ok=True)
        md_content = generate_markdown_report(eval_data)
        with open(out_md, "w", encoding="utf-8") as f:
            f.write(md_content)
        print(f"Saved evaluation Markdown report to: {out_md}")


if __name__ == "__main__":
    main()
