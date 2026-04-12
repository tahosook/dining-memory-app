# User Flows

## Meta
- Purpose: describe how people move through the app.
- Audience: product, UX, and engineering contributors.
- Update trigger: flow changes, exception handling changes, or new tab behavior.
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/index.md](../index.md), [docs/ux/screen-designs.md](screen-designs.md)

## Primary Flow: Capture a Meal
1. Open the app.
2. Land on Camera.
3. Capture a photo.
4. Review the captured image and enter meal details.
5. Edit the meal details if needed.
6. Save the record only after the image is persisted locally.
7. Optionally continue capturing or jump to Records.

## Browse Flow
1. Open Records.
2. Browse the grouped list, which refreshes when the tab becomes active again.
3. Open a record card.
4. Edit or delete the record.

## Search Flow
1. Open Search.
2. Enter text or select filters.
3. Review the result list, which reruns with the current query when the tab regains focus.
4. Open a record or refine the search.

## Stats Flow
1. Open Stats.
2. Review the latest saved summary cards.
3. Revisit the tab to see refreshed totals after new captures or edits.

## Settings Flow
1. Open Settings.
2. Review privacy guidance, current feature scope, and app info.
3. Optionally delete local data.

## Onboarding Flow
1. First launch shows a short welcome and the app's basic value.
2. Explain camera permission before requesting it.
3. Explain that location is optional and can be enabled later.
4. Keep the initial tutorial short, skippable, and centered on capture, review, and revisit.
5. End onboarding by guiding the user into the first capture action.

## Exception Flows
- Permission denied: explain why the permission is needed and give a way forward.
- Capture failure: let the user retry or return to the camera.
- Local persistence failure: do not create the meal record and show a retry path.
- Delete action: confirm destructive changes before applying them.

## UX Rules
- Keep capture and save fast.
- Prefer clear recovery options over dead ends.
- Do not hide the path back to the main capture loop.
- Make onboarding, help, and recovery guidance available without forcing a long tutorial.
- Keep accessibility support aligned with the main flow, including clear labels, large tap targets, and support for assistive technologies.
