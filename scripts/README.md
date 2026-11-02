# Scripts Catalog (scripts/)

## Meta
- Purpose: `scripts/` 配下に実在する全スクリプト群（MediaPipe 関連 32 本および共通・ツール 10 本、計 42 本）の役割、入出力、実行例、および対応テストスイートを一覧化するカタログ。
- Audience: ML/パイプライン開発者、保守者、AI エージェント。
- Update trigger: `scripts/` 配下にスクリプトやテストを追加・変更・削除したとき。
- Related docs: [docs/engineering/mediapipe-overview.md](../docs/engineering/mediapipe-overview.md), [docs/engineering/context-map.md](../docs/engineering/context-map.md), [docs/engineering/golden-test-set-v2-specification.md](../docs/engineering/golden-test-set-v2-specification.md)

---

## 1. 概要

`scripts/` には、MediaPipe 食事分類モデルの学習・評価・配布、疑似ラベルのブラインド監査・採用、データセット検証、ラベル探索、および食事分類刷新（Step 1 & Step 2）を行うためのスクリプト群（計 32 本）と、プロジェクト共通の CI・ガバナンス・ビルド・保守用スクリプト群（計 10 本）の合計 42 本が配置されています。

---

## 2. MediaPipe 関連スクリプト カタログ (全 32 本)

### 2.1 モデル学習 & Promotion Gate (4 本)

| スクリプト名 | 役割 / 責務 | 主要な入力 | 主要な出力 | 実行コマンド例 | 対応テスト |
|---|---|---|---|---|---|
| `train-mediapipe-model.py` | MediaPipe Model Maker を用いて MobileNetV2 食事分類モデル（`.task`）を学習・エクスポートする。 | クラス別ディレクトリ構造の学習データセット (`--dataset-dir`) | `.task` モデルバイナリ (`--output-path`) | `python3 scripts/train-mediapipe-model.py --dataset-dir <dir> --output-path model.task` | `test_train_mediapipe_model.py`, `test_mediapipe_labeling_loop.py` 等 |
| `evaluate-mediapipe-model.py` | MediaPipe 食事分類モデルを評価データセットに対して推論実行し、Top-1/Top-3 精度および遅延を測定・JSON 出力する。 | `.task` モデル、テスト画像ディレクトリ | 評価結果 JSON (`--output-json`) | `python3 scripts/evaluate-mediapipe-model.py --model model.task --test-dir <dir> --output-json eval.json` | `test_verify_golden_dataset_v2.py` 等 |
| `run-autonomous-model-improvement.sh` | データ拡張 ➔ Challenger 再学習 ➔ Champion/Challenger 実測比較 ➔ Promotion Gate 判定 ➔ 本番アセット昇格またはロールバックを自動実行する。 | 正規学習データセット、旧 Golden 7枚テストセット | 本番アセット `meal-input-assist.task` (昇格時)、評価 JSON | `./scripts/run-autonomous-model-improvement.sh` | 結合実走・Gate安全策テスト |
| `augment-mediapipe-dataset.py` | 少数クラスの過学習を防ぎつつ、回転・反転等の画像拡張を施してクラス間データ数を均等化する。 | 生画像ディレクトリ、拡張目標件数 (`--target-count`) | 拡張済み画像ディレクトリ | `python3 scripts/augment-mediapipe-dataset.py --input-dir <dir> --output-dir <out>` | `test_dataset_safety_guards.py` |

---

### 2.2 モデル配布 & アセット取得 (2 本)

| スクリプト名 | 役割 / 責務 | 主要な入力 | 主要な出力 | 実行コマンド例 | 対応テスト |
|---|---|---|---|---|---|
| `ensure-mediapipe-model.sh` | GitHub Releases から MediaPipe モデルバイナリ（標準9クラス、汎用23クラス、わたし専用44タグ）を取得し、SHA-256 検証を経てアセットディレクトリへ配置・旧モデルをクリーンアップする。 | GitHub Releases, 環境変数 | `android/app/src/main/assets/mediapipe/*.task` | `./scripts/ensure-mediapipe-model.sh` | `tests/buildAndroidRelease.test.ts` (Jest) |
| `publish_mediapipe_model.py` | MediaPipe モデルのバイナリ検証、GitHub Releases への正式アップロード、DL検証、および4 canonical ファイル（`modelConfig.ts`, `ensure-mediapipe-model.sh`, `build-android-release.sh`, `build.gradle`）の SHA-256 チェックサム一括更新を自動化する。 | `--model-id`, `--model-path`, `--release-tag` | GitHub Releases アセット、4ファイル更新 | `python3 scripts/publish_mediapipe_model.py --model-id universal_dining_23class --model-path model.task` | `test_publish_mediapipe_model.py` |

---

### 2.3 データ監査 & 採用レジストリ・データセット構築 (11 本)

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
| `build_dual_taxonomy_dataset.py` | 1,007枚の先入観なし視覚観察ログから、①汎用シーン7クラス、②わたし専用8クラス＋11シグネチャタグのデータセットを決定論的構築する。 | オープン観察 JSONL、Golden Test Set | デュアルラベル JSONL/CSV、サマリー JSON、スプリット画像ツリー | `python3 scripts/build_dual_taxonomy_dataset.py` | `test_build_dual_taxonomy_dataset.py` |
| `build_universal_23class_dataset.py` | オープン観察ログから汎用23クラス分類データセットを構築する。 | 観察ログ JSONL | 23クラス データセット | `python3 scripts/build_universal_23class_dataset.py` | `test_build_universal_23class_dataset.py` |
| `build_personal_3axis_dataset.py` | 3軸分類（主菜・副菜・主食）データセットを構築する。 | 観察ログ JSONL | 3軸 データセット | `python3 scripts/build_personal_3axis_dataset.py` | `test_build_personal_3axis_dataset.py` |

---

### 2.4 データセット検証 & 安全性 (2 本)

| スクリプト名 | 役割 / 責務 | 主要な入力 | 主要な出力 | 実行コマンド例 | 対応テスト |
|---|---|---|---|---|---|
| `verify-golden-dataset-v2.py` | Golden Test Set v2 (106枚) のマニフェスト整合性、画像健全性、および学習セット漏洩ゼロを機械的検証する。 | `state/mediapipe-dataset/golden_eval_v2/` | 検証レポート (SUCCESS / FAILED) | `python3 scripts/verify-golden-dataset-v2.py` | `test_verify_golden_dataset_v2.py` |
| `dataset_safety_guards.py` | パストラバーサル防止、fail-closed なファイル操作、不可逆上書き防止などの安全ユーティリティ。 | 各種パス、ディレクトリ | 共通安全ガード関数群 | (モジュールとして import 利用) | `test_dataset_safety_guards.py` |

---

### 2.5 ラベル探索 & 補助 (8 本 - 歴史的・初期資産)

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

### 2.6 食事分類刷新パイプライン (Step 1 & Step 2) (5 本)

| スクリプト名 | 役割 / 責務 | 主要な入力 | 主要な出力 | 実行コマンド例 | 対応テスト |
|---|---|---|---|---|---|
| `refresh_food_classification_step1.py` | オープン観察ログ (3,391件) から料理名辞書・セッション分割・主菜/副菜マッピングを構築し、未解決候補を決定論的に分類する。 | `observations_all_3391.jsonl`, `mapping_dictionary.json` | `session_splits_manifest.json`, `mapping_dictionary.json` (v2.0.0) | `python3 scripts/refresh_food_classification_step1.py` | `test_refresh_food_classification_step1.py` |
| `build_personal_dual_dataset.py` | セッション分割マニフェストに基づき、汎用23クラス、主菜16クラス、副菜15クラスの学習・評価用ディレクトリ構造データセットを生成する。 | `session_splits_manifest.json`, `observations_all_3391.jsonl` | `dataset_v2/{universal_dining_23class,personal_main_dish,personal_side_dish}/` | `python3 scripts/build_personal_dual_dataset.py` | `test_build_personal_dual_dataset.py` |
| `train_refresh_step2_models.py` | MediaPipe Model Maker で EfficientNet-Lite0 / Lite2 をベースに 3 タスク×2 バックボーン（計6モデル）を学習・量子化エクスポートする。 | `dataset_v2/` 配下のデータセット | `.task` モデルバイナリ群 (`state/mediapipe_models/refresh_step2/`) | `python3 scripts/train_refresh_step2_models.py` | `test_train_mediapipe_model.py` 等 |
| `evaluate_refresh_step2.py` | 学習済み 6 モデルの Test Split および人手確認評価セットに対する Top-1/Top-3 精度、混同行列、閾値キャリブレーション曲線を算出しレポート出力する。 | `.task` モデル群、評価画像群 | `evaluation_results.json`, 混同行列 CSV/MD | `python3 scripts/evaluate_refresh_step2.py` | `test_build_personal_dual_dataset.py` 等 |
| `verify_observations_integration.py` | 統合観察ログ `observations_all_3391.jsonl` の 13 フィールド完全性、連番連続性、重複排除、画像パス実在性を機械的検証する。 | `observations_all_3391.jsonl`, `blind_w2_mapping.json` | 検証結果 JSON (stdout) | `python3 scripts/verify_observations_integration.py` | `test_verify_observations_integration.py` |

---

## 3. プロジェクト共通 / ガバナンス / ビルド / ツール関連スクリプト (参考・10 本)

| スクリプト名 | 役割 / 責務 | 主要な用途 | 実行コマンド例 |
|---|---|---|---|
| `verify-pr-gates.sh` | PR 作成時の機械的ガバナンス（差分ゼロ拒否、テスト削除拒否、Evidence Gate 等）を検証する。 | CI / ローカル PR 事前検査 | `bash ./scripts/verify-pr-gates.sh` |
| `check-docs.cjs` | ドキュメントのリンク切れ、メタ情報、Canonical docs 整合性を機械的検査する。 | CI (`npm run check:docs`) | `node ./scripts/check-docs.cjs` |
| `check-react-versions.cjs` | `react` と `react-dom` のバージョン一致を機械的検査する。 | CI (`npm run check:react-versions`) | `node ./scripts/check-react-versions.cjs` |
| `build-android-release.sh` | Android リリース APK のビルドと同梱モデル検証を行う。 | ローカル / CI ビルド (`npm run build:android:release`) | `bash ./scripts/build-android-release.sh` |
| `install-android-artifact.sh` | ビルドした Android APK を adb 経由で実機にインストールする。 | ローカル実機検証 (`npm run install:android:release`) | `bash ./scripts/install-android-artifact.sh` |
| `benchmark-android-photo-save.sh` | Android 実機環境における写真保存パイプラインのプロファイリングを実行する。 | パフォーマンス評価 | `bash ./scripts/benchmark-android-photo-save.sh` |
| `benchmarks/benchmark-meals-query.ts` | `searchMeals` 等の SQLite ページネーション（OFFSET vs Keyset）および複合インデックスのクエリプラン・実行時間をベンチマーク測定する。 | DB クエリ性能評価 (`docs/notes/pagination-index-benchmark-report.md` 参照) | `npx ts-node scripts/benchmarks/benchmark-meals-query.ts` |
| `generate_github_status.py` | GitHub Actions の実行ステータスおよび `docs/issues/` の進捗レポートを JSON/Markdown 出力する。 | CI 運用 (`test_generate_github_status.py` 対応) | `python3 scripts/generate_github_status.py` |
| `generate-icons.py` | アプリアイコンおよびスプラッシュ画面の PNG アセットを Python 組み込み機能のみで生成する。 | アイコン画像生成 | `python3 scripts/generate-icons.py` |
| `create-github-issues.sh` | `docs/issues/` 配下の仕様書から GitHub Issue を一括起票するワンタイムスクリプト（起票済みのため通常実行不要）。 | 初回起票ツール（要 `--force-create-all`） | `./scripts/create-github-issues.sh` |

---

## 4. テスト対応表 (`scripts/tests/`)

`scripts/tests/` 配下に実在する **全 28 テストスイート（全 332 件のテストケース）** の一覧です。

| テストスクリプト名 | テスト件数 | テスト対象スクリプト / モジュール | 主な検証内容 |
|---|:---:|---|---|
| `test_publish_mediapipe_model.py` | 11 | `publish_mediapipe_model.py` | モデルバイナリ妥当性検査、4ファイル一括 SHA-256 更新ロジック、部分更新安全性 |
| `test_promotion_gate_v2.py` | 33 | `run-autonomous-model-improvement.sh` | 二段階昇格判定、Golden Set v2 フェイルクローズ検証、メトリクス完全性、鮮度保証、ディレクトリ整合性 |
| `test_verify_golden_dataset_v2.py` | 22 | `verify-golden-dataset-v2.py` | Golden Set v2 のマニフェスト整合性、画像破損、SHA256、学習漏洩検知 |
| `test_reconcile_sample_a_audit.py` | 13 | `reconcile_sample_a_audit.py` | アンブラインド照合、超幾何分布厳密信頼区間、二層採用レジストリ生成 |
| `test_prepare_gemini_audit_sample_a.py` | 13 | `prepare_gemini_audit_sample_a.py` | Sample A 層化無作為抽出、シード固定再現性、除外整合性 |
| `test_prepare_gemini_audit_sample.py` | 18 | `prepare_gemini_audit_sample.py` | 先行 70 枚の層化抽出ロジック |
| `test_build_sample_a_audit_package.py` | 3 | `build_sample_a_audit_package.py` | 匿名化画像パッケージング、EXIF 除去、ハッシュ検証 |
| `test_gemini_audit_blind_contract.py` | 7 | 監査プロトコル全体 | 確認バイアス排除、メタデータ非開示、隔離契約 |
| `test_validate_zip2_audit_manifest.py` | 8 | `validate_zip2_audit_manifest.py` | マニフェスト SHA256 検証、パス安全性 |
| `test_export_eligible_pseudo_labels.py` | 14 | `export_eligible_pseudo_labels.py` | 確定採用 74 枚の決定論的抽出、7 つの不変条件検証 |
| `test_integrate_eligible_pseudo_labels.py` | 12 | `integrate_eligible_pseudo_labels.py` | 疑似ラベルのデータセット統合、スプリット保護 |
| `test_integrate_agreed_pending_samples.py` | 14 | `integrate_agreed_pending_samples.py` | 合意保留 54 枚の統合、Golden Set 漏洩ゼロ検証 |
| `test_build_dual_taxonomy_dataset.py` | 25 | `build_dual_taxonomy_dataset.py` | 汎用7クラス・わたし専用8クラス＋11シグネチャタグ構築、重複拒否、Golden Set フェイルクローズ検証（トラバーサルエラー・不正 split 検知・漏洩防止） |
| `test_build_universal_23class_dataset.py` | 8 | `build_universal_23class_dataset.py` | 汎用23クラスデータセット生成、クラス分類、ディレクトリ構造検証 |
| `test_build_personal_3axis_dataset.py` | 7 | `build_personal_3axis_dataset.py` | 3軸（主菜・副菜・主食）データセット生成、アノテーション分割検証 |
| `test_refresh_food_classification_step1.py` | 5 | `refresh_food_classification_step1.py` | 料理名正規化、セッションクラスタリング、主菜・副菜ルール分類、25件未解決分類 |
| `test_build_personal_dual_dataset.py` | 3 | `build_personal_dual_dataset.py` | 汎用23・主菜16・副菜15データセット生成、holdout 除外、シンボリックリンク/コピー整合性 |
| `test_verify_observations_integration.py` | 3 | `verify_observations_integration.py` | 観察ログ13フィールド完全性、ID連続性、重複検知、パス存在検証 |
| `test_dataset_safety_guards.py` | 17 | `dataset_safety_guards.py` | パストラバーサル拒否、アトミックスワップ、削除保護 |
| `test_explore_food_labels.py` | 36 | `explore-food-labels.py` | プロンプト生成、主料理抽出、crop refinement ロジック |
| `test_analyze_food_labels.py` | 4 | `analyze-food-labels.py` | レポート集計、未知・不均衡の検出、CSV 出力 |
| `test_build_review_gallery.py` | 9 | `build-review-gallery.py` | HTML 生成、レビュー候補のグルーピング |
| `test_compare_labeling_reports.py` | 7 | `compare_labeling_reports.py` | レポート比較、回帰判定 |
| `test_export_mediapipe_dataset.py` | 6 | `export-mediapipe-dataset.py` | データセット分割、レビュー反映 |
| `test_food_label_taxonomy.py` | 4 | `food_label_taxonomy.py` | 9 クラスの正規化マッピング |
| `test_mediapipe_labeling_loop.py` | 12 | `mediapipe_labeling_loop.py` | ループ制御、executor 連携、停止条件 |
| `test_generate_github_status.py` | 14 | `generate_github_status.py` | GitHub ステータス生成ユーティリティ |
| `test_train_mediapipe_model.py` | 4 | `train-mediapipe-model.py` | MobileNet V2 仕様生成、KerasLayer ハンドリング、パラメータ検証 |
| **合計** | **332** | — | — |

---

## 5. テスト実行方法

Python テストスイート（全 332 件）は、標準ライブラリ `unittest` で実行可能です。
```bash
python3 -m unittest discover -s scripts/tests -p 'test_*.py'
# または npm スクリプト
npm run test:python:fast
```

> **Note**:
> - `npm run test:python:fast` は標準ライブラリのみで動作する軽量テスト群（全 332 件）を実行し、CI（GitHub Actions）および `npm run verify` で自動実行されます。`npm run test:python` は将来の重い ML 統合テストの拡張用に準備されています。
> - `run-autonomous-model-improvement.sh` 内の評価コマンドは `EVALUATE_MODEL_CMD`（デフォルト: `uv run --python .venv_mediapipe python scripts/evaluate-mediapipe-model.py`）で制御されます。テスト時は環境変数でモック評価スクリプトを注入できるため、CI 上で `.venv_mediapipe` や重い ML 依存関係がなくても独立してゲート検証が可能です。
