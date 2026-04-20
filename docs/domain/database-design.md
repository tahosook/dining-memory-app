# Database Design

## Meta
- Purpose: describe the current local data model and storage responsibilities.
- Audience: engineers working on persistence, search, sync, or analytics.
- Update trigger: schema changes, indexing changes, or storage policy changes.
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/index.md](../index.md), [docs/architecture/tech-spec.md](../architecture/tech-spec.md)

## Source of Truth
- The active schema lives in `src/database/services/localDatabase.ts`.
- This document explains the intent and responsibilities of that schema.

## Current Tables
- `meals`: primary meal record with name, type, cuisine, minimal AI metadata, notes, location, time, image paths, derived `search_text`, tags, and deletion flags.
- `app_settings`: persistent app preferences and local feature flags such as `ai_input_assist_enabled`, `meal_input_assist_model_version`, `meal_input_assist_model_status`, `meal_input_assist_model_downloaded_at`, and `meal_input_assist_model_error_message`.
- `search_vectors`: legacy additive table kept only for migration compatibility. current app behavior does not actively read or write semantic-search vectors.

## Planned Additive Tables
- Additional analytics or support tables should stay additive and must not become the primary source of truth for meal history.

## Storage Rules
- Keep the device-local database as the primary source of truth.
- Store images as files and keep file paths in the database.
- Use indexed columns for high-frequency lookups such as meal date, meal name, location, and deletion state.
- Keep optional fields optional; do not force data where the user did not provide it.
- Phase 1 の AI 入力補助は、ユーザーが候補を採用したときだけ `meals.ai_source` と `meals.ai_confidence` を保存し、生レスポンスや候補一覧は保存しない。
- `app_settings` は user-controlled feature flags や meal input assist model の導入状態を保存し、実際の ready 判定は app-local fixed path の file existence を優先する。
- Preserve latitude and longitude when available, and allow service-layer logic to reuse an existing place name when a new record is captured within roughly 100 meters of a known location.

## Search and Analytics Intent
- The schema currently supports text search and filter search.
- Analysis tables should stay additive and not block core capture and browse flows.
- Generated insights should be separable from raw meal records.
- Export and backup formats should stay versioned and preserve the relationships needed to rebuild meals, ingredients, images, settings, and generated insights.
- `search_vectors` は legacy schema として残すが、current feature path では source of truth にしない。

## Current Implementation Notes
- The active schema is intentionally small while capture, save, search, and settings behavior stabilizes.
- `search_text` は current text and filter search path を支える field として扱う。
- `search_vectors` は既存 install の migration 互換性のため残し、current feature path では更新しない。

## Schema Versioning
- `PRAGMA user_version = 1`: current legacy baseline with `meals` and `app_settings`.
- `PRAGMA user_version = 2`: adds `search_vectors` as a legacy additive table retained for compatibility.
- Existing installs that still report `user_version = 0` should be migrated forward through the same additive statements instead of assuming a clean install.

## Design Notes
- Favor small records and file paths over BLOB-heavy rows.
- Preserve data needed for export, backup, and future migration.
- Keep indexing focused on the read paths users actually use: date, meal identity, location, deletion state, and search support.
- Treat cleanup and maintenance as additive safety work: remove orphaned, temporary, or low-value generated data without risking primary meal history.
- Keep the schema readable enough that new table changes can be reviewed without reopening the entire app architecture.
