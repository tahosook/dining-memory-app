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
- Split large screens into presentational UI and container logic when permission handling, loading states, or side effects start to obscure the screen structure.
- Use `StyleSheet.create` for styles unless a component already has a clear exception.
- Prefer `async` / `await` over long Promise chains for app-side asynchronous flows.
- Clean up subscriptions and effects.
- Respect platform-specific behavior without splitting the whole codebase unnecessarily.
- Keep permission, loading, empty, and error states explicit in the rendered UI.

## Data and Navigation Rules
- Keep database operations inside the database service layer.
- Keep navigation definitions in one place per navigator.
- Use the tab shell as the main app structure.
- Preserve the camera-first flow as the default user path.
- Add an error boundary or equivalent recovery path around app-level UI where an uncaught render failure would otherwise blank the experience.

## Security Basics
- Do not commit API keys, tokens, or other credentials to the repository.
- Treat photo paths, notes, location data, and exported records as sensitive user data.
- Request camera, photo, and location permissions only when the feature actually needs them.
- Do not add new OS permissions without documenting the feature need, data stored, and user value.
- Keep local storage minimal: store only data needed for the user-facing feature or an explicitly planned capability.
- Do not log secrets, photo URIs, location data, full search text, or raw AI output in production-like code.
- If external AI, backup, or export behavior is added, make data transfer explicit and opt-in by default.
- Prefer existing platform or project capabilities before adding security-related dependencies with broad native access.

## Change Discipline
- Prefer the existing naming, structure, and abstraction style before inventing a new one.
- Add a new abstraction only when it clearly improves reuse, clarity, or isolation.
- Avoid one-off helpers and wrapper layers that make the code harder to trace.
- Keep behavior changes, cleanup changes, and formatting changes separate when possible.
- Make the changed path easier to understand, not just different.

## Testing Rules
- Add or update tests when behavior changes.
- Prefer focused tests for logic, screen state, and navigation behavior.
- Keep the capture, analyze, edit, save, search, and destructive-action flows covered across unit, integration, or device-level checks as the change requires.
- Mock dependencies at the boundary, not deep inside the component tree.
- A bug fix is not complete until the regression path is covered.

## AI-generated Code Review
- Treat AI-generated code as a draft, not as trusted output.
- Check that the implementation matches the requested behavior, not just the prompt wording.
- Prefer code that follows the existing architecture over code that introduces a new pattern for convenience.
- Reject code that adds duplicate logic, dead abstractions, or helpers that are only used once without a clear benefit.
- Watch for hallucinated APIs, imports, config keys, and library features.
- Do not accept code that removes, skips, or weakens tests just to make the change pass.
- When dependencies change, review maintenance status, security impact, license fit, and whether an existing dependency already solves the problem.
- If generated code is harder to read than a direct hand-written version, simplify it before merging.

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
- Did the code introduce any nonexistent or suspicious APIs, imports, or configuration?
- Did the change add a dependency, and if so, was that dependency reviewed?
- Were any tests removed, skipped, or weakened to make the change pass?
- Was the final result reviewed by a human instead of trusting the generated diff on its own?
- Did the change add or widen access to camera, photos, location, files, backup, or export behavior?
- Does the change store or log more personal data than the feature actually needs?
- Did the change stay focused on the intended task instead of drifting into cleanup or redesign?
- Did the implementation reuse an existing pattern where one already existed?
- Did the change avoid adding new abstractions or debug logs without a clear need?
