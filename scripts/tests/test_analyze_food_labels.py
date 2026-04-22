from __future__ import annotations

import csv
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SCRIPT_PATH = REPO_ROOT / "scripts" / "analyze-food-labels.py"


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
    review_note_ja: str = "",
    coarse_primary_dish_key: str | None = None,
    coarse_primary_dish_label_ja: str | None = None,
    broad_refinement_status: str = "not_applicable",
    broad_refinement_compare_keys: list[str] | None = None,
    broad_refinement_note_ja: str = "",
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
        "supporting_items": [],
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
        "container_hint": "none",
        "contains_can_or_bottle": False,
        "review_bucket": "normal",
        "coarse_primary_dish_key": coarse_primary_dish_key or primary_dish_key,
        "coarse_primary_dish_label_ja": coarse_primary_dish_label_ja or primary_dish_label_ja,
        "broad_refinement_status": broad_refinement_status,
        "broad_refinement_compare_keys": broad_refinement_compare_keys or [],
        "broad_refinement_note_ja": broad_refinement_note_ja,
        "broad_refinement_image_mode": "full_image",
    }


def write_jsonl(path: Path, records: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        for record in records:
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")


def read_csv_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        return list(csv.DictReader(handle))


def run_cli(*args: str) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        [sys.executable, str(SCRIPT_PATH), *args],
        cwd=REPO_ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


class AnalyzeFoodLabelsCliTests(unittest.TestCase):
    def test_outputs_residual_broad_candidates_and_refinement_summary(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            root = Path(temp_dir)
            input_dir = root / "run_output"
            output_dir = root / "analysis"
            labels_path = input_dir / "labels.jsonl"

            records = [
                make_record(
                    image_id="img-resolved",
                    source_path="photos/resolved.jpg",
                    primary_dish_key="nimono",
                    primary_dish_label_ja="煮物",
                    analysis_confidence=0.84,
                    primary_dish_candidates=[
                        {"key": "nimono", "label_ja": "煮物", "score": 0.84},
                        {"key": "stew", "label_ja": "煮込み", "score": 0.42},
                    ],
                    coarse_primary_dish_key="stew",
                    coarse_primary_dish_label_ja="煮込み",
                    broad_refinement_status="resolved",
                    broad_refinement_compare_keys=["nimono", "curry_rice", "meat_and_potato_stew", "stew"],
                ),
                make_record(
                    image_id="img-broad",
                    source_path="photos/broad.jpg",
                    primary_dish_key="meat_dish",
                    primary_dish_label_ja="肉料理",
                    analysis_confidence=0.57,
                    review_reasons=["broad_primary"],
                    needs_human_review=True,
                    primary_dish_candidates=[
                        {"key": "meat_dish", "label_ja": "肉料理", "score": 0.57},
                        {"key": "grilled_meat", "label_ja": "焼き肉系", "score": 0.46},
                    ],
                    review_note_ja="焼きか炒めか判別困難",
                    coarse_primary_dish_key="meat_dish",
                    coarse_primary_dish_label_ja="肉料理",
                    broad_refinement_status="kept_broad",
                    broad_refinement_compare_keys=["stir_fry", "grilled_meat", "meat_dish"],
                    broad_refinement_note_ja="焼きか炒めか判別困難",
                ),
                make_record(
                    image_id="img-scene",
                    source_path="photos/scene.jpg",
                    primary_dish_key="multi_dish_table",
                    primary_dish_label_ja="食卓全景",
                    analysis_confidence=0.73,
                    review_reasons=["scene_dominant"],
                    needs_human_review=True,
                    review_note_ja="scene優勢",
                ),
                make_record(
                    image_id="img-unknown",
                    source_path="photos/unknown.jpg",
                    primary_dish_key="unknown",
                    primary_dish_label_ja="不明",
                    analysis_confidence=0.22,
                    review_reasons=["unknown_primary", "low_confidence"],
                    needs_human_review=True,
                    review_note_ja="主料理不明",
                ),
            ]
            write_jsonl(labels_path, records)

            result = run_cli(
                "--input-path",
                str(input_dir),
                "--output-dir",
                str(output_dir),
            )

            self.assertEqual(result.returncode, 0, msg=result.stderr)

            summary_json = json.loads((output_dir / "summary.json").read_text(encoding="utf-8"))
            summary_md = (output_dir / "summary.md").read_text(encoding="utf-8")
            broad_rows = read_csv_rows(output_dir / "broad_primary_candidates.csv")
            review_rows = read_csv_rows(output_dir / "review_candidates.csv")
            scene_rows = read_csv_rows(output_dir / "scene_dominant_candidates.csv")

            self.assertEqual(summary_json["totals"]["broad_primary"]["count"], 1)
            self.assertEqual(summary_json["totals"]["coarse_broad_primary"]["count"], 2)
            self.assertEqual(summary_json["totals"]["broad_refinement_resolved"]["count"], 1)
            self.assertEqual(summary_json["totals"]["broad_refinement_kept_broad"]["count"], 1)
            self.assertEqual(summary_json["totals"]["broad_refinement_failed"]["count"], 0)
            self.assertEqual(summary_json["candidate_counts"]["broad_primary_candidates"], 1)
            self.assertEqual(summary_json["candidate_counts"]["scene_dominant_candidates"], 1)

            self.assertEqual(len(broad_rows), 1)
            self.assertEqual(broad_rows[0]["image_id"], "img-broad")
            self.assertIn("broad_fallback:meat_dish", broad_rows[0]["candidate_reasons"])
            self.assertIn("best_alt:grilled_meat", broad_rows[0]["candidate_reasons"])
            self.assertIn("refine_note:焼きか炒めか判別困難", broad_rows[0]["candidate_reasons"])

            review_ids = {row["image_id"] for row in review_rows}
            self.assertEqual(review_ids, {"img-broad", "img-scene", "img-unknown"})

            self.assertEqual(len(scene_rows), 1)
            self.assertEqual(scene_rows[0]["image_id"], "img-scene")

            self.assertIn("coarse_broad_primary 件数: 2", summary_md)
            self.assertIn("broad_refinement_resolved 件数: 1", summary_md)
            self.assertIn("broad_refinement_kept_broad 件数: 1", summary_md)
            self.assertIn("### broad_refinement_resolved_to_key", summary_md)

            resolved_top = summary_json["top_counts"]["broad_refinement_resolved_to_key"]
            self.assertEqual(resolved_top[0]["value"], "nimono")
            self.assertEqual(resolved_top[0]["count"], 1)


if __name__ == "__main__":
    unittest.main()
