# [Investigation & Enhancement] MediaPipe 自律改善パイプラインにおける Challenger データセット供給と学習条件の整合性改善

- **内部ドキュメントID**: issue-17
- **対応 GitHub Issue**: GitHub Issue #265
- **ステータス**: 完了 (Closed)
- **作成日**: 2026-10-08
- **結果**: Canonical Default Dataset を 256枚・9クラス（zip2-batch250）へ更新、データセット事前検証（構造・9クラス網羅・SHA256漏洩ゼロ）およびモデル間クラス互換性チェック（9 === 9）を実装。Gate 条件を緩和することなく Challenger が Top-3 100%、Minority Top-3 100% を達成し Promotion Gate を通過、本番アセットをアトミック更新
- **関連 PR**: PR #258 (`feat/train-mediapipe-model-cli`)

---

## 1. Problem (問題の所在)

PR #258 で導入された MediaPipe 食事分類モデルの自律改善パイプライン（`scripts/run-autonomous-model-improvement.sh`）を、リポジトリ内の実データを用いて end-to-end で実行した。
その結果、データ拡張、MobileNetV2 再学習、Champion / Challenger の Golden Test 実測評価、Promotion Gate 判定、およびロールバック安全策に至る全工程は**エラーなく正常に完走**した。

しかし、生成された **Challenger モデルは既存の Production Champion モデルの精度を上回ることができず、Promotion Gate で `REJECT` 判定**となり、本番モデルの更新（Promotion）には至らなかった。

本 Issue はパイプラインの不具合・バグ報告ではなく、**「なぜ現在の学習環境・設定から既存 Champion を上回る Challenger を生成できなかったのか」**を実測 Evidence に基づき分析し、自律改善ループが実際に Champion を安全に更新できる状態へ到達するために必要な改善項目を定義することを目的とする。

---

## 2. Evidence (実走結果と客観的証拠)

### 2.1 実走コマンドと実行ログ
- 実行コミット: `main` 最新 (`4268938` / 直前 `8ed4165`)
- 実行コマンド: `./scripts/run-autonomous-model-improvement.sh`
- 実行環境: Apple Silicon (M4), macOS, Python 3.11 (`.venv_mediapipe`)

### 2.2 定量評価結果 (Golden Test Set: N=7)

| 評価指標 | Champion (現行本番) | Challenger (今回生成) | Promotion Gate 基準 | 判定 |
| :--- | :---: | :---: | :---: | :---: |
| **Top-1 正解数** | **5 / 7 (71.4%)** | **4 / 7 (57.1%)** | `>= 2/7` (28.6%) | **PASS** (ただし回帰) |
| **Top-3 正解数** | **6 / 7 (85.7%)** | **6 / 7 (85.7%)** | `>= 5/7` (71.4%) | **PASS** |
| **少数クラス Top-3** | **1 / 2 (50.0%)** | **1 / 2 (50.0%)** | `> Champion` (厳密に超過) | **FAIL** (1 <= 1) |
| **平均推論レイテンシ** | 16.5 ms | 16.3 ms | `<= 100.0 ms` | **PASS** |
| **モデルファイルサイズ** | 8,903,665 B (~8.5 MB) | 8,898,533 B (~8.5 MB) | 1 MB 〜 15 MB | **PASS** |
| **Champion 回帰防止** | — | Top-1: 4 < 5 | `Challenger >= Champion` | **FAIL** (Regression) |
| **最終ゲート判定** | — | — | 全条件 PASS | **REJECT** |

### 2.3 モデルハッシュによる安全策（非破壊性）の実証
- **Champion Before SHA256**:
  `4835d93442c976dfea4c114926ccb230fdf4f7211c83755f1e72520a06669874`
- **Challenger SHA256**:
  `2da0dff699cd6baefc40600e58e8d23d0a4ea669952a40427a85a35bf19c08a2`
- **Champion After SHA256 (REJECT 判定後)**:
  `4835d93442c976dfea4c114926ccb230fdf4f7211c83755f1e72520a06669874`
- **確認結果**:
  判定が `REJECT` となったため、本番アセット（`android/app/src/main/assets/mediapipe/meal-input-assist.task`）は上書きされず、SHA256・ファイルサイズ・タイムスタンプすべてが完全に維持された。

### 2.4 サンプル単位の評価比較 (Golden Test 7件)

`champion_evaluation.json` と `challenger_evaluation.json` のサンプル別詳細比較：

| # | 正解ラベル (Ground Truth) | 画像識別子 | Champion 予測 (確信度) | Challenger 予測 (確信度) | Top-3 (両者) | 比較結果 |
| :-: | :--- | :--- | :--- | :--- | :-: | :--- |
| 1 | `curry_rice` | `046_MESHI_20260213...` | `stir_fry` (0.27) [×] | **`curry_rice` (0.36) [○]** | ○ / ○ | **Challenger 改善 (Top-1)** |
| 2 | `drink` | `047_MESHI_20260315...` | **`drink` (0.95) [○]** | **`drink` (0.88) [○]** | ○ / ○ | 同等 (Top-1正解) |
| 3 | `fish_dish` | `002_MESHI_20220614...` | **`fish_dish` (0.34) [○]** | **`fish_dish` (0.52) [○]** | ○ / ○ | 同等 (Top-1正解) |
| 4 | `fried_dish` *(少数クラス)* | `043_MESHI_20251112...` | **`fried_dish` (0.18) [○]** | `meat_dish` (0.36) [×] | ○ / ○ | **Challenger 悪化 (Top-1)** |
| 5 | `meat_dish` | `021_MESHI_20240130...` | **`meat_dish` (0.25) [○]** | `curry_rice` (0.27) [×] | ○ / ○ | **Challenger 悪化 (Top-1)** |
| 6 | `other_or_exclude` *(少数クラス)* | `040_MESHI_20250823...` | `meat_dish` (0.18) [×] | `curry_rice` (0.29) [×] | × / × | 同等 (Top-3不正解) |
| 7 | `simmered_dish` | `034_MESHI_20250212...` | **`simmered_dish` (0.50) [○]** | **`simmered_dish` (0.44) [○]** | ○ / ○ | 同等 (Top-1正解) |

- **改善点**: サンプル 1 (`curry_rice`) において Challenger が Top-1 を正しく識別。
- **悪化点**: サンプル 4 (`fried_dish`) および サンプル 5 (`meat_dish`) において、Champion は Top-1 正解していたが Challenger は他クラスを Top-1 と誤認（Top-1 正解数が 5 ➔ 4 へ純減）。
- **少数クラス**: `fried_dish` は Top-3 正解を維持、`other_or_exclude` は両者不正解のため、正解数は 1 vs 1 で改善条件（`> 1`）未達。

---

## 3. Root Cause Analysis (要因分析)

調査の結果、Challenger が Champion に及ばなかった原因は以下の複合要因（複数要因: D）であることが判明した。

### 3.1 主原因: データ不足および供給データセットの不整合 (要因 A)
1. **現行 Champion の出自**:
   - `docs/engineering/mediapipe-model-autonomous-improvement-plan.md` および `TASKS.md` に記録されている通り、現行 Champion は **256枚 の画像データセット（`zip2-batch250`）からクレンジング済み教師データ 190枚 を抽出し、データ拡張を経て 241枚 の訓練サンプルで学習された高精度モデル**である。
2. **今回のパイプラインの学習元データ**:
   - 一方、`scripts/run-autonomous-model-improvement.sh` 内のデフォルト設定は以下のように古い 48枚 データセットが固定指定されている：
     ```bash
     SOURCE_DATASET="state/mediapipe_labeling_runs/zip2-even48-20260423/exported_dataset"
     ```
   - このデータセットは Train が **34枚** しかなく、データ拡張後も合計 **100枚** にしかならない。
3. **結論**:
   - 元画像がたった 34枚（拡張後 100枚）の初期データセットで学習された Challenger が、256枚（拡張後 241枚）の実画像で学習された現行 Champion に勝てないのは構造的・必然的なデータ格差によるものである。

### 3.2 副原因: データ拡張の上限ガードと残存するクラス不均衡 (要因 B)
1. **4倍拡張上限による頭打ち**:
   - `scripts/augment-mediapipe-dataset.py` には過学習防止のため、1画像あたり最大 4 枚までの増強制限（`max_allowed_augmented = min(needed, orig_count * 4)`）が設定されている。
2. **少数クラスの増強不足**:
   - `zip2-even48` では元画像が `other_or_exclude`: 1枚、`fried_dish`: 2枚、`stir_fry`: 2枚 しかない。
   - その結果、目標数 15枚 に対し、`other_or_exclude` は 5枚、`fried_dish` と `stir_fry` は 10枚 で頭打ちとなった。
   - 他クラスが 15枚 に達している中で最大 1:3 のクラス不均衡が依然として残り、`fried_dish` の誤認識（Top-1 悪化）につながった。

### 3.3 評価上の特性: Golden Test Set における少数クラス標本の極度な離散性 (要因 C)
1. **Golden Test Set (7件) の内訳**:
   - クラス内訳: `curry_rice` (1), `drink` (1), `fish_dish` (1), `fried_dish` (1), `meat_dish` (1), `other_or_exclude` (1), `simmered_dish` (1)
   - `stir_fry` は 0件。
2. **少数クラス判定の厳しさ**:
   - 対象 3 クラス中、テストセットに含まれるのは `fried_dish` (1) と `other_or_exclude` (1) の **合計 2 件のみ**。
   - Champion の実測値が 1/2 であるため、Challenger が Gate 条件（`Challenger > Champion`）を満たすためには、**2件中 2件とも 100% 正解 (2/2)** することが絶対条件となる。
   - わずか 2 サンプルによる 1 点差の二者択一判定という極小標本に起因する離散的難易度の高さが存在する。

---

## 4. Expected Impact (期待される効果)

自律改善パイプラインのデータ供給元を最新の 256枚 データセット（`zip2-batch250`）へ連携し、適切なデータ拡張と学習ハイパーパラメータを適用することで：
- 既存 Champion の性能水準（Top-1 5/7, Top-3 6/7）を担保しながら、
- 未正解サンプル（`other_or_exclude` や `curry_rice`）の認識精度を向上させ、
- **回帰を起こさずに Promotion Gate の全基準を正当に突破する高品質 Challenger モデルを自律生成できる状態**を達成する。

---

## 5. Out of Scope (対象外・禁止事項)

本課題の解決にあたり、以下の安易な回避策は**厳格に禁止（スコープ外）**とする：
1. **Promotion Gate の安全条件を緩和すること**（Gate を通すためにルールを変えてはならない）
2. **回帰防止ガード（Regression Guard: `Challenger >= Champion`）を削除・緩和すること**
3. **少数クラス改善条件（`Minority Coverage > Champion`）を削除・緩和すること**
4. **Golden Test Set のサンプル数（7件）を減らす、または都合よく差し替えること**
5. **Top-1 (2/7) や Top-3 (5/7) の閾値を下げること**
6. **今回の結果を理由に Production Champion を Gate を介さず手動で上書きすること**
7. **Android 実機での手動検証作業**

---

## 6. Proposed Action Items (推奨される対応方針と優先順位)

調査結果に基づき、以下の優先順位で段階的な対応を推奨する：

1. **[優先度: 高] パイプライン入力データセットの更新とパス柔軟化 (要因 A 解決)**:
   - `scripts/run-autonomous-model-improvement.sh` の `SOURCE_DATASET` を、現行 Champion と同等以上の情報量を持つクレンジング済み 256枚 データセット（`state/mediapipe_labeling_runs/zip2-batch250/exported_dataset` など）へ更新、または引数・環境変数で指定可能にする。
   - Golden Test Set（7件）の同一性を厳格に保持したまま、訓練スプリット（190枚規模）を活用できるようにする。
2. **[優先度: 中] 少数クラスのデータ拡張戦略の最適化 (要因 B 解決)**:
   - `scripts/augment-mediapipe-dataset.py` において、元画像が極小（1〜2枚）の場合でも過学習を抑えつつクラス間サンプル数の均衡（例: 20〜30枚目標）を実現する合成パイプラインの調整。
3. **[優先度: 低] 学習ハイパーパラメータの調整**:
   - 訓練サンプル数増加に伴うエポック数、バッチサイズ、学習率、ドロップアウト率の最適化。

---

## 7. 実装・検証結果 (Implementation & Verification Results)

### 7.1 実装内容
1. **Canonical Default Dataset の更新**:
   - `scripts/run-autonomous-model-improvement.sh` のデフォルト入力を `state/mediapipe_labeling_runs/zip2-batch250/exported_dataset`（256枚・9クラス）に更新。
2. **優先順位付き Dataset Override 機構**:
   - CLI 引数（`--dataset-dir`）➔ 環境変数（`SOURCE_DATASET`）➔ デフォルト の優先度で解決。
3. **データ拡張の適正化**:
   - `TARGET_PER_CLASS=25` を設定し、過学習防止の「4倍上限」に抵触することなく 241 サンプルの均等な訓練データを生成。
4. **評価ステージング機構**:
   - 不変の Golden Test Set（7件）に対し、9クラスラベルメタデータを適用した `$GOLDEN_EVAL_DIR` をステージングして公平に評価。
5. **事前データセット検証 (`validate_dataset`)**:
   - 構造検証（`train/`, `val/`, `test/`）、必須9クラス網羅性、未知クラス排除、および Golden Test 7件との SHA256 重複（リーク）ゼロを機械的に判定。
6. **モデル間クラス互換性チェック (`check_class_compatibility`)**:
   - Champion と Challenger の出力クラス数が完全一致（9クラス === 9クラス）していることを Promotion Gate 前に検証。

### 7.2 実走結果 (E2E)
- **Top-1**: Champion 5/7 (71.4%) vs Challenger 5/7 (71.4%) (同等以上維持: PASS)
- **Top-3**: Champion 6/7 (85.7%) vs Challenger 7/7 (100.0%) (改善: PASS)
- **Minority Top-3**: Champion 1/2 (50.0%) vs Challenger 2/2 (100.0%) (strictly better: PASS)
- **Regression Guard**: リグレッション 0件 (PASS)
- **Latency**: 16.2 ms <= 100 ms (PASS)
- **Model Size**: 8,903,665 bytes (PASS)
- **Promotion Gate 判定**: **PROMOTE**
- **Champion Before SHA256**: `4835d93442c976dfea4c114926ccb230fdf4f7211c83755f1e72520a06669874`
- **Champion After SHA256**: `5a8095b38041e69023366a1639f738067d39d7f44e129c27c59769fdb0549a15` (Challenger と完全一致、アトミック置換完了)

---

## 8. 受入基準 (Acceptance Criteria)

- [x] デフォルトデータセットが正規の 256枚・9クラスデータセット（`zip2-batch250`）に更新されていること。
- [x] CLI 引数および環境変数からデータセットパスをオーバーライド可能であること。
- [x] 学習開始前に 9 クラス網羅性、未知クラス排除、Golden Test Set との SHA256 リークゼロが機械的に検証されること。
- [x] Promotion Gate 前に Champion と Challenger のクラス互換性（9クラス一致）が機械的に検証されること。
- [x] Promotion Gate の条件（Top-1、Top-3、少数クラス改善、回帰ガード、遅延、サイズ）が一切緩和されていないこと。
- [x] `tests/promotionGate.test.ts` にデータセット検証とクラス互換性のテストが追加され、全テスト（26件）が PASS すること。
- [x] リポジトリ全体回帰テスト（`npm test` 594件）がすべて PASS すること。
- [x] パイプライン E2E 実走により Challenger が Promotion Gate を正当に通過し、本番アセットがアトミック置換されること。

