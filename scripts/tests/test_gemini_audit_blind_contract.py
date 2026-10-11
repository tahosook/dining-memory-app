from __future__ import annotations

import json
import re
import unittest
from pathlib import Path
from typing import Any, Dict, List

from scripts.validate_zip2_audit_manifest import compute_sha256, extract_exif_dates

_REPO_ROOT = Path(__file__).resolve().parent.parent.parent
SAMPLE_DIR = (
    _REPO_ROOT
    / "state"
    / "mediapipe_labeling_runs"
    / "zip2-audit-manifest-20261009"
    / "gemini_audit_sample_70"
)

ALLOWED_CLASSES = {
    "curry_rice",
    "drink",
    "fish_dish",
    "fried_dish",
    "meat_dish",
    "simmered_dish",
    "stir_fry",
    "unknown",
}

ALLOWED_REASON_CODES = {
    "clear_single_dish",
    "multiple_dishes_dominant_chosen",
    "multiple_dishes_unresolvable",
    "not_in_class_set",
    "poor_image_quality",
    "non_food_or_menu",
    "ambiguous_cooking_method",
}

# Population counts from image_audit_manifest_remediated.csv (831 candidates total)
POPULATION_COUNTS = {
    "curry_rice": 120,
    "drink": 118,
    "fish_dish": 118,
    "fried_dish": 119,
    "meat_dish": 118,
    "simmered_dish": 118,
    "stir_fry": 120,
}


def validate_audit_prediction_record(rec: Dict[str, Any]) -> None:
    """Validate a single Gemini prediction record against the spec schema and combination matrix."""
    required_keys = {"blind_id", "predicted_class", "is_uncertain", "reason_code"}
    if set(rec.keys()) != required_keys:
        raise ValueError(f"Record keys mismatch: expected {required_keys}, got {set(rec.keys())}")

    blind_id = rec["blind_id"]
    if not isinstance(blind_id, str) or not re.match(r"^blind_\d{3}$", blind_id):
        raise ValueError(f"Invalid blind_id format: {blind_id}")

    predicted_class = rec["predicted_class"]
    if predicted_class not in ALLOWED_CLASSES:
        raise ValueError(f"Invalid predicted_class: {predicted_class}")

    is_uncertain = rec["is_uncertain"]
    if not isinstance(is_uncertain, bool):
        raise ValueError(f"is_uncertain must be boolean, got {type(is_uncertain)}")

    reason_code = rec["reason_code"]
    if reason_code not in ALLOWED_REASON_CODES:
        raise ValueError(f"Invalid reason_code: {reason_code}")

    # Combination Consistency Rules (Section 4.3 of spec)
    if predicted_class != "unknown":
        # Concrete 7 classes
        if reason_code in {
            "multiple_dishes_unresolvable",
            "not_in_class_set",
            "poor_image_quality",
            "non_food_or_menu",
        }:
            raise ValueError(
                f"Contradiction: reason_code '{reason_code}' cannot be used with concrete class '{predicted_class}'"
            )
        if reason_code == "clear_single_dish" and is_uncertain is not False:
            raise ValueError("Contradiction: reason_code 'clear_single_dish' requires is_uncertain to be False")
        if reason_code == "ambiguous_cooking_method" and is_uncertain is not True:
            raise ValueError("Contradiction: reason_code 'ambiguous_cooking_method' requires is_uncertain to be True")
    else:
        # predicted_class == "unknown"
        if reason_code in {"clear_single_dish", "multiple_dishes_dominant_chosen"}:
            raise ValueError(
                f"Contradiction: reason_code '{reason_code}' cannot be used with 'unknown'"
            )
        if reason_code in {"multiple_dishes_unresolvable", "poor_image_quality", "ambiguous_cooking_method"}:
            if is_uncertain is not True:
                raise ValueError(
                    f"Contradiction: reason_code '{reason_code}' with 'unknown' requires is_uncertain to be True"
                )


def scan_jpeg_metadata_markers(jpeg_path: Path) -> List[str]:
    """Scan JPEG segments and return any prohibited metadata markers (APP1..APP15, COM)."""
    data = jpeg_path.read_bytes()
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        raise ValueError(f"Invalid JPEG: {jpeg_path}")

    found_markers: List[str] = []
    idx = 2
    length_data = len(data)

    while idx < length_data - 1:
        if data[idx] != 0xFF:
            break
        while idx < length_data - 1 and data[idx] == 0xFF:
            idx += 1
        marker = data[idx]
        idx += 1

        if marker == 0xD9:  # EOI
            break
        elif marker in (0xD0, 0xD1, 0xD2, 0xD3, 0xD4, 0xD5, 0xD6, 0xD7, 0x01):  # RST / TEM
            continue

        if idx + 2 > length_data:
            break
        import struct
        seg_len = struct.unpack(">H", data[idx : idx + 2])[0]

        # Check for prohibited markers: APP1..APP15 (0xE1..0xEF), COM (0xFE)
        if 0xE1 <= marker <= 0xEF:
            found_markers.append(f"APP{marker - 0xE0}")
        elif marker == 0xFE:
            found_markers.append("COM")

        idx += seg_len
        if marker == 0xDA:  # SOS
            break

    return found_markers


def compute_audit_agreement_metrics(
    predictions: List[Dict[str, Any]],
    mapping_records: List[Dict[str, Any]],
    population_counts: Dict[str, int] | None = None,
) -> Dict[str, Any]:
    """Compute agreement rate, class-level agreement, confusion matrix, unknown rate, and weighted rate."""
    pred_by_id = {p["blind_id"]: p for p in predictions}
    mapping_by_id = {m["blind_id"]: m for m in mapping_records}

    if set(pred_by_id.keys()) != set(mapping_by_id.keys()):
        raise ValueError("Blind ID mismatch between predictions and mapping records")

    total = len(predictions)
    agreed_count = 0
    unknown_count = 0
    uncertain_count = 0

    class_counts: Dict[str, int] = {}
    class_agreed: Dict[str, int] = {}

    confusion_matrix: Dict[str, Dict[str, int]] = {}

    for b_id, pred in pred_by_id.items():
        validate_audit_prediction_record(pred)
        mapping = mapping_by_id[b_id]
        true_class = mapping["mapped_class"]
        pred_class = pred["predicted_class"]

        class_counts[true_class] = class_counts.get(true_class, 0) + 1
        if true_class not in confusion_matrix:
            confusion_matrix[true_class] = {c: 0 for c in sorted(ALLOWED_CLASSES)}
        confusion_matrix[true_class][pred_class] += 1

        if pred_class == true_class:
            agreed_count += 1
            class_agreed[true_class] = class_agreed.get(true_class, 0) + 1

        if pred_class == "unknown":
            unknown_count += 1

        if pred["is_uncertain"]:
            uncertain_count += 1

    class_agreement_rate = {
        cls: (class_agreed.get(cls, 0) / class_counts[cls]) if class_counts.get(cls, 0) > 0 else 0.0
        for cls in sorted(class_counts.keys())
    }

    # Stratified weighted agreement rate for the candidate population (831 items)
    pop_counts = population_counts or POPULATION_COUNTS
    total_pop = sum(pop_counts.get(cls, 0) for cls in class_agreement_rate.keys())
    if total_pop > 0:
        weighted_agreed = sum(
            class_agreement_rate[cls] * pop_counts.get(cls, 0)
            for cls in class_agreement_rate.keys()
        )
        weighted_agreement_rate = weighted_agreed / total_pop
    else:
        weighted_agreement_rate = agreed_count / total if total > 0 else 0.0

    return {
        "total_samples": total,
        "overall_agreement_count": agreed_count,
        "overall_agreement_rate": agreed_count / total if total > 0 else 0.0,
        "unknown_count": unknown_count,
        "unknown_rate": unknown_count / total if total > 0 else 0.0,
        "uncertain_count": uncertain_count,
        "uncertain_rate": uncertain_count / total if total > 0 else 0.0,
        "class_counts": class_counts,
        "class_agreed": class_agreed,
        "class_agreement_rate": class_agreement_rate,
        "weighted_agreement_rate": weighted_agreement_rate,
        "confusion_matrix": confusion_matrix,
    }


class TestGeminiAuditBlindContract(unittest.TestCase):
    def test_real_blind_request_inputs_has_no_labels_or_mappings(self) -> None:
        """Verify that real blind_request_inputs.jsonl contains ZERO label or origin information."""
        blind_inputs_path = SAMPLE_DIR / "blind_request_inputs.jsonl"
        self.assertTrue(blind_inputs_path.is_file(), f"Missing {blind_inputs_path}")

        raw_text = blind_inputs_path.read_text(encoding="utf-8")
        lines = [line.strip() for line in raw_text.splitlines() if line.strip()]
        self.assertEqual(len(lines), 70)

        # Check for absolute absence of class names or original path patterns in the file
        forbidden_strings = [
            "curry_rice",
            "drink",
            "fish_dish",
            "fried_dish",
            "meat_dish",
            "simmered_dish",
            "stir_fry",
            "MESHI",
            "candidate",
            "primary_dish_key",
            "mapped_class",
            "confidence",
        ]
        for s in forbidden_strings:
            self.assertNotIn(s, raw_text, f"Forbidden string '{s}' found in blind_request_inputs.jsonl")

        for idx, line in enumerate(lines, 1):
            rec = json.loads(line)
            self.assertEqual(set(rec.keys()), {"blind_id", "image_file"})
            self.assertEqual(rec["blind_id"], f"blind_{idx:03d}")
            self.assertEqual(rec["image_file"], f"blind_{idx:03d}.jpg")

    def test_real_blind_images_metadata_free(self) -> None:
        """Verify that all 70 real blind images exist and have zero EXIF DateTime metadata."""
        blind_images_dir = SAMPLE_DIR / "blind_images"
        self.assertTrue(blind_images_dir.is_dir(), f"Missing {blind_images_dir}")

        for idx in range(1, 71):
            img_path = blind_images_dir / f"blind_{idx:03d}.jpg"
            self.assertTrue(img_path.is_file(), f"Missing image {img_path}")
            exif = extract_exif_dates(img_path)
            self.assertEqual(exif, {}, f"EXIF metadata found in {img_path}: {exif}")

    def test_output_json_schema_validation(self) -> None:
        """Verify that the JSON schema validator correctly accepts basic valid records and rejects syntax violations."""
        valid_rec = {
            "blind_id": "blind_001",
            "predicted_class": "curry_rice",
            "is_uncertain": False,
            "reason_code": "clear_single_dish",
        }
        # Should not raise
        validate_audit_prediction_record(valid_rec)

        # Invalid blind_id
        with self.assertRaises(ValueError):
            validate_audit_prediction_record({**valid_rec, "blind_id": "image_123"})

        # Invalid predicted_class
        with self.assertRaises(ValueError):
            validate_audit_prediction_record({**valid_rec, "predicted_class": "ramen"})

        # Invalid is_uncertain type
        with self.assertRaises(ValueError):
            validate_audit_prediction_record({**valid_rec, "is_uncertain": "maybe"})

        # Invalid reason_code
        with self.assertRaises(ValueError):
            validate_audit_prediction_record({**valid_rec, "reason_code": "looks_good"})

        # Missing key
        with self.assertRaises(ValueError):
            validate_audit_prediction_record({"blind_id": "blind_001", "predicted_class": "curry_rice"})

        # Extra key
        with self.assertRaises(ValueError):
            validate_audit_prediction_record({**valid_rec, "explanation": "Too verbose"})

    def test_output_json_schema_valid_combinations(self) -> None:
        """Verify all legitimate field combinations defined in Section 4.3 matrix pass validation."""
        valid_cases = [
            # 1. 7 classes + clear_single_dish (must be False)
            ("curry_rice", False, "clear_single_dish"),
            ("drink", False, "clear_single_dish"),
            ("fish_dish", False, "clear_single_dish"),
            ("fried_dish", False, "clear_single_dish"),
            ("meat_dish", False, "clear_single_dish"),
            ("simmered_dish", False, "clear_single_dish"),
            ("stir_fry", False, "clear_single_dish"),
            # 2. 7 classes + multiple_dishes_dominant_chosen (can be False or True)
            ("fried_dish", False, "multiple_dishes_dominant_chosen"),
            ("fried_dish", True, "multiple_dishes_dominant_chosen"),
            # 3. 7 classes + ambiguous_cooking_method (must be True)
            ("meat_dish", True, "ambiguous_cooking_method"),
            # 4. unknown + not_in_class_set (can be False or True)
            ("unknown", False, "not_in_class_set"),
            ("unknown", True, "not_in_class_set"),
            # 5. unknown + multiple_dishes_unresolvable (must be True)
            ("unknown", True, "multiple_dishes_unresolvable"),
            # 6. unknown + poor_image_quality (must be True)
            ("unknown", True, "poor_image_quality"),
            # 7. unknown + non_food_or_menu (can be False or True)
            ("unknown", False, "non_food_or_menu"),
            ("unknown", True, "non_food_or_menu"),
            # 8. unknown + ambiguous_cooking_method (must be True)
            ("unknown", True, "ambiguous_cooking_method"),
        ]

        for idx, (pred_cls, is_unc, r_code) in enumerate(valid_cases, 1):
            rec = {
                "blind_id": f"blind_{idx:03d}",
                "predicted_class": pred_cls,
                "is_uncertain": is_unc,
                "reason_code": r_code,
            }
            try:
                validate_audit_prediction_record(rec)
            except ValueError as e:
                self.fail(f"Legitimate combination wrongly rejected: {rec}. Error: {e}")

    def test_output_json_schema_invalid_combinations(self) -> None:
        """Verify contradictory or invalid combinations defined in Section 4.3 matrix are rejected."""
        invalid_cases = [
            # 1. 7 classes with unresolvable/not_in_class/poor_quality/non_food
            ("curry_rice", False, "multiple_dishes_unresolvable"),
            ("fried_dish", False, "not_in_class_set"),
            ("meat_dish", False, "poor_image_quality"),
            ("fish_dish", False, "non_food_or_menu"),
            # 2. 7 classes with clear_single_dish but uncertain=True
            ("stir_fry", True, "clear_single_dish"),
            # 3. 7 classes with ambiguous_cooking_method but uncertain=False
            ("simmered_dish", False, "ambiguous_cooking_method"),
            # 4. unknown with clear_single_dish or multiple_dishes_dominant_chosen
            ("unknown", False, "clear_single_dish"),
            ("unknown", True, "clear_single_dish"),
            ("unknown", False, "multiple_dishes_dominant_chosen"),
            ("unknown", True, "multiple_dishes_dominant_chosen"),
            # 5. unknown with unresolvable/poor_quality/ambiguous but uncertain=False
            ("unknown", False, "multiple_dishes_unresolvable"),
            ("unknown", False, "poor_image_quality"),
            ("unknown", False, "ambiguous_cooking_method"),
        ]

        for idx, (pred_cls, is_unc, r_code) in enumerate(invalid_cases, 1):
            rec = {
                "blind_id": f"blind_{idx:03d}",
                "predicted_class": pred_cls,
                "is_uncertain": is_unc,
                "reason_code": r_code,
            }
            with self.assertRaises(ValueError, msg=f"Contradictory record should raise: {rec}"):
                validate_audit_prediction_record(rec)

    def test_real_blind_images_all_app_and_com_markers_removed(self) -> None:
        """Verify binary scan of all 70 real blind images confirms zero APP1..APP15 or COM markers."""
        blind_images_dir = SAMPLE_DIR / "blind_images"
        self.assertTrue(blind_images_dir.is_dir(), f"Missing {blind_images_dir}")

        for idx in range(1, 71):
            img_path = blind_images_dir / f"blind_{idx:03d}.jpg"
            self.assertTrue(img_path.is_file(), f"Missing image {img_path}")
            prohibited_markers = scan_jpeg_metadata_markers(img_path)
            self.assertEqual(
                prohibited_markers,
                [],
                f"Prohibited metadata markers {prohibited_markers} found in {img_path}",
            )

    def test_local_reconciliation_logic(self) -> None:
        """Verify that local agreement, confusion matrix, and stratified weighted rate calculate accurately."""
        mapping_path = SAMPLE_DIR / "blind_id_mapping.private.json"
        self.assertTrue(mapping_path.is_file(), f"Missing {mapping_path}")

        mapping_data = json.loads(mapping_path.read_text(encoding="utf-8"))
        mapping_records = mapping_data["records"]
        self.assertEqual(len(mapping_records), 70)

        # Mock predictions: 60 agree (clear), 5 unknown (not_in_class), 5 confused (ambiguous cooking)
        mock_predictions = []
        for idx, rec in enumerate(mapping_records):
            b_id = rec["blind_id"]
            true_cls = rec["mapped_class"]
            if idx < 60:
                pred_cls = true_cls
                r_code = "clear_single_dish"
                is_unc = False
            elif idx < 65:
                pred_cls = "unknown"
                r_code = "not_in_class_set"
                is_unc = False
            else:
                pred_cls = "fried_dish"
                r_code = "ambiguous_cooking_method"
                is_unc = True

            mock_predictions.append({
                "blind_id": b_id,
                "predicted_class": pred_cls,
                "is_uncertain": is_unc,
                "reason_code": r_code,
            })

        metrics = compute_audit_agreement_metrics(mock_predictions, mapping_records)
        self.assertEqual(metrics["total_samples"], 70)
        self.assertEqual(metrics["overall_agreement_count"], 60)
        self.assertAlmostEqual(metrics["overall_agreement_rate"], 60 / 70)
        self.assertEqual(metrics["unknown_count"], 5)
        self.assertAlmostEqual(metrics["unknown_rate"], 5 / 70)
        self.assertEqual(metrics["uncertain_count"], 5)
        self.assertIn("curry_rice", metrics["confusion_matrix"])
        # Check that confusion matrix has 8 columns (7 classes + unknown)
        self.assertEqual(len(metrics["confusion_matrix"]["curry_rice"]), 8)
        self.assertEqual(sum(metrics["confusion_matrix"]["curry_rice"].values()), 10)

        # Check weighted agreement rate exists and is within [0.0, 1.0]
        self.assertIn("weighted_agreement_rate", metrics)
        self.assertGreaterEqual(metrics["weighted_agreement_rate"], 0.0)
        self.assertLessEqual(metrics["weighted_agreement_rate"], 1.0)


if __name__ == "__main__":
    unittest.main()
