# [Evaluation & Benchmark] MediaPipe 採用疑似ラベル統合・Challenger 再学習・Promotion Gate 評価レポート

- **内部ドキュメントID**: issue-21
- **対応 GitHub Issue**: 未起票
- **ステータス**: 完了 (Closed)
- **作成日**: 2026-10-11
- **結果**: 確定採用疑似ラベル74枚（`curry_rice` 34枚、`drink` 40枚）を正規学習データセット（`zip2-batch250`）の訓練スプリットへ安全に統合（計330枚、訓練264枚）。Golden Test Set（7枚）に対するデータ漏洩ゼロ（0/7）を検証した上で、MediaPipe Model Maker による MobileNetV2 Challenger モデルの再学習を実施。Golden Test Set 実測評価において、追加クラスである `curry_rice` は Champion の誤分類（`stir_fry`）から **Top-1 正解（確信度 49.0%）へ劇的に改善**し、`drink` も **Top-1 正解（確信度 91.6%）を安定維持**した。しかし、クラス不均衡の拡大に伴い `other_or_exclude` が Top-3 圏外へ脱落したため、Top-3 が 7/7 (100%) ➔ 6/7 (85.7%)、Top-1 が 5/7 (71.4%) ➔ 4/7 (57.1%) となり、Promotion Gate は `REJECT`（回帰ガード作動）と判定。AGENTS.md の原則「No regression, no PR」に基づき、本番アセット（`meal-input-assist.task`）は上書きされず安全に保護された。
- **関連ドキュメント**:
  - 先行抽出パイプライン: [docs/issues/issue-20-export-eligible-pseudo-labels.md](issue-20-export-eligible-pseudo-labels.md)
  - 先行照合結果: [docs/issues/issue-19-mediapipe-audit-sample-a-reconciliation.md](issue-19-mediapipe-audit-sample-a-reconciliation.md)
  - 統合スクリプト: `scripts/integrate_eligible_pseudo_labels.py`
  - 自律改善パイプライン: `scripts/run-autonomous-model-improvement.sh`
  - Challenger 評価結果: `state/mediapipe_models/challenger_evaluation.json`
  - Champion 評価結果: `state/mediapipe_models/champion_evaluation.json`

---

## 1. Problem (問題の所在)

Issue-19 および Issue-20 において、二層採用ゲートを完全通過した高純度な学習候補データセット（74枚: `curry_rice` 34枚、`drink` 40枚）を抽出・検証した。
本タスクの目的は以下の通りである：

1. **安全なデータセット統合**:
   抽出された 74枚をベースライン学習セット（256枚 / `zip2-batch250`）の `train` スプリットへ統合し、`val` / `test` のグラウンドトゥルース性を損なわず、Golden Test Set（7枚）とのデータ漏洩が厳密にゼロであることを機械的に保証すること。
2. **Challenger モデルの再学習と実測評価**:
   拡張データセット（330枚）を用いて Challenger モデルを再学習し、現行本番モデル（Champion）との間で Golden Test Set（7枚）に対する客観的性能比較を行うこと。
3. **Promotion Gate の厳格適用**:
   Promotion Gate の基準（Top-1、Top-3、少数クラス改善、レイテンシ、モデルサイズ、回帰防止）に基づき、モデル昇格の適否を判定し、回帰発生時には本番アセットを確実に保護すること。

---

## 2. Evidence (実測結果と客観的証拠)

### 2.1 データセット統合結果

`scripts/integrate_eligible_pseudo_labels.py --enforce-real-counts` の実行結果：

```text
=== MediaPipe Pseudo-Label Dataset Integration ===
[SUCCESS] Dataset integration complete.
  - Total images: 256 -> 330 (+74)
  - Train split:  190 -> 264
  - Val split:    33 (unaltered, pristine)
  - Test split:   33 (unaltered, pristine)
  - Added by class: {'curry_rice': 34, 'drink': 40}
  - Golden test leakage: 0 / 7
```

### 2.2 Golden Test Set 実測比較 (N=7)

`run-autonomous-model-improvement.sh` による Champion vs Challenger の実測ベンチマーク結果：

| 指標 | Champion (現行本番) | Challenger (今回生成) | Promotion Gate 基準 | 判定 |
| :--- | :---: | :---: | :---: | :---: |
| **Top-1 正解数** | **5 / 7 (71.4%)** | **4 / 7 (57.1%)** | `>= 2/7` (28.6%) かつ `>= Champion` | **FAIL** (4 < 5, 回帰) |
| **Top-3 正解数** | **7 / 7 (100.0%)** | **6 / 7 (85.7%)** | `>= 5/7` (71.4%) かつ `>= Champion` | **FAIL** (6 < 7, 回帰) |
| **少数クラス Top-3** | **2 / 2 (100.0%)** | **1 / 2 (50.0%)** | `> Champion` | **FAIL** (1 <= 2) |
| **平均推論レイテンシ** | 16.4 ms | 15.6 ms | `<= 100.0 ms` | **PASS** (-0.8ms 高速化) |
| **モデルファイルサイズ** | 8,903,665 B (~8.5 MB) | 8,903,665 B (~8.5 MB) | 1 MiB 〜 15 MiB | **PASS** |
| **最終ゲート判定** | — | — | 全条件 PASS | **REJECT** |

### 2.3 サンプル別予測変化の詳細分析 (Golden Test 7件)

| # | 正解ラベル | Champion 予測 (確信度) | Challenger 予測 (確信度) | Top-3 (Champ / Chal) | 変化と分析 |
| :-: | :--- | :--- | :--- | :---: | :--- |
| 1 | `curry_rice` | `stir_fry` (0.25) [×] | **`curry_rice` (0.49) [○]** | 3位 / **1位** | **Challenger 改善 (Top-1正解獲得)**: カレー34枚追加が明確に寄与 |
| 2 | `drink` | **`drink` (0.92) [○]** | **`drink` (0.92) [○]** | 1位 / 1位 | **同等 (高精度維持)**: ドリンク40枚追加後も安定 |
| 3 | `fish_dish` | **`fish_dish` (0.57) [○]** | `stir_fry` (0.37) [×] | 1位 / 3位 (0.18) | **微減 (Top-1 ➔ Top-3)**: 魚料理が炒め物に引っ張られた |
| 4 | `fried_dish` | `meat_dish` (0.32) [×] | `other_or_exclude` (0.34) [×] | 3位 / 3位 (0.14) | **同等 (Top-3維持)** |
| 5 | `meat_dish` | **`meat_dish` (0.28) [○]** | **`meat_dish` (0.24) [○]** | 1位 / 1位 | **同等 (Top-1正解維持)** |
| 6 | `other_or_exclude` | **`other_or_exclude` (0.21) [○]** | `fish_dish` (0.34) [×] | 1位 / **圏外 (4位以下)** | **悪化 (Top-1 ➔ Miss)**: クラス不均衡により圏外脱落 |
| 7 | `simmered_dish` | **`simmered_dish` (0.61) [○]** | **`simmered_dish` (0.76) [○]** | 1位 / 1位 | **同等 (Top-1維持・確信度+15pt向上)** |

### 2.4 回帰ガードと本番アセット保護の実証
- Gate 判定が `REJECT` となったため、本番モデルアセット（`android/app/src/main/assets/mediapipe/meal-input-assist.task`）の更新は物理的にキャンセルされた。
- 本番モデルの SHA-256、サイズ（8,903,665 bytes）、タイムスタンプは 100% 変更されず完全に保護された。

---

## 3. Analysis & Key Findings (要因分析と知見)

1. **疑似ラベル投入の正の成果**:
   - `curry_rice` の予測において、Champion で誤分類されていたサンプルが **Top-1 正解（確信度 49.0%）へ劇的に改善**した。
   - `drink` についても 91.6% の高確信度で Top-1 正解を維持しており、Gemini ブラインド監査で合格した2クラスの疑似ラベル品質が極めて高かったことがモデル学習結果からも実証された。
2. **回帰の原因（クラス不均衡の拡大）**:
   - `curry_rice`（38 ➔ 72枚）と `drink`（32 ➔ 72枚）が倍増したのに対し、**`fried_dish`（8枚）、`other_or_exclude`（11枚）、`simmered_dish`（17枚）などの少数クラスはデータが増加しなかった**。
   - その結果、モデルの決定境界がデータ数の多いクラスに引き寄せられ、データ数の少ない `other_or_exclude` や `fish_dish` の判別境界に歪みが生じ、Top-3 から脱落した。
3. **ガバナンスと安全設計の完全勝利**:
   - 一部のクラスで目覚ましい改善が見られたとしても、全体として回帰が発生しているモデルを本番へ投入しない「Promotion Gate」の厳格な機械的ルール（Machine Gate）が正しく機能し、本番アプリの品質破壊が未然に防がれた。

---

## 4. Next Actions (今後の改善方針)

1. **少数クラスの均衡データ拡張**:
   - `fried_dish`、`other_or_exclude`、`simmered_dish` などの少数クラスに対して、データ拡張（Augmentation）の倍率引き上げ、または追加データ収集を実施してクラス間の不均衡を是正する。
2. **本 PR のスコープ**:
   - 本タスクでは「データ統合パイプラインの実装」「Challenger 学習と実測評価」「Promotion Gate による安全な本番保護」までを完了とし、本番モデルは現状維持とする。
