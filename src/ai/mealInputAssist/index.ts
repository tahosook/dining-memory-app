export { defaultMealInputAssistProvider, MockMealInputAssistProvider } from './provider';
export { normalizeMealInputAssistResult } from './normalizer';
export { MEDIAPIPE_STATIC_IMAGE_SOURCE, normalizeMediaPipeStaticImageResult } from './mediapipeStaticImageNormalizer';
export { createMealInputAssistPolicy, defaultMealInputAssistPolicy } from './policy';
export { LocalRuntimePrototypeMealInputAssistProvider, getLocalRuntimePrototypeAvailability } from './localRuntimePrototype';
export {
  MediaPipeStaticImageMealInputAssistProvider,
  MediaPipeStaticImageNativeModuleClassifier,
  getMediaPipeStaticImageAvailability,
} from './mediapipeStaticImageProvider';
export {
  getMealInputAssistManagedFiles,
  getMealInputAssistExpectedPaths,
  MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME,
  MEAL_INPUT_ASSIST_MODEL_CONFIG,
  resolveMealInputAssistModelDirectoryPath,
  resolveMealInputAssistModelPath,
  resolveMealInputAssistProjectorPath,
} from './modelConfig';
export {
  createNoopRuntimeAvailability,
  createOverrideRuntimeAvailability,
  createUnavailableRuntimeAvailability,
  loadMealInputAssistRuntimeAvailability,
} from './runtime';
export type {
  AppliedMealInputAssistMetadata,
  MealInputAssistAvailability,
  MealInputAssistCuisineSuggestion,
  MealInputAssistField,
  MealInputAssistProgress,
  MealInputAssistProgressStage,
  MealInputAssistProgressUpdate,
  MealInputAssistModelDownloadProgress,
  MealInputAssistModelFileKey,
  MealInputAssistModelInstallerOptions,
  MealInputAssistModelStatus,
  MealInputAssistModelStatusKind,
  MealInputAssistPolicy,
  MealInputAssistPrewarmOptions,
  MealInputAssistPrewarmStatus,
  MealInputAssistProvider,
  MealInputAssistProviderMode,
  MealInputAssistProviderResult,
  MealInputAssistRequest,
  MealInputAssistSuggestOptions,
  MealInputAssistRuntimeAvailability,
  MealInputAssistRuntimeUnavailableCode,
  MealInputAssistStatus,
  MealInputAssistSuggestions,
  MealInputAssistTextProviderCandidate,
  MealInputAssistTextSuggestion,
} from './types';
export type {
  MediaPipeStaticImageCategory,
  MediaPipeStaticImageClassifier,
  MediaPipeStaticImageClassifierStatus,
  MediaPipeStaticImageNormalizedMetadata,
  MediaPipeStaticImageNormalizedResult,
  MediaPipeStaticImageRawResult,
} from './mediapipeStaticImageTypes';
export { EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS } from './types';
