from __future__ import annotations

import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "build-review-gallery.py"


def make_record(
    *,
    image_id: str,
    source_path: str,
    primary_dish_key: str,
    primary_dish_label_ja: str,
    analysis_confidence: float = 0.9,
    review_reasons: list[str] | None = None,
    needs_human_review: bool = False,
    primary_dish_candidates: list[dict[str, object]] | None = None,
    supporting_items: list[str] | None = None,
    review_note_ja: str = "",
    container_hint: str = "none",
    contains_can_or_bottle: bool = False,
    review_bucket: str = "normal",
) -> dict[str, object]:
    return {
        "schema_version": "food_label_exploration_v3",
        "image_id": image_id,
        "source_path": source_path,
        "is_food_related": True,
        "analysis_confidence": analysis_confidence,
        "primary_dish_key": primary_dish_key,
        "primary_dish_label_ja": primary_dish_label_ja,
        "primary_dish_candidates": primary_dish_candidates or [],
        "supporting_items": supporting_items or [],
        "scene_type": "single_dish",
        "cuisine_type": "japanese",
        "meal_style": "single_item",
        "serving_style": "single_plate",
        "contains_multiple_dishes": False,
        "is_drink_only": False,
        "is_sweets_or_dessert": False,
        "is_packaged_food": False,
        "is_menu_or_text_only": False,
        "is_takeout_or_delivery": False,
        "visual_attributes": [],
        "uncertainty_reasons": [],
        "review_reasons": review_reasons or [],
        "free_tags": [],
        "review_note_ja": review_note_ja,
        "needs_human_review": needs_human_review,
        "container_hint": container_hint,
        "contains_can_or_bottle": contains_can_or_bottle,
        "review_bucket": review_bucket,
    }


def write_jsonl(path: Path, records: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def write_candidate_csv(path: Path, rows: list[dict[str, str]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = ["image_id", "source_path", "candidate_reasons"]
    with path.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({field: row.get(field, "") for field in fieldnames})


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT_PATH), *args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


class BuildReviewGalleryCliTests(unittest.TestCase):
    def test_builds_from_jsonl_with_candidate_csvs_and_review_ui(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "run_output"
            output_html = input_dir / "review_gallery.html"
            labels_path = input_dir / "labels.jsonl"
            image_path = input_dir / "photos" / "unknown.jpg"
            image_path.parent.mkdir(parents=True, exist_ok=True)
            image_path.write_bytes(b"\xff\xd8\xff\xd9")

            records = [
                make_record(
                    image_id="img-unknown",
                    source_path="photos/unknown.jpg",
                    primary_dish_key="unknown",
                    primary_dish_label_ja="不明",
                    analysis_confidence=0.21,
                    review_reasons=["unknown_primary", "low_confidence"],
                    needs_human_review=True,
                    primary_dish_candidates=[
                        {"key": "unknown", "label_ja": "不明", "score": 0.21},
                        {"key": "curry_rice", "label_ja": "カレーライス", "score": 0.19},
                    ],
                    supporting_items=["salad"],
                    review_note_ja="主料理不明",
                ),
                make_record(
                    image_id="img-fish",
                    source_path="photos/fish.jpg",
                    primary_dish_key="grilled_fish",
                    primary_dish_label_ja="焼き魚",
                    analysis_confidence=0.93,
                    primary_dish_candidates=[
                        {"key": "grilled_fish", "label_ja": "焼き魚", "score": 0.93},
                    ],
                ),
            ]
            write_jsonl(labels_path, records)

            write_candidate_csv(
                input_dir / "unknown_candidates.csv",
                [
                    {
                        "image_id": "img-unknown",
                        "source_path": "photos/unknown.jpg",
                        "candidate_reasons": "csv:unknown",
                    }
                ],
            )
            write_candidate_csv(
                input_dir / "review_candidates.csv",
                [
                    {
                        "image_id": "img-unknown",
                        "source_path": "photos/unknown.jpg",
                        "candidate_reasons": "csv:review",
                    }
                ],
            )

            result = run_cli(
                "--input-path",
                str(labels_path),
                "--output-html",
                str(output_html),
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            html_text = output_html.read_text(encoding="utf-8")
            self.assertIn("Summary", html_text)
            self.assertIn("Section index", html_text)
            self.assertIn("href=\"#section-summary\"", html_text)
            self.assertIn("href=\"#section-unknown\"", html_text)
            self.assertIn("href=\"#section-review\"", html_text)
            self.assertIn("href=\"#section-all-records\"", html_text)
            self.assertIn("Unknown candidates", html_text)
            self.assertIn("Review targets", html_text)
            self.assertIn("All records", html_text)
            self.assertIn("Export review JSON", html_text)
            self.assertIn("Import review JSON", html_text)
            self.assertIn("localStorage", html_text)
            self.assertIn("known-primary-dish-keys", html_text)
            self.assertIn("UNKNOWN", html_text)
            self.assertIn("REVIEW_TARGET", html_text)
            self.assertIn("img-unknown::photos/unknown.jpg", html_text)
            self.assertIn("file://", html_text)
            self.assertIn("csv:unknown", html_text)

    def test_builds_from_normalized_without_labels_and_writes_provisional_jsonl(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "run_output"
            normalized_dir = input_dir / "normalized"
            normalized_dir.mkdir(parents=True, exist_ok=True)
            output_html = input_dir / "review_gallery.html"

            record = make_record(
                image_id="img-broad",
                source_path="photos/missing.jpg",
                primary_dish_key="stew",
                primary_dish_label_ja="煮込み",
                analysis_confidence=0.44,
                review_reasons=["broad_primary", "low_confidence"],
                needs_human_review=True,
                primary_dish_candidates=[
                    {"key": "stew", "label_ja": "煮込み", "score": 0.44},
                    {"key": "nimono", "label_ja": "煮物", "score": 0.39},
                ],
                review_note_ja="主料理粒度要確認",
            )
            (normalized_dir / "sample-1.jpg.json").write_text(
                json.dumps(record, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            (normalized_dir / "broken.json").write_text("{broken", encoding="utf-8")

            result = run_cli(
                "--input-path",
                str(input_dir),
                "--output-html",
                str(output_html),
                "--write-provisional-jsonl",
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            provisional_path = input_dir / "labels.provisional.jsonl"
            self.assertTrue(provisional_path.is_file())
            provisional_lines = provisional_path.read_text(encoding="utf-8").strip().splitlines()
            self.assertEqual(len(provisional_lines), 1)

            html_text = output_html.read_text(encoding="utf-8")
            self.assertIn("画像未解決", html_text)
            self.assertIn("壊れた JSON 件数", html_text)
            self.assertIn("labels.provisional.jsonl", html_text)
            self.assertIn("Broad primary candidates", html_text)
            self.assertIn("broad_primary_concrete_candidate_key", html_text)
            self.assertIn("nimono", html_text)
            self.assertIn("Broken JSON: 1", result.stdout)

    def test_unknown_with_container_hint_uses_display_primary_hint(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "run_output"
            output_html = input_dir / "review_gallery.html"
            labels_path = input_dir / "labels.jsonl"
            image_path = input_dir / "photos" / "bottle.jpg"
            image_path.parent.mkdir(parents=True, exist_ok=True)
            image_path.write_bytes(b"\xff\xd8\xff\xd9")

            records = [
                make_record(
                    image_id="img-bottle-hint",
                    source_path="photos/bottle.jpg",
                    primary_dish_key="unknown",
                    primary_dish_label_ja="不明",
                    analysis_confidence=0.23,
                    review_reasons=["unknown_primary", "low_confidence"],
                    needs_human_review=True,
                    review_note_ja="瓶主体で料理不明",
                    container_hint="bottle",
                    contains_can_or_bottle=True,
                    review_bucket="unknown_likely_bottle",
                )
            ]
            write_jsonl(labels_path, records)

            result = run_cli(
                "--input-path",
                str(labels_path),
                "--output-html",
                str(output_html),
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            html_text = output_html.read_text(encoding="utf-8")
            self.assertIn("bottle_hint / 瓶主体ヒント", html_text)
            self.assertIn("display_primary_dish_key", html_text)
            self.assertIn("raw_primary_dish_key", html_text)
            self.assertIn("container_hint", html_text)
            self.assertIn("review_bucket", html_text)

    def test_candidate_group_filter_unknown_only_restricts_sections_and_records(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "run_output"
            output_html = input_dir / "review_gallery.html"
            labels_path = input_dir / "labels.jsonl"
            input_dir.mkdir(parents=True, exist_ok=True)

            records = [
                make_record(
                    image_id="img-unknown",
                    source_path="photos/unknown.jpg",
                    primary_dish_key="unknown",
                    primary_dish_label_ja="不明",
                    analysis_confidence=0.18,
                    review_reasons=["unknown_primary"],
                    needs_human_review=True,
                ),
                make_record(
                    image_id="img-scene",
                    source_path="photos/scene.jpg",
                    primary_dish_key="set_meal",
                    primary_dish_label_ja="定食",
                    analysis_confidence=0.77,
                    review_reasons=["scene_dominant"],
                    needs_human_review=True,
                ),
            ]
            write_jsonl(labels_path, records)

            result = run_cli(
                "--input-path",
                str(input_dir),
                "--output-html",
                str(output_html),
                "--candidate-group",
                "unknown",
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            html_text = output_html.read_text(encoding="utf-8")
            self.assertIn("href=\"#section-unknown\"", html_text)
            self.assertNotIn("href=\"#section-scene_dominant\"", html_text)
            self.assertIn("Unknown candidates", html_text)
            self.assertIn("All records", html_text)
            self.assertNotIn("Scene dominant candidates", html_text)
            self.assertNotIn("img-scene", html_text)
            self.assertIn("img-unknown", html_text)

    def test_missing_image_and_review_app_primitives_are_present(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "run_output"
            output_html = input_dir / "review_gallery.html"
            labels_path = input_dir / "labels.jsonl"
            input_dir.mkdir(parents=True, exist_ok=True)

            records = [
                make_record(
                    image_id="img-note",
                    source_path="photos/not-found.jpg",
                    primary_dish_key="fried_cutlet",
                    primary_dish_label_ja="とんかつ",
                    analysis_confidence=0.89,
                    review_reasons=[],
                    needs_human_review=False,
                    primary_dish_candidates=[
                        {"key": "fried_cutlet", "label_ja": "とんかつ", "score": 0.89},
                    ],
                )
            ]
            write_jsonl(labels_path, records)

            result = run_cli(
                "--input-path",
                str(labels_path),
                "--output-html",
                str(output_html),
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            html_text = output_html.read_text(encoding="utf-8")
            self.assertIn("画像未解決", html_text)
            self.assertIn("--image-root /path/to/photo/root", html_text)
            self.assertIn("data-review-field=\"human_judgment\"", html_text)
            self.assertIn("data-review-field=\"corrected_primary_dish_key\"", html_text)
            self.assertIn("data-review-field=\"review_note\"", html_text)
            self.assertIn("Clear saved state", html_text)
            self.assertIn("record_index", html_text)
            self.assertIn("review-results", html_text)

    def test_image_root_resolves_nested_file_when_source_path_is_basename_only(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "run_output"
            image_root = root / "zip2"
            nested_image = image_root / "2022" / "06" / "MESHI_20220618_211242.jpg"
            output_html = input_dir / "review_gallery.html"
            labels_path = input_dir / "labels.jsonl"
            input_dir.mkdir(parents=True, exist_ok=True)
            nested_image.parent.mkdir(parents=True, exist_ok=True)
            nested_image.write_bytes(b"\xff\xd8\xff\xd9")

            records = [
                make_record(
                    image_id="img-basename",
                    source_path="MESHI_20220618_211242.jpg",
                    primary_dish_key="grilled_meat",
                    primary_dish_label_ja="焼肉",
                    analysis_confidence=0.82,
                    primary_dish_candidates=[
                        {"key": "grilled_meat", "label_ja": "焼肉", "score": 0.82},
                    ],
                )
            ]
            write_jsonl(labels_path, records)

            result = run_cli(
                "--input-path",
                str(labels_path),
                "--output-html",
                str(output_html),
                "--image-root",
                str(image_root),
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            html_text = output_html.read_text(encoding="utf-8")
            self.assertIn("file://", html_text)
            self.assertNotIn("画像未解決", html_text)
            self.assertIn("MESHI_20220618_211242.jpg", html_text)

    def test_embed_images_outputs_data_uri_for_safari_friendly_mode(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "run_output"
            image_root = root / "zip2"
            image_path = image_root / "MESHI_20220618_211242.jpg"
            output_html = input_dir / "review_gallery.html"
            labels_path = input_dir / "labels.jsonl"
            input_dir.mkdir(parents=True, exist_ok=True)
            image_root.mkdir(parents=True, exist_ok=True)
            image_path.write_bytes(b"\xff\xd8\xff\xd9")

            records = [
                make_record(
                    image_id="img-embed",
                    source_path="MESHI_20220618_211242.jpg",
                    primary_dish_key="curry_rice",
                    primary_dish_label_ja="カレーライス",
                    analysis_confidence=0.91,
                    primary_dish_candidates=[
                        {"key": "curry_rice", "label_ja": "カレーライス", "score": 0.91},
                    ],
                )
            ]
            write_jsonl(labels_path, records)

            result = run_cli(
                "--input-path",
                str(labels_path),
                "--output-html",
                str(output_html),
                "--image-root",
                str(image_root),
                "--embed-images",
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)
            html_text = output_html.read_text(encoding="utf-8")
            self.assertIn("data:image/jpeg;base64,", html_text)
            self.assertNotIn("file://", html_text)


if __name__ == "__main__":
    unittest.main()
