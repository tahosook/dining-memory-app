# Database Design

## Meta
- Purpose: describe the current local data model and storage responsibilities.
- Audience: engineers working on persistence, search, sync, or analytics.
- Update trigger: schema changes, indexing changes, or storage policy changes.
- Related docs: [AGENTS.md](../../AGENTS.md), [docs/index.md](../index.md), [docs/architecture/tech-spec.md](../architecture/tech-spec.md)

## Source of Truth
- The active schema lives in `src/database/models/schema.ts`.
- This document explains the intent and responsibilities of that schema.

## Current Tables
- `meals`: primary meal record with name, type, cuisine, AI metadata, notes, location, time, image paths, tags, and deletion flags.
- `ingredients`: ingredient items linked to meals.
- `locations`: reusable place records and visit statistics.
- `meal_images`: original, thumbnail, and compressed image metadata.
- `cooking_patterns`: analysis output for cooking behavior and timing.
- `tags`: tag master data.
- `meal_tags`: many-to-many relation between meals and tags.
- `behavior_insights`: generated insights and user-dismissal state.
- `search_vectors`: vector or keyword search support data.
- `app_settings`: persistent app preferences.

## Storage Rules
- Keep the device-local database as the primary source of truth.
- Store images as files and keep file paths in the database.
- Use indexed columns for high-frequency lookups such as meal date, meal name, location, and deletion state.
- Keep optional fields optional; do not force data where the user did not provide it.

## Search and Analytics Intent
- The schema supports text search, filter search, and future semantic search.
- Analysis tables should stay additive and not block core capture and browse flows.
- Generated insights should be separable from raw meal records.

## Design Notes
- Favor small records and file paths over BLOB-heavy rows.
- Preserve data needed for export, backup, and future migration.
- Keep the schema readable enough that new table changes can be reviewed without reopening the entire app architecture.
