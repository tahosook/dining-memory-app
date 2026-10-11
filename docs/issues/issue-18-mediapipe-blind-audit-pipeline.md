# [Enhancement] MediaPipe 疑似ラベル候補に対するブラインド画像監査パイプラインとサンプルA抽出・監査基盤の確立

- **内部ドキュメントID**: issue-18
- **ステータス**: 完了 (Closed)
- **作成日**: 2026-10-11
- **結果**: 疑似ラベル候補群（831枚）を安全に監査するためのブラインド監査仕様書、マニフェスト検証スクリプト、先行70枚および追加サンプルA（280枚）の層化無作為抽出スクリプト、配布パッケージ構築スクリプト、および全126件のユニットテストを配備。完全隔離プロトコルのもとでサンプルA（280枚）のローカルブラインド監査を実行し結果を固定。
- **関連ドキュメント**:
  - 仕様書: [docs/engineering/mediapipe-gemini-audit-spec.md](../engineering/mediapipe-gemini-audit-spec.md)
  - 監査計画: `state/mediapipe_labeling_runs/zip2-audit-manifest-20261009/finalized_label_spec_v2_and_audit_plan.md`
  - 監査結果報告: `state/mediapipe_labeling_runs/zip2-audit-manifest-20261009/gemini_audit_sample_A_predictions/audit_pre_unblind_report.md`

---

## 1. Problem (問題の所在)

MediaPipe static-image food classifier の学習データ拡張用として抽出された疑似ラベル候補（831枚）は、ローカルVLM（Ollama）により自動付与されたラベルであるため、系統的な誤分類やバイアス（例: 焼き魚が肉料理、野菜炒めが揚げ物と判定される等）のリスクが存在していた。
これらを安全に学習へ投入するためには、客観的証拠に基づく統計的判定基準（ラベル仕様v2および監査計画）と、確認バイアス（Confirmation Bias）を物理的に排除したブラインド監査の仕組みが不可欠であった。

具体的には以下の課題が存在した：
1. **監査モデルへの確認バイアスの防止**: 元ラベル、撮影メタデータ、元ファイル名を監査モデルに渡さない完全ブラインド分離設計が必要。
2. **監査対象母集団の厳密な管理**: 先行70枚と重複せず、テストセット（Golden Test Set等）や隔離データを一切混入させない層化無作為抽出の再現性。
3. **データ完全性と隔離プロトコルの機械的検証**: マニフェストのSHA256、匿名化マッピング（`private_reconciliation`）の非開示、画像ファイルのEXIF除去を機械的に検証するテストの欠如。

---

## 2. Evidence (客観的証拠・テスト結果)

### 2.1 ユニットテスト実行結果
新たに作成された抽出・マニフェスト検証・パッケージング関連のテストスイート（126件）を実行し、全件合格を確認：
```text
$ python3 -m unittest discover -s scripts/tests -p 'test_*.py'
..............................................................................................................................
----------------------------------------------------------------------
Ran 126 tests in 5.212s

OK
```

### 2.2 プロジェクト既存テストスイートの健全性
全40テストスイート（597件のテスト）および静的解析（ESLint）の完全合格を確認：
```text
$ npm test
Test Suites: 40 passed, 40 total
Tests:       597 passed, 597 total
Snapshots:   0 total
Time:        17.622 s

$ npm run lint
eslint App.tsx index.ts src tests --cache --cache-location .eslintcache (Exit code: 0)
```

### 2.3 サンプルA（280枚）ブラインド監査の固定
- 対象画像: 280枚（7クラス×40枚）
- 予測結果: `state/mediapipe_labeling_runs/zip2-audit-manifest-20261009/gemini_audit_sample_A_predictions/blind_predictions.jsonl`
- SHA-256 チェックサム: `c258d3edaa0a79e6548f36f66a05f257511799501fc765580df585f687054275`
- 予測内訳: `unknown`: 109件 (38.93%), `curry_rice`: 43件, `drink`: 40件, `meat_dish`: 28件, `fish_dish`: 25件, `stir_fry`: 24件, `simmered_dish`: 6件, `fried_dish`: 5件

---

## 3. Expected Impact (期待される効果)

1. **品質保証の客観的証拠化**: 疑似ラベル候補（831枚）に対する統計的監査が再現可能・改ざん不可能な形で実行でき、モデル学習への低品質データ混入を事前に阻止できる。
2. **確認バイアスの完全排除**: 匿名化された `blind_id` とローカル隔離マッピングの二段階分離により、セカンドオピニオン監査の客観性を保証。
3. **安全な監査実行パイプラインの標準化**: パッケージング、マニフェスト検証、テストの自動化により、将来の追加バッチでも同様の安全な監査フローを再利用可能。

---

## 4. Out of Scope (意図して変更しなかったこと)

- **アンブラインド（元ラベルとの照合・一致率算出）**: 本フェーズではブラインド予測データの固定までとし、元ラベルとの照合、クラス採用判定は別タスクで実施する。
- **学習処理の実行・モデル更新**: 本監査結果に基づくラベル選定が確定するまで、学習パイプラインは稼働させない。
- **アプリ本体のソースコード変更**: データ監査基盤の整備であるため、React Native / Expo アプリケーションのランタイムコードは変更しない。
