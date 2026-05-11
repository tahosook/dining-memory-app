import type { CuisineTypeOption } from '../../constants/MealOptions';
import type { MealInputAssistRequest } from './types';

export interface MealInputAssistReviewInput {
  photoUri: string;
  mealName: string;
  cuisineType: CuisineTypeOption | '';
  notes: string;
  locationName: string;
  isHomemade: boolean;
}

export function buildMealInputAssistRequest(
  review: MealInputAssistReviewInput
): MealInputAssistRequest {
  return {
    photoUri: review.photoUri,
    mealName: review.mealName,
    cuisineType: review.cuisineType,
    notes: review.notes,
    locationName: review.locationName,
    isHomemade: review.isHomemade,
  };
}
