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
- `app_settings`: persistent app preferences and local feature flags such as `ai_input_assist_enabled`.
- `search_vectors`: additive semantic-search support table keyed by `meal_id`, storing vector JSON, model id, dimension, indexed text, and explicit `text_version`.

## Planned Additive Tables
- Additional analytics or support tables should stay additive and must not become the primary source of truth for meal history.

## Storage Rules
- Keep the device-local database as the primary source of truth.
- Store images as files and keep file paths in the database.
- Use indexed columns for high-frequency lookups such as meal date, meal name, location, and deletion state.
- Keep optional fields optional; do not force data where the user did not provide it.
- Phase 1 の AI 入力補助は、ユーザーが候補を採用したときだけ `meals.ai_source` と `meals.ai_confidence` を保存し、生レスポンスや候補一覧は保存しない。
- `app_settings` は user-controlled feature flags や明示許可を保存し、local AI spike では `ai_input_assist_enabled` を最小キーとして使う。
- Preserve latitude and longitude when available, and allow service-layer logic to reuse an existing place name when a new record is captured within roughly 100 meters of a known location.

## Search and Analytics Intent
- The schema supports text search, filter search, and future semantic search.
- Analysis tables should stay additive and not block core capture and browse flows.
- Generated insights should be separable from raw meal records.
- Export and backup formats should stay versioned and preserve the relationships needed to rebuild meals, ingredients, images, settings, and generated insights.
- `search_vectors.indexed_text` は `meal_name`、`cuisine_type`、`location_name`、`notes`、`tags` だけから組み立て、`search_text` の代替 source of truth にはしない。
- `search_vectors.text_version` は indexed text の組み立てルールを明示し、再生成や backfill の判断に使う。

## Current Implementation Notes
- The active schema is intentionally small while capture, save, search, and settings behavior stabilizes.
- `search_text` currently supports the existing text and filter search path and should not be treated as semantic-search storage.
- Semantic search support is additive and should continue to evolve through dedicated tables and explicit migrations instead of widening `meals` with raw AI output or bulky generated fields.

## Schema Versioning
- `PRAGMA user_version = 1`: current legacy baseline with `meals` and `app_settings`.
- `PRAGMA user_version = 2`: adds `search_vectors` as additive semantic-search support data.
- Existing installs that still report `user_version = 0` should be migrated forward through the same additive statements instead of assuming a clean install.

## Design Notes
- Favor small records and file paths over BLOB-heavy rows.
- Preserve data needed for export, backup, and future migration.
- Keep indexing focused on the read paths users actually use: date, meal identity, location, deletion state, and search support.
- Treat cleanup and maintenance as additive safety work: remove orphaned, temporary, or low-value generated data without risking primary meal history.
- Keep the schema readable enough that new table changes can be reviewed without reopening the entire app architecture.
