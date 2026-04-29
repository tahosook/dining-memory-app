# Implementation Checklist 2026-04

## Meta
- Purpose: Phase 1-12 の実装進行、検証、commit 状態を追跡する。
- Audience: 実装担当者、レビュー担当者。
- Update trigger: 各 Phase の開始、完了、検証失敗、commit 作成時。
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/engineering/codex-workflow.md](../engineering/codex-workflow.md)

## Summary
- Started: 2026-04-29
- Branch: main
- Rule: 検証が通った Phase だけ commit する。未検証または失敗が残る Phase は commit せず、原因と次アクションを残す。
- Standard gate: `npm run type-check`, `npm run lint`, `npm test -- --runInBand`

## Phase Status
| Phase | Status | Commit | Verification | Notes |
| --- | --- | --- | --- | --- |
| Phase 1: docs operation cleanup | completed | `Phase 1: docs operation cleanup` | `npm run type-check`; `npm run lint`; `npm test -- --runInBand` | Stale plan/docs cleanup and sensitive camera log cleanup verified. |
| Phase 2: update MediaPipe labeling workflow executor policy | completed | `Phase 2: update MediaPipe labeling workflow executor policy` | `npm run type-check`; `npm run lint`; `npm test -- --runInBand` | Local-first nested AI executor policy verified. |
| Phase 3: improve labeling crop diagnostics | completed | `Phase 3: improve labeling crop diagnostics` | `python3 -m unittest scripts.tests.test_compare_labeling_reports`; `python3 -m unittest scripts.tests.test_mediapipe_labeling_loop`; `python3 -m unittest scripts.tests.test_explore_food_labels scripts.tests.test_analyze_food_labels scripts.tests.test_build_review_gallery`; `npm run type-check`; `npm run lint`; `npm test -- --runInBand` | Shared taxonomy, targeted crop policy, normalized repair, crop diagnostics, analysis summary/CSV, and review gallery diagnostics verified. |
| Phase 4: stabilize Android camera preview | pending |  |  |  |
| Phase 5: change AI assist to note drafts | pending |  |  |  |
| Phase 6: prewarm AI input assist runtime | pending |  |  |  |
| Phase 7: simplify settings for users | pending |  |  |  |
| Phase 8: attach photos with Android sharing | pending |  |  |  |
| Phase 9: rename cooking level to homemade style | pending |  |  |  |
| Phase 10: rotate saved meal photos | pending |  |  |  |
| Phase 11: improve stats reflection screen | pending |  |  |  |
| Phase 12: make search photo grid first | pending |  |  |  |

## Verification Log
- Phase 1: `npm run type-check` passed.
- Phase 1: `npm run lint` passed.
- Phase 1: `npm test -- --runInBand` passed.
- Phase 2 implementation started.
- Phase 2: `npm run type-check` passed.
- Phase 2: `npm run lint` passed.
- Phase 2: `npm test -- --runInBand` passed.
- Phase 3 implementation started.
- Phase 3: `python3 -m unittest scripts.tests.test_compare_labeling_reports` passed.
- Phase 3: `python3 -m unittest scripts.tests.test_mediapipe_labeling_loop` passed.
- Phase 3: `python3 -m unittest scripts.tests.test_explore_food_labels scripts.tests.test_analyze_food_labels scripts.tests.test_build_review_gallery` passed.
- Phase 3: `npm run type-check` passed.
- Phase 3: `npm run lint` passed.
- Phase 3: `npm test -- --runInBand` passed.

## Unresolved Issues
- None.
