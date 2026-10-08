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
1. **Top-3 候補提示精度**: 現行（57.1%）を超過し、**>= 71.4% (5/7以上)** を達成すること。
2. **Top-1 完全一致精度**: 現行（28.6%）以上（**>= 28.6%**）を維持・向上すること。
3. **少数クラスの改善**: 現行で正解数 0 だった少数クラス（`fried_dish`, `stir_fry`, `other_or_exclude`）のいずれかで Top-3 カバレッジが改善すること。
4. **非機能要件**: モデルファイルサイズが 15MB 以下、推論レイテンシが 100ms 以下（モバイル動作要件）であること。
5. **回帰防止 (Regression Guardrail)**: 基準に満たない場合は自動的にロールバック（変更破棄）し、調査ログのみを残すこと（AGENTS.md の「変更しないことの成功定義」に準拠）。

---

## 2. 現状ベースライン (Current Baseline)

### モデル情報
- アーキテクチャ: MobileNetV2 転移学習（MediaPipe Model Maker）
- モデルパス: `android/app/src/main/assets/mediapipe/meal-input-assist.task` (約 8.5MB)
- 分類クラス数: 8 クラス (`curry_rice`, `drink`, `fish_dish`, `fried_dish`, `meat_dish`, `other_or_exclude`, `simmered_dish`, `stir_fry`)

### 評価結果 (Benchmark)
| スプリット | サンプル数 | Top-1 Accuracy | Top-3 Accuracy | 平均確信度 |
|:---|:---:|:---:|:---:|:---:|
| **Golden Test (不変テスト)** | **7** | **28.6% (2/7)** | **57.1% (4/7)** | **38.0%** |
| Validation (検証) | 7 | 57.1% (4/7) | 71.4% (5/7) | 36.0% |
| Train (訓練) | 34 | 44.1% (15/34) | 70.6% (24/34) | 35.6% |
| Overall (全体) | 48 | 43.8% (21/48) | 68.8% (33/48) | 36.0% |

### 主な課題
1. **少数クラスの未学習**: `fried_dish`（4枚）、`stir_fry`（2枚）のデータ数が極端に少なく、Recall 0.0%。
2. **和食・煮汁系の混同**: `fish_dish`（魚料理）と `simmered_dish`（煮物）が相互に誤分類。

---

## 3. 自律改善パイプライン設計 (Autonomous Pipeline Architecture)

人手を介さずモデルを強化する 4 つのフェーズ：

```mermaid
flowchart TD
    A["zip2 データセット<br/>(Train: 34枚 / Val: 7枚 / Test: 7枚)"] --> B["Phase 1: 不変 Golden Test Set の固定<br/>(テストデータの漏洩防止)"]
    B --> C["Phase 2: 少数クラスの自律データ拡張<br/>(Rotation / Flip / Color Jitter)"]
    C --> D["Phase 3: 自動ハイパーパラメータ探索 & 再学習<br/>(train-mediapipe-model.py)"]
    D --> E["Phase 4: Golden Test Set 自動定量評価<br/>(evaluate-mediapipe-model.py)"]
    E --> F{"Champion / Challenger 昇格判定<br/>Top-3 >= 71.4% かつ Top-1 >= 28.6% ?"}
    F -->|合格 (PASS)| G["meal-input-assist.task 更新 & Git Commit"]
    F -->|不合格 (FAIL)| H["自動ロールバック (安全停止 & ログ出力)"]
```

### Phase 1: 不変 Golden Test Set の固定
- `state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset/test/` の 7 枚は、一切の拡張や学習に含めず、純粋な最終評価用として完全隔離・固定する。

### Phase 2: 少数クラスの自律データ拡張 (Autonomous Data Augmentation)
- 課題となっている少数クラス（特に枚数が 5 枚未満のクラス）を自動検出。
- 以下の変換を自動合成し、各クラス最低 15〜20 枚程度までバランスを底上げする：
  1. 水平反転 (Horizontal Flip)
  2. 微小回転 (Rotation: ±10°, ±20°)
  3. 明るさ・コントラスト微調整 (Brightness/Contrast Jitter: ±15%)
  4. 微小ズーム・クロップ (Center Crop & Resize)
- 出力先: `state/mediapipe-dataset/augmented_run/`

### Phase 3: 自動再学習 (Autonomous Retraining)
- [`scripts/train-mediapipe-model.py`](../../scripts/train-mediapipe-model.py) を使用。
- エポック数（20〜30 epochs）、バッチサイズ（4〜8）、学習率（0.0005〜0.001）を調整して新モデル（Challenger）を生成。

### Phase 4: Golden Test Set による自動評価 (Autonomous Benchmarking)
- [`scripts/evaluate-mediapipe-model.py`](../../scripts/evaluate-mediapipe-model.py) を実行。
- Golden Test Set に対する Top-1, Top-3, Class-wise Recall, Confusion Matrix を算出。

### Phase 5: Champion / Challenger 昇格判定
- 既存モデル（Champion: Top-3 57.1%）と比較し、昇格基準を満たした場合のみ `android/app/src/main/assets/mediapipe/meal-input-assist.task` を置換。
- 満たない場合は新モデルを破棄し、原因（過学習、特定クラスの悪化等）をレポート。

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
