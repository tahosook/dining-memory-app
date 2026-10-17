# [Enhancement] MediaPipe 学習候補疑似ラベルの決定論的抽出・検証パイプライン構築

- **内部ドキュメントID**: issue-20
- **対応 GitHub Issue**: 未起票
- **ステータス**: 完了 (Closed)
- **作成日**: 2026-10-11
- **結果**: 確定済み採用レジストリ（`pseudo_label_adoption_registry.csv`）に基づき、二層採用ゲートを完全通過した学習候補（`candidate_eligible`）74枚（`curry_rice` 34枚、`drink` 40枚）のみを再現可能・決定論的に抽出・検証するパイプライン（`scripts/export_eligible_pseudo_labels.py`）を実装。未達クラス5クラス（343枚）および通過クラスの個別未監査画像（138枚）の混入を機械的防衛チェック（7つの厳格な不変条件）で100%遮断することを保証。ユニットテスト（`scripts/tests/test_export_eligible_pseudo_labels.py`）により、不正混入に対する例外送出、決定論的ソート、画像コピー検証、クリーンチェックアウト互換性を検証完了。
- **関連ドキュメント**:
  - 仕様書: [docs/engineering/mediapipe-gemini-audit-spec.md](../engineering/mediapipe-gemini-audit-spec.md)
  - 先行照合結果: [docs/issues/issue-19-mediapipe-audit-sample-a-reconciliation.md](issue-19-mediapipe-audit-sample-a-reconciliation.md)
  - 採用レジストリ: `state/mediapipe_labeling_runs/zip2-audit-manifest-20261009/pseudo_label_adoption_registry.csv`
  - 抽出マニフェスト: `state/mediapipe_labeling_runs/zip2-audit-manifest-20261009/eligible_pseudo_labels_export/eligible_pseudo_labels_manifest.csv`
  - 抽出サマリー: `state/mediapipe_labeling_runs/zip2-audit-manifest-20261009/eligible_pseudo_labels_export/export_summary.json`

---

## 1. Problem (問題の所在)

MediaPipe static-image food classifier 向けの疑似ラベル候補群（831枚）について、先行タスク（Issue-19）で二層採用レジストリ（`pseudo_label_adoption_registry.csv`）を構築した。
しかし、Challenger モデルの再学習パイプラインへデータを引き渡すにあたり、以下の課題に対処する必要があった：

1. **未達クラスおよび未監査サンプルの混入リスク**:
   - 採用レジストリには `excluded_class_gate_blocked`（343枚）や `unaudited_candidate_pending`（138枚）などの除外・保留データが同居している。
   - 単純なフィルタリングや手作業による抽出では、不一致サンプルや未監査データが誤って学習データセットへ混入し、モデル品質を不可逆的に汚染する危険性がある。
2. **再現性と不変条件の機械的強制 (Invariants Enforcement)**:
   - 抽出処理が決定論的（ソート順・ハッシュ固定）であり、7つの厳格な不変条件（合格クラス限定、モデル間合意、確信度、個別監査済み等）を満たしていることを機械的にゲートする必要がある。
3. **メタデータ統合と画像実体コピーの検証**:
   - 元マニフェスト（`image_audit_manifest_remediated.csv`）のメタデータと結合し、画像実体をコピーする場合には SHA-256 の完全一致を検証できる安全なエクスポート機能が必要。

---

## 2. Evidence (客観的証拠・実測値)

### 2.1 決定論的抽出パイプラインの実行結果 (Real Registry)

`scripts/export_eligible_pseudo_labels.py` を実レジストリに対して実行した結果：

```text
=== Export Eligible Pseudo-Labels Pipeline ===
Registry:    .../pseudo_label_adoption_registry.csv
Manifest:    .../image_audit_manifest_remediated.csv
Output Dir:  .../eligible_pseudo_labels_export

[SUCCESS] Exported 74 eligible records.
  - Manifest CSV:    .../eligible_pseudo_labels_manifest.csv
  - Manifest SHA256: b08de63df27ac29f0a490d7b7eade1dd2de13fc9339a2550080e4ad9a04922b1
  - Summary JSON:    .../export_summary.json
  - Class breakdown: {'curry_rice': 34, 'drink': 40}
  - Blocked classes contamination: 0
  - Unaudited contamination:       0
```

### 2.2 防衛的バリデーション（7つの厳格な不変条件）

抽出スクリプトは、以下の不変条件のいずれか1つでも満たさないレコードを検知した場合、直ちに `ContaminationError` を送出して処理を中断する：

1. `adoption_status == "candidate_eligible"`
2. `class_gate_status == "passed"`
3. `audit_is_uncertain == "false"`
4. `mapped_class == audit_predicted_class`
5. `mapped_class in {"curry_rice", "drink"}`（合格2クラスのみ）
6. `audit_subset == "sample_A"`（個別ブラインド監査済み標本のみ、`unaudited` の漏洩を絶対遮断）
7. 重複 `image_id` の不在

### 2.3 テスト実行結果

```text
$ python3 -m unittest scripts/tests/test_export_eligible_pseudo_labels.py
Ran 10 tests in 0.040s
OK

$ python3 -m unittest discover -s scripts/tests -p 'test_*.py'
Ran 141 tests in 5.283s
OK

$ npm test
Test Suites: 40 passed, 40 total
Tests:       597 passed, 597 total
Time:        13.612 s
OK

$ npm run lint
eslint App.tsx index.ts src tests --cache
OK
```

- クリーンチェックアウト環境（`state/` 配下が存在しない環境）でも合成フィクスチャにより全10テストがパスすることを確認。

---

## 3. Expected Impact (期待される効果)

1. **ゼロ汚染の保証**:
   超幾何厳密ゲートで否決された5クラス（`fried_dish`, `simmered_dish`, `fish_dish`, `meat_dish`, `stir_fry`）および未監査の138枚が学習データセットへ混入することを100%機械的に阻止。
2. **安全な再学習パイプラインへの接続**:
   `curry_rice` 34枚と `drink` 40枚の計74枚という、95%信頼区間下限（カレー 73.6%、ドリンク 93.5%）で保証された高純度な追加データを、再現可能なマニフェスト形式で次期 Challenger モデル学習へ供給可能。
3. **データトレーサビリティの確保**:
   出力サマリー（`export_summary.json`）に入力レジストリおよび出力マニフェストの SHA-256、抽出日時、クラス内訳を記録し、実験の完全な再現性を維持。

---

## 4. Out of Scope (意図して変更しなかったこと)

- **モデル再学習処理の実行**: 本タスクは学習候補データセットの安全な抽出・検証パイプラインの整備までとし、Challenger モデルの再学習および Promotion Gate 評価は次期タスクで実施する。
- **未監査画像の自動採用**: クラスゲートを通過した `curry_rice` / `drink` であっても、個別監査未実施の138枚は `unaudited_candidate_pending` のまま維持し、今回のエクスポート対象に含めない。
- **アプリ本体のソースコード変更**: データパイプラインタスクであるため、React Native / Expo 本体のコードは変更しない。
