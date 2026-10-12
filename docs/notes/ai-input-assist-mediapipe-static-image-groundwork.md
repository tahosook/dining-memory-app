# AI Input Assist MediaPipe Static Image Groundwork

## Meta
- Purpose: このタスクで追加する MediaPipe static-image classification groundwork の前提、保存方針、非目標を task-local memo として残す。
- Audience: 今回の実装担当者と、この差分を後から引き継ぐ人。
- Update trigger: MediaPipe static-image path の責務、保存契約、native bridge 前提が変わったとき。
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/architecture/tech-spec.md](../architecture/tech-spec.md), [docs/product/progress.md](../product/progress.md), [docs/domain/database-design.md](../domain/database-design.md), [docs/notes/ai-input-assist-phase1.md](./ai-input-assist-phase1.md)

## Summary
このメモは canonical docs より下位の task-local memo です。  
判断に迷った場合は、まず `AGENTS.md` と `docs/index.md` から辿る canonical docs、その次に現在の `src/` 実装を優先します。

## Current State
- MediaPipe path は static-image only で進め、1 枚の `photoUri` を受ける local food classification path だけを対象にする。
- CameraX は使わず、連続フレーム処理や live camera pipeline への接続は current scope に含めない。
- 既存の `llama.rn` ベース meal input assist path も維持しつつ、デフォルトランタイム環境を `'mediapipe-static-image'` に設定。
- rich runtime result や raw classifier categories は provider 内の in-memory only データとして扱い、正規化された `mealNames` / `cuisineTypes` のサジェストボタンを review UI に表示して tap-to-apply を提供。
- Android では official MediaPipe `tasks-vision` dependency を使う native bridge を配備。端末内部ストレージ（`context.filesDir/ai-models/meal-input-assist.task`）にモデルが存在しない場合、APK 内同梱アセット（`assets/mediapipe/meal-input-assist.task`）から自動シードコピーして `MappedByteBuffer` でロードするハイブリッド構成を採用（デバッグ・リリースビルドの双方で単体動作可能）。

## Decisions / Rules
- MediaPipe の coarse classifier label は `mealNames` / `cuisineTypes` に正規化してから既存 review UI へ渡す。
- cuisine type は既存の `和食 / 中華 / 洋食 / その他` に丸め、unknown は原則 UI 候補へ出さない。
- review UI（`MealInputAssistSection`）では料理名候補（`mealNames`）および料理ジャンル（`cuisineTypes`）をタップ可能なチップとして表示し、ユーザーがワンタップで入力欄に反映できるようにする。
- save 時に永続化してよい AI metadata は引き続き `ai_source` と `ai_confidence` のみとする。
- top-k 結果、model metadata、raw response、生の classifier result は DB に保存しない。
- DB migration を入れない理由は、永続化 contract が増えず、`meals.ai_source` / `meals.ai_confidence` の既存列で今回の保存要件を満たせるため。
- Android bridge はローカルストレージからの `MappedByteBuffer` 読み込みと同梱アセットの自動シードコピーをサポートし、リリースビルドでも追加の手動配置なしに即時推論可能。

## Next Steps or Open Questions
- model packaging / distribution（リモートオンデマンドダウンロード）の実装。
- Settings や runtime readiness 表示へ MediaPipe path をどう統合するかの wiring。
