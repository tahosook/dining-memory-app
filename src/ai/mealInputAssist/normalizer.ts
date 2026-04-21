import { CUISINE_TYPE_OPTIONS, type CuisineTypeOption } from '../../constants/MealOptions';
import type {
  MealInputAssistCuisineSuggestion,
  MealInputAssistHomemadeProviderCandidate,
  MealInputAssistHomemadeSuggestion,
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

function normalizeHomemadeValue(value: boolean | '自炊' | '外食') {
  if (value === true || value === '自炊') {
    return { value: true, label: '自炊' as const };
  }

  if (value === false || value === '外食') {
    return { value: false, label: '外食' as const };
  }

  return null;
}

function normalizeHomemadeCandidate(
  candidate: boolean | '自炊' | '外食' | MealInputAssistHomemadeProviderCandidate | null | undefined,
  source: string
): MealInputAssistHomemadeSuggestion | null {
  if (typeof candidate === 'boolean' || candidate === '自炊' || candidate === '外食') {
    const normalized = normalizeHomemadeValue(candidate);
    return normalized ? { ...normalized, source } : null;
  }

  if (!candidate) {
    return null;
  }

  const normalized = normalizeHomemadeValue(candidate.value);
  if (!normalized) {
    return null;
  }

  return {
    ...normalized,
    confidence: normalizeConfidence(candidate.confidence),
    source,
  };
}

function normalizeHomemadeSuggestions(
  candidates: MealInputAssistProviderResult['homemade'],
  source: string
) {
  const seen = new Set<string>();

  return (candidates ?? [])
    .map((candidate) => normalizeHomemadeCandidate(candidate, source))
    .filter((candidate): candidate is MealInputAssistHomemadeSuggestion => {
      if (!candidate) {
        return false;
      }

      const key = String(candidate.value);
      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    })
    .slice(0, MAX_SUGGESTIONS_PER_GROUP);
}

export function normalizeMealInputAssistResult(result: MealInputAssistProviderResult): MealInputAssistSuggestions {
  const source = typeof result.source === 'string' && result.source.trim()
    ? result.source.trim()
    : 'mock-local';

  return {
    source,
    mealNames: normalizeMealNameSuggestions(result.mealNames, source),
    cuisineTypes: normalizeCuisineSuggestions(result.cuisineTypes, source),
    homemade: normalizeHomemadeSuggestions(result.homemade, source),
  };
}
