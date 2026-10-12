# MediaPipe Dataset Archive & Recovery Runbook

## Meta
- Purpose: Git 管理外（`.gitignore` 対象）の MediaPipe 食事画像データセット（約 1.3GB〜1.9GB）の構成、外部保管方針、復元手順、および整合性検証コマンドを規定する Runbook。
- Audience: ML/パイプライン開発者、データ保守者、AI エージェント。
- Update trigger: データセットの追加・分割変更、新しい Golden Set や学習プールの固定時。
- Related docs: [docs/engineering/mediapipe-overview.md](mediapipe-overview.md), [docs/engineering/golden-test-set-v2-specification.md](golden-test-set-v2-specification.md), [docs/engineering/context-map.md](context-map.md)

---

## 1. 概要と背景

本リポジトリでは、リポジトリサイズの肥大化（Git Bloat）防止および差分追跡の健全性を維持するため、生画像バイナリを含む以下のデータセットディレクトリを `.gitignore` に指定しています：

- `state/mediapipe-dataset/`
- `state/mediapipe_labeling_runs/`
- `state/mediapipe_models/`

### クリーンチェックアウト環境での設計方針
`scripts/tests/` 配下に実在する **全 20 テストスイート（全 266 件のテストケース）** は、合成ダミー JPEG（Hermetic Fixtures）または存在判定スキップ（`skipTest`）を用いて実装されており、**実画像バイナリが存在しないクリーン環境でも 100% 成功する設計**となっています。

実画像バイナリは、以下の運用作業を行う場合にのみ復元が必要です：
1. `scripts/train-mediapipe-model.py` によるモデルの新規・再学習
2. `scripts/run-autonomous-model-improvement.sh` による自律改善ループおよび実画像推論 Gate 評価
3. `scripts/verify-golden-dataset-v2.py` による実データセット 106 枚の完全性・漏洩検証

---

## 2. 対象データセットの構成

| ディレクトリ / アーティファクト | 枚数 / クラス数 | 役割・責務 | 検証スクリプト |
|---|:---:|---|---|
| `state/mediapipe-dataset/golden_eval_v2/` | 106 枚 / 9 クラス | 包括的ベンチマークセット（学習セットと完全分離） | `scripts/verify-golden-dataset-v2.py` |
| `state/mediapipe-dataset/golden_eval/` | 7 枚 / 7 クラス | 旧 Golden Set（現行 Gate の回帰ガード） | `scripts/run-autonomous-model-improvement.sh` |
| `state/mediapipe-dataset/batch250_plus_agreed54/` | 384 枚 (訓練318) | Sample A 合意保留サンプル統合済みベース学習セット | `scripts/integrate_agreed_pending_samples.py` |
| `state/mediapipe-dataset/augmented_agreed54_target45_m3/` | 434 枚 / 9 クラス | 少数クラス均等化済み正規学習データセット（現 Champion 生成元） | `scripts/augment-mediapipe-dataset.py` |
| `state/mediapipe_labeling_runs/zip2-audit-manifest-20261009/` | 831 枚マニフェスト | Gemini ブラインド監査用パッケージ・予測記録・非公開マッピング | `scripts/validate_zip2_audit_manifest.py` |

---

## 3. アーカイブ保管および復元手順

### 3.1 アーカイブ命名規則
外部ストレージ（GitHub Releases、プライベートオブジェクトストレージ等）へ保管するアーカイブは、以下の命名規則に従います：
- `mediapipe-dataset-golden-v2-YYYYMMDD.tar.gz` (Golden Test Set v2 単体アーカイブ)
- `mediapipe-dataset-full-YYYYMMDD.tar.gz` (学習・評価プール全体アーカイブ)

### 3.2 復元コマンド手順

新しい開発マシンや CI 環境で実データセットを復元する場合の手順です。

```bash
# 1. 配置先ディレクトリの作成
mkdir -p state/mediapipe-dataset

# 2. アーカイブの展開 (例: golden_eval_v2 の場合)
tar -xzf mediapipe-dataset-golden-v2-YYYYMMDD.tar.gz -C state/mediapipe-dataset/

# 3. 展開後のディレクトリ構造確認
# state/mediapipe-dataset/golden_eval_v2/
# ├── labels.txt
# ├── manifest.csv
# ├── manifest.jsonl
# └── test/
#     ├── curry_rice/ (20)
#     ├── drink/ (17)
#     ├── fish_dish/ (20)
#     ├── fried_dish/ (4)
#     ├── meat_dish/ (20)
#     ├── noodles/ (11)
#     ├── other_or_exclude/ (3)
#     ├── simmered_dish/ (7)
#     └── stir_fry/ (4)
```

---

## 4. 復元後の整合性検証 (Verification)

データセットの復元完了後、直ちに以下の検証スクリプトを実行し、データの欠落・破損・学習セット漏洩がないことを機械的に検証します。

```bash
# Golden Test Set v2 (106枚) の完全性検証
python3 scripts/verify-golden-dataset-v2.py
```

### 期待される合格出力
```
========================================================
SUCCESS: Golden Test Set v2 passed all integrity checks!
- 106 verified images across 9 classes
- 100% SHA-256 match
- 0% training set leakage
- 0 extraneous or missing image files
- 0 corrupted images
========================================================
```

また、Python テストスイートを実行して監査パイプラインとの整合性を確認します：
```bash
npm run test:python:fast
```

---

## 5. 安全性インバリアント (Safety Invariants)

1. **Fail-Closed 原則**:
   データセット画像やマニフェストが欠落している場合、スクリプトは中途半端な処理を行わず、即座に明確なエラー（`FileNotFoundError` または `SafetyError`）を発生させて停止する。
2. **パストラバーサル防止**:
   すべてのファイル・ディレクトリ操作は `scripts/dataset_safety_guards.py` の `assert_path_within_directory` を介して行われ、アーカイブ展開時やスクリプト実行時のディレクトリ逸脱を防止する。
3. **不可逆上書きの禁止**:
   データセットの統合・拡張スクリプトは、既存ディレクトリを不可逆に直接上書きせず、アトミックスワップまたは新規サフィックス付きディレクトリへの書き出しを行う。
