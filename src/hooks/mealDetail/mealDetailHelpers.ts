import type { MealEditDraft } from '../../components/common/MealEditModal';
import type { MealPhotoViewerPhoto } from '../../components/common/MealPhotoViewer';
import { buildMealShareText } from '../../media/mealShare';
import type { Meal } from '../../types/MealTypes';
import { normalizeCookingLevel } from '../../utils/cookingLevel';
import { getMealDetailImageUri } from '../../utils/mealImage';

export type DetailNavigationDirection = 'previous' | 'next';

type MealDetailViewerPhoto = MealPhotoViewerPhoto & {
  mealIndex: number;
};

export const emptyEditDraft: MealEditDraft = {
  mealName: '',
  cuisineType: '',
  location: '',
  notes: '',
  isHomemade: true,
  cookingLevel: '',
};

export function createMealEditDraft(meal: Meal): MealEditDraft {
  return {
    mealName: meal.meal_name,
    cuisineType: meal.cuisine_type ?? '',
    location: meal.location_name ?? '',
    notes: meal.notes ?? '',
    isHomemade: meal.is_homemade,
    cookingLevel: normalizeCookingLevel(meal.cooking_level) ?? '',
  };
}

export function buildInitialShareText(meal: Meal): string {
  return buildMealShareText(meal);
}

export function formatMealDate(mealDatetime: number): string {
  return new Date(mealDatetime).toLocaleString('ja-JP');
}

export function createInitialDetailMeals(meal: Meal, meals?: Meal[]): Meal[] {
  return meals?.length ? meals : [meal];
}

export function clampDetailIndex(index: number, mealsLength: number): number {
  return Math.max(0, Math.min(index, mealsLength - 1));
}

export function getAdjacentMealIndex(
  currentIndex: number,
  mealsLength: number,
  direction: DetailNavigationDirection
): number {
  if (mealsLength <= 0) {
    return currentIndex;
  }

  if (direction === 'next') {
    return Math.min(currentIndex + 1, mealsLength - 1);
  }

  return Math.max(currentIndex - 1, 0);
}

export function canNavigateMealDetail(
  editingVisible: boolean,
  shareComposerVisible: boolean
): boolean {
  return !editingVisible && !shareComposerVisible;
}

export function createMealDetailViewerPhotos(meals: Meal[]): MealDetailViewerPhoto[] {
  return meals.reduce<MealDetailViewerPhoto[]>((photos, item, index) => {
    const uri = getMealDetailImageUri(item);

    if (!uri) {
      return photos;
    }

    photos.push({
      id: item.id,
      uri,
      title: item.meal_name,
      mealIndex: index,
    });

    return photos;
  }, []);
}

export function getMealDetailViewerPhotoIndex(
  photos: readonly Pick<MealDetailViewerPhoto, 'mealIndex'>[],
  currentIndex: number
): number {
  const viewerIndex = photos.findIndex(photo => photo.mealIndex === currentIndex);
  return viewerIndex >= 0 ? viewerIndex : 0;
}
