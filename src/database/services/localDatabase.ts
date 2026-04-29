import { Platform } from 'react-native';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import type { Meal } from '../../types/MealTypes';
import { normalizeCookingLevel } from '../../utils/cookingLevel';

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

export interface PersistedAppSettingRow {
  key: string;
  value?: string | null;
  updated_at: number;
}

export interface PersistedSearchVectorRow {
  meal_id: string;
  vector_data: string;
  vector_model: string;
  vector_dimension: number;
  indexed_text: string;
  text_version: number;
  created_at: number;
  updated_at: number;
}

type InMemoryState = {
  meals: PersistedMealRow[];
  appSettings: Record<string, string>;
  searchVectors: PersistedSearchVectorRow[];
};

const DB_NAME = 'DiningMemory.db';
export const DATABASE_SCHEMA_VERSION = 2;

let nativeDb: SQLiteDatabase | null = null;
let initialized = false;
const memoryState: InMemoryState = {
  meals: [],
  appSettings: {},
  searchVectors: [],
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

const APP_SETTINGS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_app_settings_updated_at ON app_settings(updated_at);
`;

const SEARCH_VECTORS_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS search_vectors (
    meal_id TEXT PRIMARY KEY NOT NULL,
    vector_data TEXT NOT NULL,
    vector_model TEXT NOT NULL,
    vector_dimension INTEGER NOT NULL,
    indexed_text TEXT NOT NULL,
    text_version INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_search_vectors_updated_at ON search_vectors(updated_at);
`;

const DATABASE_MIGRATIONS: Array<{ version: number; sql: string }> = [
  {
    version: 1,
    sql: `${MEALS_TABLE_SQL}\n${APP_SETTINGS_TABLE_SQL}`,
  },
  {
    version: 2,
    sql: SEARCH_VECTORS_TABLE_SQL,
  },
];

function isNativeRuntime() {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

function getNativeSchemaVersion(database: SQLiteDatabase) {
  const result = database.getFirstSync<{ user_version: number }>('PRAGMA user_version');
  return result?.user_version ?? 0;
}

function applyNativeMigrations(database: SQLiteDatabase) {
  let currentVersion = getNativeSchemaVersion(database);

  DATABASE_MIGRATIONS.forEach((migration) => {
    if (currentVersion >= migration.version) {
      return;
    }

    database.execSync(migration.sql);
    database.execSync(`PRAGMA user_version = ${migration.version}`);
    currentVersion = migration.version;
  });
}

function ensureNativeDatabase(): SQLiteDatabase {
  if (!nativeDb) {
    nativeDb = openDatabaseSync(DB_NAME);
  }

  if (!initialized) {
    applyNativeMigrations(nativeDb);
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

export function getInMemoryAppSettings(): Record<string, string> {
  return { ...memoryState.appSettings };
}

export function setInMemoryAppSettings(nextAppSettings: Record<string, string>) {
  memoryState.appSettings = { ...nextAppSettings };
}

export function getInMemorySearchVectors(): PersistedSearchVectorRow[] {
  return [...memoryState.searchVectors];
}

export function setInMemorySearchVectors(nextSearchVectors: PersistedSearchVectorRow[]) {
  memoryState.searchVectors = [...nextSearchVectors];
}

export function resetInMemoryDatabase() {
  memoryState.meals = [];
  memoryState.appSettings = {};
  memoryState.searchVectors = [];
}

export async function getDatabaseSchemaVersion(): Promise<number> {
  await initializeDatabase();

  if (!isUsingNativeDatabase()) {
    return DATABASE_SCHEMA_VERSION;
  }

  const database = getDatabase();
  if (!database) {
    return 0;
  }

  return getNativeSchemaVersion(database);
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
    cooking_level: normalizeCookingLevel(row.cooking_level),
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
