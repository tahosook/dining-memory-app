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

from scripts.build_dual_taxonomy_dataset import (
    PERSONAL_HOME_CLASSES,
    PERSONAL_SIGNATURE_TAGS,
    UNIVERSAL_CLASSES,
    DualTaxonomyError,
    build_dual_taxonomy_dataset,
    classify_personal_home_mode,
    classify_universal_scene,
    extract_meshi_key,
    extract_personal_signature_tags,
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
                golden_v2_manifest=tmp_dir / "nonexistent.csv",
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

            with self.assertRaises(DualTaxonomyError):
                build_dual_taxonomy_dataset(
                    observations_jsonl=obs_jsonl,
                    output_dir=tmp_dir / "out",
                    golden_v1_dir=None,
                    golden_v2_manifest=None,
                )


if __name__ == "__main__":
    unittest.main()
