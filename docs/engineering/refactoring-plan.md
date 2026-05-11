# Refactoring Plan

## Meta
- Purpose: Phase 1〜7 の段階的リファクタリングで、現状棚卸し、対象ファイル、リスク、検証結果を一か所に残す。
- Audience: repo 保守者、Codex、レビュー担当者。
- Update trigger: 各 Phase の開始時 / 完了時、責務境界や canonical docs の更新が必要になったとき。
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/engineering/codex-context-map.md](codex-context-map.md), [docs/architecture/tech-spec.md](../architecture/tech-spec.md), [docs/domain/database-design.md](../domain/database-design.md)

## Phase 1 Inventory

### Current Hotspots
- `src/hooks/cameraCapture/useCameraCapture.ts`: camera capture, library import, review state, Android photo permission, location lookup, resize, persistence, temp cleanup, MealService call, Alert, and navigation are all in one hook.
- `src/hooks/cameraCapture/useMealInputAssist.ts`: UI hook state, runtime environment loading, progress snapshots, request building, analysis-photo resizing/cleanup, normalization diagnostics, and applied metadata are mixed.
- `src/components/screens/camera/CameraView.tsx`: presentational UI is large and includes permission views, review fields, AI assist section wiring, and capture controls. Existing user changes remove the framing guide and adjust the library action layout.
- `src/database/services/MealService.ts`: DB access and pure meal domain logic are mixed, including default meal naming, nearby location reuse, search filtering, recency sorting, and statistics ranking.
- `src/ai/mealInputAssist/localRuntimePrototype.ts`: local runtime readiness, prompt construction, response parsing, progress estimation, context lifecycle, and provider orchestration are in one file.
- `src/screens/RecordsScreen/MealDetailScreen.tsx`: detail viewing, previous/next context, edit modal state, AI note assist, rotation, delete confirmation, and share composer are combined.

### Existing Structure Notes
- There is no existing `src/media/` directory before this refactor.
- There is no existing `docs/engineering/refactoring-plan.md` before this refactor.
- `src/hooks/cameraCapture/photoStorage.ts` and `src/hooks/cameraCapture/photoExif.ts` currently own photo persistence and EXIF behavior.
- `MealDetail` currently lives inside the Records stack, so Search reaches it by navigating through the Records tab.
- The worktree already contains user-owned changes in Camera/Search/UX docs/tests; this refactor must preserve and build on them.

## Phase Plan

### Phase 2: Camera Capture / Save Flow
- Target files: `src/hooks/cameraCapture/useCameraCapture.ts`, new focused helpers in `src/hooks/cameraCapture/`, and related tests.
- Intent: keep `useCameraCapture` as a thin UI hook while extracting review state, photo acquisition, Android photo-save permission, location snapshot, temp cleanup, and save workflow.
- Risk: changing permission timing, resize parameters, Alert timing, or save failure behavior.
- Verification: `npm test -- tests/useCameraCapture.test.ts --runInBand`.

### Phase 3: MealService Domain Logic
- Target files: `src/database/services/MealService.ts`, new `src/domain/meals/` helpers, `tests/MealService.test.ts`, `tests/localDatabaseMigration.test.ts`.
- Intent: keep MealService public API stable while moving pure default-name, location, search, sort, row normalization, and statistics logic out of DB service orchestration.
- Risk: search ordering/filter behavior, nearby location reuse, default meal name, statistics ranking, or in-memory fallback drift.
- Verification: `npm test -- tests/MealService.test.ts tests/localDatabaseMigration.test.ts --runInBand`.

### Phase 4: Photo / Media / EXIF Boundary
- Target files: new `src/media/` helpers, compatibility exports under `src/hooks/cameraCapture/`, photo tests.
- Intent: make photo file naming, EXIF writing, stable storage, Android album persistence, and temp cleanup explicit media responsibilities.
- Risk: changing destination paths, album behavior, saved image display compatibility, or GPS EXIF privacy behavior.
- Verification: `npm test -- tests/photoStorage.test.ts tests/photoExif.test.ts --runInBand`.

### Phase 5: AI Input Assist Boundary
- Target files: `src/hooks/cameraCapture/useMealInputAssist.ts`, new helpers under `src/ai/mealInputAssist/`, AI tests.
- Intent: keep the hook as UI bridge state and move request/environment/progress/prepared-photo/applied-metadata helper logic into testable modules.
- Risk: disabled reason drift, accidental mock/noop fallback, raw AI output logging, duplicate execution, prewarm/request sharing, or cleanup drift.
- Verification: `npm test -- tests/useMealInputAssist.test.ts tests/mealInputAssistModelInstaller.test.ts tests/mealInputAssistRuntime.test.ts --runInBand`.

### Phase 6: Navigation / Detail Route
- Target files: `src/navigation/RootNavigator.tsx`, `src/navigation/types.ts`, Records/Search/detail tests.
- Intent: move `MealDetail` to a root stack so Records/Search can open the same detail screen without forcing Search through the Records tab.
- Risk: save-after-capture Records navigation, Records detail navigation, Search back behavior, and type drift.
- Verification: `npm test -- tests/RecordsScreen.test.tsx tests/SearchScreen.test.tsx tests/MealDetailScreen.test.tsx --runInBand`.

### Phase 7: Tests / Docs / Context Map
- Target files: canonical docs and any tests/import paths touched by earlier phases.
- Intent: reflect the new structure in docs, mark completed improvements, and run final gates.
- Risk: docs claiming planned behavior as current behavior, stale context-map paths, or overlooked sensitive logging.
- Verification: full final gate from the user request.

## Phase Completion Log

### Phase 1
- Status: complete.
- Behavior change: none; documentation-only inventory.
- Verification: document created; no code verification needed.
- Remaining risks: subsequent phases must preserve existing uncommitted Camera/Search changes.

### Phase 2
- Status: complete.
- Target files: `src/hooks/cameraCapture/useCameraCapture.ts`, `captureReviewState.ts`, `photoAcquisition.ts`, `photoSavePermission.ts`, `locationSnapshot.ts`, `tempFiles.ts`, `capturePhotoPersistence.ts`, `mediaLibrarySave.ts`, `captureSaveWorkflow.ts`.
- Changes: `useCameraCapture` now delegates review-state creation, photo acquisition, Android photo-save permission, location snapshot, resize/persist, media-library save, temp cleanup, and save workflow to focused helpers while preserving its public return shape.
- Behavior change: none intended.
- Verification: `npm test -- tests/useCameraCapture.test.ts --runInBand` passed.
- Remaining risks: broader Camera screen tests still need to run after later import/doc updates.

### Phase 3
- Status: complete.
- Target files: `src/database/services/MealService.ts`, `src/domain/meals/defaults.ts`, `search.ts`, `statistics.ts`, `mealRow.ts`.
- Changes: default meal naming, nearby location reuse, search text/filtering/sort, statistics ranking, and row normalization now live in focused domain helpers. `MealService` remains the DB orchestration API.
- Behavior change: none intended.
- Verification: `npm test -- tests/MealService.test.ts tests/localDatabaseMigration.test.ts --runInBand` passed.
- Remaining risks: final type-check should confirm exported `SearchFilters` / `StatisticsSummary` compatibility across screens.

### Phase 4
- Status: complete.
- Target files: `src/media/photoExif.ts`, `src/media/photoStorage.ts`, `src/media/tempFiles.ts`, compatibility exports in `src/hooks/cameraCapture/`, photo tests.
- Changes: photo filename generation, EXIF writing, stable storage, Android album save, and temp cleanup now live under `src/media/`. Camera capture helpers import the media boundary directly.
- Behavior change: none intended.
- Verification: `npm test -- tests/photoStorage.test.ts tests/photoExif.test.ts tests/useCameraCapture.test.ts --runInBand` passed.
- Remaining risks: final doc updates must point future storage work to `src/media/`.

### Phase 5
- Status: complete.
- Target files: `src/hooks/cameraCapture/useMealInputAssist.ts`, `src/ai/mealInputAssist/request.ts`, `environment.ts`, `progress.ts`, `preparedPhoto.ts`, `appliedMetadata.ts`, `suggestionDiagnostics.ts`.
- Changes: request construction, environment loading, progress snapshots, analysis-photo preparation/cleanup, applied metadata merge, and candidate diagnostics now live outside the UI hook.
- Behavior change: none intended.
- Verification: `npm test -- tests/useMealInputAssist.test.ts tests/mealInputAssistModelInstaller.test.ts tests/mealInputAssistRuntime.test.ts --runInBand` passed.
- Remaining risks: final sensitive-log search should confirm no raw AI output, photo URI, or location details are logged.

### Phase 6
- Status: complete.
- Target files: `src/navigation/RootNavigator.tsx`, `src/navigation/types.ts`, `src/screens/RecordsScreen/RecordsScreen.tsx`, `src/screens/SearchScreen/SearchScreen.tsx`, `src/screens/RecordsScreen/MealDetailScreen.tsx`, related tests.
- Changes: `MealDetail` is now a root stack route above `MainTabs`; Records and Search both navigate directly to `MealDetail` with the current ordered meal context.
- Behavior change: Search no longer switches into the Records tab before opening detail; back returns to Search context.
- Verification: `npm test -- tests/RecordsScreen.test.tsx tests/SearchScreen.test.tsx tests/MealDetailScreen.test.tsx --runInBand` passed.
- Remaining risks: final app-wide type-check should confirm navigator param compatibility.

### Phase 7
- Status: complete.
- Target files: `README.md`, `docs/index.md`, `docs/engineering/codex-context-map.md`, `docs/architecture/tech-spec.md`, `docs/domain/database-design.md`, `docs/engineering/coding-standards.md`, `docs/engineering/immediate-improvements.md`, `docs/ux/screen-designs.md`, `docs/ux/user-flows.md`, related tests/import paths.
- Changes: canonical docs now describe `src/domain/meals/`, `src/media/`, the thinner camera/AI hooks, and root-level `MealDetail` routing. Completed immediate-improvement items were marked done after verification.
- Behavior change: none beyond the intentional Phase 6 Search detail route change.
- Verification: `npm run lint`, `npm run type-check`, `npm test -- --runInBand`, `npm run check:react-versions`, `npm run check:deps`, and `bash scripts/check-doc-drift.sh` passed. Sensitive-log search for photo URI, location, and raw AI output logging returned no matches.
- Remaining risks: real-device camera capture, Android album save, iOS/Android permission prompts, and back navigation smoke testing were not run in this environment.
