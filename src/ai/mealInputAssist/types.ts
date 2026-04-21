import type { CuisineTypeOption } from '../../constants/MealOptions';
import type { AiRuntimeUnavailableCode } from '../runtime/types';

export type MealInputAssistStatus = 'idle' | 'running' | 'success' | 'error' | 'disabled';

export type MealInputAssistField = 'mealName' | 'cuisineType';

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

export interface MealInputAssistProviderResult {
  source: string;
  mealNames?: Array<string | MealInputAssistTextProviderCandidate | null | undefined>;
  cuisineTypes?: Array<string | MealInputAssistTextProviderCandidate | null | undefined>;
}

export interface MealInputAssistTextSuggestion<TValue extends string = string> {
  value: TValue;
  label: string;
  confidence?: number;
  source: string;
}

export type MealInputAssistCuisineSuggestion = MealInputAssistTextSuggestion<CuisineTypeOption>;

export interface MealInputAssistSuggestions {
  source: string;
  mealNames: MealInputAssistTextSuggestion[];
  cuisineTypes: MealInputAssistCuisineSuggestion[];
}

export interface AppliedMealInputAssistMetadata {
  aiSource: string;
  aiConfidence?: number;
  appliedFields: MealInputAssistField[];
}

export type MealInputAssistProgressStage =
  | 'preparing'
  | 'loading_model'
  | 'initializing_multimodal'
  | 'analyzing_photo'
  | 'generating_response'
  | 'finalizing';

export interface MealInputAssistProgressUpdate {
  stage: MealInputAssistProgressStage;
  message: string;
  progress: number | null;
  estimatedRemainingMs: number | null;
}

export interface MealInputAssistProgress extends MealInputAssistProgressUpdate {
  elapsedMs: number;
}

export interface MealInputAssistSuggestOptions {
  onProgress?: (progress: MealInputAssistProgressUpdate) => void;
}

export interface MealInputAssistProvider {
  suggest: (
    request: MealInputAssistRequest,
    options?: MealInputAssistSuggestOptions
  ) => Promise<MealInputAssistProviderResult>;
}

export type MealInputAssistModelFileKey = 'model' | 'projector';
export type MealInputAssistModelStatusKind = 'not_installed' | 'ready' | 'error';

export interface MealInputAssistModelStatus {
  kind: MealInputAssistModelStatusKind;
  version: string | null;
  downloadedAt: number | null;
  errorMessage: string | null;
  expectedPaths: string[];
  files: {
    modelExists: boolean;
    projectorExists: boolean;
  };
}

export interface MealInputAssistModelDownloadProgress {
  phase: 'preparing' | 'downloading' | 'installing';
  completedFiles: number;
  totalFiles: number;
  overallProgress: number;
  currentFileKey: MealInputAssistModelFileKey | null;
  currentFileLabel: string | null;
  currentFileFileName: string | null;
  currentFileSourceFileName: string | null;
  currentFileBytesWritten: number;
  currentFileBytesExpected: number | null;
  currentFileProgress: number | null;
}

export interface MealInputAssistModelInstallerOptions {
  onProgress?: (progress: MealInputAssistModelDownloadProgress) => void;
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
};
