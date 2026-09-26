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
    const rows = await getAllRows();
    const row = normalizeRow({
      ...data,
      meal_name: resolveDefaultMealName(data, rows),
      location_name: resolveNearbyLocationName(rows, data),
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
    const rows = await getAllRows();
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
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

        const params: (string | number | null)[] = [];

        // dateFrom
        params.push(filters.dateFrom ? 1 : null, filters.dateFrom ? filters.dateFrom.getTime() : null);

        // dateTo
        params.push(filters.dateTo ? 1 : null, filters.dateTo ? filters.dateTo.getTime() : null);

        // cuisine_type
        params.push(filters.cuisine_type || null, filters.cuisine_type || null);

        // is_homemade
        const hasHomemade = typeof filters.is_homemade === 'boolean';
        params.push(hasHomemade ? 1 : null, hasHomemade ? (filters.is_homemade ? 1 : 0) : null);

        // cooking_level
        let hasCookingLevel = 0;
        let v1 = '', v2 = '';
        if (filters.cooking_level) {
          const targetCookingLevel = normalizeCookingLevel(filters.cooking_level);
          if (targetCookingLevel) {
            hasCookingLevel = 1;
            const variants = COOKING_LEVEL_VARIANTS[targetCookingLevel];
            v1 = variants[0];
            v2 = variants[1] || variants[0];
          } else {
            hasCookingLevel = -1;
          }
        }
        params.push(hasCookingLevel === 1 ? 1 : null, v1, v2, hasCookingLevel === -1 ? 1 : null);

        // location_name
        const locationQuery = filters.location_name?.trim();
        params.push(locationQuery ? 1 : null, locationQuery ? `%${escapeSqliteLike(locationQuery)}%` : null);

        // text
        const textQuery = filters.text?.trim();
        const escapedTextPattern = textQuery ? `%${escapeSqliteLike(textQuery)}%` : null;
        params.push(
          textQuery ? 1 : null,
          escapedTextPattern,
          escapedTextPattern,
          escapedTextPattern,
          escapedTextPattern
        );

        // limit & offset
        const limit = typeof filters.limit === 'number' ? filters.limit : -1;
        const offset = typeof filters.offset === 'number' && filters.offset > 0 ? filters.offset : 0;
        params.push(limit, offset);

        const query = `
          SELECT * FROM meals
          WHERE is_deleted = 0
            AND (? IS NULL OR meal_datetime >= ?)
            AND (? IS NULL OR meal_datetime <= ?)
            AND (? IS NULL OR cuisine_type = ?)
            AND (? IS NULL OR is_homemade = ?)
            AND (? IS NULL OR cooking_level IN (?, ?))
            AND (? IS NULL OR 1 = 0)
            AND (? IS NULL OR location_name LIKE ? ESCAPE '\\')
            AND (? IS NULL OR (search_text LIKE ? ESCAPE '\\' OR meal_name LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR location_name LIKE ? ESCAPE '\\'))
          ORDER BY meal_datetime DESC
          LIMIT ? OFFSET ?
        `;

        const rows = await db.getAllAsync<PersistedMealRow>(query, ...(params as any));
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

        const params: (string | number | null)[] = [];
        const hasDatetime = typeof beforeMealDatetime === 'number';
        const hasId = !!beforeId;

        params.push(
          hasDatetime ? 1 : null,
          hasDatetime && hasId ? 1 : null,
          hasDatetime ? beforeMealDatetime : null,
          hasDatetime ? beforeMealDatetime : null,
          hasId ? beforeId : null,
          hasDatetime && !hasId ? 1 : null,
          hasDatetime ? beforeMealDatetime : null
        );

        params.push(limit, offset > 0 ? offset : 0);

        const query = `
          SELECT * FROM meals
          WHERE is_deleted = 0
            AND (? IS NULL OR (
              (? IS NOT NULL AND (meal_datetime < ? OR (meal_datetime = ? AND id < ?)))
              OR
              (? IS NOT NULL AND meal_datetime < ?)
            ))
          ORDER BY meal_datetime DESC, id DESC
          LIMIT ? OFFSET ?
        `;

        const rows = await db.getAllAsync<PersistedMealRow>(query, ...(params as any));
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

        const params: (string | number | null)[] = [];

        params.push(
          options.dateFrom ? 1 : null, options.dateFrom ? options.dateFrom.getTime() : null,
          options.dateTo ? 1 : null, options.dateTo ? options.dateTo.getTime() : null
        );

        const summaryRow = await db.getFirstAsync<{ total: number; homemade: number | null }>(
          `SELECT COUNT(*) AS total, SUM(CASE WHEN is_homemade = 1 THEN 1 ELSE 0 END) AS homemade FROM meals WHERE is_deleted = 0 AND (? IS NULL OR meal_datetime >= ?) AND (? IS NULL OR meal_datetime <= ?)`,
          ...(params as any)
        );

        const cuisineRows = await db.getAllAsync<{ label: string; count: number }>(
          `SELECT TRIM(cuisine_type) AS label, COUNT(*) AS count FROM meals WHERE is_deleted = 0 AND (? IS NULL OR meal_datetime >= ?) AND (? IS NULL OR meal_datetime <= ?) AND cuisine_type IS NOT NULL AND TRIM(cuisine_type) != '' GROUP BY TRIM(cuisine_type) ORDER BY count DESC`,
          ...(params as any)
        );

        const locationRows = await db.getAllAsync<{ label: string; count: number }>(
          `SELECT TRIM(location_name) AS label, COUNT(*) AS count FROM meals WHERE is_deleted = 0 AND (? IS NULL OR meal_datetime >= ?) AND (? IS NULL OR meal_datetime <= ?) AND location_name IS NOT NULL AND TRIM(location_name) != '' GROUP BY TRIM(location_name) ORDER BY count DESC`,
          ...(params as any)
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
