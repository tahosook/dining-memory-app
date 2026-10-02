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

## Next
### Investigation / evaluation candidates（調査・評価候補）
- 統計画面の改善: 候補。period tabs / reflection / balance bar / Top 3 ranking は実装済み。次は calendar、曜日 / 時間帯 trend、photo highlights など深い insight を検討する。
- 食事ラベルレビューHTMLの改善: 候補。`build-review-gallery.py` は教師データ化支援が主責務で、アプリ本体 UX の再現は対象外。
- MediaPipe 食事分類モデルのリモートオンデマンド配布・端末内ローカル読み込みパイプライン（GitHub Issue #120、内部ドキュメント issue-13）: 次期実装候補。バイナリ同梱を廃止し、GitHub Releases 等からオンデマンド配布して MappedByteBuffer 経由でローカル推論するアーキテクチャおよびタスク仕様を策定済み（[docs/architecture/food-labeling-pipeline.md](docs/architecture/food-labeling-pipeline.md)、[docs/issues/issue-13-mediapipe-remote-model-pipeline.md](docs/issues/issue-13-mediapipe-remote-model-pipeline.md)）。
- ローカルLLM / Ollama を使ったラベリング支援: 候補。既存 workflow は bounded loop と local executor 前提。生成 state の扱いに注意する。
- Android / Expo ビルド運用: 候補。CI はあり、実機 smoke と model asset / native build 前提の確認手順は必要に応じて整理する。

## Later
### Future-triggered evaluation（将来トリガー待ち評価）
- Keyset (Cursor) ページネーションへの移行検討: 将来トリガー待ち評価（GitHub Issue #80、内部ドキュメント issue-08）。`searchMeals` の大量データ時における性能特性と移行トリガーの実測評価完了（[docs/notes/pagination-index-benchmark-report.md](docs/notes/pagination-index-benchmark-report.md)）。現時点では実装見送りとし、正しいタイブレーカー条件を文書化。20,000件超かつ深いスクロール・大量同期時に別Issueで実装 ([docs/issues/issue-08-keyset-cursor-pagination.md](docs/issues/issue-08-keyset-cursor-pagination.md))。
- 大量データ規模における複合インデックス導入の再評価: 将来トリガー待ち評価（GitHub Issue #81、内部ドキュメント issue-09）。実測評価完了（[docs/notes/pagination-index-benchmark-report.md](docs/notes/pagination-index-benchmark-report.md)）。現時点では本番INDEX追加を見送り、10,000件以上を「再評価トリガー」として記録（実機体感・データ分布等と併せて別Issueで判断） ([docs/issues/issue-09-composite-index-follow-up.md](docs/issues/issue-09-composite-index-follow-up.md))。
- バックアップ復元の写真コピー並列化 — 再開条件と必須 Evidence の定義: 将来トリガー待ち評価（GitHub Issue #229、内部ドキュメント issue-14）。低スペック端末を含む実機実測データ・ロールバック整合性テスト・並列度根拠が揃うまで実装見送り（Refs #220、[docs/issues/issue-14-backup-restore-concurrency-criteria.md](docs/issues/issue-14-backup-restore-concurrency-criteria.md)）。

### Backlog / Future ideas（バックログ・将来検討）
- EXIF / GPS / ファイル名保存方針: 要確認。保存時 EXIF / GPS は実装方針あり。backup / export / file naming まで広げる場合は data policy と privacy を再確認する。
- X共有導線: 候補。現在は Records detail から OS share sheet へ明示操作で進む最小導線がある。投稿状態保存や自動送信はしない。
- 検索 quality 改善: 候補。current scope は text/filter path。semantic search は current scope ではない。
- BackupService Zip Slip 拒否ケースのテスト行列確認: 調査・確認候補（GitHub Issue #232）。PR #194 マージ後の絶対パス・トラバーサル拒否テスト行列の確認（Refs #194）。

### Process / governance follow-ups（運用・ガバナンス追跡）
- テスト専用 PR のマージ前ゲート（フル npm test + モック干渉）の明文化（GitHub Issue #233）。
- PR クローズコメント標準 — 再開条件と根拠ドキュメントリンクの必須化（GitHub Issue #234）。
- main 直コミット + PR ブランチ force-push 運用の見直し（GitHub Issue #235）。
- エージェントによる `.jules/` 変更の拒否方針とゲート化の検討（GitHub Issue #236）。
- Issue #80 / #81 クローズコメントへの再オープン条件・ベンチマークリンク補完（GitHub Issue #237）。
- カメラ権限エラー表示の汎用化によるデバッグ性・UX 影響の確認（GitHub Issue #238、Refs #198）。
- 孤立写真削除のチャンク化 — 再開条件の定義（GitHub Issue #239、Refs #210）。

## Done / Historical Notes
- Expo SQLite prepareAsync 可用性の根拠固定: 完了（GitHub Issue #231）。Expo SDK 57 / expo-sqlite ~57.0.3 の型定義およびランタイム実装（runAsync 等が内部で prepareAsync を直接使用）に基づき、prepareAsync が常時利用可能でありフォールバック分岐が死パスであることを固定。SDKアップグレード時の再確認トリガーを定義（Refs #209, #197、[docs/notes/sqlite-prepareasync-availability.md](docs/notes/sqlite-prepareasync-availability.md)、完了 / Closed）。
- mealShare エラーパス統合テストの完全性確認: 調査・確認完了（GitHub Issue #230、内部ドキュメント issue-15）。MealDetailScreen から mealShare への呼び出し経路、エラー伝播、フォールバック（Android: NativeModule -> expo-sharing -> Share.share）、UI 側でのエラーアラート表示、およびパスサニタイズ処理が既存のテスト（tests/mealShare.test.ts、tests/MealDetailScreen.test.tsx）にて網羅（カバレッジ 100%）されており、追加変更不要で完了と判断（Refs #228, #226, #211, #202, #196、[docs/issues/issue-15-mealshare-error-path-verification.md](docs/issues/issue-15-mealshare-error-path-verification.md)、完了 / Closed）。
- エージェント運用のガバナンス刷新と機械的 PR ゲートの最適化 (Core Machine-Enforced & Evidence-Based Governance): 自然言語禁止リストの肥大化を廃止し、3層構造（`.jules/rules.md` での意思決定ポリシー、`bolt.md`/`sentinel.md` での標準5セクションペルソナ定義、および `scripts/verify-pr-gates.sh` による機械的ゲート）を配備。差分ゼロ・テスト削除・テスト弱体化および PR 本文 Evidence Gate を CI で物理遮断し、`any`・エスケープハッチは ESLint で静的検査、PR 本文修正時の CI 自動再検証（`pull_request.edited` トリガー）を配備。
- Android 実機環境における写真保存パイプラインの実測プロファイリング (GitHub Issue #60) & Native EXIF 移行要否判断 (GitHub Issue #61): Google Pixel 9a (Android 17, 8GB RAM) 実機での写真保存パイプライン全8ステップの所要時間、メモリ推移（PSS/RSS）、GC 挙動、および UI フレーム描画（Jank）を実測（2回施行）。今回の測定条件では EXIF 処理時間は平均 42.4ms、Java Heap PSS は 11〜22MB、GC ポーズは 3ms 未満、Jank 率は 3.9〜5.4% で推移し、顕著な UI 停止やメモリ圧迫は観測されず。この実機データに基づき、Issue #61（Kotlin Native EXIF 化）は未実測の机上試算（~10ms）と比較しても得られる短縮幅が限定的であることから現状維持と判断（[docs/notes/photo-save-benchmark-issue-60.md](docs/notes/photo-save-benchmark-issue-60.md)、完了）。
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
