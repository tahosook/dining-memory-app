# [Enhancement] 1,007枚オープン視覚観察に基づく2階層（汎用シーン7クラス／わたし専用8クラス＋シグネチャタグ）分類データセット構築

- **内部ドキュメントID**: issue-23
- **対応 GitHub Issue**: 未起票
- **ステータス**: 進行中 (In Progress — データセット構築・検証パイプライン完了、次フェーズにてモデル学習評価)
- **作成日**: 2026-10-13
- **関連ドキュメント**:
  - 総合概要: [docs/engineering/mediapipe-overview.md](../engineering/mediapipe-overview.md)
  - スクリプトカタログ: [scripts/README.md](../../scripts/README.md)
  - 先行ブラインド監査照合: [docs/issues/issue-19-mediapipe-audit-sample-a-reconciliation.md](issue-19-mediapipe-audit-sample-a-reconciliation.md)
  - 先行合意サンプル統合: [docs/issues/issue-22-integrate-agreed-pending-and-promote-challenger.md](issue-22-integrate-agreed-pending-and-promote-challenger.md)
  - データセット構築スクリプト: [scripts/build_dual_taxonomy_dataset.py](../../scripts/build_dual_taxonomy_dataset.py)
  - ユニットテスト: [scripts/tests/test_build_dual_taxonomy_dataset.py](../../scripts/tests/test_build_dual_taxonomy_dataset.py)

---

## 1. Problem (問題の所在)

1. **既存9クラス（調理法ベース単一ラベル）の構造的限界**:
   - 現行の9クラス（`curry_rice`, `drink`, `fish_dish`, `fried_dish`, `meat_dish`, `noodles`, `simmered_dish`, `stir_fry`, `other_or_exclude`）は「1枚の写真に1つの主菜調理法がある」ことを前提としている。
   - しかし [Issue-19](issue-19-mediapipe-audit-sample-a-reconciliation.md) のブラインド監査突合において、`curry_rice`（合意率 85.0%）と `drink`（合意率 100.0%）以外の調理法5クラスがゲート未達（BLOCKED）となった最大の要因は、日本の家庭料理写真の多くが「焼き魚＋炒め物＋煮物小鉢＋汁物」の一汁複数菜で構成されており、単一の調理法クラスへ強制的に割り当てるとラベルの揺れ（構造的曖昧性）が発生するためであった。
2. **「汎用的な使いやすさ」と「個人専用アプリとしての面白さ」のギャップ**:
   - 誰にでも使える汎用アプリとしては「一汁複数菜の定食」「ワンプレート」「晩酌・パーティー」「麺・単品」「外食・社食トレイ」「お酒記録」「非食事ノイズ」といった**食卓シーン（Meal Scene）**の分類が直感的で破綻しにくい。
   - 一方で、ユーザー自身の家族の記録（奥様の手料理や食卓の習慣を振り返るパーソナルアプリ）としては、単なる汎用カテゴリだけでは味気なく、「奥様の特製キーマカレー（丸ごとゆで卵乗せ）」「北欧大皿（ARABIA Tuokio/Avec・モナミ等）のおかず合盛り」「焼き鮭と納豆パックの定番和朝食」「卓上IHアヒージョとバゲットのおうちバル」「藍染付小皿の晩酌膳」「タッパーりんご・四角い解凍ストックご飯・猫やトラの箸置き」といった**家庭固有の料理レパートリーと生活感シグネチャ**を捉えられるモデルが求められる。

---

## 2. Evidence (客観的証拠・実測値)

### 2.1 先入観なし（固定選択肢なし）の1,007枚オープン視覚観察

確認バイアスや既存9クラスの先入観を排除するため、`zip2`（全3,391枚）から重複なしで **計1,007枚（全体の29.7%）** をブラインド状態で視覚観察し、写っている料理・器・配置・特徴を自由記述（JSONL）として記録した（`state/mediapipe_labeling_runs/open_observation_20261013/observations_all_1007.jsonl`）。

- **観察内訳（計1,007枚、重複ゼロ）**:
  - `sample_a_280`: 280枚
  - `batch250`: 256枚
  - `zip2_audit_rare_boundary`: 189枚（全件網羅）
  - `sample_70`: 70枚
  - `zip2_reserve_pool`: 65枚
  - `zip2_audit_random_major`: 58枚
  - `even48`: 41枚（重複除外後全件）
  - `zip2_excluded_pending_review`: 24枚（全件網羅）
  - `zip2_pseudo_label_candidate`: 15枚
  - `zip2_quarantine_candidate`: 9枚（全件網羅）

### 2.2 デュアルタクソノミー（汎用7クラス／わたし専用8クラス＋11シグネチャタグ）構築結果

`python3 scripts/build_dual_taxonomy_dataset.py` を1,007枚の観察データに対して実行した実測出力：

```text
=== Dual-Taxonomy Dataset Build Complete ===
Total records: 1007
Protected Golden Test overlap pinned to test: 7

[Model 1: Universal Dining Scene (7 classes)]
  - home_teishoku_set: 320
  - one_plate_or_curry: 295
  - izakaya_bistro_or_party: 112
  - noodles_or_single_bowl: 68
  - dining_out_or_tray_meal: 73
  - drink_or_bottle_record: 113
  - non_food_or_exclude: 26
  Splits: {'train': 806, 'val': 101, 'test': 100}

[Model 2: Personal Household & Wife's Cooking (8 classes)]
  - wife_multi_dish_teishoku: 204
  - wife_nordic_one_plate: 144
  - wife_curry_or_ethnic_plate: 129
  - wife_morning_salmon_natto: 108
  - wife_bistro_baguette_bal: 53
  - wife_izakaya_small_dishes: 66
  - household_pot_noodles_or_ramen_rice: 65
  - special_takeout_party_feast: 26
  Splits: {'train': 637, 'val': 79, 'test': 79}

[Personal Signature Multi-Label Tags]
  - sig_nordic_tableware: 210
  - sig_sometsuke_ware: 194
  - sig_herb_rimmed_plate: 104
  - sig_whole_or_soft_egg: 129
  - sig_seasonal_fruit_side: 113
  - sig_staple_veggie_sides: 218
  - sig_thawed_block_rice: 106
  - sig_natto_pack_on_table: 61
  - sig_tupperware_or_deli_pack: 99
  - sig_cookware_on_table: 82
  - sig_cute_chopstick_rest_or_figure: 130
```

---

## 3. 設計仕様：2種類の分類モデル体系

### 3.1 モデル①：汎用モデル（Universal Dining Scene — 7クラス）
一般ユーザーの食卓写真にもそのまま適用可能な、食卓全体のシーン・献立形式を判別する7クラス体系：

| クラスID | 日本語名称 | 定義・視覚的特徴 | 1,007枚中の件数 |
|---|---|---|---:|
| `home_teishoku_set` | 一汁複数菜・おうち定食 | 主菜皿＋小鉢（副菜）＋汁物椀＋ご飯茶碗が並ぶ定食スタイル | 320 (31.8%) |
| `one_plate_or_curry` | ワンプレート・カレー・丼皿 | 大皿合盛りプレート、カレー・キーマ・ハヤシ・ガパオ・チャーハン・丼物 | 295 (29.3%) |
| `drink_or_bottle_record` | お酒・ドリンク単体記録 | 日本酒・焼酎・泡盛・ワイン等のボトルやラベル接写記録 | 113 (11.2%) |
| `izakaya_bistro_or_party` | 晩酌おつまみ・バル・パーティー | 小皿おつまみ膳、卓上IHアヒージョ/フォンデュ、宅配ピザやパック寿司大皿 | 112 (11.1%) |
| `dining_out_or_tray_meal` | 外食・社食トレイ・デスク飯 | 社食/学食プラスチックトレイ、外食チェーン、PCデスク横ランチ | 73 (7.2%) |
| `noodles_or_single_bowl` | 麺・単品ボウル | ラーメン・うどん・蕎麦・パスタ・まぜそば・焼きそば主体の食事 | 68 (6.8%) |
| `non_food_or_exclude` | 非食事・除外ノイズ | カメラロールから混入した眼鏡試着セルフィー・日用品箱・風景等の除外対象 | 26 (2.6%) |

### 3.2 モデル②：わたし専用モデル（Personal Household & Wife's Cooking — 8クラス＋11シグネチャタグ）
おうちの食事記録（計795枚）を対象に、奥様の手料理レパートリーと我が家の食卓モードを判別する8クラス体系および11種のマルチラベル特徴タグ：

| クラスID | 日本語名称 | 定義・我が家固有の特徴 | 795枚中の件数 |
|---|---|---|---:|
| `wife_multi_dish_teishoku` | 品数たっぷり一汁複数菜・夕定食 | 肉/魚メイン＋常備菜小鉢（しりしり・きんぴら・かぼちゃ煮等）＋具沢山汁物 | 204 (25.7%) |
| `wife_nordic_one_plate` | 北欧大皿のおかず合盛りプレート | ARABIA（Tuokio/Avec）・モナミ・ハーブ柄大皿のご飯＋炒め物ワンプレート | 144 (18.1%) |
| `wife_curry_or_ethnic_plate` | 奥様の特製カレー・エスニック皿 | キーマカレー（中央に丸ごとゆで卵）、ガパオ（目玉焼き）、ハヤシ、グリーンカレー | 129 (16.2%) |
| `wife_morning_salmon_natto` | 定番の和朝食・焼き鮭＆納豆膳 | 焼き鮭や干物・ししゃも＋ネギからし乗せ納豆パック直出し＋汁物 | 108 (13.6%) |
| `wife_izakaya_small_dishes` | おうち居酒屋・染付小皿の晩酌膳 | 藍染付（唐草・十草）やガラス小鉢に丸ごと焼きピーマン・鶏レバー煮・厚揚げ・刺身 | 66 (8.3%) |
| `household_pot_noodles_or_ramen_rice` | 休日の鍋/フライパン麺＆ラーメンライス | コルク鍋敷きに小鍋・フライパン直出しの煮込みうどん/ラーメン、袋麺＋白ご飯 | 65 (8.2%) |
| `wife_bistro_baguette_bal` | 奥様の洋風ビストロ・おうちバル | 木製ボードのバゲット＋卓上IHアヒージョ/フォンデュ、ラタトゥイユ、チーズ、温野菜 | 53 (6.7%) |
| `special_takeout_party_feast` | ハレの日テイクアウト宴席 | ドミノ・ピザ複数箱パーティー、スシロー等の大皿パック寿司、オードブル重 | 26 (3.3%) |

---

## 4. 受入基準 (Acceptance Criteria)

- [x] `zip2` 画像群から1,007枚（重複ゼロ、全境界・除外候補を含む）の先入観なし視覚観察ログと重複防止台帳を構築すること。
- [x] 1,007枚の観察ログから「①汎用7クラス」と「②わたし専用8クラス＋11シグネチャタグ」を決定論的に構築・スプリット分割するスクリプト（`scripts/build_dual_taxonomy_dataset.py`）を実装すること。
- [x] Golden Test Set とのデータ漏洩防止（重複する7枚を強制的に `test` スプリットへ固定し、`train`/`val` への混入ゼロ）を機械的に保証し、ユニットテスト（`scripts/tests/test_build_dual_taxonomy_dataset.py`）で検証すること。
- [ ] 次フェーズ：構築した2種類のデータセットを用いて実際に分類モデルを学習・評価し、精度および実用性を検証すること。
