# Documentation Index

## Meta
- Purpose: entry point for reading and maintaining project documentation.
- Audience: Codex, contributors, and future maintainers.
- Update trigger: add, rename, or deprecate any canonical document.
- Related docs: [AGENTS.md](../AGENTS.md)

## Read First
1. [AGENTS.md](../AGENTS.md)
2. This index
3. The document that matches the task category

## Canonical Docs

### Repository
- [README.md](../README.md): setup, scripts, and high-level onboarding.

### Product
- [Overview](./product/overview.md): product vision, target user, MVP scope, and non-goals.

### Architecture
- [Tech Spec](./architecture/tech-spec.md): current stack, runtime assumptions, and app-level architecture.

### Domain
- [Database Design](./domain/database-design.md): current schema, table responsibilities, and storage rules.

### UX
- [Screen Designs](./ux/screen-designs.md): screen structure, states, and interaction details.
- [User Flows](./ux/user-flows.md): main journeys, exception flows, and UX rules.

### Engineering
- [Coding Standards](./engineering/coding-standards.md): code-level conventions, review checks, and implementation discipline.
- [Codex Workflow](./engineering/codex-workflow.md): task flow, verification, prohibited shortcuts, and definition of done.

### Notes
- [notes/](./notes/): temporary investigations, incident follow-ups, and one-off fixes.

## Writing Rules
- Put each topic in one canonical document only.
- Prefer links over repetition.
- If you create a new canonical doc, add it here and in `README.md`.
- If a document is temporary or historical, place it under `docs/notes/` and mark it clearly.

## Suggested Reading Paths
- New feature work: Product -> UX -> Domain -> Engineering
- Bug fix: Engineering -> relevant UX or Domain doc -> notes if needed
- Refactor: Engineering -> Architecture -> relevant implementation files
