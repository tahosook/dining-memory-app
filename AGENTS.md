# AGENTS.md

## Purpose
This repository uses this file as the first stop for Codex and any other agentic workflow.
Read this file first, then follow [docs/index.md](docs/index.md) to the relevant canonical document.

## Read Order
1. [AGENTS.md](AGENTS.md)
2. [docs/index.md](docs/index.md)
3. [README.md](README.md) when you need setup, scripts, or project-level onboarding
4. The category-specific canonical doc for the task
5. The source files that implement the behavior

## Canonical Document Map
- Repository setup and scripts: [README.md](README.md)
- Product overview: [docs/product/overview.md](docs/product/overview.md)
- Architecture and runtime assumptions: [docs/architecture/tech-spec.md](docs/architecture/tech-spec.md)
- Data model and storage: [docs/domain/database-design.md](docs/domain/database-design.md)
- UX and screen behavior: [docs/ux/screen-designs.md](docs/ux/screen-designs.md)
- User journeys and exception flows: [docs/ux/user-flows.md](docs/ux/user-flows.md)
- Coding rules: [docs/engineering/coding-standards.md](docs/engineering/coding-standards.md)
- Codex work process: [docs/engineering/codex-workflow.md](docs/engineering/codex-workflow.md)
- Change history and incident notes: [docs/notes/](docs/notes/)

## Documentation Rules
- One document, one responsibility.
- Start every canonical doc with a short metadata block:
  - purpose
  - audience
  - update trigger
  - related docs
- Put each topic in exactly one canonical home.
- Link to related docs instead of repeating the same content.
- If a document becomes obsolete, mark it `deprecated` or move it to `docs/notes/`.
- When adding or renaming a canonical doc, update both `docs/index.md` and `README.md`.
- Keep the title short and category-based.
- Use Japanese for project-facing content unless English is clearly better for code or external APIs.

## Placement Rules
- Product, scope, and roadmap belong in `docs/product/`.
- Architecture, dependencies, and non-functional decisions belong in `docs/architecture/`.
- Schema, tables, and storage rules belong in `docs/domain/`.
- Screens, states, and UI behavior belong in `docs/ux/`.
- Implementation rules, conventions, and agent workflow belong in `docs/engineering/`.
- Historical fixes, investigations, and temporary notes belong in `docs/notes/`.

## Codex Working Rules
- Keep each task focused on one primary outcome.
- Inspect before editing.
- Read the relevant existing implementation pattern before introducing a new one.
- Keep diffs small and local.
- Do not mix unrelated cleanup or refactors into a behavior change unless the task explicitly asks for it.
- Preserve user changes unless explicitly asked to replace them.
- Update tests and docs when behavior changes.
- Prefer the current source of truth in `src/` and canonical docs over deprecated or historical docs.
- If a change touches product, UX, data, or engineering conventions, update the matching canonical doc in the same task.
- Verify AI-generated code before trusting it.
- Treat automated review as support, not as a replacement for human judgment.
- Consider `npm run check:deps` whenever dependencies are added or reorganized.
- When `package.json`, `package-lock.json`, or CI runtime assumptions change, verify `npm ci` and keep `README.md` and `.github/workflows/ci.yml` aligned in the same task.

## New Document Template
Use this structure for new docs when practical:

```md
# Title

## Meta
- Purpose:
- Audience:
- Update trigger:
- Related docs:

## Summary
## Current State
## Decisions / Rules
## Next Steps or Open Questions
```

## Doc Hygiene
- Avoid duplicating the same table, flow, or rule in multiple places.
- Use links for cross references.
- If a section is only relevant for a past incident, keep it in `docs/notes/`.
- If the same content appears in README and a canonical doc, keep the canonical doc as the detailed version and the README as the pointer.
