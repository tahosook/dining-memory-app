# User Flows

## Meta
- Purpose: describe how people move through the app.
- Audience: product, UX, and engineering contributors.
- Update trigger: flow changes, exception handling changes, or new tab behavior.
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/index.md](../index.md), [docs/ux/screen-designs.md](screen-designs.md)

## Primary Flow: Capture a Meal
1. Open the app.
2. Land on Camera.
3. Capture a photo or choose from the gallery.
4. Review the result.
5. Edit the meal details if needed.
6. Save the record.
7. Optionally continue capturing or jump to Records.

## Browse Flow
1. Open Records.
2. Filter by date or browse the grouped list.
3. Open a record card.
4. Edit or delete the record.

## Search Flow
1. Open Search.
2. Enter text or select filters.
3. Review the result list.
4. Open a record or refine the search.

## Stats Flow
1. Open Stats.
2. Choose a time range.
3. Review summaries and patterns.
4. Drill into a detail if needed.

## Settings Flow
1. Open Settings.
2. Review backup, export, privacy, and app info.
3. Change the setting or launch the related action.

## Exception Flows
- Permission denied: explain why the permission is needed and give a way forward.
- Capture failure: let the user retry or return to the camera.
- Analysis fallback: allow manual entry when automatic recognition is not enough.
- Delete action: confirm destructive changes before applying them.

## UX Rules
- Keep capture and save fast.
- Prefer clear recovery options over dead ends.
- Do not hide the path back to the main capture loop.
