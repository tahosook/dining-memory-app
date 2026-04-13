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
4. Open a result card to review the saved details.
5. Edit or delete the record, or refine the search and try again.

## Stats Flow
1. Open Stats.
2. Review the latest saved summary cards.
3. Revisit the tab to see refreshed totals after new captures or edits.
4. If refresh fails, retry without losing the previous summary when it is already available.

## Settings Flow
1. Open Settings.
2. Review privacy guidance, current feature scope, and app info.
3. Optionally delete local data.

## Camera Permission Flow
1. Open the Camera tab.
2. If camera permission is still undetermined, show a short explanation before requesting it.
3. Request camera permission only after the user taps the explicit CTA.
4. If permission is denied, explain that the user can recover through the system settings screen.
5. Once permission is granted, return directly to the normal capture flow.

## Exception Flows
- Permission denied: explain why the permission is needed and provide a recovery path through system settings.
- Capture failure: let the user retry or return to the camera.
- Local persistence failure: do not create the meal record and show a retry path.
- Search refresh failure: keep the last successful results when possible and show a retry action.
- Stats refresh failure: keep the last successful summary when possible and show a retry action.
- Delete action: confirm destructive changes before applying them.

## UX Rules
- Keep capture and save fast.
- Prefer clear recovery options over dead ends.
- Do not hide the path back to the main capture loop.
- Keep permission, help, and recovery guidance available without forcing a long tutorial.
- Keep accessibility support aligned with the main flow, including clear labels, large tap targets, and support for assistive technologies.
