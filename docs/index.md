# Documentation Index

## Meta
- Purpose: entry point for reading and maintaining project documentation.
- Audience: Codex, contributors, and future maintainers.
- Update trigger: add, rename, or deprecate any canonical document.
- Related docs: [AGENTS.md](../AGENTS.md), [docs/engineering/codex-context-map.md](./engineering/codex-context-map.md)

## Read First
1. [AGENTS.md](../AGENTS.md)
2. [docs/engineering/codex-context-map.md](./engineering/codex-context-map.md)
3. This index when you need the broader documentation map
4. The document that matches the task category

## Reader Paths

### For You
- [docs/product/overview.md](./product/overview.md): 何を作りたいか、誰のためのものか、将来どうしたいか
- [docs/product/progress.md](./product/progress.md): 今どこまでできているか、何が未実装か

### For Implementation
- [docs/engineering/codex-context-map.md](./engineering/codex-context-map.md): task ごとに読むべき最小 context の索引
- [docs/architecture/tech-spec.md](./architecture/tech-spec.md): current implementation and runtime assumptions
- [docs/ux/screen-designs.md](./ux/screen-designs.md): current screen behavior
- [docs/ux/user-flows.md](./ux/user-flows.md): current implemented flows
- [docs/domain/database-design.md](./domain/database-design.md): current storage rules
- [docs/engineering/coding-standards.md](./engineering/coding-standards.md): coding rules
- [docs/engineering/codex-workflow.md](./engineering/codex-workflow.md): verification and workflow
- [docs/engineering/food-labeling-guidelines.md](./engineering/food-labeling-guidelines.md): 食事画像ラベリング用スクリプトの責務、優先度、打ち止めライン
- [docs/engineering/mediapipe-labeling-workflow.md](./engineering/mediapipe-labeling-workflow.md): MediaPipe 用ラベル改善 loop の目的、guardrail、停止条件

## Canonical Docs

### Repository
- [README.md](../README.md): setup, scripts, and high-level onboarding.
- [AGENTS.md](../AGENTS.md): Codex fixed working rules.
- [TASKS.md](../TASKS.md): current task candidates and rough priority.
- [PLANS.md](../PLANS.md): short implementation plans for larger work.

### Product
- [Overview](./product/overview.md): product vision, target user, MVP scope, and non-goals.
- [Progress](./product/progress.md): current implementation progress, available features, and planned next areas.

### Architecture
- [Tech Spec](./architecture/tech-spec.md): current stack, runtime assumptions, and app-level architecture.

### Domain
- [Database Design](./domain/database-design.md): current schema, table responsibilities, and storage rules.

### UX
- [Screen Designs](./ux/screen-designs.md): screen structure, states, and interaction details.
- [User Flows](./ux/user-flows.md): main journeys, exception flows, and UX rules.

### Engineering
- [Codex Context Map](./engineering/codex-context-map.md): task-specific reading map for reducing unnecessary context use.
- [Coding Standards](./engineering/coding-standards.md): code-level conventions, review checks, and implementation discipline.
- [Codex Workflow](./engineering/codex-workflow.md): task flow, verification, prohibited shortcuts, and definition of done.
- [Food Labeling Guidelines](./engineering/food-labeling-guidelines.md): MediaPipe 用ラベル設計と教師データ作成に向けたスクリプト修整の判断ルール.
- [MediaPipe Labeling Workflow](./engineering/mediapipe-labeling-workflow.md): MediaPipe 用ラベル改善 loop の自動化方針、guardrail、停止条件.
- [Immediate Improvements](./engineering/immediate-improvements.md): 今すぐ入れるべき具体的な改善案と優先度.

### Notes
- [notes/](./notes/): temporary investigations, incident follow-ups, and one-off fixes.
- [deprecated/](./deprecated/): retired pre-reorganization documents kept only for historical reference.

## Writing Rules
- Put each topic in one canonical document only.
- Prefer links over repetition.
- If you create a new canonical doc, add it here and in `README.md`.
- If a document is temporary or historical, place it under `docs/notes/` or `docs/deprecated/` and mark it clearly.

## Suggested Reading Paths
- Product direction: Product Overview -> Product Progress
- Current implementation review: Architecture -> UX -> Domain -> Engineering
- New feature work: Product -> UX -> Domain -> Engineering
- Bug fix: Engineering -> relevant UX or Domain doc -> notes if needed
- Refactor: Engineering -> Architecture -> relevant implementation files
