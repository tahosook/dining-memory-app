import type { CuisineTypeOption } from '../../constants/MealOptions';
import type { AiRuntimeUnavailableCode } from '../runtime/types';

export type MealInputAssistStatus = 'idle' | 'running' | 'success' | 'error' | 'disabled';

export type MealInputAssistField = 'mealName' | 'cuisineType' | 'isHomemade';

export type MealInputAssistAvailability =
  | { kind: 'enabled' }
  | { kind: 'disabled'; reason: string };

export interface MealInputAssistRequest {
  photoUri: string;
  mealName?: string;
  cuisineType?: CuisineTypeOption | '';
  notes?: string;
  locationName?: string;
  isHomemade?: boolean;
}

export interface MealInputAssistTextProviderCandidate {
  value: string;
  confidence?: number | null;
}

export interface MealInputAssistHomemadeProviderCandidate {
  value: boolean | '自炊' | '外食';
  confidence?: number | null;
  label?: string;
}

export interface MealInputAssistProviderResult {
  source: string;
  mealNames?: Array<string | MealInputAssistTextProviderCandidate | null | undefined>;
  cuisineTypes?: Array<string | MealInputAssistTextProviderCandidate | null | undefined>;
  homemade?: Array<boolean | '自炊' | '外食' | MealInputAssistHomemadeProviderCandidate | null | undefined>;
}

export interface MealInputAssistTextSuggestion<TValue extends string = string> {
  value: TValue;
  label: string;
  confidence?: number;
  source: string;
}

export type MealInputAssistCuisineSuggestion = MealInputAssistTextSuggestion<CuisineTypeOption>;

export interface MealInputAssistHomemadeSuggestion {
  value: boolean;
  label: '自炊' | '外食';
  confidence?: number;
  source: string;
}

export interface MealInputAssistSuggestions {
  source: string;
  mealNames: MealInputAssistTextSuggestion[];
  cuisineTypes: MealInputAssistCuisineSuggestion[];
  homemade: MealInputAssistHomemadeSuggestion[];
}

export interface AppliedMealInputAssistMetadata {
  aiSource: string;
  aiConfidence?: number;
  appliedFields: MealInputAssistField[];
}

export interface MealInputAssistProvider {
  suggest: (request: MealInputAssistRequest) => Promise<MealInputAssistProviderResult>;
}

export type MealInputAssistProviderMode = 'mock' | 'local-runtime-prototype' | 'override';

export type MealInputAssistRuntimeUnavailableCode = AiRuntimeUnavailableCode;

export type MealInputAssistRuntimeAvailability =
  | {
    kind: 'ready';
    mode: MealInputAssistProviderMode;
    description: string;
    provider: MealInputAssistProvider;
  }
  | {
    kind: 'unavailable';
    mode: 'local-runtime-prototype';
    code: MealInputAssistRuntimeUnavailableCode;
    reason: string;
  };

export type MealInputAssistPolicy = (request: MealInputAssistRequest) => MealInputAssistAvailability;

export const EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS: MealInputAssistSuggestions = {
  source: '',
  mealNames: [],
  cuisineTypes: [],
  homemade: [],
};
