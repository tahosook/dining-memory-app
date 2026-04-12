# Coding Standards

## Meta
- Purpose: define implementation conventions for this app.
- Audience: anyone writing or reviewing code in this repo.
- Update trigger: architecture changes, file layout changes, or repeated code review issues.
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/index.md](../index.md), [docs/engineering/codex-workflow.md](codex-workflow.md)

## Core Principles
- Single responsibility first.
- Prefer clarity over cleverness.
- Keep platform differences isolated.
- Favor testable, side-effect-light code.
- Use TypeScript to make invalid states harder to express.

## Project Layout Expectations
- `src/screens/` for screen-level UI and screen composition.
- `src/components/` for reusable presentational components.
- `src/hooks/` for stateful or reusable application logic.
- `src/database/` for schema, models, and database services.
- `src/navigation/` for route and tab definitions.
- `src/constants/` for shared constants.
- `src/types/` for app-wide TypeScript types.

## TypeScript Rules
- Avoid `any`.
- Prefer explicit interfaces and literal unions.
- Model nullable data intentionally.
- Keep props small and readable.
- Make return types obvious when a function is reused in more than one place.

## React Native Rules
- Keep screens thin and move business logic into hooks or services.
- Use `StyleSheet.create` for styles unless a component already has a clear exception.
- Clean up subscriptions and effects.
- Respect platform-specific behavior without splitting the whole codebase unnecessarily.

## Data and Navigation Rules
- Keep database operations inside the database service layer.
- Keep navigation definitions in one place per navigator.
- Use the tab shell as the main app structure.
- Preserve the camera-first flow as the default user path.

## Testing Rules
- Add or update tests when behavior changes.
- Prefer focused tests for logic, screen state, and navigation behavior.
- Mock dependencies at the boundary, not deep inside the component tree.
- A bug fix is not complete until the regression path is covered.

## Naming Rules
- Components: `PascalCase`.
- Hooks: `useCamelCase`.
- Services and utilities: descriptive, lowercase file names.
- Constants: uppercase with underscores when shared broadly.
- Keep terms consistent across docs, code, and tests.

## Review Checklist
- Is the change as small as it can be?
- Is the logic easy to trace?
- Are tests updated?
- Did the change introduce duplicated knowledge?
- Did the implementation stay consistent with the existing app shape?
