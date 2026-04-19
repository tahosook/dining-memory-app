# Technical Specification

## Meta
- Purpose: describe the current app architecture and runtime assumptions.
- Audience: engineers implementing or reviewing app behavior.
- Update trigger: dependency changes, architecture changes, or runtime policy changes.
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/index.md](../index.md), [docs/domain/database-design.md](../domain/database-design.md)

## Current Stack
- Expo SDK 55 on React Native 0.83 / React 19.2
- TypeScript 6
- Local SQLite storage with a lightweight in-memory fallback for web and tests
- React Navigation bottom tabs
- Expo Camera, expo-file-system, expo-location, expo-media-library, and related native modules

## Architecture Principles
- Offline-first by default.
- Keep capture, storage, search, and presentation separated.
- Prefer local processing and local persistence for user data.
- Preserve clear boundaries between UI, hooks, navigation, and database services.

## App Shape
- `Camera` for capture and immediate save flow.
- `Records` for browsing and editing saved meals.
- `Search` for text and filter-based retrieval.
- `Stats` for analysis and future insight features.
- `Settings` for data, privacy, and app controls.

## Runtime Assumptions
- Local development uses Node.js 20.19+.
- Expo SDK 55 keeps the New Architecture enabled at all times.
- App data lives primarily on the device.
- Captured photos should be resized before save.
- On Android, captured photos should keep an app-local stable file for in-app display and also be added to a dedicated `Pictures / Dining Memory` album so future backup targeting stays possible without mixing unrelated media.
- On Android, capture review save should verify photo-library permission immediately before persistence and route denied states to system settings guidance.
- On iOS and web, saved photos can continue using app-local stable paths.
- Phase 1 の AI 入力補助は capture review 上の明示的なユーザー操作でのみ実行し、local mock provider を使って UI 統合を確認する。
- 次の local AI spike では、Settings の明示許可と `app_settings` 永続化を追加し、default provider mode を `local-runtime-prototype` に向ける。
- Cloud use is optional and should be treated as a future fallback path, not the default path.
- Database schema versioning should stay explicit and small.
- UI should remain usable on both iOS and Android without platform-specific forks unless necessary.
- Search, records, and stats should refresh when a tab regains focus so the capture flow never leaves stale data on screen.

## Security and Privacy Defaults
- Prefer local storage and local processing unless a feature clearly needs external transfer.
- Allow external handoff only from an explicit user action, such as opening the OS share sheet from a saved record detail.
- Request only the minimum camera, photo, and location access needed for the active feature.
- Request foreground location only at save time, and keep meal saving available even if location permission is denied.
- Treat photos, notes, location data, export data, and file paths as sensitive user data.
- Do not assume external AI, backup, or export is allowed by default; require explicit user intent.
- Phase 1 の AI 入力補助では写真やメモを外部送信せず、候補採用時だけ最小限の AI metadata を meal record に残す。
- local AI spike でも写真やメモの外部送信は行わず、Settings の user opt-in がない限り AI 入力補助を無効にする。
- Records detail may hand off the current meal to the OS share sheet, but should not store posting state or send data automatically.
- Keep secrets out of source control and out of runtime logs.

## Quality and Delivery Defaults
- Keep the core capture, save, search, and export paths covered through a mix of unit, integration, and device-level verification.
- Treat type checking, linting, and automated tests as the normal gate for meaningful app changes.
- Keep build and release assumptions aligned with the current Expo and EAS workflow rather than maintaining parallel delivery paths.
- Prefer privacy-preserving crash and usage diagnostics; do not introduce telemetry that weakens the app's local-first posture by default.

## Implementation Boundaries
- UI details belong in `docs/ux/`.
- Table-by-table schema details belong in `docs/domain/database-design.md`.
- Coding rules belong in `docs/engineering/coding-standards.md`.

## Current Decisions Worth Preserving
- Bottom-tab navigation is the main shell.
- Camera is the main entry point for the app.
- Search and stats exist as first-class tabs rather than hidden tools.
- The project keeps a strong privacy and local-storage bias.
- The current MVP does not ship cloud backup, export, or external AI transfer behavior.
- Phase 1 の AI 入力補助は save flow の外側に置き、失敗時でも手入力保存を妨げない。
- local AI runtime が未組み込みの build では、review に disabled reason を出し、mock 候補で自動的に置き換えない。
