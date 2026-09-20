# TASKS

## Meta
- Purpose: 今見えている作業候補を短く整理し、今後の開発 prompt を短くする。
- Audience: repo 保守者、AI エージェント、実装担当者。
- Update trigger: 優先順位、作業候補、完了状況、前提が変わったとき。
- Related docs: [AGENTS.md](AGENTS.md), [PLANS.md](PLANS.md), [docs/engineering/context-map.md](docs/engineering/context-map.md), [docs/product/progress.md](docs/product/progress.md)

## Now
### Implementation candidates（実装候補）
- Jest テスト環境およびセットアップ設定の健全化: 実装候補（Issue #73）。`setupFilesAfterEnv` 未読み込み、不要な `testEnvironment: 'node'`、未導入パッケージの死んだモック整理、環境変数重複の解消 ([docs/issues/issue-01-jest-config-cleanup.md](docs/issues/issue-01-jest-config-cleanup.md))。
- RecordsScreen の日付グルーピングにおけるタイムゾーン・日付パース改善: 実装候補（Issue #77）。文字列 `toDateString()` 再パースの解消と `YYYY-MM-DD` / タイムスタンプソート化 ([docs/issues/issue-05-records-screen-date-grouping.md](docs/issues/issue-05-records-screen-date-grouping.md))。

### Investigation / evaluation candidates（調査・評価候補）
- 撮影写真の保存時圧縮・リサイズ機構の検討（ストレージ肥大化対策）: 調査・評価候補（Issue #75）。既存依存 `@bam.tech/react-native-image-resizer` の活用前提で実測評価を行い、適切な保存仕様（解像度・JPEG品質・フォールバック等）を検討・決定（※本Issueでは決め打ち実装せず仕様決定後に別Issue切り出し） ([docs/issues/issue-03-photo-storage-compression.md](docs/issues/issue-03-photo-storage-compression.md))。
- AIメモ下書き生成の待ち時間短縮: 候補。すでに progress / remaining time 表示と review 中の live preview 停止はあるため、次は実測と小さな runtime 改善から始める。
- AIメモ下書きの面白さ・品質改善: 候補。manual save と tap-to-apply を崩さず、下書きの実用性と表現を改善する。
- AIコード品質・セキュリティガードレール: 候補。raw AI output、photo path、location、notes の保存・ログ出力を増やさない方針を維持する。

## Next
### Implementation candidates（実装候補）
- ESLint flat config スクリプト整理 & CI フォーマットチェック追加: 実装候補（Issue #74）。`--ext` 廃止対応と `prettier --check` による CI ガードレール ([docs/issues/issue-02-eslint-flat-config-and-format-ci.md](docs/issues/issue-02-eslint-flat-config-and-format-ci.md))。
- CI 実行環境の Node.js バージョン見直し（LTS 固定）: 実装候補（Issue #76）。EOL 済みの Node 25.9.0 から長期サポート版（v24.x/v22.x LTS）への移行 ([docs/issues/issue-04-ci-node-lts-version.md](docs/issues/issue-04-ci-node-lts-version.md))。
- RootNavigator のタブヘッダー制御を宣言的設定に移行: 実装候補（Issue #78）。文字列比較条件の解消と各画面 `options` への集約 ([docs/issues/issue-06-root-navigator-declarative-headers.md](docs/issues/issue-06-root-navigator-declarative-headers.md))。
- RootNavigator / App.tsx ナビゲーション結合テスト追加: 実装候補（Issue #79）。タブ構成・スタック画面のリグレッション自動検知 ([docs/issues/issue-07-navigation-integration-test.md](docs/issues/issue-07-navigation-integration-test.md))。
- `knip.json` スキーマ定義バージョン更新 (v5 → v6): 実装候補（Issue #83）。使用中 Knip v6 に合わせたエディタ検証整合 ([docs/issues/issue-11-knip-schema-version.md](docs/issues/issue-11-knip-schema-version.md))。

### Investigation / evaluation candidates（調査・評価候補）
- 統計画面の改善: 候補。period tabs / reflection / balance bar / Top 3 ranking は実装済み。次は calendar、曜日 / 時間帯 trend、photo highlights など深い insight を検討する。
- 食事ラベルレビューHTMLの改善: 候補。`build-review-gallery.py` は教師データ化支援が主責務で、アプリ本体 UX の再現は対象外。
- MediaPipe分類モデル同梱: 要確認。現在 `.task` model は repo commit せず manual local drop-in 前提。配布方法、license、size、build impact の判断が必要。
- ローカルLLM / Ollama を使ったラベリング支援: 候補。既存 workflow は bounded loop と local executor 前提。生成 state の扱いに注意する。
- Android / Expo ビルド運用: 候補。CI はあり、実機 smoke と model asset / native build 前提の確認手順は必要に応じて整理する。

## Later
### Future-triggered evaluation（将来トリガー待ち評価）
- Keyset (Cursor) ページネーションへの移行検討: 将来トリガー待ち評価（Issue #80）。`searchMeals` の大量データ時における性能劣化条件と移行トリガーの評価（※本IssueではKeyset実装を行わず、必要と判断された場合に別Issue切り出し） ([docs/issues/issue-08-keyset-cursor-pagination.md](docs/issues/issue-08-keyset-cursor-pagination.md))。
- 大量データ規模における複合インデックス導入の再評価: 将来トリガー待ち評価（Issue #81）。Issue #59 実測評価レポート（現時点見送り）を引き継ぎ、10,000件超等のトリガー到達時に再評価（※今すぐインデックス追加せず実機性能とクエリ計画を確認して判断） ([docs/issues/issue-09-composite-index-follow-up.md](docs/issues/issue-09-composite-index-follow-up.md))。

### Backlog / Future ideas（バックログ・将来検討）
- EXIF / GPS / ファイル名保存方針: 要確認。保存時 EXIF / GPS は実装方針あり。backup / export / file naming まで広げる場合は data policy と privacy を再確認する。
- X共有導線: 候補。現在は Records detail から OS share sheet へ明示操作で進む最小導線がある。投稿状態保存や自動送信はしない。
- 検索 quality 改善: 候補。current scope は text/filter path。semantic search は current scope ではない。

## Done / Historical Notes
- `src/ai/search/` ディレクトリの確認（Issue #82）: Git リポジトリ上で未追跡（存在しない）ことを確認し Close 済み。
- 基本の capture -> save -> records / search / stats flow は実装済み。
- review 画面の tap-to-apply AI 入力補助は一部実装済みで、current visible UI は `noteDraft` を notes に追記する形。
- Settings の local AI opt-in、model status、runtime status は実装済み。
- MediaPipe static-image path は Android native bridge まで groundwork 済み。ただし default runtime / Settings readiness への接続は未接続。
- Records detail からの明示的な X共有導線は実装済み。
- 内部データのバックアップ / エクスポート / 復元（ローカル ZIP バックアップ基盤、Issue #63）は実装済み。
- 旧 `PLANS.md` の MVP completion plan は historical reference で、current plan ではない。
