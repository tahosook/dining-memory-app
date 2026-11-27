import type { CookingLevel } from '../../types/MealTypes';
import type { PersistedMealRow } from '../persistedTypes';
import { inferCookingLevel, normalizeCookingLevel } from '../../utils/cookingLevel';
import { generateSearchText } from './search';

export interface MealRowInput {
  meal_name: string;
  meal_type?: string | null;
  cuisine_type?: string | null;
  ai_confidence?: number | null;
  ai_source?: string | null;
  notes?: string | null;
  cooking_level?: CookingLevel | string | null;
  is_homemade: boolean;
  photo_path: string;
  photo_thumbnail_path?: string | null;
  location_name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  meal_datetime: Date;
  search_text?: string | null;
  tags?: string | null;
}

interface NormalizeMealRowOptions {
  existing?: PersistedMealRow;
  nowMs: number;
  createId: () => string;
}

export function resolveCookingLevelForSave(
  data: Pick<MealRowInput, 'cooking_level' | 'is_homemade' | 'meal_name' | 'cuisine_type' | 'notes'>
): CookingLevel | undefined {
  if (!data.is_homemade || data.cooking_level === null) {
    return undefined;
  }

  return (
    normalizeCookingLevel(data.cooking_level) ??
    inferCookingLevel({
      mealName: data.meal_name,
      cuisineType: data.cuisine_type,
      notes: data.notes,
      isHomemade: data.is_homemade,
    })
  );
}

export function normalizeMealRow(
  data: MealRowInput,
  { existing, nowMs, createId }: NormalizeMealRowOptions
): PersistedMealRow {
  const searchText = data.search_text !== undefined ? data.search_text : generateSearchText(data);

  return {
    id: existing?.id ?? createId(),
    uuid: existing?.uuid ?? createId(),
    meal_name: data.meal_name,
    meal_type: data.meal_type ?? null,
    cuisine_type: data.cuisine_type ?? null,
    ai_confidence: data.ai_confidence ?? null,
    ai_source: data.ai_source ?? null,
    notes: data.notes ?? null,
    cooking_level: resolveCookingLevelForSave(data) ?? null,
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
    created_at: existing?.created_at ?? nowMs,
    updated_at: nowMs,
  };
}
