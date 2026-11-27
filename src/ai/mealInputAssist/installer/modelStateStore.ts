import {
  AppSettingsService,
  type MealInputAssistModelStatusSetting,
  type MediaPipeModelStatusSetting,
} from '../../../database/services/AppSettingsService';
import {
  DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID,
  MEDIAPIPE_CLASSIFIER_MODEL_IDS,
  type MediaPipeClassifierModelId,
} from '../../../domain/ai/mediapipeModelIds';
import {
  MEAL_INPUT_ASSIST_MODEL_CONFIG,
  MEDIAPIPE_CLASSIFIER_MODELS,
  MEDIAPIPE_MODEL_CONFIG,
} from '../modelConfig';

export interface PersistedModelState<TStatus extends string> {
  status: TStatus;
  version: string | null;
  downloadedAt: number | null;
  errorMessage: string | null;
}

/** Reads persisted GGUF model status metadata from AppSettingsService. */
export async function readMealInputAssistModelPersistedState(): Promise<
  PersistedModelState<MealInputAssistModelStatusSetting>
> {
  const [status, version, downloadedAt, errorMessage] = await Promise.all([
    AppSettingsService.getMealInputAssistModelStatus(),
    AppSettingsService.getMealInputAssistModelVersion(),
    AppSettingsService.getMealInputAssistModelDownloadedAt(),
    AppSettingsService.getMealInputAssistModelErrorMessage(),
  ]);

  return { status, version, downloadedAt, errorMessage };
}

/** Persists ready state for the GGUF meal input assist model. */
export async function persistMealInputAssistReadyState(): Promise<void> {
  await Promise.all([
    AppSettingsService.setMealInputAssistModelVersion(MEAL_INPUT_ASSIST_MODEL_CONFIG.version),
    AppSettingsService.setMealInputAssistModelStatus('ready'),
    AppSettingsService.setMealInputAssistModelDownloadedAt(Date.now()),
    AppSettingsService.setMealInputAssistModelErrorMessage(null),
  ]);
}

/** Persists error state for the GGUF meal input assist model. */
export async function persistMealInputAssistErrorState(message: string): Promise<void> {
  await Promise.all([
    AppSettingsService.setMealInputAssistModelVersion(MEAL_INPUT_ASSIST_MODEL_CONFIG.version),
    AppSettingsService.setMealInputAssistModelStatus('error'),
    AppSettingsService.setMealInputAssistModelErrorMessage(message),
  ]);
}

/** Resets persisted state for the GGUF meal input assist model to not_installed. */
export async function persistMealInputAssistNotInstalledState(): Promise<void> {
  await Promise.all([
    AppSettingsService.setMealInputAssistModelVersion(null),
    AppSettingsService.setMealInputAssistModelStatus('not_installed'),
    AppSettingsService.setMealInputAssistModelDownloadedAt(null),
    AppSettingsService.setMealInputAssistModelErrorMessage(null),
  ]);
}

async function persistLegacyMediaPipeReadyState(version: string): Promise<void> {
  await Promise.all([
    AppSettingsService.setMediaPipeModelVersion(version),
    AppSettingsService.setMediaPipeModelStatus('ready'),
    AppSettingsService.setMediaPipeModelDownloadedAt(Date.now()),
    AppSettingsService.setMediaPipeModelErrorMessage(null),
  ]);
}

async function persistLegacyMediaPipeErrorState(
  message: string,
  version?: string | null
): Promise<void> {
  await Promise.all([
    AppSettingsService.setMediaPipeModelVersion(version ?? MEDIAPIPE_MODEL_CONFIG.version),
    AppSettingsService.setMediaPipeModelStatus('error'),
    AppSettingsService.setMediaPipeModelErrorMessage(message),
  ]);
}

async function persistLegacyMediaPipeNotInstalledState(): Promise<void> {
  await Promise.all([
    AppSettingsService.setMediaPipeModelVersion(null),
    AppSettingsService.setMediaPipeModelStatus('not_installed'),
    AppSettingsService.setMediaPipeModelDownloadedAt(null),
    AppSettingsService.setMediaPipeModelErrorMessage(null),
  ]);
}

/** Reads persisted status metadata for a specific MediaPipe classifier model. */
export async function readMediaPipeModelPersistedStateForModel(
  modelId: MediaPipeClassifierModelId
): Promise<PersistedModelState<MediaPipeModelStatusSetting>> {
  const [status, version, downloadedAt, errorMessage] = await Promise.all([
    AppSettingsService.getMediaPipeModelStatusForModel(modelId),
    AppSettingsService.getMediaPipeModelVersionForModel(modelId),
    AppSettingsService.getMediaPipeModelDownloadedAtForModel(modelId),
    AppSettingsService.getMediaPipeModelErrorMessageForModel(modelId),
  ]);

  return { status, version, downloadedAt, errorMessage };
}

/** Persists ready state for a MediaPipe model and keeps legacy default keys in sync. */
export async function persistMediaPipeReadyStateForModel(
  modelId: MediaPipeClassifierModelId,
  version: string
): Promise<void> {
  await Promise.all([
    AppSettingsService.setMediaPipeModelVersionForModel(modelId, version),
    AppSettingsService.setMediaPipeModelStatusForModel(modelId, 'ready'),
    AppSettingsService.setMediaPipeModelDownloadedAtForModel(modelId, Date.now()),
    AppSettingsService.setMediaPipeModelErrorMessageForModel(modelId, null),
  ]);
  if (modelId === DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID) {
    await persistLegacyMediaPipeReadyState(version);
  }
}

/** Persists error state for a MediaPipe model and keeps legacy default keys in sync. */
export async function persistMediaPipeErrorStateForModel(
  modelId: MediaPipeClassifierModelId,
  message: string,
  version?: string | null
): Promise<void> {
  const modelMeta = MEDIAPIPE_CLASSIFIER_MODELS[modelId];
  await Promise.all([
    AppSettingsService.setMediaPipeModelVersionForModel(
      modelId,
      version ?? modelMeta?.version ?? MEDIAPIPE_MODEL_CONFIG.version
    ),
    AppSettingsService.setMediaPipeModelStatusForModel(modelId, 'error'),
    AppSettingsService.setMediaPipeModelErrorMessageForModel(modelId, message),
  ]);
  if (modelId === DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID) {
    await persistLegacyMediaPipeErrorState(message, version);
  }
}

/** Resets persisted state for a MediaPipe model to not_installed. */
export async function persistMediaPipeNotInstalledStateForModel(
  modelId: MediaPipeClassifierModelId
): Promise<void> {
  await Promise.all([
    AppSettingsService.setMediaPipeModelVersionForModel(modelId, null),
    AppSettingsService.setMediaPipeModelStatusForModel(modelId, 'not_installed'),
    AppSettingsService.setMediaPipeModelDownloadedAtForModel(modelId, null),
    AppSettingsService.setMediaPipeModelErrorMessageForModel(modelId, null),
  ]);
  if (modelId === DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID) {
    await persistLegacyMediaPipeNotInstalledState();
  }
}

/** Resets persisted states for GGUF, legacy MediaPipe keys, and all active MediaPipe models. */
export async function persistAllLocalAiModelsNotInstalledState(): Promise<void> {
  await Promise.all([
    persistMealInputAssistNotInstalledState(),
    persistLegacyMediaPipeNotInstalledState(),
    ...MEDIAPIPE_CLASSIFIER_MODEL_IDS.map(modelId =>
      persistMediaPipeNotInstalledStateForModel(modelId)
    ),
  ]);
}
