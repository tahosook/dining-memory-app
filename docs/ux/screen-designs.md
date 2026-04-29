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
- Capture review should show the photo first, then an optional AI suggestion section, then the fields in this order: meal name, cuisine type, homemade flag, location, note.
- Meal name should use a placeholder-only text input labeled `料理名` instead of a separate section label or helper copy.
- Cuisine type should stay visible, but the selector should hide its label inside capture review.
- Homemade should remain visible as a short inline toggle row.
- Location and note should default to compact one-line triggers and swap into inline inputs after a single tap.
- AI suggestion section should show `未実行 / 解析中 / 成功 / 失敗 / 無効` and keep the save and cancel actions available in every state.
- AI suggestion section の `解析中` では、少なくとも current stage、進捗の目安、経過時間、残り時間の目安を表示する。
- Current visible AI output is a `noteDraft` card, and `メモに追加` should append it to notes only when the user taps the action.
- Meal name / cuisine candidate chips are not part of the current visible Camera UI; MediaPipe or test-only providers may still use those fields behind the provider contract.
- AI suggestion section の `無効` 理由は、少なくとも `設定で未許可` `この build では未対応` `model / projector 未準備` を区別できるようにする。
- capture review を開いたら live camera preview は止め、review 中の端末負荷を抑える。
- AI 入力補助は captured original をそのまま解析せず、端末内で一時的に downsized image を作ってから推論し、終わったら一時 file を片付ける。
- Saved photos should be resized to a practical review size for the device-first experience instead of preserving the original full-resolution capture.
- If Android photo-save permission is missing at save time, keep the review visible and offer an alert-based recovery path to the system settings screen instead of collapsing into a generic save failure.
- After a successful save, close capture review and move directly to Records instead of showing a success modal.

## Records Screen
- Shows meal records grouped by date.
- Card layout should keep the meal name, time, location, cuisine tag, homemade/eating-out tag, and homemade style tag visible when available.
- If a thumbnail is missing, fall back to the saved photo path instead of showing an empty placeholder.
- Tapping a record card should move directly to a dedicated detail screen instead of opening an alert.
- The detail screen should show a visibly larger photo than the list card, preferring `photo_path` over `photo_thumbnail_path`.
- The detail screen should show meal details including cuisine, note, homemade/eating-out type, and homemade style.
- Edit and delete entry points should live on the detail screen.
- The detail edit modal should show the saved photo, allow a user-triggered right 90-degree rotation that updates the saved image file, and expose homemade style when the record is homemade.
- The detail screen should also provide an explicit user-triggered share path for posting to X through the OS share sheet.

## Search Screen
- Search bar should be the first thing the user sees; optional filters stay collapsed behind a compact conditions toggle.
- Text input changes should automatically refresh search results with a short debounce; there is no separate search button.
- Results should browse like a photo-first three-column grid, using thumbnails before full photo paths.
- The current optional filters are cuisine type, location, and homemade-only.
- Search は current text/filter match だけを使い、semantic search は current scope に含めない。
- Result cards should open the same saved-record detail screen used from Records.
- Use explicit loading, error, and zero-result states, and keep the previous results visible if only a refresh fails.

## Stats Screen
- Use summaries and compact cards instead of dense dashboards.
- Keep insights readable and practical, not decorative.
- The current MVP shows period tabs for 7 days, this month, last month, and all time.
- The screen should include a short reflection sentence, summary cards, a homemade/eating-out balance bar, top cuisine ranking, and top location ranking.
- Show explicit loading and retryable error states, while keeping the previous summary visible during refresh failures.
- Later candidates include a record calendar, day/time trends, photo highlights, and recently increasing genres; they are not part of the current MVP.

## Settings Screen
- Prioritize privacy, current scope, local data deletion, and app information.
- AI 入力補助の事前許可トグルを置き、端末内処理だけで外部送信しないことを短く説明する。
- meal input assist model の status を `未導入 / ダウンロード中 / 利用可能 / エラー` で表示し、`ダウンロード / 再ダウンロード / 削除` を提供する。
- `Local AI Runtime Status` では AI 入力補助だけを表示し、ready / unavailable、reason、expected path を確認できる。
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
