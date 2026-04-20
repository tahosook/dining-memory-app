import {
  getDatabase,
  getInMemorySearchVectors,
  initializeDatabase,
  isUsingNativeDatabase,
  setInMemorySearchVectors,
  type PersistedSearchVectorRow,
} from './localDatabase';
import {
  getLocalLlamaTextEmbeddingAvailability,
  type AiTextEmbeddingProvider,
} from '../../ai/runtime';
import {
  buildMealEmbeddingText,
  MEAL_EMBEDDING_TEXT_VERSION,
} from '../../ai/search/buildMealEmbeddingText';
import type { Meal } from '../../types/MealTypes';

export interface MealEmbeddingRecord {
  mealId: string;
  vector: number[];
  vectorModel: string;
  vectorDimension: number;
  indexedText: string;
  textVersion: number;
  createdAt: number;
  updatedAt: number;
}

export interface UpsertMealEmbeddingData {
  mealId: string;
  vector: number[];
  vectorModel: string;
  vectorDimension?: number;
  indexedText: string;
  textVersion: number;
}

export interface MealEmbeddingStaleCheck {
  indexedText: string;
  textVersion: number;
  vectorModel?: string;
}

export type MealEmbeddingSource = Pick<
  Meal,
  'id' | 'meal_name' | 'cuisine_type' | 'location_name' | 'notes' | 'tags'
>;

function serializeVector(vector: number[]) {
  return JSON.stringify(vector);
}

function parseVector(vectorData: string) {
  try {
    const parsed = JSON.parse(vectorData);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((value): value is number => typeof value === 'number');
  } catch {
    return [];
  }
}

function mapRowToMealEmbeddingRecord(row: PersistedSearchVectorRow): MealEmbeddingRecord {
  return {
    mealId: row.meal_id,
    vector: parseVector(row.vector_data),
    vectorModel: row.vector_model,
    vectorDimension: row.vector_dimension,
    indexedText: row.indexed_text,
    textVersion: row.text_version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapUpsertDataToRow(
  data: UpsertMealEmbeddingData,
  existing?: PersistedSearchVectorRow
): PersistedSearchVectorRow {
  const now = Date.now();

  return {
    meal_id: data.mealId,
    vector_data: serializeVector(data.vector),
    vector_model: data.vectorModel,
    vector_dimension: data.vectorDimension ?? data.vector.length,
    indexed_text: data.indexedText,
    text_version: data.textVersion,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };
}

async function getAllRows(): Promise<PersistedSearchVectorRow[]> {
  await initializeDatabase();

  if (!isUsingNativeDatabase()) {
    return getInMemorySearchVectors();
  }

  const database = getDatabase();
  if (!database) {
    return [];
  }

  return database.getAllAsync<PersistedSearchVectorRow>('SELECT * FROM search_vectors');
}

async function upsertRow(row: PersistedSearchVectorRow) {
  await initializeDatabase();

  if (!isUsingNativeDatabase()) {
    const rows = getInMemorySearchVectors();
    const nextRows = rows.filter((item) => item.meal_id !== row.meal_id);
    nextRows.push(row);
    setInMemorySearchVectors(nextRows);
    return;
  }

  const database = getDatabase();
  if (!database) {
    return;
  }

  await database.runAsync(
    `INSERT OR REPLACE INTO search_vectors (
      meal_id, vector_data, vector_model, vector_dimension, indexed_text, text_version, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    row.meal_id,
    row.vector_data,
    row.vector_model,
    row.vector_dimension,
    row.indexed_text,
    row.text_version,
    row.created_at,
    row.updated_at
  );
}

async function deleteRow(mealId: string) {
  await initializeDatabase();

  if (!isUsingNativeDatabase()) {
    const rows = getInMemorySearchVectors();
    setInMemorySearchVectors(rows.filter((item) => item.meal_id !== mealId));
    return;
  }

  const database = getDatabase();
  if (!database) {
    return;
  }

  await database.runAsync('DELETE FROM search_vectors WHERE meal_id = ?', mealId);
}

export class MealEmbeddingService {
  private static async refreshEmbeddingWithProvider(
    meal: MealEmbeddingSource,
    provider: AiTextEmbeddingProvider
  ): Promise<MealEmbeddingRecord | null> {
    const indexedText = buildMealEmbeddingText(meal);
    if (!indexedText) {
      return null;
    }

    const current = await this.getEmbedding(meal.id);
    const staleCheck = {
      indexedText,
      textVersion: MEAL_EMBEDDING_TEXT_VERSION,
      vectorModel: provider.modelId,
    };

    if (!this.isStale(current, staleCheck)) {
      return current;
    }

    const embedding = await provider.generateEmbedding(indexedText);
    return this.upsertEmbedding({
      mealId: meal.id,
      vector: embedding.vector,
      vectorModel: embedding.modelId,
      vectorDimension: embedding.dimension,
      indexedText,
      textVersion: MEAL_EMBEDDING_TEXT_VERSION,
    });
  }

  static async listEmbeddings(): Promise<MealEmbeddingRecord[]> {
    const rows = await getAllRows();
    return rows.map(mapRowToMealEmbeddingRecord);
  }

  static async getEmbedding(mealId: string): Promise<MealEmbeddingRecord | null> {
    const rows = await getAllRows();
    const row = rows.find((item) => item.meal_id === mealId);
    return row ? mapRowToMealEmbeddingRecord(row) : null;
  }

  static async upsertEmbedding(data: UpsertMealEmbeddingData): Promise<MealEmbeddingRecord> {
    const rows = await getAllRows();
    const existing = rows.find((item) => item.meal_id === data.mealId);
    const nextRow = mapUpsertDataToRow(data, existing);
    await upsertRow(nextRow);
    return mapRowToMealEmbeddingRecord(nextRow);
  }

  static async deleteEmbedding(mealId: string): Promise<void> {
    await deleteRow(mealId);
  }

  static async clearAllEmbeddings(): Promise<void> {
    await initializeDatabase();

    if (!isUsingNativeDatabase()) {
      setInMemorySearchVectors([]);
      return;
    }

    const database = getDatabase();
    if (!database) {
      return;
    }

    await database.runAsync('DELETE FROM search_vectors');
  }

  static async refreshEmbeddingForMeal(meal: MealEmbeddingSource): Promise<MealEmbeddingRecord | null> {
    const availability = await getLocalLlamaTextEmbeddingAvailability();
    if (availability.kind !== 'ready') {
      return null;
    }

    return this.refreshEmbeddingWithProvider(meal, availability.provider);
  }

  static async backfillMissingEmbeddings(meals: MealEmbeddingSource[]): Promise<void> {
    const availability = await getLocalLlamaTextEmbeddingAvailability();
    if (availability.kind !== 'ready') {
      return;
    }

    for (const meal of meals) {
      try {
        await this.refreshEmbeddingWithProvider(meal, availability.provider);
      } catch {
        // Keep backfill best-effort so meal history stays usable while support data catches up.
      }
    }
  }

  static isStale(current: MealEmbeddingRecord | null, next: MealEmbeddingStaleCheck) {
    if (!current) {
      return true;
    }

    if (current.textVersion !== next.textVersion) {
      return true;
    }

    if (current.indexedText !== next.indexedText) {
      return true;
    }

    if (next.vectorModel && current.vectorModel !== next.vectorModel) {
      return true;
    }

    return false;
  }
}
