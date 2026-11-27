export type LocalAiModelStatusKind = 'not_installed' | 'ready' | 'error';

export const MEDIAPIPE_CLASSIFIER_MODEL_IDS = [
  'cooking_method_9class',
  'universal_dining_23class',
  'personal_dual_dish',
] as const;

export type MediaPipeClassifierModelId = (typeof MEDIAPIPE_CLASSIFIER_MODEL_IDS)[number];

export const DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID: MediaPipeClassifierModelId =
  'cooking_method_9class';

export const PERSONAL_DUAL_DISH_SUBMODEL_IDS = {
  main: 'personal_main_dish',
  side: 'personal_side_dish',
} as const;

export const LEGACY_MEDIAPIPE_CLASSIFIER_MODEL_IDS = [
  'personal_multilabel_44tag',
  'personal_household_8class',
  'universal_scene_7class',
] as const;

export type LegacyMediaPipeClassifierModelId =
  (typeof LEGACY_MEDIAPIPE_CLASSIFIER_MODEL_IDS)[number];

const LEGACY_MEDIAPIPE_MODEL_SUCCESSOR_MAP: Record<
  LegacyMediaPipeClassifierModelId,
  MediaPipeClassifierModelId
> = {
  universal_scene_7class: 'universal_dining_23class',
  personal_household_8class: 'personal_dual_dish',
  personal_multilabel_44tag: 'personal_dual_dish',
};

export const RETIRED_MEDIAPIPE_MODEL_FILE_NAMES: readonly string[] =
  LEGACY_MEDIAPIPE_CLASSIFIER_MODEL_IDS.map(id => `${id}.task`);

function isMediaPipeClassifierModelId(
  value: string | null | undefined
): value is MediaPipeClassifierModelId {
  return (
    typeof value === 'string' &&
    (MEDIAPIPE_CLASSIFIER_MODEL_IDS as readonly string[]).includes(value)
  );
}

/** Returns true when the given value matches a retired MediaPipe classifier model ID. */
export function isLegacyMediaPipeClassifierModelId(
  value: string | null | undefined
): value is LegacyMediaPipeClassifierModelId {
  return (
    typeof value === 'string' &&
    (LEGACY_MEDIAPIPE_CLASSIFIER_MODEL_IDS as readonly string[]).includes(value)
  );
}

/**
 * Resolves any persisted model ID (active, legacy, empty, or unknown) to a supported
 * MediaPipeClassifierModelId without performing any persistence side effects.
 */
export function resolveMediaPipeClassifierModelId(
  rawValue: string | null | undefined
): MediaPipeClassifierModelId {
  if (isMediaPipeClassifierModelId(rawValue)) {
    return rawValue;
  }
  if (isLegacyMediaPipeClassifierModelId(rawValue)) {
    return LEGACY_MEDIAPIPE_MODEL_SUCCESSOR_MAP[rawValue];
  }
  return DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID;
}
