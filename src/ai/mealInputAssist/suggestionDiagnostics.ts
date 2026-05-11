import type { MealInputAssistProviderResult, MealInputAssistSuggestions } from './types';

export function hasAnyMealInputAssistSuggestions(suggestions: MealInputAssistSuggestions) {
  return (
    Boolean(suggestions.noteDraft) ||
    suggestions.mealNames.length > 0 ||
    suggestions.cuisineTypes.length > 0
  );
}

export function countProviderResultCandidates(result: MealInputAssistProviderResult) {
  return {
    noteDraft: result.noteDraft ? 1 : 0,
    mealNames: result.mealNames?.length ?? 0,
    cuisineTypes: result.cuisineTypes?.length ?? 0,
  };
}

export function countNormalizedSuggestions(suggestions: MealInputAssistSuggestions) {
  return {
    noteDraft: suggestions.noteDraft ? 1 : 0,
    mealNames: suggestions.mealNames.length,
    cuisineTypes: suggestions.cuisineTypes.length,
  };
}
