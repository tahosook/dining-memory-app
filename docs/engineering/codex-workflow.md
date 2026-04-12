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

## Review Gate
- Standard gate for code changes: `npm run lint`, `npm run type-check`, `npm test`.
- Add `npm run check:deps` when dependencies are added, removed, or significantly reorganized.
- Use the narrowest useful verification first, but do not skip the standard gate for meaningful behavior changes.

## When to Run What
- Docs-only changes: verify links, filenames, and document consistency.
- Type or interface changes: run `npm run type-check`.
- Behavior changes: run `npm test`, and run `npm run lint` if touched files include application code.
- Dependency changes: run `npm run check:deps` and review the dependency choice directly.

## AI-specific Risks
- Hallucinated APIs or unsupported library behavior.
- Code that technically runs but does not match the intended behavior.
- Duplicate helpers, dead abstractions, or unused branches left by generated code.
- Missing regression coverage or tests that were weakened to avoid failures.
- Security, maintenance, or license issues introduced through new dependencies.
- False confidence from automated review without human inspection.

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
- Verify AI-generated code before trusting it.
- Use human review to supplement automated review and test output.
