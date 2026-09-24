# TASKS

## Meta
- Purpose: 今見えている作業候補を短く整理し、今後の開発 prompt を短くする。
- Audience: repo 保守者、AI エージェント、実装担当者。
- Update trigger: 優先順位、作業候補、完了状況、前提が変わったとき。
- Related docs: [AGENTS.md](AGENTS.md), [PLANS.md](PLANS.md), [docs/engineering/context-map.md](docs/engineering/context-map.md), [docs/product/progress.md](docs/product/progress.md)

## Now
### Investigation / evaluation candidates（調査・評価候補）
- AIメモ下書き生成の待ち時間短縮: 候補。すでに progress / remaining time 表示と review 中の live preview 停止はあるため、次は実測と小さな runtime 改善から始める。
- AIメモ下書きの面白さ・品質改善: 候補。manual save と tap-to-apply を崩さず、下書きの実用性と表現を改善する。
- AIコード品質・セキュリティガードレール: 候補。raw AI output、photo path、location、notes の保存・ログ出力を増やさない方針を維持する。

## Next
### Investigation / evaluation candidates（調査・評価候補）
- 統計画面の改善: 候補。period tabs / reflection / balance bar / Top 3 ranking は実装済み。次は calendar、曜日 / 時間帯 trend、photo highlights など深い insight を検討する。
- 食事ラベルレビューHTMLの改善: 候補。`build-review-gallery.py` は教師データ化支援が主責務で、アプリ本体 UX の再現は対象外。
- MediaPipe分類モデル同梱: 要確認。現在 `.task` model は repo commit せず manual local drop-in 前提。配布方法、license、size、build impact の判断が必要。
- ローカルLLM / Ollama を使ったラベリング支援: 候補。既存 workflow は bounded loop と local executor 前提。生成 state の扱いに注意する。
- Android / Expo ビルド運用: 候補。CI はあり、実機 smoke と model asset / native build 前提の確認手順は必要に応じて整理する。

## Later
### Future-triggered evaluation（将来トリガー待ち評価）
- Keyset (Cursor) ページネーションへの移行検討: 将来トリガー待ち評価（GitHub Issue #80、内部ドキュメント issue-08）。`searchMeals` の大量データ時における性能劣化条件と移行トリガーの評価（※本IssueではKeyset実装を行わず、必要と判断された場合に別Issue切り出し） ([docs/issues/issue-08-keyset-cursor-pagination.md](docs/issues/issue-08-keyset-cursor-pagination.md))。
- 大量データ規模における複合インデックス導入の再評価: 将来トリガー待ち評価（GitHub Issue #81、内部ドキュメント issue-09）。Issue #59 実測評価レポート（現時点見送り）を引き継ぎ、10,000件超等のトリガー到達時に再評価（※今すぐインデックス追加せず実機性能とクエリ計画を確認して判断） ([docs/issues/issue-09-composite-index-follow-up.md](docs/issues/issue-09-composite-index-follow-up.md))。

### Backlog / Future ideas（バックログ・将来検討）
- EXIF / GPS / ファイル名保存方針: 要確認。保存時 EXIF / GPS は実装方針あり。backup / export / file naming まで広げる場合は data policy と privacy を再確認する。
- X共有導線: 候補。現在は Records detail から OS share sheet へ明示操作で進む最小導線がある。投稿状態保存や自動送信はしない。
- 検索 quality 改善: 候補。current scope は text/filter path。semantic search は current scope ではない。

## Done / Historical Notes
- RecordsScreen におけるページネーション・無限スクロールの導入 (GitHub Issue #89): 100件固定取得を廃止し、`MealService.getRecentMeals` のカーソル（Keyset: `beforeMealDatetime` / `beforeId`）対応および `SectionList` の `onEndReached`（50件単位の無限スクロール）による、データ追加・削除時にも欠落しない過去記録の段階的追加読み込み機構を導入。
- リリースビルド署名鍵（Keystore）の管理・注入方針の策定 (GitHub Issue #109, 内部ドキュメント issue-12): 本番リリース時の Keystore 生成規格（RSA 4096bit / PKCS12）、多重保管・バックアップ運用、および各ビルド環境（ローカル / CI / EAS）へのシークレット注入方法の確立、Play App Signing 運用方針の策定（[docs/engineering/release-keystore-guidelines.md](docs/engineering/release-keystore-guidelines.md)、完了 / Closed）。
- 写真保存時圧縮・リサイズおよびライフサイクル管理 (GitHub Issue #75, #86, #87, #88): 撮影写真の保存時圧縮・リサイズ実測評価（GitHub Issue #75、`docs/notes/photo-compression-evaluation-issue-75.md`、完了 / Closed）、メイン写真保存時ネイティブリサイズ（最大長辺1600px / JPEG 80%）およびフォールバック（GitHub Issue #86、PR #102 にてマージ済み）、写真世代ベースのサムネイル非同期生成と写真回転競合耐性（GitHub Issue #87、PR #102 にてマージ済み）、孤立写真ファイル回収とファイルライフサイクル保護（GitHub Issue #88、PR #105 にてマージ済み）。
- Phase 2 (GitHub Issue #77, #78, #79): RecordsScreen の日付グルーピング改善（YYYY-MM-DD 化 & タイムスタンプ直接ソート、GitHub Issue #77）、RootNavigator のタブヘッダー宣言的設定移行（GitHub Issue #78）、RootNavigator / App.tsx ナビゲーション結合テスト追加（GitHub Issue #79）（PR #85 にて完了）。
- Phase 1 (GitHub Issue #73, #74, #76, #83): Jest テスト環境設定健全化（GitHub Issue #73）、ESLint flat config / Prettier CI フォーマットチェック（GitHub Issue #74）、CI Node.js 24 LTS 固定（GitHub Issue #76）、Knip スキーマ v6 更新（GitHub Issue #83）（PR #84 にて完了）。
- `src/ai/search/` ディレクトリの確認（GitHub Issue #82）: Git リポジトリ上で未追跡（存在しない）ことを確認し Close 済み。
- 基本の capture -> save -> records / search / stats flow は実装済み。
- review 画面の tap-to-apply AI 入力補助は一部実装済みで、current visible UI は `noteDraft` を notes に追記する形。
- Settings の local AI opt-in、model status、runtime status は実装済み。
- MediaPipe static-image path は Android native bridge まで groundwork 済み。ただし default runtime / Settings readiness への接続は未接続。
- Records detail からの明示的な X共有導線は実装済み。
- 内部データのバックアップ / エクスポート / 復元（ローカル ZIP バックアップ基盤、GitHub Issue #63）は実装済み。
- 旧 `PLANS.md` の MVP completion plan は historical reference で、current plan ではない。
