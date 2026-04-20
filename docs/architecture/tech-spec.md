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
- Keep AI runtime capability checks explicit so unavailable local runtimes stay visible instead of being hidden behind silent fallbacks.

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
- `src/ai/runtime/` は meal input assist 向けの最小 runtime status helper を持ち、feature 固有ロジックは `src/ai/mealInputAssist/` 配下に残す。
- ready な runtime と unavailable / noop helper は明確に分け、production path の default fallback に noop provider を使わない。
- Search は current text/filter path だけを使い、semantic search は current scope に含めない。
- meal input assist は `llama.rn` の multimodal path を使い、supported device/runtime と app-local の `documentDirectory/ai-models/meal-input-assist.gguf` / `documentDirectory/ai-models/meal-input-assist.mmproj` が揃うときだけ ready とする。
- capture review では AI 解析中に live camera preview を止め、captured image と review overlay だけを残して余分な camera memory pressure を増やさない。
- meal input assist の running state は `準備 / model 読み込み / 画像解析 / 候補整形` の近似 stage を UI に返し、進捗の目安と残り時間の目安を表示する。
- meal input assist の real runtime 条件を満たさない build では `runtime_unavailable` / `model_unavailable` / `unsupported_architecture` を返し、review の disabled reason を維持する。
- meal input assist model の配布は app bundle ではなく Settings からの明示ダウンロードとし、direct URL は TypeScript config で固定管理する。
- Settings は meal input assist の model status と local AI runtime status を表示し、`未導入 / ダウンロード中 / 利用可能 / エラー`、reason、expected path を確認できる。
- local AI model の document picker や user-configurable path は current scope に入れず、app-local fixed path だけを前提にする。
- Android first で runtime readiness を詰めるが、shared code path の範囲では iOS でも同じ status 表示 contract を維持する。
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
- Settings の runtime status も外部照会を行わず、端末内で native module / supported ABI / app-local model path の存在だけを確認する。
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
