# Development Workflow

## Meta
- Purpose: define how developers and AI agents should work in this repository.
- Audience: developers, AI agents, and code reviewers.
- Update trigger: when the team changes how developers or AI agents should read, edit, or verify work.
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/engineering/context-map.md](context-map.md), [docs/index.md](../index.md), [docs/engineering/coding-standards.md](coding-standards.md)

## Workflow
1. Read `AGENTS.md`.
2. Open `docs/engineering/context-map.md`.
3. Open `docs/index.md` only when you need the broader documentation map.
4. Read the smallest set of docs, source files, and tests needed for the task.
5. Confirm the source of truth for the area you are changing.
6. Inspect the relevant source files before editing.
7. Identify at least one existing implementation pattern to follow when possible.
8. Make the smallest safe change that solves the problem.
9. Update tests and documentation when behavior changes.
10. Verify the result.

## Task Shape
- Prefer bounded tasks with one clear outcome.
- Keep one task focused on one primary purpose.
- If a task spans product, UX, and implementation, resolve the docs first and then edit code.
- Avoid mixing unrelated changes in one pass.
- Separate behavior changes from cleanup-only changes unless combining them clearly reduces risk.

## Issue and Task Tracking Policy
To prevent double-maintenance overhead and synchronization drift between GitHub Issues and the codebase, follow the three-tier tracking model:

1. **Three-Tier Tracking Model**:
   - **Candidate Index ([TASKS.md](../../TASKS.md))**: lightweight index of immediate (`Now`), planned (`Next`), and triggered (`Later`) tasks. Used to prioritize work without reading the entire repository.
   - **Specification & Acceptance Criteria ([docs/issues/](../issues/) and [docs/notes/](../notes/))**: single source of truth for technical specifications, investigation benchmarks, and acceptance criteria. Version-controlled directly alongside source code.
   - **Ticket Lifecycle & Automation (GitHub Issues)**: tracks open/closed lifecycle, assignees, milestones, and pull request linkages.

2. **Thin GitHub Issues**:
   - When opening a GitHub Issue, keep the issue body thin: state the high-level objective and link directly to the corresponding `docs/issues/issue-XX-xxx.md` file.
   - Do not copy-paste detailed acceptance checklists into GitHub Issues to avoid synchronization drift.

3. **PR Linkage & Auto-Close (`Closes` vs. `Refs`)**:
   - **Full Resolution PRs**: When a PR completely resolves an issue, declare `Closes #<issue-number>` (or `Fixes #<issue-number>`) so merging automatically closes the GitHub Issue.
   - **Investigation & Multi-Phase PRs**: When a PR covers an investigation spike, a partial milestone, or a parent issue that spawns child implementation issues (e.g., investigation Issue #75 spawning implementation Issues #86, #87, #88), use `Refs #<issue-number>` or `Relates to #<issue-number>` instead. Do **not** use `Closes` unless the issue is explicitly intended to close upon merge.

4. **Synchronous Ledger Updates**:
   - In the same PR that implements or completes the task, update:
     - [TASKS.md](../../TASKS.md): move the task from `Now` to `Done / Historical Notes`.
     - `docs/issues/issue-XX.md`: update status to closed, mark acceptance checkboxes `[x]`, and record the PR number.

5. **Future-Triggered Tasks (`Later`)**:
   - Tasks awaiting future trigger conditions (e.g., Issue #80 Keyset pagination or Issue #81 composite index awaiting 10,000 records) remain classified as `Later / Future-triggered`.
   - On GitHub, tag these issues with `later` or `future-triggered` to keep the active backlog clean.

6. **ID Distinction Rule (Internal Doc ID vs. GitHub Issue Number)**:
   - The sequence number in `docs/issues/issue-XX-*.md` (`XX`) is an internal repository document ID, **not** the GitHub Issue number.
   - For example, `issue-01` maps to GitHub Issue #73, and `issue-12` is an internal document ID where the corresponding GitHub Issue is not yet filed (unrelated to GitHub PR/Issue #12).
   - In all `docs/issues/` headers, explicitly specify both `- **内部ドキュメントID**: issue-XX` and `- **対応 GitHub Issue**: GitHub Issue #YY` (or `未起票`).
   - Always refer to GitHub Issues with the full prefix `GitHub Issue #YY` to prevent AI agents and contributors from conflating internal doc numbers with GitHub issue numbers.

## Before Editing
- Identify the canonical doc and the implementation files that are the source of truth.
- Prefer `src/` and current canonical docs over deprecated docs and historical notes.
- Read the nearest existing pattern before adding a new abstraction, helper, or file shape.
- Reuse an established pattern unless there is a clear reason not to.

## Editing Rules
- Preserve user changes.
- Do not rewrite unrelated files.
- Keep diffs local to the behavior being changed.
- If a doc is now stale, update the canonical doc instead of adding a second copy elsewhere.

## Core Governance Principles
- **自然言語の禁止リスト全廃**: 言い訳で容易にすり抜けられる細かな禁止構文の列挙をやめ、機械判定と客観的証拠にオフロードする（詳細は [.jules/rules.md](../../.jules/rules.md) 参照）。
- **機械的判定への完全オフロード (No machine gate, no trust)**: 差分ゼロ、新規 `any`、エスケープハッチ（`@ts-ignore` 等）、テスト削除、PR本文の Evidence 欠落などは `scripts/verify-pr-gates.sh` および CI で物理的に遮断する。
- **客観的証拠の義務化 (No evidence, no PR)**: 具体的課題と客観的証拠（失敗テスト、実測値、EXPLAIN 結果等）が示されない PR は起票しない。
- **「変更しないこと」の成功定義 (No actionable finding, stop)**: 調査の結果、対処すべき問題がなければ無理にコード変更を捏造せず、レポートを残して「変更なし」で終了することを成功とする。

## PR Eligibility Criteria
- **Problem**: 現行コードベースにおける具体的な事実（破損、脆弱性、測定されたボトルネック、明示された要件）。
- **Evidence**: 客観的証拠（失敗テストログ、実測ベンチマーク、EXPLAIN 結果等）。
- **Scope**: 課題解決に直結する最小限の変更（スコープ外の周辺コードを触らない）。

## Verification Rules
- Run the most relevant checks for the change.
- For behavior changes, verify the affected path with tests.
- For type or interface changes, run type checking or the narrowest equivalent validation.
- For docs-only changes, confirm links and structure are correct.

## Review Gate
- Standard gate for code changes: `npm run lint`, `npm run type-check`, `npm test` (CI runs `test:coverage`).
- Machine gate for PRs: `npm run verify:pr-gates` (`bash scripts/verify-pr-gates.sh`). Automatically enforced in CI for pull requests.
- The same standard gate should stay mirrored in GitHub Actions CI for `main` pushes and pull requests.
- Add `npm run check:deps` and `npm run check:react-versions` when dependencies are added, removed, or reorganized. Follow [docs/engineering/dependency-policy.md](dependency-policy.md).
- If native dependencies (Tier 1) or Expo SDK change, run `npm run build:android:debug` locally (Jest tests pass via mocks and do not guarantee native compatibility). In CI, the `native-build` job automatically runs `build:android:debug` when native-sensitive files change.
- If `package.json`, `package-lock.json`, or `.github/workflows/ci.yml` changes, run `npm ci` before finishing the task.
- If dependency install only passes on a different Node/npm version than CI, update the CI runtime and the setup docs in the same task or regenerate the lockfile for the existing CI version.
- Use the narrowest useful verification first, but do not skip the standard gate for meaningful behavior changes.
- Add a security review pass when changes touch permissions, file storage, location, export, backup, or external AI calls.
- Run `npm run check:docs` when a task changes AI input assist, MediaPipe labeling, Records, Search, Stats, Settings, storage, runtime assumptions, or documentation about current behavior.

## Doc Sync Gate
- Before editing, identify the source area and the canonical docs that describe it.
- After editing source, check the matching canonical docs even if the task did not explicitly ask for docs.
- If source changed but docs did not, state why the current docs still match.
- If docs changed but source did not, verify the docs describe current behavior and not a planned or historical behavior.
- Use [docs/engineering/context-map.md](context-map.md) to choose the smallest doc set to check.
- Refer to `Doc Sync Targets` in [docs/engineering/context-map.md](context-map.md) for the exact mapping between source areas and canonical docs.
- Treat `docs/deprecated/` and `docs/working/` as history; do not use them as proof of current behavior.
- Keep historical notes explicit when they mention old behavior.
- For current-behavior drift phrases, run `npm run check:docs` and review any matches before finishing.

## When to Run What
- Docs-only changes: verify links, filenames, and document consistency.
- Type or interface changes: run `npm run type-check`.
- Behavior changes: run `npm test`, and run `npm run lint` if touched files include application code.
- Dependency changes: run `npm run check:deps`, `npm run check:react-versions`, and follow [docs/engineering/dependency-policy.md](dependency-policy.md). If native modules (Tier 1) change, also run `npm run build:android:debug`.
- Dependency or CI runtime changes: run `npm ci` and confirm `README.md` and `.github/workflows/ci.yml` still describe the same runtime expectation.
- Permission, export, backup, location, file, or external-send changes: confirm what data is accessed, stored, logged, or sent.

## AI-specific Risks
- Hallucinated APIs or unsupported library behavior.
- Code that technically runs but does not match the intended behavior.
- Duplicate helpers, dead abstractions, or unused branches left by generated code.
- Missing regression coverage or tests that were weakened to avoid failures.
- Security, maintenance, or license issues introduced through new dependencies.
- False confidence from automated review without human inspection.

## Security-specific Risks
- Secrets committed to code, examples, or debug output.
- Personal data exposed through logs, alerts, exports, or notes.
- Permissions requested earlier or more broadly than the feature requires.
- External transmission introduced without a clear user-facing explanation.
- Backup or export flows exposing more data than the user expects.

## Documentation Update Rules
- Keep `README.md` as an onboarding entry point; move detailed operational rules to the matching canonical document and link to it.
- Mark historical plans or improvement notes as stale, done, or obsolete when implementation catches up so they are not mistaken for current rules.
- If product scope changes, update `docs/product/overview.md`.
- If a screen or interaction changes, update `docs/ux/*`.
- If schema or storage changes, update `docs/domain/database-design.md`.
- If coding conventions change, update `docs/engineering/coding-standards.md`.
- If the development workflow changes, update this file and `AGENTS.md`.
- If a change affects permissions, local storage, export, backup, or external data transfer, update `docs/architecture/tech-spec.md`.
- If a change touches photo paths, location, notes, raw AI output, export, or sharing, verify production-like logs do not expose sensitive user data.

## Definition of Done
- Summarize what changed.
- List the files touched.
- State what was verified.
- Call out any risks or follow-up work that remains.
- Make any unverified assumptions explicit.

## Good Defaults
- Keep prompts and task descriptions specific.
- Prefer existing patterns in the repo.
- Treat the canonical docs as the source of truth.
- Verify AI-generated code before trusting it.
- Use human review to supplement automated review and test output.
