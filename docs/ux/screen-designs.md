# Screen Designs

## Meta
- Purpose: define what each screen shows and how it behaves.
- Audience: engineers and designers working on the mobile UI.
- Update trigger: layout, interaction, or screen-state changes.
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/index.md](../index.md), [docs/ux/user-flows.md](user-flows.md)

## Navigation Shell
- Bottom tabs: Camera, Records, Search, Stats, Settings.
- Camera is the primary entry point.
- Other screens should stay lightweight and support the main capture-and-review loop.

## Camera Screen
- Main area: live camera preview.
- Top area: close and camera-flip actions.
- Bottom area: shutter and capture guidance.
- States to support: permission denied, taking photo, capture review, capture error, and web/mock fallback.
- Before the first permission request, show a short explanation card and ask for permission only from an explicit CTA.
- If permission is denied, show a recovery card with a direct path to the system settings screen.
- Capture review should be vertically scrollable and start closer to the top bar so the captured photo and editing area feel like one surface.
- Capture review should show the fields in this order: meal name, cuisine type, homemade flag, location, note.
- Meal name should use a placeholder-only text input labeled `料理名` instead of a separate section label or helper copy.
- Cuisine type should stay visible, but the selector should hide its label inside capture review.
- Homemade should remain visible as a short inline toggle row.
- Location and note should default to compact one-line triggers and swap into inline inputs after a single tap.
- Saved photos should be resized to a practical review size for the device-first experience instead of preserving the original full-resolution capture.
- If Android photo-save permission is missing at save time, keep the review visible and offer an alert-based recovery path to the system settings screen instead of collapsing into a generic save failure.
- After a successful save, close capture review and move directly to Records instead of showing a success modal.

## Records Screen
- Shows meal records grouped by date.
- Card layout should keep the meal name, time, location, and note visible at a glance.
- If a thumbnail is missing, fall back to the saved photo path instead of showing an empty placeholder.
- Tapping a record card should move directly to a dedicated detail screen instead of opening an alert.
- The detail screen should show a visibly larger photo than the list card, preferring `photo_path` over `photo_thumbnail_path`.
- Edit and delete entry points should live on the detail screen.
- The detail screen should also provide an explicit user-triggered share path for posting to X through the OS share sheet.

## Search Screen
- Search bar and filter area should be the first things the user sees.
- Results should remain scannable and support quick refinement.
- The current filters are text, cuisine type, location, and homemade-only.
- Result cards should open the same saved-record detail screen used from Records.
- Use explicit loading, error, and zero-result states, and keep the previous results visible if only a refresh fails.

## Stats Screen
- Use summaries and compact cards instead of dense dashboards.
- Keep insights readable and practical, not decorative.
- The current MVP only shows totals, homemade ratio, favorite cuisine, and favorite location.
- Show explicit loading and retryable error states, while keeping the previous summary visible during refresh failures.

## Settings Screen
- Prioritize privacy, current scope, local data deletion, and app information.
- Keep destructive actions visually separated.

## Shared States
- Empty state: each major screen should explain what is missing and give the next useful action.
- Loading state: show progress without blocking the user longer than necessary.
- Error state: explain what failed, what data is affected, and whether retry or fallback is available.
- Zero-result state: search and filter views should suggest how to broaden or reset the query.

## Accessibility Rules
- Provide clear accessibility labels and hints for camera controls, record cards, and stats summaries.
- Keep tap targets large enough for quick use and dynamic text scaling.
- Preserve readable layouts under larger system font settings.
- Do not rely on color alone to communicate status or destructive intent.

## UI Rules
- Keep tap targets large enough for quick use.
- Favor clear labels over clever wording.
- Use explicit empty, loading, and error states.
- Keep screen behavior aligned with the current implementation before inventing new interactions.
