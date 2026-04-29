# Codex Context Map

## Meta
- Purpose: Codex が task ごとに読むべき最小 context を選ぶための入口を定義する。
- Audience: Codex、repo 保守者、実装担当者。
- Update trigger: 読むべき canonical docs、主要 source path、作業分類、AI / MediaPipe 方針が変わったとき。
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/index.md](../index.md), [docs/engineering/codex-workflow.md](codex-workflow.md), [docs/engineering/food-labeling-guidelines.md](food-labeling-guidelines.md)

## Summary
- この repo では、毎回すべての docs や code を読まない。
- まずこの context map を読み、今回のタスクに必要な docs / source / tests だけ読む。
- `TASKS.md` と `PLANS.md` は毎回読む対象ではない。作業候補や大きめ計画を扱うときだけ参照する。
- 判断に迷う場合は、historical notes より current source of truth の canonical docs と `src/` を優先する。

## Always Read
- [AGENTS.md](../../AGENTS.md)
- この file
- User prompt で明示された file
- 変更予定箇所の近い source / tests

必要になったときだけ読む:
- setup / scripts: [README.md](../../README.md)
- docs 全体の入口: [docs/index.md](../index.md)
- 作業候補: [TASKS.md](../../TASKS.md)
- 大きめ作業の計画: [PLANS.md](../../PLANS.md)

## Task Entry Points
### Product / Progress
- Read first: [docs/product/overview.md](../product/overview.md), [docs/product/progress.md](../product/progress.md)
- Then: task に関係する UX / architecture / source

### Architecture / Runtime
- Read first: [docs/architecture/tech-spec.md](../architecture/tech-spec.md)
- Common source: `src/ai/`, `src/hooks/`, `src/database/services/`, `src/navigation/`
- Also read: [docs/domain/database-design.md](../domain/database-design.md) when storage or schema changes

### UI / Screen Improvements
- Read first: [docs/ux/screen-designs.md](../ux/screen-designs.md), [docs/ux/user-flows.md](../ux/user-flows.md)
- Common source: `src/screens/`, `src/components/`, `src/navigation/RootNavigator.tsx`
- Common tests: `tests/*Screen*.test.tsx`, focused hook/service tests when behavior crosses layers

### Camera / Save / EXIF / GPS / File Paths
- Read first: [docs/architecture/tech-spec.md](../architecture/tech-spec.md), [docs/domain/database-design.md](../domain/database-design.md), [docs/ux/user-flows.md](../ux/user-flows.md)
- Common source: `src/hooks/cameraCapture/`, `src/utils/mealPhotoRotation.ts`, `src/utils/mealImage.ts`, `src/database/services/MealService.ts`
- Common tests: `tests/useCameraCapture.test.ts`, `tests/photoStorage.test.ts`, `tests/photoExif.test.ts`, `tests/mealPhotoRotation.test.ts`

### Records / Search / X Share
- Read first: [docs/ux/screen-designs.md](../ux/screen-designs.md), [docs/ux/user-flows.md](../ux/user-flows.md), [docs/domain/database-design.md](../domain/database-design.md)
- Common source: `src/screens/RecordsScreen/`, `src/screens/SearchScreen/`, `src/components/common/MealEditModal.tsx`, `src/database/services/MealService.ts`
- Common tests: `tests/RecordsScreen.test.tsx`, `tests/MealDetailScreen.test.tsx`, `tests/SearchScreen.test.tsx`, `tests/MealService.test.ts`

### Stats
- Read first: [docs/product/progress.md](../product/progress.md), [docs/ux/screen-designs.md](../ux/screen-designs.md)
- Common source: `src/screens/StatsScreen/StatsScreen.tsx`, `src/database/services/MealService.ts`
- Common tests: `tests/StatsSettingsScreens.test.tsx`, `tests/MealService.test.ts`

### AI Input Assist
- Read first: [docs/architecture/tech-spec.md](../architecture/tech-spec.md), [docs/ux/screen-designs.md](../ux/screen-designs.md), [docs/notes/ai-input-assist-phase1.md](../notes/ai-input-assist-phase1.md), [docs/notes/local-ai-provider-spike.md](../notes/local-ai-provider-spike.md)
- Common source: `src/hooks/cameraCapture/useMealInputAssist.ts`, `src/ai/mealInputAssist/`, `src/ai/runtime/`, `src/screens/SettingsScreen/SettingsScreen.tsx`
- Common tests: `tests/useMealInputAssist.test.ts`, `tests/mealInputAssistRuntime.test.ts`, `tests/mealInputAssistPolicy.test.ts`, `tests/mealInputAssistNormalizer.test.ts`, `tests/localAiRuntimeStatus.test.ts`
- Preserve: AI is optional, user-triggered, local-first, and tap-to-apply only.

### Food Labeling / Classification / MediaPipe
- Highest priority: [docs/engineering/food-labeling-guidelines.md](food-labeling-guidelines.md)
- Read also: [docs/engineering/mediapipe-labeling-workflow.md](mediapipe-labeling-workflow.md), [docs/notes/ai-input-assist-mediapipe-static-image-groundwork.md](../notes/ai-input-assist-mediapipe-static-image-groundwork.md)
- Script source: `scripts/explore-food-labels.py`, `scripts/analyze-food-labels.py`, `scripts/build-review-gallery.py`, `scripts/compare_labeling_reports.py`, `scripts/mediapipe_labeling_loop.py`, `scripts/mediapipe_labeling_common.py`
- App source: `src/ai/mealInputAssist/mediapipe*`, `android/app/src/main/java/com/tahosook/diningmemory/MediaPipeMealInputAssist*`, `android/app/src/main/assets/mediapipe/README.md`
- Config / prompts: `config/mediapipe_labeling_goals.json`, `prompts/mediapipe_labeling_implementer.txt`
- Common tests: `scripts/tests/test_*food_labels*.py`, `scripts/tests/test_*mediapipe*.py`, `tests/mealInputAssistRuntime.test.ts`, `tests/mealInputAssistNormalizer.test.ts`
- Preserve: MediaPipe path stays separate unless a task explicitly changes runtime selection.

### Local LLM / Ollama / Batch Labeling
- Read first: [docs/engineering/mediapipe-labeling-workflow.md](mediapipe-labeling-workflow.md), [docs/notes/local-ai-provider-spike.md](../notes/local-ai-provider-spike.md)
- Common source: `scripts/mediapipe_labeling_loop.py`, `scripts/mediapipe_labeling_common.py`, `config/mediapipe_labeling_goals.json`, `prompts/mediapipe_labeling_implementer.txt`
- Generated / state files: `state/mediapipe_labeling_state.json`, `state/mediapipe_labeling_runs/`
- Do not edit generated state unless the task explicitly asks for workflow state maintenance.

### Expo / Android / Build
- Read first: [README.md](../../README.md), [docs/architecture/tech-spec.md](../architecture/tech-spec.md)
- Common files: `app.json`, `eas.json`, `metro.config.js`, `babel.config.js`, `android/app/build.gradle`, `.github/workflows/ci.yml`
- If dependency or runtime assumptions change, also read `package.json`, `package-lock.json`, and [docs/engineering/codex-workflow.md](codex-workflow.md)

### Tests / CI / Quality
- Read first: [docs/engineering/codex-workflow.md](codex-workflow.md), [docs/engineering/coding-standards.md](coding-standards.md)
- Common files: `package.json`, `jest.config.js`, `jest.setup.js`, `eslint.config.js`, `.github/workflows/ci.yml`, `tests/`, `scripts/tests/`
- Use the narrowest useful check first, then broader gates for meaningful code changes.

### Docs-only Changes
- Read first: target doc, [docs/index.md](../index.md), [README.md](../../README.md) when adding or renaming canonical docs.
- Keep one responsibility per doc.
- Prefer links over duplication.
- Use Japanese for project-facing docs unless English is clearer for code or external APIs.

## Doc Sync Targets
When source changes, check the smallest matching canonical docs before finishing.

- `src/ai/mealInputAssist/`, `src/ai/runtime/`, `src/screens/SettingsScreen/`: [docs/architecture/tech-spec.md](../architecture/tech-spec.md), [docs/ux/screen-designs.md](../ux/screen-designs.md), [docs/product/progress.md](../product/progress.md), relevant `docs/notes/ai-input-*`
- `src/hooks/cameraCapture/`, `src/utils/mealPhotoRotation.ts`, `src/utils/mealImage.ts`: [docs/architecture/tech-spec.md](../architecture/tech-spec.md), [docs/domain/database-design.md](../domain/database-design.md), [docs/ux/user-flows.md](../ux/user-flows.md)
- `src/screens/RecordsScreen/`, `src/screens/SearchScreen/`, `src/components/common/MealEditModal.tsx`: [docs/ux/screen-designs.md](../ux/screen-designs.md), [docs/ux/user-flows.md](../ux/user-flows.md), [docs/domain/database-design.md](../domain/database-design.md), [docs/product/progress.md](../product/progress.md)
- `src/screens/StatsScreen/`, stats aggregation in `src/database/services/MealService.ts`: [docs/product/progress.md](../product/progress.md), [docs/ux/screen-designs.md](../ux/screen-designs.md), [docs/domain/database-design.md](../domain/database-design.md)
- `src/database/services/`, schema or persistence contracts: [docs/domain/database-design.md](../domain/database-design.md), [docs/architecture/tech-spec.md](../architecture/tech-spec.md)
- `scripts/*food-labels.py`, `scripts/mediapipe_*`, `config/mediapipe_labeling_goals.json`, `prompts/mediapipe_labeling_implementer.txt`: [docs/engineering/food-labeling-guidelines.md](food-labeling-guidelines.md), [docs/engineering/mediapipe-labeling-workflow.md](mediapipe-labeling-workflow.md)
- `app.json`, `eas.json`, `.github/workflows/ci.yml`, dependency or runtime files: [README.md](../../README.md), [docs/architecture/tech-spec.md](../architecture/tech-spec.md), [docs/engineering/codex-workflow.md](codex-workflow.md)

Run `bash scripts/check-doc-drift.sh` when a change touches current behavior docs, AI input assist, MediaPipe, storage, runtime, or UX descriptions.

## Codex Working Rules
- 変更前に読む予定ファイルを明確にする。
- 今回のタスクに必要なファイルだけ読む。
- 対象外ファイルを広く読まない。
- 大きな変更は「調査」「計画」「実装」を分ける。
- 変更は最小差分にする。
- 大規模リファクタや無関係な cleanup を避ける。
- food-labeling / MediaPipe / AI labeling では `food-labeling-guidelines.md` を最優先で尊重する。
- 変更後に変更ファイル、確認コマンド、未確認事項を報告する。
