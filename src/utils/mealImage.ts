import type { Meal } from '../types/MealTypes';

function normalizeMealImageUri(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }

  if (
    path.startsWith('file://')
    || path.startsWith('content://')
    || path.startsWith('ph://')
    || path.startsWith('http://')
    || path.startsWith('https://')
  ) {
    return path;
  }

  return `file://${path}`;
}

export function getMealListImageUri(meal: Pick<Meal, 'photo_path' | 'photo_thumbnail_path'>): string | undefined {
  return normalizeMealImageUri(meal.photo_thumbnail_path ?? meal.photo_path);
}

export function getMealDetailImageUri(meal: Pick<Meal, 'photo_path' | 'photo_thumbnail_path'>): string | undefined {
  return normalizeMealImageUri(meal.photo_path ?? meal.photo_thumbnail_path);
}
