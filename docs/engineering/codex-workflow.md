# Codex Workflow

## Meta
- Purpose: define how Codex should work in this repository.
- Audience: Codex and any agentic coding workflow.
- Update trigger: when the team changes how it wants agents to read, edit, or verify work.
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/index.md](../index.md), [docs/engineering/coding-standards.md](coding-standards.md)

## Workflow
1. Read `AGENTS.md`.
2. Open `docs/index.md`.
3. Read the smallest set of canonical docs needed for the task.
4. Inspect the relevant source files before editing.
5. Make the smallest safe change that solves the problem.
6. Update tests and documentation when behavior changes.
7. Verify the result.

## Task Shape
- Prefer bounded tasks with one clear outcome.
- If a task spans product, UX, and implementation, resolve the docs first and then edit code.
- Avoid mixing unrelated changes in one pass.

## Editing Rules
- Preserve user changes.
- Do not rewrite unrelated files.
- Keep diffs local to the behavior being changed.
- If a doc is now stale, update the canonical doc instead of adding a second copy elsewhere.

## Verification Rules
- Run the most relevant checks for the change.
- For behavior changes, verify the affected path with tests.
- For type or interface changes, run type checking or the narrowest equivalent validation.
- For docs-only changes, confirm links and structure are correct.

## Documentation Update Rules
- If product scope changes, update `docs/product/overview.md`.
- If a screen or interaction changes, update `docs/ux/*`.
- If schema or storage changes, update `docs/domain/database-design.md`.
- If coding conventions change, update `docs/engineering/coding-standards.md`.
- If the way Codex should work changes, update this file and `AGENTS.md`.

## Output Expectations
- Summarize what changed.
- List the files touched.
- State what was verified.
- Call out any risks or follow-up work that remains.

## Good Defaults
- Keep prompts and task descriptions specific.
- Prefer existing patterns in the repo.
- Treat the canonical docs as the source of truth.
