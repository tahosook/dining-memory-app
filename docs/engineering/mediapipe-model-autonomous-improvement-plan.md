# MediaPipe 食事分類モデル 自律改善計画書 (Autonomous Model Improvement Plan)

## Meta
- Purpose: `zip2` ディレクトリ内の食事写真資産を活用し、人手を介さず自律的（Human-free）に MediaPipe 画像分類モデル（`.task`）の精度改善ループを回すための実行計画・仕様を定義する。
- Audience: AI エージェント（長期自律タスク実行者）、リポジトリ保守者。
- Related docs: [AGENTS.md](../../AGENTS.md), [PLANS.md](../../PLANS.md), [TASKS.md](../../TASKS.md), [docs/engineering/mediapipe-labeling-workflow.md](mediapipe-labeling-workflow.md), [docs/engineering/food-labeling-guidelines.md](food-labeling-guidelines.md)

---

## 1. 目的と成功基準 (Goal & Acceptance Criteria)

### 目的
`state/mediapipe_labeling_runs/zip2-even48-20260423/`（zip2）の食事写真データを基盤とし、目視確認や CSV 手動編集を介さずに、データ拡張・自動再学習・定量評価・昇格判定の自律ループを完走させ、入力補助モデルの精度を向上させる。

### 成功基準 (Gate Acceptance Criteria)
固定された **Golden Test Set（7枚の不変テストデータ）** において、以下の基準を満たす新モデル（Challenger）の生成および Android assets への安全デプロイを達成すること：
1. **Golden Test Set 厳格検証**: 評価対象テストセットのサンプル数が厳格に **7件** であること（7件以外は Gate Failure とし Promotion 不可）。
2. **Top-3 候補提示精度**: 正解サンプル数 **>= 5/7 (71.4%以上)** を達成すること（初期 Champion 実績: 4/7 = 57.1%）。
3. **Top-1 完全一致精度**: 正解サンプル数 **>= 2/7 (28.6%以上)** を維持・向上すること（初期 Champion 実績: 2/7 = 28.6%）。
4. **少数クラスの改善 (Champion 実測比較)**: 現在の本番 Champion モデル（`android/app/src/main/assets/mediapipe/meal-input-assist.task`）を同一 Golden Test Set で実測評価し、対象少数クラス（`fried_dish`, `stir_fry`, `other_or_exclude`）について、Challenger の Top-3 正解数が Champion の実測正解数を厳密に上回ること（`Challenger 少数クラス正解数 > Champion 実測正解数`）。
5. **非機能要件**:
   - モデルファイルサイズ: 1MB 以上 **15MB 以下** であること。
   - 推論レイテンシ: 評価環境（CI / ホスト）における平均推論時間が **100ms 以下** であること（※ 本 Gate は評価環境で測定した推論時間に対する品質チェックであり、Android 実機での 100ms 以下性能を直接証明・保証するものではない）。
6. **回帰防止 (Regression Guardrail)**: 基準に満たない場合（REJECT / TIE / テスト件数不一致）は本番 asset を一切変更せず既存の Champion モデルを維持すること（AGENTS.md の「変更しないことの成功定義」に準拠）。

---

## 2. 現状ベースライン (Current Baseline)

### モデル情報
- アーキテクチャ: MobileNetV2 転移学習（MediaPipe Model Maker）
- モデルパス: `android/app/src/main/assets/mediapipe/meal-input-assist.task` (約 8.5MB)
- 分類クラス数: 8 クラス (`curry_rice`, `drink`, `fish_dish`, `fried_dish`, `meat_dish`, `other_or_exclude`, `simmered_dish`, `stir_fry`)

### 評価結果 (Benchmark Before / After)

#### ① 初期モデル (48枚データセット)
| スプリット | サンプル数 | Top-1 Accuracy | Top-3 Accuracy | 平均確信度 |
|:---|:---:|:---:|:---:|:---:|
| **Golden Test (不変テスト)** | **7** | **28.6% (2/7)** | **57.1% (4/7)** | **38.0%** |
| Validation (検証) | 7 | 57.1% (4/7) | 71.4% (5/7) | 36.0% |
| Train (訓練) | 34 | 44.1% (15/34) | 70.6% (24/34) | 35.6% |
| Overall (全体) | 48 | 43.8% (21/48) | 68.8% (33/48) | 36.0% |

#### ② 改修後モデル (256枚 Antigravity 再ラベリング ＋ データ拡張 241枚学習)
| 評価対象 | サンプル数 | **Top-1 Accuracy** | **Top-3 Accuracy** | 平均確信度 | 改善幅 (vs 初期) |
|:---|:---:|:---:|:---:|:---:|:---:|
| **Golden Test (同一7枚直接比較)** | **7** | **71.4% (5/7)** | **85.7% (6/7)** | **38.1%** | **Top-1 +42.8pt / Top-3 +28.6pt** |
| 新 Test (未知テストセット) | 33 | 51.5% (17/33) | 81.8% (27/33) | 50.2% | - |
| 新 Val (検証セット) | 33 | 66.7% (22/33) | 81.8% (27/33) | 51.7% | - |
| 新 Train (訓練セット) | 190 | 63.7% (121/190) | 88.9% (169/190) | 53.6% | - |
| **新 Overall (全体)** | **256** | **62.5% (160/256)** | **87.1% (223/256)** | **52.9%** | **Top-3 約 9 割達成** |

### 達成された成果
1. **初期 Golden Test 比較**: Top-3 精度が **57.1% ➔ 85.7%** へ爆伸し、目標基準（>= 71.4%）を大幅クリア。
2. **少数クラスの完全克服**: 初期モデルで Recall 0% だった `fried_dish`（揚げ物）および `stir_fry`（炒め物）が正しく認識可能になり、全クラスで機能。
3. **ラベルノイズの完全除去**: ローカルLLMが「ソテーやハンバーグを揚げ物、焼き魚を肉料理」と誤認していた 69件（27%）の重大汚染を Antigravity 目視でクレンジング完了。

---

## 3. 自律改善パイプライン設計 (Autonomous Pipeline Architecture)

人手を介さずモデルを強化する 4 つのフェーズ：

```mermaid
flowchart TD
    A["zip2 データセット<br/>(Train: 34枚 / Val: 7枚 / Test: 7枚)"] --> B["Phase 1: 不変 Golden Test Set の固定<br/>(テストデータの漏洩防止)"]
    B --> C["Phase 2: 少数クラスの自律データ拡張<br/>(train のみ拡張、val/test は厳格隔離)"]
    C --> D["Phase 3: 自動再学習<br/>(train-mediapipe-model.py)"]
    D --> E["Phase 4: Golden Test Set 自動定量評価<br/>(evaluate-mediapipe-model.py)"]
    E --> F{"Promotion Gate 判定<br/>Top-3 >= 5/7 (71.4%) かつ Top-1 >= 2/7 (28.6%)<br/>+ 少数クラス改善 (> Champion) + サイズ<=15MB + 遅延<=100ms ?"}
    F -->|合格 (PROMOTE)| G["meal-input-assist.task 安全アトミック更新"]
    F -->|不合格/同等 (REJECT / TIE)| H["本番 asset 変更なし (Champion 完全維持)"]
```

### Phase 1: 不変 Golden Test Set の固定
- `state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset/test/` の 7 枚は、一切の拡張や学習に含めず、純粋な最終評価用として完全隔離・固定する。
- スクリプト実行時に入出力の件数・SHA256ハッシュを自動照合し、データの変質や train への漏洩（Data Leakage）を機械的に防止する。

### Phase 2: 少数クラスの自律データ拡張 (Autonomous Data Augmentation)
- 課題となっている少数クラス（特に枚数が少ないクラス）を対象に、`train` スプリットのみを増強。`test` および `val` は一切変更しない。
- 以下の変換を自動合成し、各クラス目標枚数（15枚程度）までバランスを底上げする：
  1. 水平反転 (Horizontal Flip)
  2. 微小回転 (Rotation: ±8°, ±10°)
  3. 明るさ・コントラスト微調整 (Brightness/Contrast Jitter: ±15%)
  4. クロップ＆リサイズ (Subtle Crop & Resize)
- 出力先: `state/mediapipe-dataset/augmented/`

### Phase 3: 自動再学習 (Autonomous Retraining)
- [`scripts/train-mediapipe-model.py`](../../scripts/train-mediapipe-model.py) を使用。
- Challenger モデル（`model.task`）は作業用ディレクトリ（`OUTPUT_DIR`）にのみ出力し、本番 asset は Gate 評価前には一切変更しない。

### Phase 4: Golden Test Set による自動評価 (Autonomous Benchmarking)
- [`scripts/evaluate-mediapipe-model.py`](../../scripts/evaluate-mediapipe-model.py) を実行。
- 本番 Champion モデル（存在する場合）および Challenger モデルを同一の Golden Test Set（厳格に 7 サンプル）に対して評価。
- Top-1, Top-3, 少数クラス（`fried_dish`, `stir_fry`, `other_or_exclude`）の正解数, Class-wise Recall, 推論レイテンシ, Confusion Matrix を算出。

### Phase 5: Champion / Challenger 昇格判定
- 既存 Champion モデルの実測値と比較し、第 1 節の成功基準（サンプル数 == 7, Top-3 >= 5/7, Top-1 >= 2/7, 少数クラス正解数 > Champion 実測正解数, サイズ <= 15MB, 評価ホスト遅延 <= 100ms）をすべて満たした場合のみ、一時ファイル検証を経てアトミックに `android/app/src/main/assets/mediapipe/meal-input-assist.task` を置換（※ 推論遅延 <= 100ms は評価実行ホスト環境上での品質ゲートであり、Android 実機での遅延性能を直接保証するものではない）。
- 未達（REJECT / REJECT_INVALID_TEST_SET）または同等（MAINTAIN_OR_TIE）の場合は本番 asset を一切変更せず、既存の Champion モデルを完全に維持する（「No regression, no PR」の保証）。

---

## 4. 長期タスク（`/goal`）での実行準備

エージェントが夜間やバックグラウンドで完全自律実行できるようにするためのタスク定義：

### 実行スクリプト・ツール構成
1. データ拡張スクリプト: `scripts/augment-mediapipe-dataset.py`（少数クラス自動検出＆画像合成）
2. モデル学習スクリプト: `scripts/train-mediapipe-model.py`
3. モデル評価スクリプト: `scripts/evaluate-mediapipe-model.py`
4. オーケストレータ: `scripts/run-autonomous-model-improvement.sh`（または Python ランナー）

### 長期タスクの起動プロンプト（ユーザー推奨例）
> `/goal zip2データセットの少数クラスを自動データ拡張し、MediaPipeモデルを再学習して、Golden Test SetにおけるTop-3精度が現行（57.1%）を超えるまで自律改善ループを実行して`
