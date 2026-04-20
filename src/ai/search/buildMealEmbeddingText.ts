import type { Meal } from '../../types/MealTypes';

export const MEAL_EMBEDDING_TEXT_VERSION = 1;

export type MealEmbeddingTextSource = Pick<
  Meal,
  'meal_name' | 'cuisine_type' | 'location_name' | 'notes' | 'tags'
>;

function normalizeSegment(value?: string) {
  return value?.trim().replace(/\s+/g, ' ') ?? '';
}

export function buildMealEmbeddingText(source: MealEmbeddingTextSource): string {
  return [
    normalizeSegment(source.meal_name),
    normalizeSegment(source.cuisine_type),
    normalizeSegment(source.location_name),
    normalizeSegment(source.notes),
    normalizeSegment(source.tags),
  ]
    .filter((value) => value.length > 0)
    .join('\n');
}
