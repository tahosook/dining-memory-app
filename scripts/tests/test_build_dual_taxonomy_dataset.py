#!/usr/bin/env python3
"""Unit tests for Dual-Taxonomy Dataset Builder (Issue-23).

Verifies:
1. Canonical MESHI key extraction and duplicate detection.
2. Universal 7-class classification across all dining scenes and non-food noise.
3. Personal 8-class household/wife's cooking classification and non-home exclusion.
4. Personal 11 signature multi-label tag extraction.
5. Deterministic stratified train/val/test splitting with Golden Test Set leakage protection.
6. End-to-end JSONL, CSV manifest, summary JSON, and optional split image directory materialization.
"""
from __future__ import annotations

import csv
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

_REPO_ROOT = Path(__file__).resolve().parents[2]

from scripts.build_dual_taxonomy_dataset import (
    PERSONAL_HOME_CLASSES,
    PERSONAL_SIGNATURE_TAGS,
    UNIVERSAL_CLASSES,
    DualTaxonomyError,
    build_dual_taxonomy_dataset,
    classify_personal_home_mode,
    classify_universal_scene,
    collect_protected_golden_meshi_keys,
    extract_meshi_key,
    extract_personal_signature_tags,
    verify_golden_test_leakage,
)


class TestBuildDualTaxonomyDataset(unittest.TestCase):
    def test_extract_meshi_key_normalizes_case_and_affixes(self) -> None:
        self.assertEqual(
            extract_meshi_key("042__meshi_20251017_121459__fa3cb106.jpg"),
            "MESHI_20251017_121459",
        )
        self.assertEqual(
            extract_meshi_key("/Users/test/MESHI_20230706_123923.jpg"),
            "MESHI_20230706_123923",
        )
        self.assertEqual(extract_meshi_key("custom_id_001"), "custom_id_001")

    def test_classify_universal_scene_all_seven_classes(self) -> None:
        cases = [
            (
                {
                    "short_caption": "豚肉ソテーとれんこんきんぴら、かぼちゃ煮、味噌汁、白ご飯の和定食",
                    "visual_elements": ["豚肉ソテー", "れんこんきんぴら", "味噌汁", "白ご飯"],
                    "tableware_and_setting": "青い染付の器と茶碗が木目テーブルに並ぶ",
                    "notable_characteristics": "品数豊富な一汁三菜の夕食",
                    "free_tags": ["和定食", "家庭料理"],
                },
                "home_teishoku_set",
            ),
            (
                {
                    "short_caption": "北欧柄プレートのキーマカレーと丸ごとゆで卵のワンプレート",
                    "visual_elements": ["キーマカレー", "ゆで卵", "白ご飯"],
                    "tableware_and_setting": "アラビア トゥオキオの丸皿",
                    "notable_characteristics": "中央に丸ごとゆで卵",
                    "free_tags": ["キーマカレー", "ワンプレート"],
                },
                "one_plate_or_curry",
            ),
            (
                {
                    "short_caption": "卓上IHで温めるアヒージョと山盛りバゲットのおうちバル",
                    "visual_elements": ["アヒージョ", "バゲット", "ブルーチーズ"],
                    "tableware_and_setting": "卓上IHヒーターと木製ボード",
                    "notable_characteristics": "おうちバルスタイル",
                    "free_tags": ["おうちバル", "アヒージョ"],
                },
                "izakaya_bistro_or_party",
            ),
            (
                {
                    "short_caption": "朱色の丼に入った溶き卵とわかめのインスタントラーメン",
                    "visual_elements": ["ラーメン", "溶き卵", "わかめ"],
                    "tableware_and_setting": "朱色のラーメン鉢",
                    "notable_characteristics": "手軽な昼食の袋麺",
                    "free_tags": ["ラーメン", "麺類"],
                },
                "noodles_or_single_bowl",
            ),
            (
                {
                    "short_caption": "黒いプラスチックトレイに載せられた社食の唐揚げ定食",
                    "visual_elements": ["唐揚げ", "白ご飯", "味噌汁"],
                    "tableware_and_setting": "社食の黒いトレイ",
                    "notable_characteristics": "カフェテリアでのランチ",
                    "free_tags": ["社食", "ランチ"],
                },
                "dining_out_or_tray_meal",
            ),
            (
                {
                    "short_caption": "金属製ホルダーに収まった純米大吟醸の日本酒ボトルのアップ",
                    "visual_elements": ["日本酒ボトル", "ラベル"],
                    "tableware_and_setting": "緑色の四合瓶",
                    "notable_characteristics": "銘柄ラベルの記録写真",
                    "free_tags": ["日本酒", "純米吟醸", "酒瓶"],
                },
                "drink_or_bottle_record",
            ),
            (
                {
                    "short_caption": "眼鏡店で値札付きのメガネを試着する男性のセルフィー（非食事）",
                    "visual_elements": ["メガネ", "男性"],
                    "tableware_and_setting": "眼鏡店の店内",
                    "notable_characteristics": "非料理写真",
                    "free_tags": ["セルフィー", "非食事"],
                },
                "non_food_or_exclude",
            ),
        ]
        for record, expected in cases:
            actual = classify_universal_scene(record)
            self.assertIn(actual, UNIVERSAL_CLASSES)
            self.assertEqual(actual, expected)

    def test_classify_personal_home_mode_all_eight_classes_and_exclusions(self) -> None:
        # Non-home universal classes must return None
        for excluded_u in (
            "non_food_or_exclude",
            "drink_or_bottle_record",
            "dining_out_or_tray_meal",
        ):
            self.assertIsNone(
                classify_personal_home_mode({"short_caption": "テスト"}, excluded_u)
            )

        home_cases = [
            (
                {
                    "short_caption": "ドミノ・ピザのクワトロピザ2枚とチキンのデリバリーパーティー",
                    "visual_elements": ["クワトロピザ", "チキンナゲット"],
                    "free_tags": ["宅配ピザ", "パーティー"],
                },
                "izakaya_bistro_or_party",
                "special_takeout_party_feast",
            ),
            (
                {
                    "short_caption": "卓上IHのチーズフォンデュとバゲット、温野菜のおうちバル",
                    "visual_elements": ["チーズフォンデュ", "バゲット", "ブルーチーズ"],
                    "free_tags": ["おうちバル"],
                },
                "izakaya_bistro_or_party",
                "wife_bistro_baguette_bal",
            ),
            (
                {
                    "short_caption": "焼き鮭とパック納豆、具だくさん味噌汁の和朝食",
                    "visual_elements": ["焼き鮭", "納豆", "味噌汁", "白ご飯"],
                    "free_tags": ["和朝食", "納豆パック"],
                },
                "home_teishoku_set",
                "wife_morning_salmon_natto",
            ),
            (
                {
                    "short_caption": "丸ごとゆで卵が乗ったキーマカレーとスープのワンプレート",
                    "visual_elements": ["キーマカレー", "ゆで卵", "白ご飯"],
                    "free_tags": ["キーマカレー", "ワンプレート"],
                },
                "one_plate_or_curry",
                "wife_curry_or_ethnic_plate",
            ),
            (
                {
                    "short_caption": "フライパン直出しの目玉焼き入り煮込みうどんとタッパーの漬物",
                    "visual_elements": ["煮込みうどん", "目玉焼き"],
                    "free_tags": ["うどん", "フライパン"],
                },
                "noodles_or_single_bowl",
                "household_pot_noodles_or_ramen_rice",
            ),
            (
                {
                    "short_caption": "唐草模様皿に丸ごと焼きピーマンや鶏レバー煮、刺身、徳利が並ぶ晩酌膳",
                    "visual_elements": ["焼きピーマン", "鶏レバー煮", "刺身", "徳利"],
                    "free_tags": ["晩酌", "おつまみ"],
                },
                "izakaya_bistro_or_party",
                "wife_izakaya_small_dishes",
            ),
            (
                {
                    "short_caption": "北欧風大皿に豚キムチ炒めと白ご飯を合盛りにしたワンプレート",
                    "visual_elements": ["豚キムチ炒め", "白ご飯"],
                    "free_tags": ["ワンプレート", "合盛り"],
                },
                "one_plate_or_curry",
                "wife_nordic_one_plate",
            ),
            (
                {
                    "short_caption": "豚の生姜焼きとれんこんきんぴら、かぼちゃ煮、豚汁、白ご飯の夕食",
                    "visual_elements": ["生姜焼き", "れんこんきんぴら", "かぼちゃ煮", "豚汁"],
                    "free_tags": ["和定食", "家庭料理"],
                },
                "home_teishoku_set",
                "wife_multi_dish_teishoku",
            ),
        ]
        for rec, u_cls, expected_p in home_cases:
            actual_p = classify_personal_home_mode(rec, u_cls)
            self.assertIn(actual_p, PERSONAL_HOME_CLASSES)
            self.assertEqual(actual_p, expected_p)

    def test_extract_personal_signature_tags(self) -> None:
        rec = {
            "short_caption": "アラビア トゥオキオ皿のキーマカレー（丸ごとゆで卵）と染付小鉢、タッパーのりんご",
            "visual_elements": [
                "キーマカレー",
                "丸ごとゆで卵",
                "人参しりしり",
                "パック納豆",
                "四角く解凍されたご飯",
                "りんご",
            ],
            "tableware_and_setting": "ハーブ柄プレート、唐草模様の染付鉢、卓上IHヒーター、タッパー容器",
            "notable_characteristics": "猫の箸置きとシマウマのミニチュアが添えられている",
            "free_tags": ["北欧食器"],
        }
        tags = extract_personal_signature_tags(rec)
        self.assertEqual(set(tags), set(PERSONAL_SIGNATURE_TAGS))

    def test_build_dual_taxonomy_dataset_end_to_end_and_golden_leakage_pinning(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            obs_jsonl = tmp_dir / "observations.jsonl"
            golden_v1_dir = tmp_dir / "golden_v1" / "curry_rice"
            golden_v1_dir.mkdir(parents=True)
            img_dir = tmp_dir / "images"
            img_dir.mkdir(parents=True)

            # Create a dummy golden test file for MESHI_20250101_120001
            golden_img = golden_v1_dir / "001__MESHI_20250101_120001__abcd1234.jpg"
            golden_img.write_bytes(b"golden_image_bytes")

            records = []
            for idx in range(1, 13):
                mk = f"MESHI_20250101_1200{idx:02d}"
                img_path = img_dir / f"{mk}.jpg"
                img_path.write_bytes(f"image_{idx}".encode("utf-8"))
                if idx <= 6:
                    cap = "北欧食器に盛られたキーマカレーと丸ごとゆで卵のワンプレート"
                    tags = ["キーマカレー", "ワンプレート", "北欧食器"]
                elif idx <= 10:
                    cap = "焼き鮭と納豆パック、れんこんきんぴら、味噌汁、白ご飯の和朝食"
                    tags = ["和朝食", "焼き鮭", "納豆"]
                elif idx == 11:
                    cap = "純米吟醸の日本酒ボトルとラベルのクローズアップ"
                    tags = ["日本酒", "酒瓶"]
                else:
                    cap = "眼鏡店で値札付きメガネを試着する男性のセルフィー（非食事）"
                    tags = ["非食事", "セルフィー"]
                records.append(
                    {
                        "image_id": f"blind_{idx:03d}",
                        "meshi_key": mk,
                        "image_path": str(img_path),
                        "original_path": str(img_path),
                        "source_set": "unit_test",
                        "visual_elements": [cap],
                        "tableware_and_setting": "木目テーブル",
                        "notable_characteristics": cap,
                        "free_tags": tags,
                        "short_caption": cap,
                    }
                )

            with open(obs_jsonl, "w", encoding="utf-8") as f:
                for r in records:
                    f.write(json.dumps(r, ensure_ascii=False) + "\n")

            out_dir = tmp_dir / "out"
            summary = build_dual_taxonomy_dataset(
                observations_jsonl=obs_jsonl,
                output_dir=out_dir,
                golden_v1_dir=golden_v1_dir.parent,
                golden_v2_manifest=None,
                export_image_dirs=True,
            )

            self.assertEqual(summary["total_records"], 12)
            self.assertEqual(summary["protected_golden_overlap_count"], 1)
            self.assertEqual(summary["golden_train_val_leakage_count"], 0)
            self.assertEqual(
                summary["universal_scene_7class"]["by_class"]["one_plate_or_curry"], 6
            )
            self.assertEqual(
                summary["universal_scene_7class"]["by_class"]["home_teishoku_set"], 4
            )
            self.assertEqual(
                summary["universal_scene_7class"]["by_class"]["drink_or_bottle_record"],
                1,
            )
            self.assertEqual(
                summary["universal_scene_7class"]["by_class"]["non_food_or_exclude"], 1
            )
            self.assertEqual(summary["personal_household_8class"]["total"], 10)

            # Verify golden image MESHI_20250101_120001 is strictly pinned to 'test' in both models
            manifest_csv = out_dir / "dual_taxonomy_manifest_1007.csv"
            with open(manifest_csv, encoding="utf-8") as f:
                rows = {row["meshi_key"]: row for row in csv.DictReader(f)}

            golden_row = rows["MESHI_20250101_120001"]
            self.assertEqual(golden_row["is_protected_golden_test"], "true")
            self.assertEqual(golden_row["universal_split"], "test")
            self.assertEqual(golden_row["personal_split"], "test")

            # Verify exported image trees exist
            self.assertTrue(
                (
                    out_dir
                    / "universal_scene_7class_images"
                    / "test"
                    / "one_plate_or_curry"
                    / "MESHI_20250101_120001.jpg"
                ).exists()
            )
            self.assertTrue(
                (
                    out_dir
                    / "personal_household_8class_images"
                    / "test"
                    / "wife_curry_or_ethnic_plate"
                    / "MESHI_20250101_120001.jpg"
                ).exists()
            )

    def test_duplicate_meshi_key_raises_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            obs_jsonl = tmp_dir / "dup.jsonl"
            rec = {
                "image_id": "b1",
                "meshi_key": "MESHI_20250101_120001",
                "short_caption": "カレーライス",
            }
            with open(obs_jsonl, "w", encoding="utf-8") as f:
                f.write(json.dumps(rec) + "\n")
                f.write(json.dumps(rec) + "\n")

            with self.assertRaises(DualTaxonomyError) as ctx:
                build_dual_taxonomy_dataset(
                    observations_jsonl=obs_jsonl,
                    output_dir=tmp_dir / "out",
                )
            self.assertIn("Duplicate meshi_key detected", str(ctx.exception))


    def test_verify_golden_test_leakage_success(self) -> None:
        records = [
            {
                "meshi_key": "MESHI_20250101_120001",
                "universal_split": "test",
                "universal_scene_class": "one_plate_or_curry",
                "personal_split": "test",
                "personal_home_class": "wife_curry_or_ethnic_plate",
                "is_protected_golden_test": True,
            },
            {
                "meshi_key": "MESHI_20250101_120002",
                "universal_split": "train",
                "universal_scene_class": "one_plate_or_curry",
                "personal_split": "train",
                "personal_home_class": "wife_curry_or_ethnic_plate",
                "is_protected_golden_test": False,
            },
        ]
        protected_keys = {"MESHI_20250101_120001", "MESHI_20250101_999999"}
        res = verify_golden_test_leakage(records, protected_keys)
        self.assertTrue(res["verified"])
        self.assertEqual(res["total_leakage_count"], 0)
        self.assertEqual(res["universal_leakage_count"], 0)
        self.assertEqual(res["personal_leakage_count"], 0)
        self.assertEqual(res["present_in_dataset_count"], 1)
        self.assertEqual(res["absent_from_dataset_count"], 1)

    def test_verify_golden_test_leakage_detects_universal_leak(self) -> None:
        records = [
            {
                "meshi_key": "MESHI_20250101_120001",
                "universal_split": "train",
                "universal_scene_class": "one_plate_or_curry",
                "personal_split": "test",
                "personal_home_class": "wife_curry_or_ethnic_plate",
            }
        ]
        protected_keys = {"MESHI_20250101_120001"}
        with self.assertRaises(DualTaxonomyError) as ctx:
            verify_golden_test_leakage(records, protected_keys)
        err_msg = str(ctx.exception)
        self.assertIn("Golden test leakage detected", err_msg)
        self.assertIn("MESHI_20250101_120001", err_msg)
        self.assertIn("Universal: 1", err_msg)

    def test_verify_golden_test_leakage_detects_personal_leak(self) -> None:
        records = [
            {
                "meshi_key": "MESHI_20250101_120001",
                "universal_split": "test",
                "universal_scene_class": "one_plate_or_curry",
                "personal_split": "val",
                "personal_home_class": "wife_curry_or_ethnic_plate",
            }
        ]
        protected_keys = {"MESHI_20250101_120001"}
        with self.assertRaises(DualTaxonomyError) as ctx:
            verify_golden_test_leakage(records, protected_keys)
        err_msg = str(ctx.exception)
        self.assertIn("Golden test leakage detected", err_msg)
        self.assertIn("Personal: 1", err_msg)

    def test_verify_golden_test_leakage_detects_multiple_leaks(self) -> None:
        records = [
            {
                "meshi_key": "MESHI_20250101_120001",
                "universal_split": "val",
                "universal_scene_class": "one_plate_or_curry",
                "personal_split": "test",
                "personal_home_class": "wife_curry_or_ethnic_plate",
            },
            {
                "meshi_key": "MESHI_20250101_120002",
                "universal_split": "test",
                "universal_scene_class": "home_teishoku_set",
                "personal_split": "train",
                "personal_home_class": "wife_multi_dish_teishoku",
            },
        ]
        protected_keys = {"MESHI_20250101_120001", "MESHI_20250101_120002"}
        with self.assertRaises(DualTaxonomyError) as ctx:
            verify_golden_test_leakage(records, protected_keys)
        err_msg = str(ctx.exception)
        self.assertIn("Total leaked keys: 2", err_msg)
        self.assertIn("MESHI_20250101_120001", err_msg)
        self.assertIn("MESHI_20250101_120002", err_msg)

    def test_verify_golden_test_leakage_key_normalization(self) -> None:
        records = [
            {
                "meshi_key": "  meshi_20250101_120001.jpg  ",
                "universal_split": "train",
                "universal_scene_class": "one_plate_or_curry",
            }
        ]
        protected_keys = {"MESHI_20250101_120001"}
        with self.assertRaises(DualTaxonomyError) as ctx:
            verify_golden_test_leakage(records, protected_keys)
        self.assertIn("MESHI_20250101_120001", str(ctx.exception))

    def test_collect_protected_golden_meshi_keys_fails_when_golden_v1_dir_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            missing_dir = Path(tmp) / "nonexistent_v1_dir"
            with self.assertRaises(DualTaxonomyError) as ctx:
                collect_protected_golden_meshi_keys(golden_v1_dir=missing_dir)
            self.assertIn("Golden Test Set v1 directory does not exist", str(ctx.exception))
            self.assertIn(str(missing_dir), str(ctx.exception))

    def test_collect_protected_golden_meshi_keys_fails_when_golden_v1_not_a_dir(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            a_file = Path(tmp) / "not_a_dir.txt"
            a_file.write_text("dummy", encoding="utf-8")
            with self.assertRaises(DualTaxonomyError) as ctx:
                collect_protected_golden_meshi_keys(golden_v1_dir=a_file)
            self.assertIn("Golden Test Set v1 path is not a directory", str(ctx.exception))
            self.assertIn(str(a_file), str(ctx.exception))

    def test_collect_protected_golden_meshi_keys_fails_when_golden_v2_manifest_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            missing_manifest = Path(tmp) / "nonexistent_manifest.csv"
            with self.assertRaises(DualTaxonomyError) as ctx:
                collect_protected_golden_meshi_keys(golden_v2_manifest=missing_manifest)
            self.assertIn("Golden Test Set v2 manifest file does not exist", str(ctx.exception))
            self.assertIn(str(missing_manifest), str(ctx.exception))

    def test_collect_protected_golden_meshi_keys_fails_when_golden_v2_manifest_not_a_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            a_dir = Path(tmp) / "manifest_dir"
            a_dir.mkdir()
            with self.assertRaises(DualTaxonomyError) as ctx:
                collect_protected_golden_meshi_keys(golden_v2_manifest=a_dir)
            self.assertIn("Golden Test Set v2 manifest path is not a file", str(ctx.exception))
            self.assertIn(str(a_dir), str(ctx.exception))

    def test_collect_protected_golden_meshi_keys_fails_when_both_sources_none(self) -> None:
        with self.assertRaises(DualTaxonomyError) as ctx:
            collect_protected_golden_meshi_keys(golden_v1_dir=None, golden_v2_manifest=None)
        self.assertIn("At least one Golden test set source", str(ctx.exception))

    def test_collect_protected_golden_meshi_keys_fails_when_sources_empty_or_no_valid_keys(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            empty_v1 = Path(tmp) / "empty_v1"
            empty_v1.mkdir()
            with self.assertRaises(DualTaxonomyError) as ctx:
                collect_protected_golden_meshi_keys(golden_v1_dir=empty_v1)
            self.assertIn("No valid protected Golden MESHI keys could be extracted", str(ctx.exception))

            (empty_v1 / "random_photo.jpg").write_bytes(b"data")
            with self.assertRaises(DualTaxonomyError) as ctx:
                collect_protected_golden_meshi_keys(golden_v1_dir=empty_v1)
            self.assertIn("No valid protected Golden MESHI keys could be extracted", str(ctx.exception))

            empty_v2 = Path(tmp) / "empty_v2.csv"
            empty_v2.write_text("filename,rel_path_source\nsample.jpg,other/path.jpg\n", encoding="utf-8")
            with self.assertRaises(DualTaxonomyError) as ctx:
                collect_protected_golden_meshi_keys(golden_v2_manifest=empty_v2)
            self.assertIn("No valid protected Golden MESHI keys could be extracted", str(ctx.exception))

    def test_collect_protected_golden_meshi_keys_fails_on_manifest_read_error(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            bad_csv = Path(tmp) / "corrupt.csv"
            bad_csv.write_bytes(b"filename\x00\xff")
            with self.assertRaises(DualTaxonomyError) as ctx:
                collect_protected_golden_meshi_keys(golden_v2_manifest=bad_csv)
            self.assertIn("Failed to read Golden Test Set v2 manifest", str(ctx.exception))

    def test_collect_protected_golden_meshi_keys_optional_combinations(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            v1_dir = Path(tmp) / "v1" / "test"
            v1_dir.mkdir(parents=True)
            (v1_dir / "001__MESHI_20250101_120001__a.jpg").write_bytes(b"img1")

            v2_csv = Path(tmp) / "v2.csv"
            v2_csv.write_text(
                "filename,rel_path_source\n"
                "002__MESHI_20250101_120002__b.jpg,source/path.jpg\n",
                encoding="utf-8",
            )

            # v1 only
            keys_v1 = collect_protected_golden_meshi_keys(golden_v1_dir=v1_dir, golden_v2_manifest=None)
            self.assertEqual(keys_v1, {"MESHI_20250101_120001"})

            # v2 only
            keys_v2 = collect_protected_golden_meshi_keys(golden_v1_dir=None, golden_v2_manifest=v2_csv)
            self.assertEqual(keys_v2, {"MESHI_20250101_120002"})

            # both v1 and v2
            keys_both = collect_protected_golden_meshi_keys(golden_v1_dir=v1_dir, golden_v2_manifest=v2_csv)
            self.assertEqual(keys_both, {"MESHI_20250101_120001", "MESHI_20250101_120002"})

    def test_verify_golden_test_leakage_fails_on_empty_protected_keys(self) -> None:
        records = [
            {
                "meshi_key": "MESHI_20250101_120001",
                "universal_split": "test",
                "universal_scene_class": "one_plate_or_curry",
            }
        ]
        with self.assertRaises(DualTaxonomyError) as ctx:
            verify_golden_test_leakage(records, set())
        self.assertIn("protected_test_keys is empty", str(ctx.exception))

        with self.assertRaises(DualTaxonomyError) as ctx:
            verify_golden_test_leakage(records, {"", "   "})
        self.assertIn("no non-empty protected test keys", str(ctx.exception))

    def test_build_dual_taxonomy_dataset_fails_when_golden_sources_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            tmp_dir = Path(tmp)
            obs_jsonl = tmp_dir / "obs.jsonl"
            obs_jsonl.write_text(
                json.dumps({
                    "meshi_key": "MESHI_20250101_120001",
                    "short_caption": "定食",
                    "image_id": "b1",
                }) + "\n",
                encoding="utf-8",
            )
            out_dir = tmp_dir / "out"

            # missing v1
            with self.assertRaises(DualTaxonomyError) as ctx:
                build_dual_taxonomy_dataset(
                    observations_jsonl=obs_jsonl,
                    output_dir=out_dir,
                    golden_v1_dir=tmp_dir / "missing_v1",
                    golden_v2_manifest=None,
                )
            self.assertIn("Golden Test Set v1 directory does not exist", str(ctx.exception))

            # missing v2
            valid_v1 = tmp_dir / "valid_v1"
            valid_v1.mkdir()
            (valid_v1 / "001__MESHI_20250101_120001.jpg").write_bytes(b"data")
            with self.assertRaises(DualTaxonomyError) as ctx:
                build_dual_taxonomy_dataset(
                    observations_jsonl=obs_jsonl,
                    output_dir=out_dir,
                    golden_v1_dir=valid_v1,
                    golden_v2_manifest=tmp_dir / "missing_v2.csv",
                )
            self.assertIn("Golden Test Set v2 manifest file does not exist", str(ctx.exception))

    @patch("scripts.build_dual_taxonomy_dataset.os.walk")
    def test_collect_protected_golden_meshi_keys_fails_on_os_walk_error_in_subdir(
        self, mock_walk: MagicMock
    ) -> None:
        def fake_walk(top: str | Path, onerror=None):
            yield (str(top), ["subdir"], ["001__MESHI_20250101_120001.jpg"])
            if onerror:
                onerror(OSError(13, "Permission denied", str(Path(top) / "subdir")))
            yield (str(Path(top) / "subdir"), [], [])

        mock_walk.side_effect = fake_walk
        with tempfile.TemporaryDirectory() as tmp:
            v1_dir = Path(tmp) / "v1"
            v1_dir.mkdir()
            with self.assertRaises(DualTaxonomyError) as ctx:
                collect_protected_golden_meshi_keys(golden_v1_dir=v1_dir, golden_v2_manifest=None)
            err_msg = str(ctx.exception)
            self.assertIn("Failed to traverse Golden Test Set v1 directory", err_msg)
            self.assertIn("Permission denied", err_msg)

    def test_verify_golden_test_leakage_detects_universal_missing_or_invalid_split(self) -> None:
        # missing split
        records_missing = [
            {
                "meshi_key": "MESHI_20250101_120001",
                "universal_scene_class": "one_plate_or_curry",
                "personal_split": "test",
                "personal_home_class": "wife_curry_or_ethnic_plate",
            }
        ]
        protected_keys = {"MESHI_20250101_120001"}
        with self.assertRaises(DualTaxonomyError) as ctx:
            verify_golden_test_leakage(records_missing, protected_keys)
        err_msg = str(ctx.exception)
        self.assertIn("Golden test leakage detected", err_msg)
        self.assertIn("Universal: 1", err_msg)
        self.assertIn("'split': None", err_msg)
        self.assertIn("'taxonomy': 'universal'", err_msg)

        # None split
        records_none = [
            {
                "meshi_key": "MESHI_20250101_120001",
                "universal_split": None,
                "universal_scene_class": "one_plate_or_curry",
                "personal_split": "test",
                "personal_home_class": "wife_curry_or_ethnic_plate",
            }
        ]
        with self.assertRaises(DualTaxonomyError) as ctx:
            verify_golden_test_leakage(records_none, protected_keys)
        self.assertIn("Universal: 1", str(ctx.exception))

        # unknown split
        records_invalid = [
            {
                "meshi_key": "MESHI_20250101_120001",
                "universal_split": "unknown_split",
                "universal_scene_class": "one_plate_or_curry",
                "personal_split": "test",
                "personal_home_class": "wife_curry_or_ethnic_plate",
            }
        ]
        with self.assertRaises(DualTaxonomyError) as ctx:
            verify_golden_test_leakage(records_invalid, protected_keys)
        err_msg = str(ctx.exception)
        self.assertIn("Universal: 1", err_msg)
        self.assertIn("unknown_split", err_msg)

    def test_verify_golden_test_leakage_detects_personal_missing_or_invalid_split(self) -> None:
        # missing split
        records_missing = [
            {
                "meshi_key": "MESHI_20250101_120001",
                "universal_split": "test",
                "universal_scene_class": "one_plate_or_curry",
                "personal_home_class": "wife_curry_or_ethnic_plate",
            }
        ]
        protected_keys = {"MESHI_20250101_120001"}
        with self.assertRaises(DualTaxonomyError) as ctx:
            verify_golden_test_leakage(records_missing, protected_keys)
        err_msg = str(ctx.exception)
        self.assertIn("Golden test leakage detected", err_msg)
        self.assertIn("Personal: 1", err_msg)
        self.assertIn("'split': None", err_msg)
        self.assertIn("'taxonomy': 'personal'", err_msg)

        # None split
        records_none = [
            {
                "meshi_key": "MESHI_20250101_120001",
                "universal_split": "test",
                "universal_scene_class": "one_plate_or_curry",
                "personal_split": None,
                "personal_home_class": "wife_curry_or_ethnic_plate",
            }
        ]
        with self.assertRaises(DualTaxonomyError) as ctx:
            verify_golden_test_leakage(records_none, protected_keys)
        self.assertIn("Personal: 1", str(ctx.exception))

        # unknown split
        records_invalid = [
            {
                "meshi_key": "MESHI_20250101_120001",
                "universal_split": "test",
                "universal_scene_class": "one_plate_or_curry",
                "personal_split": "invalid_value",
                "personal_home_class": "wife_curry_or_ethnic_plate",
            }
        ]
        with self.assertRaises(DualTaxonomyError) as ctx:
            verify_golden_test_leakage(records_invalid, protected_keys)
        err_msg = str(ctx.exception)
        self.assertIn("Personal: 1", err_msg)
        self.assertIn("invalid_value", err_msg)

    def test_verify_golden_test_leakage_allows_personal_non_home_excluded_records(self) -> None:
        records = [
            {
                "meshi_key": "MESHI_20250101_120001",
                "universal_split": "test",
                "universal_scene_class": "noodle_soup_or_ramen",
                "personal_split": None,
                "personal_home_class": None,
                "is_protected_golden_test": True,
            }
        ]
        protected_keys = {"MESHI_20250101_120001"}
        res = verify_golden_test_leakage(records, protected_keys)
        self.assertTrue(res["verified"])
        self.assertEqual(res["total_leakage_count"], 0)
        self.assertEqual(res["universal_leakage_count"], 0)
        self.assertEqual(res["personal_leakage_count"], 0)
        self.assertEqual(res["present_in_dataset_count"], 1)


if __name__ == "__main__":
    unittest.main()
