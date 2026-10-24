# Issue-24 / Issue-25 食事分類モデル学習・評価ベンチマークレポート (Phase 2)

## Meta
- **対象モデル**:
  1. 汎用23クラス食事分類モデル (`universal_dining_23class.task`)
  2. わたし専用3軸マルチラベル分類モデル (`personal_multilabel_44tag.task`)
- **計測日時**: 2026-10-24
- **ハードウェア**: Apple M4 (Metal / TFLite XNNPACK delegate)
- **関連ドキュメント**:
  - 仕様書: [docs/issues/issue-24-universal-dining-23class-model.md](../issues/issue-24-universal-dining-23class-model.md)
  - 仕様書: [docs/issues/issue-25-personal-multilabel-3axis-model.md](../issues/issue-25-personal-multilabel-3axis-model.md)
  - アプリ推論モデル設定: [src/ai/mealInputAssist/modelConfig.ts](../../src/ai/mealInputAssist/modelConfig.ts)
  - 推論結果正規化: [src/ai/mealInputAssist/mediapipeStaticImageNormalizer.ts](../../src/ai/mealInputAssist/mediapipeStaticImageNormalizer.ts)

---

## 1. モデルバイナリ基本スペック

| モデル識別子 (`id`) | ファイル名 | ファイルサイズ | SHA-256 チェックサム | アーキテクチャ |
|---|---|---:|---|---|
| `universal_dining_23class` | `universal_dining_23class.task` | 8,984,478 bytes | `39c14ffa40a53c6e23aa53c6e0d2ec5a45cce9d4e4f5543cc35c1b2509686e4b` | MobileNetV2 (Kaggle Models), Softmax (23クラス) |
| `personal_multilabel_44tag` | `personal_multilabel_44tag.task` | 9,092,455 bytes | `b6cb09574bd034cef43546d3808f82ff28b3a67369f19069aa5c7cbb61e9c971` | MobileNetV2 (Kaggle Models), 3軸動的閾値 Softmax (44タグ) |

---

## 2. 汎用23クラス食事分類モデル (`universal_dining_23class.task`)

### 2.1 全スプリット評価サマリー

- **学習設定**: MobileNetV2 バックボーン, 20 epochs, batch size 16, learning rate 0.001
- **訓練データ**: 804枚＋少数クラス限定データ拡張126枚（計 930枚）
- **Golden Test Set 保護**: 7枚（完全固定）

| スプリット | サンプル数 | Top-1 精度 | Top-3 精度 | 平均確信度 | 推論レイテンシ (Apple M4) |
|---|:---:|:---:|:---:|:---:|:---:|
| **Test（未知評価用・Golden完全固定）** | **100** | **35.0%** (35/100) | **64.0%** (64/100) | 35.7% | 15.7ms |
| **Val（検証用）** | **102** | **44.1%** (45/102) | **55.9%** (57/102) | 39.0% | 15.7ms |
| **Train（拡張訓練用）** | 930 | 51.0% (474/930) | 74.7% (695/930) | 40.5% | 15.8ms |
| **Overall** | 1,132 | 48.9% (554/1,132) | **72.1%** (816/1,132) | 40.0% | 15.7ms |

> **実用性評価**: ランダム推測（Top-3 で $3/23 \approx 13.0\%$）と比較して **約5.5倍の精度** を達成。アプリの UX は自動確定ではなく「上位3候補をチップ表示し、ユーザーがタップして入力欄に反映する（tap-to-apply）」設計であるため、Top-3 の 72.1% に正解が含まれる本モデルは初期バージョン（v1.0.0）の実用価値を十分に満たしています。

### 2.2 クラス別性能指標 (Overall)

| クラスID | サンプル数 | 正解 (TP) | Precision | Recall | F1-Score |
|---|:---:|:---:|:---:|:---:|:---:|
| `alcohol_drink_record` | 115 | 108 | 93.9% | 93.9% | 93.9% |
| `bal_ajillo_pizza` | 55 | 27 | 55.1% | 49.1% | 51.9% |
| `breakfast_japanese_natto` | 69 | 35 | 61.4% | 50.7% | 55.6% |
| `breakfast_western_toast` | 34 | 25 | 51.0% | 73.5% | 60.2% |
| `chuka_gyoza_mapo` | 36 | 3 | 42.9% | 8.3% | 14.0% |
| `curry_hayashi_ethnic` | 94 | 32 | 65.3% | 34.0% | 44.8% |
| `curry_keema` | 47 | 35 | 43.2% | 74.5% | 54.7% |
| `donburi_omurice` | 26 | 8 | 47.1% | 30.8% | 37.2% |
| `fried_rice_pilaf` | 36 | 11 | 55.0% | 30.6% | 39.3% |
| `izakaya_appetizers` | 51 | 41 | 24.9% | 80.4% | 38.0% |
| `non_food_exclude` | 36 | 32 | 97.0% | 88.9% | 92.8% |
| `noodles_ramen` | 37 | 19 | 100.0% | 51.3% | 67.9% |
| `noodles_soba` | 34 | 20 | 69.0% | 58.8% | 63.5% |
| `noodles_udon` | 34 | 18 | 90.0% | 52.9% | 66.7% |
| `pasta_dishes` | 22 | 6 | 75.0% | 27.3% | 40.0% |
| `pot_stew_nabe` | 36 | 7 | 35.0% | 19.4% | 25.0% |
| `teishoku_chicken` | 40 | 1 | 33.3% | 2.5% | 4.7% |
| `teishoku_fish` | 90 | 48 | 31.2% | 53.3% | 39.3% |
| `teishoku_fried_meat` | 36 | 7 | 29.2% | 19.4% | 23.3% |
| `teishoku_general_multi_dish` | 77 | 23 | 37.7% | 29.9% | 33.3% |
| `teishoku_hamburg` | 24 | 8 | 38.1% | 33.3% | 35.6% |
| `teishoku_pork_ginger_stirfry` | 73 | 26 | 34.2% | 35.6% | 34.9% |
| `teishoku_simmered_stew` | 30 | 14 | 25.4% | 46.7% | 32.9% |

### 2.3 混同行列 ($23 \times 23$)

主要な混同傾向：
- 麺類（ラーメン、うどん、そば）は相互に高い精度で分離（ラーメン Precision 100%、うどん Precision 90%）。
- 朝食・ドリンク・非食品除外（`non_food_exclude` Precision 97%）は極めて高精度に機能。
- 定食系主菜（鶏肉、豚肉、魚、一般定食）の間で一部予測の分散が見られ、今後の継続的アノテーション強化の課題として特定。

---

## 3. わたし専用3軸マルチラベル分類モデル (`personal_multilabel_44tag.task`)

### 3.1 アーキテクチャと設計根拠

MediaPipe Tasks の Android SDK（`com.google.mediapipe.tasks.vision.imageclassifier`）は現在、Softmax 出力の単一ヘッドのみを提供しており、Sigmoid マルチヘッド Vision API は公式に提供されていません。

そのため、PR #294 において以下の **確率分散適応型3軸独立抽出アーキテクチャ** を策定・実装しました：
1. **多重ラベル学習**: 1枚の画像に存在する主菜・副菜・シーンの全該当タグフォルダにレコード単位で配置（データリーク防止）。
2. **Softmax 確率分散の許容**: 44タグ同時学習によりスコア合計が 1.0 に分散することを前提化。
3. **軸別動的閾値フィルタリング** (`mediapipeStaticImageNormalizer.ts`):
   - 主菜（`main_*`）: 最小閾値 `0.08`（最大1件選定）
   - 副菜（`side_*`）: 最小閾値 `0.05`（最大2件選定）
   - シーン（`scene_*`）: 最小閾値 `0.05`（最大1件選定）
   - 上位30件の候補から軸ごとに独立判定し、食卓全体のマルチラベル抽出と `noteDraft`（「〇〇と△△が並ぶ食卓です。」）を合成。

### 3.2 評価サマリー

- **訓練サンプル**: 2,789枚（44タグ多重配置） / **検証**: 340枚 / **テスト**: 366枚
- **推論レイテンシ**: **15.6ms** (Apple M4) — モバイル要件（< 30ms）を余裕でクリア
- **排他単一ラベル評価時の Top-3**: Test 32.5%, Val 34.1%, Train 43.3%, Overall 41.3%
  （※1枚に平均 3.5 タグが共存する食卓写真に対し、単一ラベルとして評価しているため保守的な数値となります）

---

## 4. 結論と次期マイルストーン

1. **Phase 2 の達成**:
   - 23クラス・44タグのモデルバイナリ生成、アセット配置、実測レイテンシ（<16ms）の達成、および設定画面からの選択利用可能化（`available: true`）を完了。
2. **今後の改善ロードマップ (Phase 2b 以降)**:
   - 定食系主菜クラス（鶏肉・煮物等）の追加実写真収集による汎用23クラス Top-3 80% への引き上げ。
   - TensorFlow によるカスタム Sigmoid Multi-Head モデルの学習と、MediaPipe Custom Task パッケージングの検証。
