from __future__ import annotations

import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "export-mediapipe-dataset.py"


def make_record(
    *,
    image_id: str,
    source_path: str,
    primary_dish_key: str,
    is_food_related: bool = True,
    scene_type: str = "single_dish",
    review_reasons: list[str] | None = None,
) -> dict[str, object]:
    return {
        "schema_version": "food_label_exploration_v3",
        "image_id": image_id,
        "source_path": source_path,
        "is_food_related": is_food_related,
        "analysis_confidence": 0.9,
        "primary_dish_key": primary_dish_key,
        "primary_dish_label_ja": primary_dish_key,
        "primary_dish_candidates": [
            {"key": primary_dish_key, "label_ja": primary_dish_key, "score": 0.9},
        ],
        "supporting_items": [],
        "scene_type": scene_type,
        "review_reasons": review_reasons or [],
        "needs_human_review": bool(review_reasons),
    }


def write_jsonl(path: Path, records: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def write_review_json(path: Path, records: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps({"version": 1, "records": records}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def write_review_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        "image_id",
        "source_path",
        "predicted_primary_dish_key",
        "human_judgment",
        "corrected_primary_dish_key",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fieldnames})


def touch_image(root: Path, relative_path: str) -> None:
    path = root / relative_path
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(b"\xff\xd8\xff\xd9")


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT_PATH), *args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


def read_summary(output_dir: Path) -> dict[str, object]:
    return json.loads((output_dir / "dataset_summary.json").read_text(encoding="utf-8"))


def image_layout(output_dir: Path) -> list[str]:
    paths: list[str] = []
    for split in ("train", "val", "test"):
        split_dir = output_dir / split
        if split_dir.exists():
            paths.extend(path.relative_to(output_dir).as_posix() for path in split_dir.rglob("*.jpg"))
    return sorted(paths)


class ExportMediaPipeDatasetTests(unittest.TestCase):
    def test_labels_jsonl_only_builds_split_dataset_and_seed_is_reproducible(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            image_root = root / "images"
            labels_path = root / "labels.jsonl"
            output_a = root / "dataset-a"
            output_b = root / "dataset-b"
            records = []
            for index in range(6):
                source_path = f"photos/curry_{index}.jpg"
                touch_image(image_root, source_path)
                records.append(
                    make_record(
                        image_id=f"img-curry-{index}",
                        source_path=source_path,
                        primary_dish_key="curry_rice",
                    )
                )
            write_jsonl(labels_path, records)

            result_a = run_cli(
                "--labels-jsonl",
                str(labels_path),
                "--image-root",
                str(image_root),
                "--output-dir",
                str(output_a),
                "--val-ratio",
                "0.2",
                "--test-ratio",
                "0.2",
                "--seed",
                "99",
            )
            result_b = run_cli(
                "--labels-jsonl",
                str(labels_path),
                "--image-root",
                str(image_root),
                "--output-dir",
                str(output_b),
                "--val-ratio",
                "0.2",
                "--test-ratio",
                "0.2",
                "--seed",
                "99",
            )

            self.assertEqual(result_a.returncode, 0, msg=result_a.stderr)
            self.assertEqual(result_b.returncode, 0, msg=result_b.stderr)
            summary = read_summary(output_a)
            self.assertEqual(summary["counts"]["included_count"], 6)
            self.assertEqual(summary["counts"]["excluded_count"], 0)
            self.assertEqual(summary["split_counts"], {"train": 4, "val": 1, "test": 1})
            self.assertEqual(summary["class_counts"], {"curry_rice": 6})
            self.assertEqual((output_a / "labels.txt").read_text(encoding="utf-8"), "curry_rice\n")
            self.assertTrue((output_a / "label_map.json").is_file())
            self.assertTrue((output_a / "dataset_summary.md").is_file())
            self.assertEqual(image_layout(output_a), image_layout(output_b))

    def test_review_json_correction_overrides_ai_and_csv(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            image_root = root / "images"
            labels_path = root / "labels.jsonl"
            review_json = root / "review.json"
            review_csv = root / "review.csv"
            output_dir = root / "dataset"
            source_path = "photos/corrected.jpg"
            touch_image(image_root, source_path)
            write_jsonl(
                labels_path,
                [
                    make_record(
                        image_id="img-corrected",
                        source_path=source_path,
                        primary_dish_key="grilled_fish",
                    )
                ],
            )
            write_review_csv(
                review_csv,
                [
                    {
                        "image_id": "img-corrected",
                        "source_path": source_path,
                        "predicted_primary_dish_key": "grilled_fish",
                        "human_judgment": "incorrect",
                        "corrected_primary_dish_key": "pasta",
                    }
                ],
            )
            write_review_json(
                review_json,
                [
                    {
                        "image_id": "img-corrected",
                        "source_path": source_path,
                        "predicted_primary_dish_key": "grilled_fish",
                        "human_judgment": "incorrect",
                        "corrected_primary_dish_key": "curry_rice",
                    }
                ],
            )

            result = run_cli(
                "--labels-jsonl",
                str(labels_path),
                "--image-root",
                str(image_root),
                "--output-dir",
                str(output_dir),
                "--review-json",
                str(review_json),
                "--review-csv",
                str(review_csv),
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            summary = read_summary(output_dir)
            self.assertEqual(summary["class_counts"], {"curry_rice": 1})
            self.assertEqual(summary["counts"]["correction_applied_count"], 1)
            self.assertEqual(summary["counts"]["ai_label_used_count"], 0)
            self.assertTrue((output_dir / "train" / "curry_rice").is_dir())
            self.assertFalse((output_dir / "train" / "fish_dish").exists())

    def test_excludes_unknown_missing_unmappable_and_unknown_correction(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            image_root = root / "images"
            labels_path = root / "labels.jsonl"
            review_json = root / "review.json"
            output_dir = root / "dataset"
            touch_image(image_root, "photos/unknown.jpg")
            touch_image(image_root, "photos/unmapped.jpg")
            touch_image(image_root, "photos/bad-correction.jpg")
            write_jsonl(
                labels_path,
                [
                    make_record(
                        image_id="img-unknown",
                        source_path="photos/unknown.jpg",
                        primary_dish_key="unknown",
                    ),
                    make_record(
                        image_id="img-missing",
                        source_path="photos/missing.jpg",
                        primary_dish_key="curry_rice",
                    ),
                    make_record(
                        image_id="img-unmapped",
                        source_path="photos/unmapped.jpg",
                        primary_dish_key="alien_food",
                    ),
                    make_record(
                        image_id="img-bad-correction",
                        source_path="photos/bad-correction.jpg",
                        primary_dish_key="grilled_fish",
                    ),
                ],
            )
            write_review_json(
                review_json,
                [
                    {
                        "image_id": "img-bad-correction",
                        "source_path": "photos/bad-correction.jpg",
                        "human_judgment": "incorrect",
                        "corrected_primary_dish_key": "謎料理",
                    }
                ],
            )

            result = run_cli(
                "--labels-jsonl",
                str(labels_path),
                "--image-root",
                str(image_root),
                "--output-dir",
                str(output_dir),
                "--review-json",
                str(review_json),
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            summary = read_summary(output_dir)
            self.assertEqual(summary["counts"]["included_count"], 0)
            self.assertEqual(summary["counts"]["excluded_count"], 4)
            self.assertEqual(
                summary["excluded_reason_counts"],
                {
                    "missing_image": 1,
                    "unknown_correction_label": 1,
                    "unknown_label": 1,
                    "unmapped_label": 1,
                },
            )
            manifest_lines = (output_dir / "excluded" / "excluded_manifest.jsonl").read_text(encoding="utf-8").splitlines()
            self.assertEqual(len(manifest_lines), 4)

    def test_dry_run_writes_summary_without_copying_images(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            image_root = root / "images"
            labels_path = root / "labels.jsonl"
            output_dir = root / "dataset"
            records = []
            for index in range(3):
                source_path = f"photos/pasta_{index}.jpg"
                touch_image(image_root, source_path)
                records.append(
                    make_record(
                        image_id=f"img-pasta-{index}",
                        source_path=source_path,
                        primary_dish_key="pasta",
                    )
                )
            write_jsonl(labels_path, records)

            result = run_cli(
                "--labels-jsonl",
                str(labels_path),
                "--image-root",
                str(image_root),
                "--output-dir",
                str(output_dir),
                "--dry-run",
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            summary = read_summary(output_dir)
            self.assertTrue(summary["dry_run"])
            self.assertEqual(summary["counts"]["included_count"], 3)
            self.assertFalse((output_dir / "train").exists())
            self.assertFalse((output_dir / "val").exists())
            self.assertFalse((output_dir / "test").exists())
            self.assertTrue((output_dir / "label_map.json").is_file())
            self.assertTrue((output_dir / "dataset_summary.md").is_file())
            self.assertTrue((output_dir / "excluded" / "excluded_manifest.jsonl").is_file())

    def test_min_class_count_excludes_small_classes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            image_root = root / "images"
            labels_path = root / "labels.jsonl"
            output_dir = root / "dataset"
            touch_image(image_root, "photos/curry.jpg")
            touch_image(image_root, "photos/pasta.jpg")
            write_jsonl(
                labels_path,
                [
                    make_record(
                        image_id="img-curry",
                        source_path="photos/curry.jpg",
                        primary_dish_key="curry_rice",
                    ),
                    make_record(
                        image_id="img-pasta",
                        source_path="photos/pasta.jpg",
                        primary_dish_key="pasta",
                    ),
                ],
            )

            result = run_cli(
                "--labels-jsonl",
                str(labels_path),
                "--image-root",
                str(image_root),
                "--output-dir",
                str(output_dir),
                "--min-class-count",
                "2",
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            summary = read_summary(output_dir)
            self.assertEqual(summary["counts"]["included_count"], 0)
            self.assertEqual(summary["excluded_reason_counts"], {"below_min_class_count": 2})
            self.assertEqual(
                summary["min_class_count_excluded_classes"],
                [
                    {"class": "curry_rice", "count": 1},
                    {"class": "pasta", "count": 1},
                ],
            )


if __name__ == "__main__":
    unittest.main()
