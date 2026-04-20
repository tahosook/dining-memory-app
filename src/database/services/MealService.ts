import { getDatabase, getInMemoryMeals, initializeDatabase, isUsingNativeDatabase, mapRowToMeal, setInMemoryMeals, type PersistedMealRow } from './localDatabase';
import { MealEmbeddingService } from './MealEmbeddingService';
import { SemanticSearchService } from './SemanticSearchService';
import type { Meal } from '../../types/MealTypes';

export interface CreateMealData {
  meal_name: string;
  meal_type?: string;
  cuisine_type?: string;
  ai_confidence?: number;
  ai_source?: string;
  notes?: string;
  cooking_level?: string;
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

export interface SearchFilters {
  dateFrom?: Date;
  dateTo?: Date;
  cuisine_type?: string;
  is_homemade?: boolean;
  cooking_level?: string;
  location_name?: string;
  text?: string;
}

export interface StatisticsSummary {
  totalMeals: number;
  homemadeMeals: number;
  takeoutMeals: number;
  favoriteCuisine?: string;
  favoriteLocation?: string;
}

type MealUpdateData = Partial<CreateMealData>;
const SAME_LOCATION_THRESHOLD_METERS = 100;

function createId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeRow(data: CreateMealData, existing?: PersistedMealRow): PersistedMealRow {
  const now = Date.now();
  const searchText = data.search_text ?? generateSearchText(data);

  return {
    id: existing?.id ?? createId(),
    uuid: existing?.uuid ?? createId(),
    meal_name: data.meal_name,
    meal_type: data.meal_type ?? null,
    cuisine_type: data.cuisine_type ?? null,
    ai_confidence: data.ai_confidence ?? null,
    ai_source: data.ai_source ?? null,
    notes: data.notes ?? null,
    cooking_level: data.cooking_level ?? null,
    is_homemade: data.is_homemade ? 1 : 0,
    photo_path: data.photo_path,
    photo_thumbnail_path: data.photo_thumbnail_path ?? null,
    location_name: data.location_name ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    meal_datetime: data.meal_datetime.getTime(),
    search_text: searchText,
    tags: data.tags ?? null,
    is_deleted: existing?.is_deleted ?? 0,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
}

function generateSearchText(data: Partial<CreateMealData>): string {
  return [data.meal_name, data.cuisine_type, data.location_name, data.notes, data.tags]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function getMealNameByTime(date: Date): string {
  const hour = date.getHours();

  if (hour >= 5 && hour < 10) {
    return '朝食';
  } else if (hour >= 10 && hour < 14) {
    return '昼食';
  } else if (hour >= 14 && hour < 18) {
    return '午後の軽食';
  } else if (hour >= 18 && hour < 22) {
    return '夕食';
  } else {
    return '深夜の食事';
  }
}

function resolveDefaultMealName(data: CreateMealData, rows: PersistedMealRow[]): string {
  if (data.meal_name.trim()) {
    return data.meal_name.trim();
  }

  const timeBasedName = getMealNameByTime(data.meal_datetime);

  // 過去一週間以内、同じ場所のレコードを探す
  if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const origin = { latitude: data.latitude, longitude: data.longitude };

    const recentNearbyRow = rows.find((row) => {
      if (!row.location_name
        || typeof row.latitude !== 'number'
        || typeof row.longitude !== 'number'
        || row.is_deleted
        || row.meal_datetime < oneWeekAgo
      ) {
        return false;
      }

      return getDistanceMeters(origin, { latitude: row.latitude, longitude: row.longitude }) <= SAME_LOCATION_THRESHOLD_METERS;
    });

    if (recentNearbyRow?.location_name) {
      return `${recentNearbyRow.location_name} の ${timeBasedName}`;
    }
  }

  return timeBasedName;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number }
) {
  const earthRadiusMeters = 6371000;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const startLatitude = toRadians(first.latitude);
  const endLatitude = toRadians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function resolveNearbyLocationName(rows: PersistedMealRow[], data: CreateMealData) {
  if (
    data.location_name?.trim()
    || typeof data.latitude !== 'number'
    || typeof data.longitude !== 'number'
  ) {
    return data.location_name;
  }

  const origin = {
    latitude: data.latitude,
    longitude: data.longitude,
  };

  const nearbyRow = rows.find((row) => {
    if (!row.location_name || typeof row.latitude !== 'number' || typeof row.longitude !== 'number' || row.is_deleted) {
      return false;
    }

    return getDistanceMeters(
      origin,
      { latitude: row.latitude, longitude: row.longitude }
    ) <= SAME_LOCATION_THRESHOLD_METERS;
  });

  return nearbyRow?.location_name ?? data.location_name;
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

async function saveRows(rows: PersistedMealRow[]) {
  if (isUsingNativeDatabase()) {
    return;
  }

  setInMemoryMeals(rows);
}

function scheduleEmbeddingRefresh(meal: Meal) {
  MealEmbeddingService.refreshEmbeddingForMeal(meal).catch(() => {
    // Embedding refresh is additive support data and must not block save flows.
  });
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

function applyNonTextFilters(rows: PersistedMealRow[], filters: SearchFilters): PersistedMealRow[] {
  return rows.filter((row) => {
    if (row.is_deleted) {
      return false;
    }

    if (filters.dateFrom && row.meal_datetime < filters.dateFrom.getTime()) {
      return false;
    }

    if (filters.dateTo && row.meal_datetime > filters.dateTo.getTime()) {
      return false;
    }

    if (filters.cuisine_type && row.cuisine_type !== filters.cuisine_type) {
      return false;
    }

    if (typeof filters.is_homemade === 'boolean' && Boolean(row.is_homemade) !== filters.is_homemade) {
      return false;
    }

    if (filters.cooking_level && row.cooking_level !== filters.cooking_level) {
      return false;
    }

    if (filters.location_name && !(row.location_name ?? '').toLowerCase().includes(filters.location_name.toLowerCase())) {
      return false;
    }

    return true;
  });
}

function matchesTextFilter(row: PersistedMealRow, text: string) {
  const haystack = `${row.meal_name} ${row.location_name ?? ''} ${row.notes ?? ''} ${row.search_text ?? ''}`.toLowerCase();
  return haystack.includes(text.toLowerCase());
}

function sortByRecency(left: PersistedMealRow, right: PersistedMealRow) {
  return right.meal_datetime - left.meal_datetime;
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
    const meal = mapRowToMeal(row);
    scheduleEmbeddingRefresh(meal);
    return meal;
  }

  static async searchMeals(filters: SearchFilters = {}): Promise<Meal[]> {
    const rows = await getAllRows();
    const filteredRows = applyNonTextFilters(rows, filters);
    const textQuery = filters.text?.trim();

    if (!textQuery) {
      return filteredRows
        .sort(sortByRecency)
        .map(mapRowToMeal);
    }

    const lexicalMatches = filteredRows.filter((row) => matchesTextFilter(row, textQuery));
    const semanticMatches = await SemanticSearchService.scoreMeals(textQuery, filteredRows.map(mapRowToMeal));

    if (semanticMatches.length === 0) {
      return lexicalMatches
        .sort(sortByRecency)
        .map(mapRowToMeal);
    }

    const lexicalMatchIds = new Set(lexicalMatches.map((row) => row.id));
    const semanticScores = new Map(semanticMatches.map((match) => [match.mealId, match.score]));

    return filteredRows
      .filter((row) => lexicalMatchIds.has(row.id) || semanticScores.has(row.id))
      .sort((left, right) => {
        const leftIsLexical = lexicalMatchIds.has(left.id);
        const rightIsLexical = lexicalMatchIds.has(right.id);

        if (leftIsLexical !== rightIsLexical) {
          return leftIsLexical ? -1 : 1;
        }

        const semanticScoreDelta = (semanticScores.get(right.id) ?? Number.NEGATIVE_INFINITY)
          - (semanticScores.get(left.id) ?? Number.NEGATIVE_INFINITY);
        if (semanticScoreDelta !== 0) {
          return semanticScoreDelta;
        }

        return sortByRecency(left, right);
      })
      .map(mapRowToMeal);
  }

  static async searchMealsByText(searchText: string): Promise<Meal[]> {
    return this.searchMeals({ text: searchText });
  }

  static async getMealsByDateRange(startDate: Date, endDate: Date): Promise<Meal[]> {
    return this.searchMeals({ dateFrom: startDate, dateTo: endDate });
  }

  static async getRecentMeals(limit = 20): Promise<Meal[]> {
    const rows = await getAllRows();
    return rows
      .filter((row) => !row.is_deleted)
      .sort((a, b) => b.meal_datetime - a.meal_datetime)
      .slice(0, limit)
      .map(mapRowToMeal);
  }

  static async softDeleteMeal(mealId: string): Promise<void> {
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
    const rows = await getAllRows();
    const row = rows.find((item) => item.id === mealId);
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
    const meal = mapRowToMeal(nextRow);
    scheduleEmbeddingRefresh(meal);
    return meal;
  }

  static async getStatistics(): Promise<StatisticsSummary> {
    const rows = (await getAllRows()).filter((row) => !row.is_deleted);
    const homemadeMeals = rows.filter((row) => Boolean(row.is_homemade)).length;
    const takeoutMeals = rows.length - homemadeMeals;
    const favoriteCuisine = pickFavorite(rows.map((row) => row.cuisine_type).filter(Boolean) as string[]);
    const favoriteLocation = pickFavorite(rows.map((row) => row.location_name).filter(Boolean) as string[]);

    return {
      totalMeals: rows.length,
      homemadeMeals,
      takeoutMeals,
      favoriteCuisine,
      favoriteLocation,
    };
  }

  static async clearAllMeals(): Promise<void> {
    await initializeDatabase();

    if (!isUsingNativeDatabase()) {
      await saveRows([]);
      await MealEmbeddingService.clearAllEmbeddings().catch(() => {});
      return;
    }

    const db = getDatabase();
    if (!db) {
      return;
    }

    await db.runAsync('DELETE FROM meals');
    await MealEmbeddingService.clearAllEmbeddings().catch(() => {});
  }

  static async backfillMissingEmbeddings(): Promise<void> {
    const meals = (await getAllRows())
      .filter((row) => !row.is_deleted)
      .map(mapRowToMeal);

    await MealEmbeddingService.backfillMissingEmbeddings(meals);
  }
}

function pickFavorite(values: string[]): string | undefined {
  if (!values.length) {
    return undefined;
  }

  const counts = new Map<string, number>();
  values.forEach((value) => {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  });

  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}
