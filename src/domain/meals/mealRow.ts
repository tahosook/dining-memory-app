import type { CookingLevel } from '../../types/MealTypes';
import type { PersistedMealRow } from '../../database/services/localDatabase';
import { inferCookingLevel, normalizeCookingLevel } from '../../utils/cookingLevel';
import { generateSearchText } from './search';

export interface MealRowInput {
  meal_name: string;
  meal_type?: string;
  cuisine_type?: string;
  ai_confidence?: number;
  ai_source?: string;
  notes?: string;
  cooking_level?: CookingLevel | string;
  is_homemade: boolean;
  photo_path: string;
  photo_thumbnail_path?: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  meal_datetime: Date;
  search_text?: string;
  tags?: string;
}

interface NormalizeMealRowOptions {
  existing?: PersistedMealRow;
  nowMs: number;
  createId: () => string;
}

export function resolveCookingLevelForSave(
  data: Pick<MealRowInput, 'cooking_level' | 'is_homemade' | 'meal_name' | 'cuisine_type' | 'notes'>
): CookingLevel | undefined {
  if (!data.is_homemade) {
    return undefined;
  }

  return normalizeCookingLevel(data.cooking_level) ?? inferCookingLevel({
    mealName: data.meal_name,
    cuisineType: data.cuisine_type,
    notes: data.notes,
    isHomemade: data.is_homemade,
  });
}

export function normalizeMealRow(
  data: MealRowInput,
  { existing, nowMs, createId }: NormalizeMealRowOptions
): PersistedMealRow {
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
