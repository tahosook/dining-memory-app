# TASKS

## Meta
- Purpose: 今見えている作業候補を短く整理し、今後の Codex prompt を短くする。
- Audience: repo 保守者、Codex、実装担当者。
- Update trigger: 優先順位、作業候補、完了状況、前提が変わったとき。
- Related docs: [AGENTS.md](AGENTS.md), [PLANS.md](PLANS.md), [docs/engineering/codex-context-map.md](docs/engineering/codex-context-map.md), [docs/product/progress.md](docs/product/progress.md)

## Now
- AI候補生成の待ち時間短縮: 候補。すでに progress / remaining time 表示と review 中の live preview 停止はあるため、次は実測と小さな runtime 改善から始める。
- AI候補の面白さ・品質改善: 候補。manual save と tap-to-apply を崩さず、候補の実用性と表現を改善する。
- AIコード品質・セキュリティガードレール: 候補。raw AI output、photo path、location、notes の保存・ログ出力を増やさない方針を維持する。

## Next
- 統計画面の改善: 候補。現在は軽量な summary / ranking が中心。より実用的な振り返りを増やす場合は UX docs と実装進捗を先に確認する。
- 食事ラベルレビューHTMLの改善: 候補。`build-review-gallery.py` は教師データ化支援が主責務で、アプリ本体 UX の再現は対象外。
- MediaPipe分類モデル同梱: 要確認。現在 `.task` model は repo commit せず manual local drop-in 前提。配布方法、license、size、build impact の判断が必要。
- ローカルLLM / Ollama を使ったラベリング支援: 候補。既存 workflow は bounded loop と local executor 前提。生成 state の扱いに注意する。
- Android / Expo ビルド運用: 候補。CI はあり、実機 smoke と model asset / native build 前提の確認手順は必要に応じて整理する。

## Later
- EXIF / GPS / ファイル名保存方針: 要確認。保存時 EXIF / GPS は実装方針あり。backup / export / file naming まで広げる場合は data policy と privacy を再確認する。
- X共有導線: 候補。現在は Records detail から OS share sheet へ明示操作で進む最小導線がある。投稿状態保存や自動送信はしない。
- バックアップ / エクスポート / 復元: 候補。product progress では未実装。local-first と sensitive data の扱いを先に固める。
- 検索 quality 改善: 候補。current scope は text/filter path。semantic search は current scope ではない。

## Done / Historical Notes
- 基本の capture -> save -> records / search / stats flow は実装済み。
- review 画面の tap-to-apply AI 入力補助は一部実装済み。
- Settings の local AI opt-in、model status、runtime status は実装済み。
- MediaPipe static-image path は Android native bridge まで groundwork 済み。ただし default runtime / Settings readiness への接続は未接続。
- Records detail からの明示的な X共有導線は実装済み。
- 旧 `PLANS.md` の MVP completion plan は historical reference で、current plan ではない。
