# PLANS

## Meta
- Purpose: 大きめ作業の短い実装方針を保存し、今後の Codex prompt を短くする。
- Audience: repo 保守者、Codex、実装担当者。
- Update trigger: 大きめ作業の方針、制約、読み先、優先度が変わったとき。
- Related docs: [AGENTS.md](AGENTS.md), [TASKS.md](TASKS.md), [docs/engineering/codex-context-map.md](docs/engineering/codex-context-map.md), [docs/product/progress.md](docs/product/progress.md)

この file は Codex が毎回読む固定ルールではありません。
該当する大きめ作業を実施するときだけ、対象 plan の `Read First` から読み始めます。

## AIメモ下書き生成の待ち時間短縮

### Goal
Review 画面で AI メモ下書きを要求してから表示までの体感待ち時間を短くし、manual save の邪魔をしない状態を維持する。

### Constraints
- 外部送信を default にしない。
- AI は user-triggered / optional / tap-to-apply のままにする。
- runtime unavailable や model unavailable を mock fallback で隠さない。
- raw AI output や厚い runtime metadata を保存しない。

### Suggested Steps
- 現在の stage 表示、downsized image、live preview 停止の実装を確認する。
- 待ち時間の律速が image preparation、model load、inference、normalization のどこかを切り分ける。
- 既存 contract を変えずに、precheck、temporary file cleanup、progress update、provider call の小さな改善を行う。
- 失敗時も review 入力と保存導線が残ることを確認する。

### Read First
- [docs/architecture/tech-spec.md](docs/architecture/tech-spec.md)
- [docs/ux/screen-designs.md](docs/ux/screen-designs.md)
- [docs/notes/local-ai-provider-spike.md](docs/notes/local-ai-provider-spike.md)
- `src/hooks/cameraCapture/useMealInputAssist.ts`
- `src/ai/mealInputAssist/`
- `tests/useMealInputAssist.test.ts`

### Notes
- すでに progress / remaining time 表示と review 中の live preview 停止はある。
- 実測方法は要確認。
- model / projector の配布や差し替え UI は current scope ではない。

## AIメモ下書きの品質改善

### Goal
写真から notes に追記できるメモ下書きを、ユーザーが採用したくなる実用的な内容と表現に改善する。

### Constraints
- 下書きは自動確定しない。
- 既存入力を自動上書きしない。
- 保存する AI metadata は thin に保つ。
- MediaPipe の rich result や raw categories を DB に保存しない。
- `mealNames` / `cuisineTypes` は hidden separate path / normalizer contract として扱い、current Camera UI の主表示へ勝手に戻さない。

### Suggested Steps
- 現在の provider / prompt / normalizer / policy / Camera UI の責務を確認する。
- メモ下書きの過剰な断定、長さ、見出し、タグ表現、notes 追記時の重複を小さく改善する。
- `noteDraft` の provider contract を維持する。
- 採用時 metadata が最小のままか確認する。

### Read First
- [docs/notes/ai-input-assist-phase1.md](docs/notes/ai-input-assist-phase1.md)
- [docs/architecture/tech-spec.md](docs/architecture/tech-spec.md)
- [docs/ux/screen-designs.md](docs/ux/screen-designs.md)
- `src/ai/mealInputAssist/localRuntimePrototype.ts`
- `src/ai/mealInputAssist/normalizer.ts`
- `src/ai/mealInputAssist/policy.ts`
- `src/components/screens/camera/CameraView.tsx`
- `tests/CameraScreen.test.tsx`
- `tests/mealInputAssistNormalizer.test.ts`

### Notes
- 「面白さ」は要確認。まずは実用性、過剰な断定の回避、採用しやすさを優先する。
- 外部 AI を使う案は local-first 方針と privacy 方針を再確認してから扱う。

## 統計画面改善

### Goal
Stats 画面を、保存件数の確認だけでなく「振り返り」に使いやすい画面へ改善する。

### Constraints
- 既存の local DB を source of truth とする。
- 重い分析や cloud 前提にしない。
- loading / error / retry と、refresh failure 時に前回 summary を残す挙動を維持する。
- schema 変更が必要な場合は additive にし、domain doc を更新する。

### Suggested Steps
- 現在の Stats 表示、period、ranking、reflection text の実装済み範囲を確認する。
- calendar、曜日 / 時間帯 trend、photo highlights などから、追加する insight を 1 task につき少数に絞る。
- `MealService` の集計責務と screen 表示責務を分ける。
- focused tests を追加・更新する。

### Read First
- [docs/product/progress.md](docs/product/progress.md)
- [docs/ux/screen-designs.md](docs/ux/screen-designs.md)
- [docs/domain/database-design.md](docs/domain/database-design.md)
- `src/screens/StatsScreen/StatsScreen.tsx`
- `src/database/services/MealService.ts`
- `tests/StatsSettingsScreens.test.tsx`

### Notes
- period tabs、reflection text、balance bar、Top 3 ranking は実装済み。
- 高度な行動パターン分析や深い trend insight は未実装領域として扱う。

## 食事ラベルレビューHTML改善

### Goal
MediaPipe 教師データ作成に向けて、人手レビューしやすい HTML / export を改善する。

### Constraints
- アプリ本体 UX の再現を目的にしない。
- review と教師データ化に効く情報だけを残す。
- crop 画像や厚い中間 state を恒久保存しない。
- 出力契約を変える場合は、分析・比較 script と tests も合わせる。

### Suggested Steps
- 現在の review gallery の出力契約と candidate groups を確認する。
- 人手判断に必要な表示項目、CSV / JSON export、review flags を最小限で改善する。
- `analyze` / `compare` の期待 shape とずれないことを確認する。
- script tests を focused に実行する。

### Read First
- [docs/engineering/food-labeling-guidelines.md](docs/engineering/food-labeling-guidelines.md)
- [docs/engineering/mediapipe-labeling-workflow.md](docs/engineering/mediapipe-labeling-workflow.md)
- `scripts/build-review-gallery.py`
- `scripts/analyze-food-labels.py`
- `scripts/tests/test_build_review_gallery.py`
- `scripts/tests/test_analyze_food_labels.py`

### Notes
- 高機能な review UI へ広げすぎない。
- 教師データ化へ進む判断は frequency、review しやすさ、class set の見通しを基準にする。

## ローカルLLM / Ollama によるラベリング補助

### Goal
MediaPipe 用ラベル改善 loop を、local LLM / Ollama を使って bounded に回しやすくする。

### Constraints
- 1 cycle は 1 target、1 hypothesis、1 primary purpose に絞る。
- `src/` 配下のアプリ実装は原則変更しない。
- local executor は script / prompt / config / engineering docs の小さな仮説検証だけを担当する。
- stall が続く場合だけ cloud executor や manual review へ escalation する。

### Suggested Steps
- loop config、prompt template、state schema、compare result の現状を確認する。
- local executor の入力 / 出力 / changed_files / validation command 記録を確認する。
- dry run で prompt と target selection を検証する。
- state や generated runs は、必要な場合だけ明示的に更新する。

### Read First
- [docs/engineering/mediapipe-labeling-workflow.md](docs/engineering/mediapipe-labeling-workflow.md)
- [docs/engineering/food-labeling-guidelines.md](docs/engineering/food-labeling-guidelines.md)
- `scripts/mediapipe_labeling_loop.py`
- `scripts/mediapipe_labeling_common.py`
- `config/mediapipe_labeling_goals.json`
- `prompts/mediapipe_labeling_implementer.txt`

### Notes
- 既定 executor や model 候補は workflow doc を優先する。
- `state/mediapipe_labeling_runs/` は生成物なので、編集対象にするかはタスクごとに要確認。

## MediaPipe分類モデル同梱

### Goal
MediaPipe static-image classifier の `.task` model を Android build で利用できる状態へ近づける。

### Constraints
- 現在は model asset を repo commit しない manual local drop-in 前提。
- model license、file size、配布方法、build impact を確認するまで同梱を断定しない。
- MediaPipe path は hidden separate path のまま扱い、default runtime や Settings readiness へ勝手に切り替えない。
- UI へ渡す shape は既存 suggestion contract に正規化する。

### Suggested Steps
- Android asset path と native bridge の current assumptions を確認する。
- `.task` model の入手元、license、size、coarse label compatibility を確認する。
- 同梱する場合の build / CI / EAS への影響を整理する。
- Settings / runtime readiness へ接続するかは別 decision として分ける。

### Read First
- [docs/notes/ai-input-assist-mediapipe-static-image-groundwork.md](docs/notes/ai-input-assist-mediapipe-static-image-groundwork.md)
- [docs/architecture/tech-spec.md](docs/architecture/tech-spec.md)
- `android/app/src/main/assets/mediapipe/README.md`
- `android/app/src/main/java/com/tahosook/diningmemory/MediaPipeMealInputAssistModule.kt`
- `src/ai/mealInputAssist/mediapipeStaticImageProvider.ts`
- `tests/mealInputAssistRuntime.test.ts`

### Notes
- `android/app/src/main/assets/mediapipe/meal-input-assist.task` は期待 path だが、actual model は現在 repo に含めない。
- label set は JS normalizer と一致する必要がある。
- 同梱可否は要確認。

## Historical Notes
- 以前の MVP completion plan は current plan ではない。
- Search / Stats / Records の基本改善は現在の canonical docs と `src/` 実装を source of truth とする。
