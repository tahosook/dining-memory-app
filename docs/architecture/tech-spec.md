# Technical Specification

## Meta
- Purpose: describe the current app architecture and runtime assumptions.
- Audience: engineers implementing or reviewing app behavior.
- Update trigger: dependency changes, architecture changes, or runtime policy changes.
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/index.md](../index.md), [docs/domain/database-design.md](../domain/database-design.md)

## Current Stack
- React Native + Expo
- TypeScript
- WatermelonDB on top of SQLite
- React Navigation bottom tabs
- Expo Camera, expo-file-system, expo-media-library, and related native modules

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
- App data lives primarily on the device.
- Cloud use is optional and should be treated as a fallback path, not the default path.
- Database schema versioning should stay explicit and small.
- UI should remain usable on both iOS and Android without platform-specific forks unless necessary.

## Security and Privacy Defaults
- Prefer local storage and local processing unless a feature clearly needs external transfer.
- Request only the minimum camera, photo, and location access needed for the active feature.
- Treat photos, notes, location data, export data, and file paths as sensitive user data.
- Do not assume external AI, backup, or export is allowed by default; require explicit user intent.
- Keep secrets out of source control and out of runtime logs.

## Implementation Boundaries
- UI details belong in `docs/ux/`.
- Table-by-table schema details belong in `docs/domain/database-design.md`.
- Coding rules belong in `docs/engineering/coding-standards.md`.

## Current Decisions Worth Preserving
- Bottom-tab navigation is the main shell.
- Camera is the main entry point for the app.
- Search and stats exist as first-class tabs rather than hidden tools.
- The project keeps a strong privacy and local-storage bias.
