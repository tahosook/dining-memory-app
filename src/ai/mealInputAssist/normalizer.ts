import { CUISINE_TYPE_OPTIONS, type CuisineTypeOption } from '../../constants/MealOptions';
import type {
  MealInputAssistCuisineSuggestion,
  MealInputAssistProviderResult,
  MealInputAssistSuggestions,
  MealInputAssistTextProviderCandidate,
  MealInputAssistTextSuggestion,
} from './types';

const VALID_CUISINES = new Set<string>(CUISINE_TYPE_OPTIONS);
const MAX_SUGGESTIONS_PER_GROUP = 3;

function normalizeConfidence(confidence: number | null | undefined) {
  if (typeof confidence !== 'number' || Number.isNaN(confidence)) {
    return undefined;
  }

  return Math.min(Math.max(confidence, 0), 1);
}

function normalizeTextCandidate(
  candidate: string | MealInputAssistTextProviderCandidate | null | undefined,
  source: string
): MealInputAssistTextSuggestion | null {
  if (typeof candidate === 'string') {
    const value = candidate.trim();
    return value ? { value, label: value, source } : null;
  }

  if (!candidate) {
    return null;
  }

  if (typeof candidate.value !== 'string') {
    return null;
  }

  const value = candidate.value.trim();
  if (!value) {
    return null;
  }

  return {
    value,
    label: value,
    confidence: normalizeConfidence(candidate.confidence),
    source,
  };
}

function normalizeMealNameSuggestions(
  candidates: MealInputAssistProviderResult['mealNames'],
  source: string
) {
  const seen = new Set<string>();

  return (candidates ?? [])
    .map((candidate) => normalizeTextCandidate(candidate, source))
    .filter((candidate): candidate is MealInputAssistTextSuggestion => {
      if (!candidate) {
        return false;
      }

      const key = candidate.value.toLocaleLowerCase();
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, MAX_SUGGESTIONS_PER_GROUP);
}

function normalizeNoteDraftSuggestion(
  candidate: MealInputAssistProviderResult['noteDraft'],
  source: string
) {
  return normalizeTextCandidate(candidate, source);
}

function normalizeCuisineSuggestions(
  candidates: MealInputAssistProviderResult['cuisineTypes'],
  source: string
) {
  const seen = new Set<string>();

  return (candidates ?? [])
    .map((candidate) => normalizeTextCandidate(candidate, source))
    .filter((candidate): candidate is MealInputAssistCuisineSuggestion => {
      if (!candidate || !VALID_CUISINES.has(candidate.value)) {
        return false;
      }

      if (seen.has(candidate.value)) {
        return false;
      }

      seen.add(candidate.value);
      return true;
    })
    .map((candidate) => ({
      ...candidate,
      value: candidate.value as CuisineTypeOption,
    }))
    .slice(0, MAX_SUGGESTIONS_PER_GROUP);
}

export function normalizeMealInputAssistResult(result: MealInputAssistProviderResult): MealInputAssistSuggestions {
  const source = typeof result.source === 'string' && result.source.trim()
    ? result.source.trim()
    : 'mock-local';

  return {
    source,
    noteDraft: normalizeNoteDraftSuggestion(result.noteDraft, source),
    mealNames: normalizeMealNameSuggestions(result.mealNames, source),
    cuisineTypes: normalizeCuisineSuggestions(result.cuisineTypes, source),
  };
}
