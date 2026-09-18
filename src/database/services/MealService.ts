import { getDatabase, getInMemoryMeals, initializeDatabase, isUsingNativeDatabase, mapRowToMeal, setInMemoryMeals, type PersistedMealRow } from './localDatabase';
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
  type StatisticsOptions,
  type StatisticsSummary,
} from '../../domain/meals/statistics';
import { normalizeMealRow } from '../../domain/meals/mealRow';
import { normalizeCookingLevel } from '../../utils/cookingLevel';

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
  photo_thumbnail_path?: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  meal_datetime: Date;
  search_text?: string;
  tags?: string;
}

export type { SearchFilters } from '../../domain/meals/search';
export type { StatisticsOptions, StatisticsSummary } from '../../domain/meals/statistics';

type MealUpdateData = Partial<CreateMealData>;

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeRow(data: CreateMealData, existing?: PersistedMealRow): PersistedMealRow {
  return normalizeMealRow(data, {
    existing,
    nowMs: Date.now(),
    createId,
  });
}

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
  return rows.find((item) => item.id === id) ?? null;
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
    const nextRows = rows.filter((item) => item.id !== row.id);
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

  static async getRecentNearbyHomemadeDefault(origin: { latitude: number; longitude: number }): Promise<boolean | null> {
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

        const whereClause = conditions.join(' AND ');
        const rows = await db.getAllAsync<PersistedMealRow>(
          `SELECT * FROM meals WHERE ${whereClause} ORDER BY meal_datetime DESC`,
          ...params
        );

        let resultRows = rows;
        if (filters.cooking_level) {
          const targetLevel = normalizeCookingLevel(filters.cooking_level);
          resultRows = resultRows.filter((r) => normalizeCookingLevel(r.cooking_level) === targetLevel);
        }
        if (filters.location_name) {
          const loc = filters.location_name.toLowerCase();
          resultRows = resultRows.filter((r) => (r.location_name ?? '').toLowerCase().includes(loc));
        }
        const textQuery = filters.text?.trim();
        if (textQuery) {
          resultRows = resultRows.filter((r) => matchesTextFilter(r, textQuery));
        }

        return resultRows.map(mapRowToMeal);
      }
    }

    const rows = await getAllRows();
    const filteredRows = applyNonTextFilters(rows, filters);
    const textQuery = filters.text?.trim();

    if (!textQuery) {
      return filteredRows
        .sort(sortByRecency)
        .map(mapRowToMeal);
    }

    return filteredRows
      .filter((row) => matchesTextFilter(row, textQuery))
      .sort(sortByRecency)
      .map(mapRowToMeal);
  }

  static async searchMealsByText(searchText: string): Promise<Meal[]> {
    return this.searchMeals({ text: searchText });
  }

  static async getMealsByDateRange(startDate: Date, endDate: Date): Promise<Meal[]> {
    return this.searchMeals({ dateFrom: startDate, dateTo: endDate });
  }

  static async getRecentMeals(limit = 20): Promise<Meal[]> {
    await initializeDatabase();

    if (isUsingNativeDatabase()) {
      const db = getDatabase();
      if (db) {
        const rows = await db.getAllAsync<PersistedMealRow>(
          'SELECT * FROM meals WHERE is_deleted = 0 ORDER BY meal_datetime DESC LIMIT ?',
          limit
        );
        return rows.map(mapRowToMeal);
      }
    }

    const rows = await getAllRows();
    return rows
      .filter((row) => !row.is_deleted)
      .sort((a, b) => b.meal_datetime - a.meal_datetime)
      .slice(0, limit)
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
    const row = rows.find((item) => item.id === mealId);
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
      photo_thumbnail_path: updates.photo_thumbnail_path ?? row.photo_thumbnail_path ?? undefined,
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

  static async getStatistics(options: StatisticsOptions = {}): Promise<StatisticsSummary> {
    const rows = filterRowsForStatistics(await getAllRows(), options);
    return buildStatisticsSummary(rows);
  }

  static async clearAllMeals(): Promise<void> {
    await initializeDatabase();

    if (!isUsingNativeDatabase()) {
      await saveRows([]);
      return;
    }

    const db = getDatabase();
    if (!db) {
      return;
    }

    await db.runAsync('DELETE FROM meals');
  }
}
