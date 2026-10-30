#!/usr/bin/env python3
"""Unit tests for refresh_food_classification_step1.py (Final Owner Decisions)."""

import datetime
import unittest

from scripts.refresh_food_classification_step1 import (
    TZ_JST,
    UNRESOLVED_25_IDS,
    classify_record_dish,
    cluster_sessions,
    extract_datetime_from_text,
    normalize_photo_key,
)


class TestRefreshFoodClassificationStep1(unittest.TestCase):
    def setUp(self):
        self.mock_blind_lookup = {
            "blind_001.jpg": "MESHI_20231015_212825.jpg",
            "blind_A_001.jpg": "MESHI_20240716_222001.jpg",
        }

    def test_normalize_photo_key(self):
        self.assertEqual(
            normalize_photo_key("MESHI_20240101_120000.jpg", self.mock_blind_lookup),
            "MESHI_20240101_120000",
        )
        self.assertEqual(
            normalize_photo_key("002__MESHI_20220614_124545__7d3f82f9.jpg", self.mock_blind_lookup),
            "MESHI_20220614_124545",
        )
        self.assertEqual(
            normalize_photo_key("meal-1776316534079.jpg", self.mock_blind_lookup),
            "meal-1776316534079",
        )
        self.assertEqual(
            normalize_photo_key("001__meal-1776184349365__f0d8cde8.jpg", self.mock_blind_lookup),
            "meal-1776184349365",
        )
        self.assertEqual(
            normalize_photo_key("blind_001.jpg", self.mock_blind_lookup),
            "MESHI_20231015_212825",
        )

    def test_extract_datetime_from_text(self):
        dt_meshi = extract_datetime_from_text("MESHI_20240509_183045.jpg")
        self.assertIsNotNone(dt_meshi)
        self.assertEqual(
            dt_meshi,
            datetime.datetime(2024, 5, 9, 18, 30, 45, tzinfo=TZ_JST),
        )

        dt_meal = extract_datetime_from_text("meal-1776316534079.jpg")
        self.assertIsNotNone(dt_meal)
        expected_dt = datetime.datetime.fromtimestamp(1776316534.079, TZ_JST)
        self.assertEqual(dt_meal, expected_dt)

    def test_cluster_sessions(self):
        dt0 = datetime.datetime(2024, 1, 1, 12, 0, 0, tzinfo=TZ_JST)
        dt1 = datetime.datetime(2024, 1, 1, 12, 10, 0, tzinfo=TZ_JST)
        dt2 = datetime.datetime(2024, 1, 1, 12, 25, 0, tzinfo=TZ_JST)
        dt3 = datetime.datetime(2024, 1, 1, 13, 10, 0, tzinfo=TZ_JST)
        dt4 = datetime.datetime(2024, 1, 1, 18, 0, 0, tzinfo=TZ_JST)

        records = [
            {"image_id": "r1", "dt": dt0},
            {"image_id": "r2", "dt": dt1},
            {"image_id": "r3", "dt": dt2},
            {"image_id": "r4", "dt": dt3},
            {"image_id": "r5", "dt": dt4},
        ]

        sessions = cluster_sessions(records, gap_seconds=1800.0)
        self.assertEqual(len(sessions), 3)
        self.assertEqual([r["image_id"] for r in sessions[0]], ["r1", "r2", "r3"])
        self.assertEqual([r["image_id"] for r in sessions[1]], ["r4"])
        self.assertEqual([r["image_id"] for r in sessions[2]], ["r5"])

    def test_classify_record_dish_rules(self):
        # 1. Non-meal photo (bottle only)
        raw_bottle = {
            "short_caption": "新潟の日本酒ボトルの写真",
            "visual_elements": ["日本酒の四合瓶", "緑色のガラスボトル", "銘柄ラベル"],
            "free_tags": ["日本酒", "酒瓶", "地酒"],
        }
        mtype, mclass, sclasses, mmeta = classify_record_dish(raw_bottle)
        self.assertEqual(mtype, "not_meal")
        self.assertEqual(mclass, "not_meal")
        self.assertFalse(mmeta["is_learning_target"])

        # 2. Main dish with short_caption subject (standard class)
        raw_fish = {
            "short_caption": "香ばしく焼かれた焼き鮭と具だくさん豚汁の和定食",
            "visual_elements": ["焼き鮭（塩焼き）", "具だくさん豚汁", "白ご飯", "きんぴらごぼう"],
            "free_tags": ["焼き鮭", "豚汁", "きんぴら", "和定食"],
        }
        mtype, mclass, sclasses, mmeta = classify_record_dish(raw_fish)
        self.assertEqual(mtype, "meal")
        self.assertEqual(mclass, "main_grilled_fish")
        self.assertTrue(mmeta["is_learning_target"])
        self.assertFalse(mmeta["is_reference_eval"])
        self.assertIn("side_tonjiru_soup", sclasses)
        self.assertIn("side_kinpira", sclasses)

        # 3. Merged Japanese noodles class (udon / soba)
        raw_udon = {
            "short_caption": "温かい煮込みうどんと卵の小鉢",
            "visual_elements": ["煮込みうどん", "温泉卵"],
            "free_tags": ["うどん", "温泉卵"],
        }
        mtype, mclass, sclasses, mmeta = classify_record_dish(raw_udon)
        self.assertEqual(mtype, "meal")
        self.assertEqual(mclass, "main_japanese_noodles")
        self.assertTrue(mmeta["is_learning_target"])

        raw_soba = {
            "short_caption": "冷たいざるそばと天ぷら",
            "visual_elements": ["ざるそば", "天ぷら"],
            "free_tags": ["ざるそば"],
        }
        mtype, mclass, sclasses, mmeta = classify_record_dish(raw_soba)
        self.assertEqual(mtype, "meal")
        self.assertEqual(mclass, "main_japanese_noodles")

        # 4. Reference evaluation class (gapao, hotpot, fried_rice, sashimi)
        raw_gapao = {
            "short_caption": "目玉焼きが乗った本格ガパオライス",
            "visual_elements": ["ガパオライス", "目玉焼き"],
            "free_tags": ["ガパオ"],
        }
        mtype, mclass, sclasses, mmeta = classify_record_dish(raw_gapao)
        self.assertEqual(mtype, "meal")
        self.assertEqual(mclass, "main_ethnic_gapao")
        self.assertTrue(mmeta["is_learning_target"])
        self.assertTrue(mmeta["is_reference_eval"])

        # 5. Excluded low-sample tags (ajillo, nikujaga, pasta) -> learning target False
        raw_pasta = {
            "short_caption": "トマトとバジルの特製パスタランチ",
            "visual_elements": ["パスタ", "ミニサラダ"],
            "free_tags": ["パスタ", "サラダ"],
        }
        mtype, mclass, sclasses, mmeta = classify_record_dish(raw_pasta)
        self.assertEqual(mtype, "meal")
        self.assertEqual(mclass, "main_pasta")
        self.assertFalse(mmeta["is_learning_target"])
        self.assertEqual(mmeta["category"], "excluded_low_sample")

        raw_ajillo = {
            "short_caption": "エビとマッシュルームのアヒージョとバゲット",
            "visual_elements": ["アヒージョ", "バゲット"],
            "free_tags": ["アヒージョ"],
        }
        mtype, mclass, sclasses, mmeta = classify_record_dish(raw_ajillo)
        self.assertEqual(mclass, "main_bal_ajillo")
        self.assertFalse(mmeta["is_learning_target"])

        # 6. Main undetermined
        raw_undetermined = {
            "short_caption": "冷奴とキムチ、きゅうりの小鉢が並ぶ朝食の一角",
            "visual_elements": ["冷奴", "白菜キムチ", "きゅうりの浅漬け"],
            "free_tags": ["冷奴", "キムチ", "浅漬け"],
        }
        mtype, mclass, sclasses, mmeta = classify_record_dish(raw_undetermined)
        self.assertEqual(mclass, "main_undetermined")
        self.assertFalse(mmeta["is_learning_target"])
        self.assertEqual(mmeta["category"], "undetermined")

        # 7. Side none
        raw_single_curry = {
            "short_caption": "深皿に盛られた特製チキンカレーライス",
            "visual_elements": ["チキンカレー", "白ご飯"],
            "free_tags": ["カレーライス", "ワンプレート"],
        }
        mtype, mclass, sclasses, mmeta = classify_record_dish(raw_single_curry)
        self.assertEqual(mtype, "meal")
        self.assertEqual(mclass, "main_curry_hayashi")
        self.assertEqual(sclasses, ["side_none"])

    def test_unresolved_25_ids_set(self):
        self.assertEqual(len(UNRESOLVED_25_IDS), 25)
        self.assertIn("blind_w2_2720", UNRESOLVED_25_IDS)
        self.assertIn("blind_w2_2744", UNRESOLVED_25_IDS)
        self.assertNotIn("blind_w2_2719", UNRESOLVED_25_IDS)


if __name__ == "__main__":
    unittest.main()
