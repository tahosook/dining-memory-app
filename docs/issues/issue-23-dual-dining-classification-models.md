# [Enhancement] 1,007枚オープン視覚観察に基づく2階層（汎用シーン7クラス／わたし専用8クラス＋シグネチャタグ）分類データセット構築

- **内部ドキュメントID**: issue-23
- **対応 GitHub Issue**: 未起票
- **ステータス**: Phase 1 & 2 完了（データセット構築・モデル学習評価完了、アプリ統合は Phase 3 次期フェーズ候補）
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

### フェーズ 1: オープン視覚観察とデュアルデータセット構築（完了）
- [x] `zip2` 画像群から1,007枚（重複ゼロ、全境界・除外候補を含む）の先入観なし視覚観察ログと重複防止台帳を構築すること。
- [x] 1,007枚の観察ログから「①汎用7クラス」と「②わたし専用8クラス＋11シグネチャタグ」を決定論的に構築・スプリット分割するスクリプト（`scripts/build_dual_taxonomy_dataset.py`）を実装すること。
- [x] Golden Test Set とのデータ漏洩防止（重複する7枚を強制的に `test` スプリットへ固定し、`train`/`val` への混入ゼロ）を実測検証し、ユニットテスト（`scripts/tests/test_build_dual_taxonomy_dataset.py`）で検証すること。

### フェーズ 2: デュアル分類モデルの学習と Held-out 全スプリット評価（完了）
- [x] 構築した2種類のデータセットを用いて実際に分類モデル（汎用7クラス / 専用8クラス）を学習し、Held-out `test` / `val` / `train` スプリットでの Top-1 / Top-3 精度およびレイテンシを実測・記録すること。
- [x] TensorFlow Hub の Kaggle Models 移行に対応し、MobileNetV2 バックボーンの取得・モデル仕様生成・学習処理の実動作を検証すること。

### フェーズ 3: Android アプリ本体・本番ランタイムへの統合（次期フェーズ・未着手）
- [ ] （次期フェーズ候補）Android アプリ（APK）同梱アセット（`assets/mediapipe/meal-input-assist.task`）の更新、または二刀流モデルのオンデマンド切替機構の実装。
- [ ] （次期フェーズ候補）TypeScript / Native 側の推論正規化レイヤーおよび `MealInputAssistSection` UI でのデュアルモデルサジェスト配線。

---

## 5. モデル学習・評価実績 (Evaluation & Evidence)

2026年10月14日、構築したデュアルデータセットを用いて MobileNetV2 バックボーン（Kaggle Models 移行対応済み）による 2 種類の MediaPipe Image Classifier モデルの学習と、厳格な Held-out（`test` / `val` / `train`）全スプリット評価を完了しました。

### 5.1 モデル①：汎用ダイニングシーン分類モデル (`universal_scene_7class.task`)
- **モデルファイル**: `state/mediapipe_models/dual_taxonomy_issue23/universal_scene_7class/universal_scene_7class.task` (8,902,224 bytes)
- **学習条件**: MobileNetV2 (224x224), 20 epochs, batch size 16, 少数クラス拡張訓練データ 992 枚

| スプリット | サンプル数 | Top-1 精度 | Top-3 精度 | 平均確信度 | 推論レイテンシ (Apple M4) |
|---|:---:|:---:|:---:|:---:|:---:|
| **Test（未知評価用・Golden重複完全固定）** | **100** | **67.0%** (67/100) | **94.0%** (94/100) | 65.7% | 15.8ms |
| **Val（検証用）** | **101** | **67.3%** (68/101) | **94.1%** (95/101) | 61.7% | 15.8ms |
| **Train（拡張訓練用）** | 992 | 80.8% (802/992) | 99.2% (984/992) | 68.8% | 15.8ms |
| **Overall** | 1,193 | 78.5% (937/1,193) | 98.3% (1,173/1,193) | 67.9% | 15.8ms |

#### クラス別性能指標 (Overall)
| クラス | サンプル数 | 正解 (TP) | Precision | Recall | F1-Score |
|---|:---:|:---:|:---:|:---:|:---:|
| `non_food_or_exclude` | 106 | 104 | 97.2% | 98.1% | **97.7%** |
| `drink_or_bottle_record` | 122 | 114 | 96.6% | 93.4% | **95.0%** |
| `dining_out_or_tray_meal` | 114 | 106 | 88.3% | 93.0% | **90.6%** |
| `one_plate_or_curry` | 295 | 204 | 81.0% | 69.2% | **74.6%** |
| `noodles_or_single_bowl` | 114 | 68 | 93.2% | 59.7% | **72.7%** |
| `home_teishoku_set` | 320 | 251 | 64.7% | 78.4% | **70.9%** |
| `izakaya_bistro_or_party` | 122 | 90 | 66.7% | 73.8% | **70.0%** |

### 5.2 モデル②：わたし専用食卓・奥様手料理分類モデル (`personal_household_8class.task`)
- **モデルファイル**: `state/mediapipe_models/dual_taxonomy_issue23/personal_household_8class/personal_household_8class.task` (8,907,412 bytes)
- **学習条件**: MobileNetV2 (224x224), 20 epochs, batch size 16, 少数クラス拡張訓練データ 833 枚

| スプリット | サンプル数 | Top-1 精度 | Top-3 精度 | 平均確信度 | 推論レイテンシ (Apple M4) |
|---|:---:|:---:|:---:|:---:|:---:|
| **Test（未知評価用・Golden重複完全固定）** | **79** | **50.6%** (40/79) | **86.1%** (68/79) | 48.9% | 15.7ms |
| **Val（検証用）** | **79** | **48.1%** (38/79) | **78.5%** (62/79) | 49.8% | 15.7ms |
| **Train（拡張訓練用）** | 833 | 71.7% (597/833) | 93.2% (776/833) | 56.5% | 15.6ms |
| **Overall** | 991 | 68.1% (675/991) | 91.4% (906/991) | 55.4% | 15.6ms |

#### クラス別性能指標 (Overall)
| クラス | サンプル数 | 正解 (TP) | Precision | Recall | F1-Score |
|---|:---:|:---:|:---:|:---:|:---:|
| `special_takeout_party_feast` | 96 | 93 | 82.3% | 96.9% | **89.0%** |
| `household_pot_noodles_or_ramen_rice` | 102 | 82 | 75.9% | 80.4% | **78.1%** |
| `wife_bistro_baguette_bal` | 100 | 87 | 65.9% | 87.0% | **75.0%** |
| `wife_morning_salmon_natto` | 112 | 100 | 63.7% | 89.3% | **74.4%** |
| `wife_curry_or_ethnic_plate` | 129 | 82 | 81.2% | 63.6% | **71.3%** |
| `wife_izakaya_small_dishes` | 104 | 76 | 59.8% | 73.1% | **65.8%** |
| `wife_nordic_one_plate` | 144 | 75 | 60.5% | 52.1% | **56.0%** |
| `wife_multi_dish_teishoku` | 204 | 80 | 62.0% | 39.2% | **48.0%** |

### 5.3 成果と考察
1. **アプリ実用性との適合（Top-3 カバレッジ）**:
   - Android アプリの入力補助 UI（`MealInputAssistSection`）は Top-3 の候補ラベルをタップ可能なサジェストチップとして表示する UX 設計。
   - 汎用モデルは未知 Test セットで **Top-3 94.0%**、専用モデルも **Top-3 86.1%** の高確率で正解ラベルを画面内に提示できることが実証された。
2. **高速推論性能**:
   - 両モデルとも推論時間 **15.7〜15.8ms**（約 63 FPS 相当）で動作し、モバイル端末上での低遅延入力補助要件を余裕を持ってクリア。
3. **AI & Privacy ガバナンス遵守**:
   - `AGENTS.md` の原則に従い、本番同梱アセット（`android/app/src/main/assets/mediapipe/meal-input-assist.task`）は上書きせず、実験モデル群は `state/mediapipe_models/dual_taxonomy_issue23/` 配下で安全に分離管理されている。
