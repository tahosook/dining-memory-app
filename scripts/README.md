# Scripts Catalog (scripts/)

## Meta
- Purpose: `scripts/` 配下に実在する全 22 本のスクリプトの役割、入出力、実行例、および対応テストスイートを一覧化するカタログ。
- Audience: ML/パイプライン開発者、保守者、AI エージェント。
- Update trigger: `scripts/` 配下にスクリプトやテストを追加・変更・削除したとき。
- Related docs: [docs/engineering/mediapipe-overview.md](../docs/engineering/mediapipe-overview.md), [docs/engineering/context-map.md](../docs/engineering/context-map.md), [docs/engineering/golden-test-set-v2-specification.md](../docs/engineering/golden-test-set-v2-specification.md)

---

## 1. 概要

`scripts/` には、MediaPipe 食事分類モデルの学習・評価、疑似ラベルのブラインド監査・採用、データセット検証、およびラベル探索を行うためのスクリプト群が配置されています。

---

## 2. スクリプト一覧カタログ

### 2.1 モデル学習 & Promotion Gate (Model Training & Gate)

| スクリプト名 | 役割 / 責務 | 主要な入力 | 主要な出力 | 実行コマンド例 | 対応テスト |
|---|---|---|---|---|---|
| `train-mediapipe-model.py` | MediaPipe Model Maker を用いて MobileNetV2 食事分類モデル（`.task`）を学習・エクスポートする。 | クラス別ディレクトリ構造の学習データセット (`--dataset-dir`) | `.task` モデルバイナリ (`--output-path`) | `python3 scripts/train-mediapipe-model.py --dataset-dir <dir> --output-path model.task` | `test_mediapipe_labeling_loop.py` 等で統合検証 |
| `evaluate-mediapipe-model.py` | MediaPipe 食事分類モデルを評価データセットに対して推論実行し、Top-1/Top-3 精度および遅延を測定・JSON 出力する。 | `.task` モデル、テスト画像ディレクトリ | 評価結果 JSON (`--output-json`) | `python3 scripts/evaluate-mediapipe-model.py --model model.task --test-dir <dir> --output-json eval.json` | `test_verify_golden_dataset_v2.py` 等 |
| `run-autonomous-model-improvement.sh` | データ拡張 ➔ Challenger 再学習 ➔ Champion/Challenger 実測比較 ➔ Promotion Gate 判定 ➔ 本番アセット昇格またはロールバックを自動実行する。 | 正規学習データセット、旧 Golden 7枚テストセット | 本番アセット `meal-input-assist.task` (昇格時)、評価 JSON | `./scripts/run-autonomous-model-improvement.sh` | 結合実走・Gate安全策テスト |
| `augment-mediapipe-dataset.py` | 少数クラスの過学習を防ぎつつ、回転・反転等の画像拡張を施してクラス間データ数を均等化する。 | 生画像ディレクトリ、拡張目標件数 (`--target-count`) | 拡張済み画像ディレクトリ | `python3 scripts/augment-mediapipe-dataset.py --input-dir <dir> --output-dir <out>` | `test_dataset_safety_guards.py` |

---

### 2.2 データ監査 & 採用レジストリ (Dataset Audit & Registry)

| スクリプト名 | 役割 / 責務 | 主要な入力 | 主要な出力 | 実行コマンド例 | 対応テスト |
|---|---|---|---|---|---|
| `prepare_gemini_audit_sample.py` | 疑似ラベル候補から先行 70 枚の層化無作為サンプリングを決定論的に実行する。 | 疑似ラベルマニフェスト | 監査サンプリング JSONL | `python3 scripts/prepare_gemini_audit_sample.py` | `test_prepare_gemini_audit_sample.py` |
| `prepare_gemini_audit_sample_a.py` | Sample A (280枚、7クラス×40枚) の層化無作為サンプリングをシード固定で決定論的抽出する。 | 疑似ラベル候補プール、除外リスト | Sample A マニフェスト | `python3 scripts/prepare_gemini_audit_sample_a.py` | `test_prepare_gemini_audit_sample_a.py` |
| `build_sample_a_audit_package.py` | 確認バイアスを排除するため、ファイル名・撮影日時を匿名化したブラインド監査用画像パッケージを構築する。 | Sample A マニフェスト、元画像 | 匿名化画像パッケージ、非公開突合マッピング | `python3 scripts/build_sample_a_audit_package.py` | `test_build_sample_a_audit_package.py`, `test_gemini_audit_blind_contract.py` |
| `validate_zip2_audit_manifest.py` | 監査マニフェストの SHA-256 チェックサム、画像実在性、および隔離プロトコルを検証する。 | 監査マニフェスト CSV/JSONL | 検証レポート (stdout) | `python3 scripts/validate_zip2_audit_manifest.py` | `test_validate_zip2_audit_manifest.py` |
| `reconcile_sample_a_audit.py` | Sample A のブラインド予測結果をアンブラインド突合し、超幾何厳密信頼区間を算出して採用レジストリを構築する。 | ブラインド予測 JSONL、非公開マッピング | `pseudo_label_adoption_registry.csv`, 混同行列レポート | `python3 scripts/reconcile_sample_a_audit.py` | `test_reconcile_sample_a_audit.py` |
| `export_eligible_pseudo_labels.py` | 採用レジストリに基づき、基準完全クリアの学習候補 (`candidate_eligible` 74枚) のみを決定論的抽出する。 | 採用レジストリ CSV、元画像ディレクトリ | 抽出済み学習用画像ディレクトリ | `python3 scripts/export_eligible_pseudo_labels.py` | `test_export_eligible_pseudo_labels.py` |
| `integrate_eligible_pseudo_labels.py` | 確定採用疑似ラベル (74枚) を正規学習データセットスプリットへ安全に統合する。 | ベースデータセット、抽出済み疑似ラベル | 統合データセット | `python3 scripts/integrate_eligible_pseudo_labels.py` | `test_integrate_eligible_pseudo_labels.py` |
| `integrate_agreed_pending_samples.py` | Sample A で両モデル合意した少数クラス実写真 (54枚) を訓練スプリットへ安全に統合する。 | ベースデータセット、Sample A パッケージ | 統合データセット | `python3 scripts/integrate_agreed_pending_samples.py` | `test_integrate_agreed_pending_samples.py` |

---

### 2.3 データセット検証 & 安全性 (Verification & Safety)

| スクリプト名 | 役割 / 責務 | 主要な入力 | 主要な出力 | 実行コマンド例 | 対応テスト |
|---|---|---|---|---|---|
| `verify-golden-dataset-v2.py` | Golden Test Set v2 (106枚) のマニフェスト整合性、画像健全性、および学習セット漏洩ゼロを機械的検証する。 | `state/mediapipe-dataset/golden_eval_v2/` | 検証レポート (SUCCESS / FAILED) | `python3 scripts/verify-golden-dataset-v2.py` | `test_verify_golden_dataset_v2.py` |
| `dataset_safety_guards.py` | パストラバーサル防止、fail-closed なファイル操作、不可逆上書き防止などの安全ユーティリティ。 | 各種パス、ディレクトリ | 共通安全ガード関数群 | (モジュールとして import 利用) | `test_dataset_safety_guards.py` |
| `verify-pr-gates.sh` | PR 作成時の機械的ガバナンス（差分ゼロ拒否、テスト削除拒否、Evidence Gate 等）を検証する。 | Git HEAD, PR 本文 | ゲート通過判定 (Exit 0 / 1) | `bash ./scripts/verify-pr-gates.sh` | CI 上で実行 |

---

### 2.4 ラベル探索 & 補助 (Exploration & Labeling Loop - 歴史的・補助)

| スクリプト名 | 役割 / 責務 | 主要な入力 | 主要な出力 | 実行コマンド例 | 対応テスト |
|---|---|---|---|---|---|
| `explore-food-labels.py` | 食事画像から主料理ラベルと候補を抽出し、曖昧な画像に対して一時 crop で主料理を見直す。 | 食事画像群、Ollama / VLM | `labels.jsonl`, `normalized/**/*.json` | `python3 scripts/explore-food-labels.py` | `test_explore_food_labels.py` |
| `analyze-food-labels.py` | ラベル提案の集計、未知・複数皿・不均衡の偏り、および人手レビュー優先候補の抽出を行う。 | `labels.jsonl` | `summary.json`, `summary.md`, candidate CSVs | `python3 scripts/analyze-food-labels.py` | `test_analyze_food_labels.py` |
| `mediapipe_labeling_loop.py` | 自動探索ループのオーケストレーション（集計 ➔ 対象選定 ➔ 仮説実行 ➔ 比較 ➔ 継続判定）。 | `summary.json`, 各種設定 | ループ実行ログ、比較アーティファクト | `python3 scripts/mediapipe_labeling_loop.py` | `test_mediapipe_labeling_loop.py` |
| `mediapipe_labeling_common.py` | ラベリングループの共通定数、型定義、ヘルパー関数。 | — | 共通モジュール | (モジュールとして import 利用) | `test_mediapipe_labeling_loop.py` |
| `build-review-gallery.py` | 人手レビューを行いやすい HTML ギャラリーおよびレビュー export を生成する。 | `summary.json`, 画像群 | HTML ギャラリー, レビュー用 JSON | `python3 scripts/build-review-gallery.py` | `test_build_review_gallery.py` |
| `compare_labeling_reports.py` | 2 つのラベリング run の差分・回帰を定量比較する。 | 2 つの `summary.json` | 比較レポート | `python3 scripts/compare_labeling_reports.py` | `test_compare_labeling_reports.py` |
| `food_label_taxonomy.py` | 9 クラスの coarse taxonomy 定義およびマッピング関数。 | 料理名文字列 | 正規化済み coarse class | (モジュールとして import 利用) | `test_food_label_taxonomy.py` |
| `export-mediapipe-dataset.py` | `labels.jsonl` から MediaPipe 用の train/val/test ディレクトリデータセットを構築する。 | `labels.jsonl`, レビュー export | クラス別ディレクトリ構造データセット | `python3 scripts/export-mediapipe-dataset.py` | `test_export_mediapipe_dataset.py` |

---

## 3. テスト対応表 (`scripts/tests/`)

`scripts/tests/` 配下に実在する全 19 テストスイート（全 233 件のテスト）の一覧です。

| テストスクリプト名 | テスト対象スクリプト / モジュール | 主な検証内容 |
|---|---|---|
| `test_verify_golden_dataset_v2.py` | `verify-golden-dataset-v2.py` | Golden Set v2 のマニフェスト整合性、画像破損、SHA256、学習漏洩検知 |
| `test_reconcile_sample_a_audit.py` | `reconcile_sample_a_audit.py` | アンブラインド照合、超幾何分布厳密信頼区間、二層採用レジストリ生成 |
| `test_prepare_gemini_audit_sample_a.py` | `prepare_gemini_audit_sample_a.py` | Sample A 層化無作為抽出、シード固定再現性、除外整合性 |
| `test_prepare_gemini_audit_sample.py` | `prepare_gemini_audit_sample.py` | 先行 70 枚の層化抽出ロジック |
| `test_build_sample_a_audit_package.py` | `build_sample_a_audit_package.py` | 匿名化画像パッケージング、EXIF 除去、ハッシュ検証 |
| `test_gemini_audit_blind_contract.py` | 監査プロトコル全体 | 確認バイアス排除、メタデータ非開示、隔離契約 |
| `test_validate_zip2_audit_manifest.py` | `validate_zip2_audit_manifest.py` | マニフェスト SHA256 検証、パス安全性 |
| `test_export_eligible_pseudo_labels.py` | `export_eligible_pseudo_labels.py` | 確定採用 74 枚の決定論的抽出、7 つの不変条件検証 |
| `test_integrate_eligible_pseudo_labels.py` | `integrate_eligible_pseudo_labels.py` | 疑似ラベルのデータセット統合、スプリット保護 |
| `test_integrate_agreed_pending_samples.py` | `integrate_agreed_pending_samples.py` | 合意保留 54 枚の統合、Golden Set 漏洩ゼロ検証 |
| `test_dataset_safety_guards.py` | `dataset_safety_guards.py` | パストラバーサル拒否、アトミックスワップ、削除保護 |
| `test_explore_food_labels.py` | `explore-food-labels.py` | プロンプト生成、主料理抽出、crop refinement ロジック |
| `test_analyze_food_labels.py` | `analyze-food-labels.py` | レポート集計、未知・不均衡の検出、CSV 出力 |
| `test_build_review_gallery.py` | `build-review-gallery.py` | HTML 生成、レビュー候補のグルーピング |
| `test_compare_labeling_reports.py` | `compare_labeling_reports.py` | レポート比較、回帰判定 |
| `test_export_mediapipe_dataset.py` | `export-mediapipe-dataset.py` | データセット分割、レビュー反映 |
| `test_food_label_taxonomy.py` | `food_label_taxonomy.py` | 9 クラスの正規化マッピング |
| `test_mediapipe_labeling_loop.py` | `mediapipe_labeling_loop.py` | ループ制御、executor 連携、停止条件 |
| `test_generate_github_status.py` | `generate_github_status.py` | GitHub ステータス生成ユーティリティ |

---

## 4. テスト実行方法

Python テストスイート（全 233 件）は、標準ライブラリ `unittest` で実行可能です。
```bash
python3 -m unittest discover -s scripts/tests -p 'test_*.py'
```
