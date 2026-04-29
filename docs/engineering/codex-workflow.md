# Codex Workflow

## Meta
- Purpose: define how Codex should work in this repository.
- Audience: Codex and any agentic coding workflow.
- Update trigger: when the team changes how it wants agents to read, edit, or verify work.
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/engineering/codex-context-map.md](codex-context-map.md), [docs/index.md](../index.md), [docs/engineering/coding-standards.md](coding-standards.md)

## Workflow
1. Read `AGENTS.md`.
2. Open `docs/engineering/codex-context-map.md`.
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

## Prohibited Shortcuts
- Do not delete, skip, or weaken failing tests just to make the task pass.
- Do not mix unrelated refactors into a targeted feature or bug fix.
- Do not add a new dependency if the existing stack already solves the problem well enough.
- Do not leave broad debug logging in production-like application code.

## Verification Rules
- Run the most relevant checks for the change.
- For behavior changes, verify the affected path with tests.
- For type or interface changes, run type checking or the narrowest equivalent validation.
- For docs-only changes, confirm links and structure are correct.

## Review Gate
- Standard gate for code changes: `npm run lint`, `npm run type-check`, `npm test`.
- The same standard gate should stay mirrored in GitHub Actions CI for `main` pushes and pull requests.
- Add `npm run check:deps` when dependencies are added, removed, or significantly reorganized.
- If `package.json`, `package-lock.json`, or `.github/workflows/ci.yml` changes, run `npm ci` before finishing the task.
- If dependency install only passes on a different Node/npm version than CI, update the CI runtime and the setup docs in the same task or regenerate the lockfile for the existing CI version.
- Use the narrowest useful verification first, but do not skip the standard gate for meaningful behavior changes.
- Add a security review pass when changes touch permissions, file storage, location, export, backup, or external AI calls.

## When to Run What
- Docs-only changes: verify links, filenames, and document consistency.
- Type or interface changes: run `npm run type-check`.
- Behavior changes: run `npm test`, and run `npm run lint` if touched files include application code.
- Dependency changes: run `npm run check:deps` and review the dependency choice directly.
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
- If the way Codex should work changes, update this file and `AGENTS.md`.
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
