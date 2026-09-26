import {
  getDatabase,
  getInMemoryMeals,
  initializeDatabase,
  isUsingNativeDatabase,
  mapRowToMeal,
  setInMemoryMeals,
  type PersistedMealRow,
} from './localDatabase';
import type { CookingLevel, Meal } from '../../types/MealTypes';
import {
  resolveDefaultMealName,
  resolveNearbyHomemadeDefault,
  resolveNearbyLocationName,
  type NearbyCandidateRow,
} from '../../domain/meals/defaults';
import {
  applyNonTextFilters,
  matchesTextFilter,
  sortByRecency,
  type SearchFilters,
} from '../../domain/meals/search';
import {
  buildStatisticsSummary,
  filterRowsForStatistics,
  rankTopEntries,
  type StatisticsOptions,
  type StatisticsSummary,
} from '../../domain/meals/statistics';
import { normalizeMealRow } from '../../domain/meals/mealRow';
import { normalizeCookingLevel } from '../../utils/cookingLevel';
import * as Crypto from 'expo-crypto';
import { cleanupOrphanedPhotoFiles } from '../../media/photoLifecycle';

export interface CreateMealData {
  meal_name: string;
  meal_type?: string;
  cuisine_type?: string;
  ai_confidence?: number;
  ai_source?: string;
  notes?: string;
  cooking_level?: CookingLevel | string;
  is_homemade: boolean;
  photo_path: string; // Caller must provide a stable, displayable URI.
  photo_thumbnail_path?: string | null;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  meal_datetime: Date;
  search_text?: string;
  tags?: string;
}

/**
 * getRecentMeals の取得オプション。
 *
 * NOTE: beforeMealDatetime (cursor) が指定されている場合は、offset は無視され、
 * カーソル走査 (Keyset pagination) が優先されます。
 */
export interface GetRecentMealsOptions {
  limit?: number;
  offset?: number;
  beforeMealDatetime?: number;
  beforeId?: string;
}

export type { SearchFilters } from '../../domain/meals/search';
export type { StatisticsOptions, StatisticsSummary } from '../../domain/meals/statistics';

type MealUpdateData = Partial<CreateMealData>;

function createId() {
  return `${Date.now()}-${Crypto.randomUUID()}`;
}

function normalizeRow(data: CreateMealData, existing?: PersistedMealRow): PersistedMealRow {
  return normalizeMealRow(data, {
    existing,
    nowMs: Date.now(),
    createId,
  });
}

function escapeSqliteLike(value: string): string {
  return value.replace(/([%_\\])/g, '\\$1');
}

const COOKING_LEVEL_VARIANTS: Record<CookingLevel, string[]> = {
  quick: ['quick', 'easy'],
  daily: ['daily', 'medium'],
  gourmet: ['gourmet', 'hard'],
};

async function getAllRows(): Promise<PersistedMealRow[]> {
  await initializeDatabase();

  if (!isUsingNativeDatabase()) {
    return getInMemoryMeals();
  }

  const db = getDatabase();
  if (!db) {
    return [];
  }

  return db.getAllAsync<PersistedMealRow>('SELECT * FROM meals');
}

async function getRowById(id: string): Promise<PersistedMealRow | null> {
  await initializeDatabase();

  if (isUsingNativeDatabase()) {
    const db = getDatabase();
    if (db) {
      const row = await db.getFirstAsync<PersistedMealRow>(
        'SELECT * FROM meals WHERE id = ? LIMIT 1',
        id
      );
      return row ?? null;
    }
  }

  const rows = getInMemoryMeals();
  return rows.find(item => item.id === id) ?? null;
}

async function saveRows(rows: PersistedMealRow[]) {
  if (isUsingNativeDatabase()) {
    return;
  }

  setInMemoryMeals(rows);
}

async function upsertRow(row: PersistedMealRow) {
  await initializeDatabase();

  if (!isUsingNativeDatabase()) {
    const rows = getInMemoryMeals();
    const nextRows = rows.filter(item => item.id !== row.id);
    nextRows.push(row);
    setInMemoryMeals(nextRows);
    return;
  }

  const db = getDatabase();
  if (!db) {
    return;
  }

  await db.runAsync(
    `INSERT OR REPLACE INTO meals (
      id, uuid, meal_name, meal_type, cuisine_type, ai_confidence, ai_source, notes, cooking_level,
      is_homemade, photo_path, photo_thumbnail_path, location_name, latitude, longitude, meal_datetime,
      search_text, tags, is_deleted, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.uuid,
    row.meal_name,
    row.meal_type ?? null,
    row.cuisine_type ?? null,
    row.ai_confidence ?? null,
    row.ai_source ?? null,
    row.notes ?? null,
    row.cooking_level ?? null,
    row.is_homemade,
    row.photo_path,
    row.photo_thumbnail_path ?? null,
    row.location_name ?? null,
    row.latitude ?? null,
    row.longitude ?? null,
    row.meal_datetime,
    row.search_text ?? null,
    row.tags ?? null,
    row.is_deleted,
    row.created_at,
    row.updated_at
  );
}

export class MealService {
  static async createMeal(data: CreateMealData): Promise<Meal> {
    await initializeDatabase();

    const needsDefaultMealName = !data.meal_name?.trim();
    const needsNearbyLocationName =
      !data.location_name?.trim() &&
      typeof data.latitude === 'number' &&
      typeof data.longitude === 'number';

    let candidateRows: PersistedMealRow[] | NearbyCandidateRow[] = [];

    if (
      (needsDefaultMealName || needsNearbyLocationName) &&
      typeof data.latitude === 'number' &&
      typeof data.longitude === 'number'
    ) {
      if (isUsingNativeDatabase()) {
        const db = getDatabase();
        if (db) {
          let sql =
            "SELECT id, meal_datetime, location_name, latitude, longitude, is_deleted FROM meals WHERE is_deleted = 0 AND location_name IS NOT NULL AND location_name != '' AND latitude IS NOT NULL AND longitude IS NOT NULL";
          const params: number[] = [];

          if (needsDefaultMealName && !needsNearbyLocationName) {
            sql += ' AND meal_datetime >= ?';
            params.push(Date.now() - 7 * 24 * 60 * 60 * 1000);
          }

          sql += ' ORDER BY meal_datetime DESC';
          candidateRows = await db.getAllAsync<NearbyCandidateRow>(sql, ...params);
        }
      } else {
        candidateRows = getInMemoryMeals();
      }
    }

    const row = normalizeRow({
      ...data,
      meal_name: resolveDefaultMealName(data, candidateRows),
      location_name: resolveNearbyLocationName(candidateRows, data),
    });
    await upsertRow(row);
    return mapRowToMeal(row);
  }

  static async getMealById(mealId: string): Promise<Meal | null> {
    const row = await getRowById(mealId);
    return row ? mapRowToMeal(row) : null;
  }

  static async getRecentNearbyHomemadeDefault(origin: {
    latitude: number;
    longitude: number;
  }): Promise<boolean | null> {
    await initializeDatabase();
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    if (isUsingNativeDatabase()) {
      const db = getDatabase();
      if (db) {
        // Optimization: Execute a direct SQL query to filter out deleted and old meals
        // instead of loading all rows into memory. This reduces memory footprint.
        const rows = await db.getAllAsync<PersistedMealRow>(
          'SELECT * FROM meals WHERE is_deleted = 0 AND meal_datetime >= ?',
          oneWeekAgo
        );
        return resolveNearbyHomemadeDefault(rows, origin, {
          minMealDatetime: oneWeekAgo,
          maxDistanceMeters: 80,
        });
      }
    }

    const rows = await getAllRows();
    return resolveNearbyHomemadeDefault(rows, origin, {
      minMealDatetime: oneWeekAgo,
      maxDistanceMeters: 80,
    });
  }

  static async searchMeals(filters: SearchFilters = {}): Promise<Meal[]> {
    await initializeDatabase();

    if (isUsingNativeDatabase()) {
      const db = getDatabase();
      if (db) {
        const conditions: string[] = ['is_deleted = 0'];
        const params: (string | number)[] = [];

        if (filters.dateFrom) {
          conditions.push('meal_datetime >= ?');
          params.push(filters.dateFrom.getTime());
        }
        if (filters.dateTo) {
          conditions.push('meal_datetime <= ?');
          params.push(filters.dateTo.getTime());
        }
        if (filters.cuisine_type) {
          conditions.push('cuisine_type = ?');
          params.push(filters.cuisine_type);
        }
        if (typeof filters.is_homemade === 'boolean') {
          conditions.push('is_homemade = ?');
          params.push(filters.is_homemade ? 1 : 0);
        }

        let targetCookingLevel: CookingLevel | undefined;
        if (filters.cooking_level) {
          targetCookingLevel = normalizeCookingLevel(filters.cooking_level);
          if (targetCookingLevel) {
            const variants = COOKING_LEVEL_VARIANTS[targetCookingLevel];
            conditions.push(`cooking_level IN (${variants.map(() => '?').join(', ')})`);
            params.push(...variants);
          } else {
            conditions.push('1 = 0');
          }
        }

        const locationQuery = filters.location_name?.trim();
        if (locationQuery) {
          conditions.push("location_name LIKE ? ESCAPE '\\'");
          params.push(`%${escapeSqliteLike(locationQuery)}%`);
        }

        const textQuery = filters.text?.trim();
        if (textQuery) {
          const escapedTextPattern = `%${escapeSqliteLike(textQuery)}%`;
          conditions.push(
            "(search_text LIKE ? ESCAPE '\\' OR meal_name LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR location_name LIKE ? ESCAPE '\\')"
          );
          params.push(
            escapedTextPattern,
            escapedTextPattern,
            escapedTextPattern,
            escapedTextPattern
          );
        }

        const whereClause = conditions.join(' AND ');
        let query = `SELECT * FROM meals WHERE ${whereClause} ORDER BY meal_datetime DESC`;
        // NOTE: 目前はシングルユーザー・ローカルDB前提のためシンプルな LIMIT / OFFSET 方式を採用しています。
        // 将来的にバックグラウンド同期や大量データ下での高速カーソル走査が必要になった場合は、
        // (meal_datetime, id) を用いた keyset pagination への移行を検討してください。
        if (typeof filters.limit === 'number') {
          query += ' LIMIT ?';
          params.push(filters.limit);
          if (typeof filters.offset === 'number' && filters.offset > 0) {
            query += ' OFFSET ?';
            params.push(filters.offset);
          }
        } else if (typeof filters.offset === 'number' && filters.offset > 0) {
          query += ' LIMIT -1 OFFSET ?';
          params.push(filters.offset);
        }

        const rows = await db.getAllAsync<PersistedMealRow>(query, ...params);
        return rows.map(mapRowToMeal);
      }
    }

    const rows = await getAllRows();
    const filteredRows = applyNonTextFilters(rows, filters);
    const textQuery = filters.text?.trim();

    const sortedRows = textQuery
      ? filteredRows.filter(row => matchesTextFilter(row, textQuery)).sort(sortByRecency)
      : filteredRows.sort(sortByRecency);

    const start = typeof filters.offset === 'number' && filters.offset > 0 ? filters.offset : 0;
    const end = typeof filters.limit === 'number' ? start + filters.limit : undefined;
    const pagedRows = sortedRows.slice(start, end);

    return pagedRows.map(mapRowToMeal);
  }

  static async searchMealsByText(searchText: string): Promise<Meal[]> {
    return this.searchMeals({ text: searchText });
  }

  static async getMealsByDateRange(startDate: Date, endDate: Date): Promise<Meal[]> {
    return this.searchMeals({ dateFrom: startDate, dateTo: endDate });
  }

  /**
   * 最近の食事記録を取得します。
   *
   * @param limitOrOptions 取得件数、またはページネーションオプション
   * @param offsetParam オフセット（limitOrOptions が数値の場合に使用）
   * NOTE: beforeMealDatetime (cursor) 指定時は offset は無視され、カーソル走査 (Keyset pagination) が優先されます。
   */
  static async getRecentMeals(
    limitOrOptions: number | GetRecentMealsOptions = 20,
    offsetParam = 0
  ): Promise<Meal[]> {
    await initializeDatabase();

    const options: GetRecentMealsOptions =
      typeof limitOrOptions === 'number'
        ? { limit: limitOrOptions, offset: offsetParam }
        : limitOrOptions;

    const limit = options.limit ?? 20;
    const { beforeMealDatetime, beforeId } = options;
    const offset = typeof beforeMealDatetime === 'number' ? 0 : (options.offset ?? 0);

    if (isUsingNativeDatabase()) {
      const db = getDatabase();
      if (db) {
        // Optimization: Execute a direct SQL query with ORDER BY and LIMIT to avoid loading
        // all rows into memory and processing in JavaScript. Reduces heap usage and CPU time.
        const conditions = ['is_deleted = 0'];
        const params: (string | number)[] = [];

        if (typeof beforeMealDatetime === 'number') {
          if (beforeId) {
            conditions.push('(meal_datetime < ? OR (meal_datetime = ? AND id < ?))');
            params.push(beforeMealDatetime, beforeMealDatetime, beforeId);
          } else {
            conditions.push('meal_datetime < ?');
            params.push(beforeMealDatetime);
          }
        }

        let query = `SELECT * FROM meals WHERE ${conditions.join(' AND ')} ORDER BY meal_datetime DESC, id DESC LIMIT ?`;
        params.push(limit);

        if (offset > 0) {
          query += ' OFFSET ?';
          params.push(offset);
        }

        const rows = await db.getAllAsync<PersistedMealRow>(query, ...params);
        return rows.map(mapRowToMeal);
      }
    }

    const rows = await getAllRows();
    let filtered = rows.filter(row => !row.is_deleted);

    if (typeof beforeMealDatetime === 'number') {
      filtered = filtered.filter(row => {
        if (row.meal_datetime < beforeMealDatetime) return true;
        if (row.meal_datetime === beforeMealDatetime && beforeId) {
          return row.id < beforeId;
        }
        return false;
      });
    }

    return filtered
      .sort((a, b) => b.meal_datetime - a.meal_datetime || (b.id < a.id ? -1 : b.id > a.id ? 1 : 0))
      .slice(offset, offset + limit)
      .map(mapRowToMeal);
  }

  static async softDeleteMeal(mealId: string): Promise<void> {
    await initializeDatabase();

    if (isUsingNativeDatabase()) {
      const db = getDatabase();
      if (db) {
        await db.runAsync(
          'UPDATE meals SET is_deleted = 1, updated_at = ? WHERE id = ?',
          Date.now(),
          mealId
        );
        return;
      }
    }

    const rows = await getAllRows();
    const row = rows.find(item => item.id === mealId);
    if (!row) {
      return;
    }

    row.is_deleted = 1;
    row.updated_at = Date.now();
    await upsertRow(row);
  }

  static async updateMeal(mealId: string, updates: MealUpdateData): Promise<Meal | null> {
    const row = await getRowById(mealId);
    if (!row) {
      return null;
    }

    const merged: CreateMealData = {
      meal_name: updates.meal_name ?? row.meal_name,
      meal_type: updates.meal_type ?? row.meal_type ?? undefined,
      cuisine_type: updates.cuisine_type ?? row.cuisine_type ?? undefined,
      ai_confidence: updates.ai_confidence ?? row.ai_confidence ?? undefined,
      ai_source: updates.ai_source ?? row.ai_source ?? undefined,
      notes: updates.notes ?? row.notes ?? undefined,
      cooking_level: updates.cooking_level ?? row.cooking_level ?? undefined,
      is_homemade: updates.is_homemade ?? Boolean(row.is_homemade),
      photo_path: updates.photo_path ?? row.photo_path,
      photo_thumbnail_path:
        updates.photo_thumbnail_path !== undefined
          ? updates.photo_thumbnail_path
          : (row.photo_thumbnail_path ?? undefined),
      location_name: updates.location_name ?? row.location_name ?? undefined,
      latitude: updates.latitude ?? row.latitude ?? undefined,
      longitude: updates.longitude ?? row.longitude ?? undefined,
      meal_datetime: updates.meal_datetime ?? new Date(row.meal_datetime),
      search_text: updates.search_text ?? row.search_text ?? undefined,
      tags: updates.tags ?? row.tags ?? undefined,
    };

    const nextRow = normalizeRow(merged, row);
    await upsertRow(nextRow);
    return mapRowToMeal(nextRow);
  }

  static async updateMealThumbnail(
    mealId: string,
    thumbnailPath: string,
    expectedPhotoPath: string
  ): Promise<boolean> {
    await initializeDatabase();

    if (isUsingNativeDatabase()) {
      const db = getDatabase();
      if (db) {
        const result = await db.runAsync(
          'UPDATE meals SET photo_thumbnail_path = ?, updated_at = ? WHERE id = ? AND photo_path = ? AND is_deleted = 0',
          thumbnailPath,
          Date.now(),
          mealId,
          expectedPhotoPath
        );
        return result.changes > 0;
      }
    }

    const rows = getInMemoryMeals();
    const row = rows.find(
      item => item.id === mealId && item.photo_path === expectedPhotoPath && !item.is_deleted
    );
    if (!row) {
      return false;
    }

    row.photo_thumbnail_path = thumbnailPath;
    row.updated_at = Date.now();
    await saveRows(rows);
    return true;
  }

  static async getStatistics(options: StatisticsOptions = {}): Promise<StatisticsSummary> {
    await initializeDatabase();

    if (isUsingNativeDatabase()) {
      const db = getDatabase();
      if (db) {
        const conditions: string[] = ['is_deleted = 0'];
        const params: number[] = [];

        if (options.dateFrom) {
          conditions.push('meal_datetime >= ?');
          params.push(options.dateFrom.getTime());
        }
        if (options.dateTo) {
          conditions.push('meal_datetime <= ?');
          params.push(options.dateTo.getTime());
        }

        const whereClause = conditions.join(' AND ');

        const summaryRow = await db.getFirstAsync<{ total: number; homemade: number | null }>(
          `SELECT COUNT(*) AS total, SUM(CASE WHEN is_homemade = 1 THEN 1 ELSE 0 END) AS homemade FROM meals WHERE ${whereClause}`,
          ...params
        );

        const cuisineRows = await db.getAllAsync<{ label: string; count: number }>(
          `SELECT TRIM(cuisine_type) AS label, COUNT(*) AS count FROM meals WHERE ${whereClause} AND cuisine_type IS NOT NULL AND TRIM(cuisine_type) != '' GROUP BY TRIM(cuisine_type) ORDER BY count DESC`,
          ...params
        );

        const locationRows = await db.getAllAsync<{ label: string; count: number }>(
          `SELECT TRIM(location_name) AS label, COUNT(*) AS count FROM meals WHERE ${whereClause} AND location_name IS NOT NULL AND TRIM(location_name) != '' GROUP BY TRIM(location_name) ORDER BY count DESC`,
          ...params
        );

        const totalMeals = Number(summaryRow?.total ?? 0);
        const homemadeMeals = Number(summaryRow?.homemade ?? 0);
        const takeoutMeals = totalMeals - homemadeMeals;
        const topCuisines = rankTopEntries(cuisineRows);
        const topLocations = rankTopEntries(locationRows);

        return {
          totalMeals,
          homemadeMeals,
          takeoutMeals,
          favoriteCuisine: topCuisines[0]?.label,
          favoriteLocation: topLocations[0]?.label,
          topCuisines,
          topLocations,
        };
      }
    }

    const rows = filterRowsForStatistics(await getAllRows(), options);
    return buildStatisticsSummary(rows);
  }

  static async clearAllMeals(options: { cleanupPhotos?: boolean } = {}): Promise<void> {
    await initializeDatabase();

    if (!isUsingNativeDatabase()) {
      await saveRows([]);
    } else {
      const db = getDatabase();
      if (db) {
        await db.runAsync('DELETE FROM meals');
      }
    }

    if (options.cleanupPhotos) {
      try {
        await cleanupOrphanedPhotoFiles();
      } catch (cleanupError) {
        console.warn(
          '[MealService] Non-fatal warning: Failed to clean up orphaned photos after clearAllMeals:',
          cleanupError
        );
      }
    }
  }
}
