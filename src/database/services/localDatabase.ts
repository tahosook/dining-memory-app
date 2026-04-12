import { Platform } from 'react-native';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import type { Meal } from '../../types/MealTypes';

export interface PersistedMealRow {
  id: string;
  uuid: string;
  meal_name: string;
  meal_type?: string | null;
  cuisine_type?: string | null;
  ai_confidence?: number | null;
  ai_source?: string | null;
  notes?: string | null;
  cooking_level?: string | null;
  is_homemade: number;
  photo_path: string;
  photo_thumbnail_path?: string | null;
  location_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  meal_datetime: number;
  search_text?: string | null;
  tags?: string | null;
  is_deleted: number;
  created_at: number;
  updated_at: number;
}

type InMemoryState = {
  meals: PersistedMealRow[];
};

const DB_NAME = 'DiningMemory.db';

let nativeDb: SQLiteDatabase | null = null;
let initialized = false;
const memoryState: InMemoryState = {
  meals: [],
};

const MEALS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS meals (
    id TEXT PRIMARY KEY NOT NULL,
    uuid TEXT NOT NULL,
    meal_name TEXT NOT NULL,
    meal_type TEXT,
    cuisine_type TEXT,
    ai_confidence REAL,
    ai_source TEXT,
    notes TEXT,
    cooking_level TEXT,
    is_homemade INTEGER NOT NULL DEFAULT 0,
    photo_path TEXT NOT NULL,
    photo_thumbnail_path TEXT,
    location_name TEXT,
    latitude REAL,
    longitude REAL,
    meal_datetime INTEGER NOT NULL,
    search_text TEXT,
    tags TEXT,
    is_deleted INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_meals_meal_datetime ON meals(meal_datetime);
  CREATE INDEX IF NOT EXISTS idx_meals_location_name ON meals(location_name);
  CREATE INDEX IF NOT EXISTS idx_meals_is_deleted ON meals(is_deleted);
  CREATE INDEX IF NOT EXISTS idx_meals_search_text ON meals(search_text);
`;

function isNativeRuntime() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function ensureNativeDatabase(): SQLiteDatabase {
  if (!nativeDb) {
    nativeDb = openDatabaseSync(DB_NAME);
  }

  if (!initialized) {
    nativeDb.execSync(MEALS_TABLE_SQL);
    initialized = true;
  }

  return nativeDb;
}

export async function initializeDatabase(): Promise<void> {
  if (isNativeRuntime()) {
    ensureNativeDatabase();
  } else {
    initialized = true;
  }
}

export function getDatabase() {
  if (isNativeRuntime()) {
    return ensureNativeDatabase();
  }

  return null;
}

export function isUsingNativeDatabase() {
  return isNativeRuntime();
}

export function getInMemoryMeals(): PersistedMealRow[] {
  return [...memoryState.meals];
}

export function setInMemoryMeals(nextMeals: PersistedMealRow[]) {
  memoryState.meals = [...nextMeals];
}

export function resetInMemoryDatabase() {
  memoryState.meals = [];
}

export function mapRowToMeal(row: PersistedMealRow): Meal {
  return {
    id: row.id,
    uuid: row.uuid,
    meal_name: row.meal_name,
    meal_type: (row.meal_type ?? undefined) as Meal['meal_type'],
    cuisine_type: row.cuisine_type ?? undefined,
    ai_confidence: row.ai_confidence ?? undefined,
    ai_source: row.ai_source ?? undefined,
    notes: row.notes ?? undefined,
    cooking_level: (row.cooking_level ?? undefined) as Meal['cooking_level'],
    is_homemade: Boolean(row.is_homemade),
    photo_path: row.photo_path,
    photo_thumbnail_path: row.photo_thumbnail_path ?? undefined,
    location_name: row.location_name ?? undefined,
    latitude: row.latitude ?? undefined,
    longitude: row.longitude ?? undefined,
    meal_datetime: row.meal_datetime,
    search_text: row.search_text ?? undefined,
    tags: row.tags ?? undefined,
    is_deleted: Boolean(row.is_deleted),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
