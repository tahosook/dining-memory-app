import {
  isLegacyMediaPipeClassifierModelId,
  LEGACY_MEDIAPIPE_CLASSIFIER_MODEL_IDS,
  resolveMediaPipeClassifierModelId,
  type LocalAiModelStatusKind,
  type MediaPipeClassifierModelId,
} from '../../domain/ai/mediapipeModelIds';
import {
  getDatabase,
  getInMemoryAppSettings,
  initializeDatabase,
  isUsingNativeDatabase,
  setInMemoryAppSettings,
  type PersistedAppSettingRow,
} from './localDatabase';

const AI_INPUT_ASSIST_ENABLED_KEY = 'ai_input_assist_enabled';
const MEAL_INPUT_ASSIST_MODEL_KEY_PREFIX = 'meal_input_assist_model';
const MEDIAPIPE_MODEL_KEY_PREFIX = 'mediapipe_model';
const MEDIAPIPE_CLASSIFIER_MODEL_ID_KEY = 'mediapipe_classifier_model_id';

const MODEL_STATE_KEY_SUFFIXES = ['status', 'version', 'downloaded_at', 'error_message'] as const;
type ModelStateKeySuffix = (typeof MODEL_STATE_KEY_SUFFIXES)[number];

export type MealInputAssistModelStatusSetting = LocalAiModelStatusKind;
export type MediaPipeModelStatusSetting = LocalAiModelStatusKind;

function parseBooleanSetting(value: string | null | undefined, defaultValue: boolean) {
  if (typeof value !== 'string') {
    return defaultValue;
  }

  return value === 'true';
}

function serializeBooleanSetting(value: boolean) {
  return value ? 'true' : 'false';
}

function parseNumberSetting(value: string | null | undefined, defaultValue: number | null) {
  if (typeof value !== 'string') {
    return defaultValue;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

export class AppSettingsService {
  static async getAiInputAssistEnabled(): Promise<boolean> {
    return this.getBoolean(AI_INPUT_ASSIST_ENABLED_KEY, false);
  }

  static async setAiInputAssistEnabled(enabled: boolean): Promise<void> {
    await this.setBoolean(AI_INPUT_ASSIST_ENABLED_KEY, enabled);
  }

  static async getMealInputAssistModelVersion(): Promise<string | null> {
    return this.getModelVersionByPrefix(MEAL_INPUT_ASSIST_MODEL_KEY_PREFIX);
  }

  static async setMealInputAssistModelVersion(version: string | null): Promise<void> {
    await this.setModelVersionByPrefix(MEAL_INPUT_ASSIST_MODEL_KEY_PREFIX, version);
  }

  static async getMealInputAssistModelStatus(): Promise<MealInputAssistModelStatusSetting> {
    return this.getModelStatusByPrefix(MEAL_INPUT_ASSIST_MODEL_KEY_PREFIX);
  }

  static async setMealInputAssistModelStatus(
    status: MealInputAssistModelStatusSetting
  ): Promise<void> {
    await this.setModelStatusByPrefix(MEAL_INPUT_ASSIST_MODEL_KEY_PREFIX, status);
  }

  static async getMealInputAssistModelDownloadedAt(): Promise<number | null> {
    return this.getModelDownloadedAtByPrefix(MEAL_INPUT_ASSIST_MODEL_KEY_PREFIX);
  }

  static async setMealInputAssistModelDownloadedAt(downloadedAt: number | null): Promise<void> {
    await this.setModelDownloadedAtByPrefix(MEAL_INPUT_ASSIST_MODEL_KEY_PREFIX, downloadedAt);
  }

  static async getMealInputAssistModelErrorMessage(): Promise<string | null> {
    return this.getModelErrorMessageByPrefix(MEAL_INPUT_ASSIST_MODEL_KEY_PREFIX);
  }

  static async setMealInputAssistModelErrorMessage(message: string | null): Promise<void> {
    await this.setModelErrorMessageByPrefix(MEAL_INPUT_ASSIST_MODEL_KEY_PREFIX, message);
  }

  static async getMediaPipeModelStatus(): Promise<MediaPipeModelStatusSetting> {
    return this.getModelStatusByPrefix(MEDIAPIPE_MODEL_KEY_PREFIX);
  }

  static async setMediaPipeModelStatus(status: MediaPipeModelStatusSetting): Promise<void> {
    await this.setModelStatusByPrefix(MEDIAPIPE_MODEL_KEY_PREFIX, status);
  }

  static async getMediaPipeModelVersion(): Promise<string | null> {
    return this.getModelVersionByPrefix(MEDIAPIPE_MODEL_KEY_PREFIX);
  }

  static async setMediaPipeModelVersion(version: string | null): Promise<void> {
    await this.setModelVersionByPrefix(MEDIAPIPE_MODEL_KEY_PREFIX, version);
  }

  static async getMediaPipeModelDownloadedAt(): Promise<number | null> {
    return this.getModelDownloadedAtByPrefix(MEDIAPIPE_MODEL_KEY_PREFIX);
  }

  static async setMediaPipeModelDownloadedAt(downloadedAt: number | null): Promise<void> {
    await this.setModelDownloadedAtByPrefix(MEDIAPIPE_MODEL_KEY_PREFIX, downloadedAt);
  }

  static async getMediaPipeModelErrorMessage(): Promise<string | null> {
    return this.getModelErrorMessageByPrefix(MEDIAPIPE_MODEL_KEY_PREFIX);
  }

  static async setMediaPipeModelErrorMessage(errorMessage: string | null): Promise<void> {
    await this.setModelErrorMessageByPrefix(MEDIAPIPE_MODEL_KEY_PREFIX, errorMessage);
  }

  static async getMediaPipeClassifierModelId(): Promise<MediaPipeClassifierModelId> {
    const value = await this.getString(MEDIAPIPE_CLASSIFIER_MODEL_ID_KEY, null);
    return resolveMediaPipeClassifierModelId(value);
  }

  static async migrateLegacyMediaPipeModelSettings(): Promise<boolean> {
    const rawValue = await this.getString(MEDIAPIPE_CLASSIFIER_MODEL_ID_KEY, null);
    if (!isLegacyMediaPipeClassifierModelId(rawValue)) {
      return false;
    }

    const successorModelId = resolveMediaPipeClassifierModelId(rawValue);
    await this.setMediaPipeClassifierModelId(successorModelId);
    await this.cleanupLegacyMediaPipeModelSettings();
    return true;
  }

  static async cleanupLegacyMediaPipeModelSettings(): Promise<void> {
    const legacyKeys = LEGACY_MEDIAPIPE_CLASSIFIER_MODEL_IDS.flatMap(legacyModelId =>
      MODEL_STATE_KEY_SUFFIXES.map(suffix =>
        this.getModelStateKey(`${MEDIAPIPE_MODEL_KEY_PREFIX}_${legacyModelId}`, suffix)
      )
    );
    await Promise.all(legacyKeys.map(key => this.setString(key, null)));
  }

  static async setMediaPipeClassifierModelId(modelId: MediaPipeClassifierModelId): Promise<void> {
    await this.setString(MEDIAPIPE_CLASSIFIER_MODEL_ID_KEY, modelId);
  }

  static async getMediaPipeModelStatusForModel(
    modelId: MediaPipeClassifierModelId
  ): Promise<MediaPipeModelStatusSetting> {
    return this.getModelStatusByPrefix(`${MEDIAPIPE_MODEL_KEY_PREFIX}_${modelId}`);
  }

  static async setMediaPipeModelStatusForModel(
    modelId: MediaPipeClassifierModelId,
    status: MediaPipeModelStatusSetting
  ): Promise<void> {
    await this.setModelStatusByPrefix(`${MEDIAPIPE_MODEL_KEY_PREFIX}_${modelId}`, status);
  }

  static async getMediaPipeModelVersionForModel(
    modelId: MediaPipeClassifierModelId
  ): Promise<string | null> {
    return this.getModelVersionByPrefix(`${MEDIAPIPE_MODEL_KEY_PREFIX}_${modelId}`);
  }

  static async setMediaPipeModelVersionForModel(
    modelId: MediaPipeClassifierModelId,
    version: string | null
  ): Promise<void> {
    await this.setModelVersionByPrefix(`${MEDIAPIPE_MODEL_KEY_PREFIX}_${modelId}`, version);
  }

  static async getMediaPipeModelDownloadedAtForModel(
    modelId: MediaPipeClassifierModelId
  ): Promise<number | null> {
    return this.getModelDownloadedAtByPrefix(`${MEDIAPIPE_MODEL_KEY_PREFIX}_${modelId}`);
  }

  static async setMediaPipeModelDownloadedAtForModel(
    modelId: MediaPipeClassifierModelId,
    downloadedAt: number | null
  ): Promise<void> {
    await this.setModelDownloadedAtByPrefix(
      `${MEDIAPIPE_MODEL_KEY_PREFIX}_${modelId}`,
      downloadedAt
    );
  }

  static async getMediaPipeModelErrorMessageForModel(
    modelId: MediaPipeClassifierModelId
  ): Promise<string | null> {
    return this.getModelErrorMessageByPrefix(`${MEDIAPIPE_MODEL_KEY_PREFIX}_${modelId}`);
  }

  static async setMediaPipeModelErrorMessageForModel(
    modelId: MediaPipeClassifierModelId,
    errorMessage: string | null
  ): Promise<void> {
    await this.setModelErrorMessageByPrefix(
      `${MEDIAPIPE_MODEL_KEY_PREFIX}_${modelId}`,
      errorMessage
    );
  }

  private static getModelStateKey(prefix: string, suffix: ModelStateKeySuffix): string {
    return `${prefix}_${suffix}`;
  }

  private static async getModelStatusByPrefix(prefix: string): Promise<LocalAiModelStatusKind> {
    const value = await this.getString(this.getModelStateKey(prefix, 'status'), 'not_installed');
    return value === 'ready' || value === 'error' ? value : 'not_installed';
  }

  private static async setModelStatusByPrefix(
    prefix: string,
    status: LocalAiModelStatusKind
  ): Promise<void> {
    await this.setString(this.getModelStateKey(prefix, 'status'), status);
  }

  private static async getModelVersionByPrefix(prefix: string): Promise<string | null> {
    return this.getString(this.getModelStateKey(prefix, 'version'), null);
  }

  private static async setModelVersionByPrefix(
    prefix: string,
    version: string | null
  ): Promise<void> {
    await this.setString(this.getModelStateKey(prefix, 'version'), version);
  }

  private static async getModelDownloadedAtByPrefix(prefix: string): Promise<number | null> {
    return this.getNumber(this.getModelStateKey(prefix, 'downloaded_at'), null);
  }

  private static async setModelDownloadedAtByPrefix(
    prefix: string,
    downloadedAt: number | null
  ): Promise<void> {
    await this.setNumber(this.getModelStateKey(prefix, 'downloaded_at'), downloadedAt);
  }

  private static async getModelErrorMessageByPrefix(prefix: string): Promise<string | null> {
    return this.getString(this.getModelStateKey(prefix, 'error_message'), null);
  }

  private static async setModelErrorMessageByPrefix(
    prefix: string,
    errorMessage: string | null
  ): Promise<void> {
    await this.setString(this.getModelStateKey(prefix, 'error_message'), errorMessage);
  }

  static async getBoolean(key: string, defaultValue: boolean): Promise<boolean> {
    const value = await this.getSettingValue(key);
    return parseBooleanSetting(value, defaultValue);
  }

  static async setBoolean(key: string, value: boolean): Promise<void> {
    await this.setString(key, serializeBooleanSetting(value));
  }

  static async getString(key: string, defaultValue: string | null): Promise<string | null> {
    const value = await this.getSettingValue(key);
    return typeof value === 'string' ? value : defaultValue;
  }

  static async setString(key: string, value: string | null): Promise<void> {
    await this.setSettingValue(key, value);
  }

  static async getNumber(key: string, defaultValue: number | null): Promise<number | null> {
    const value = await this.getSettingValue(key);
    return parseNumberSetting(value, defaultValue);
  }

  static async setNumber(key: string, value: number | null): Promise<void> {
    await this.setSettingValue(key, value === null ? null : String(value));
  }

  private static async getSettingValue(key: string): Promise<string | null | undefined> {
    await initializeDatabase();

    if (!isUsingNativeDatabase()) {
      const appSettings = getInMemoryAppSettings();
      return appSettings[key];
    }

    const database = getDatabase();
    if (!database) {
      return null;
    }

    const row = await database.getFirstAsync<PersistedAppSettingRow>(
      'SELECT key, value, updated_at FROM app_settings WHERE key = ?',
      key
    );

    return row?.value;
  }

  private static async setSettingValue(key: string, value: string | null): Promise<void> {
    await initializeDatabase();

    const updatedAt = Date.now();

    if (!isUsingNativeDatabase()) {
      const appSettings = getInMemoryAppSettings();
      if (value === null) {
        delete appSettings[key];
      } else {
        appSettings[key] = value;
      }
      setInMemoryAppSettings(appSettings);
      return;
    }

    const database = getDatabase();
    if (!database) {
      return;
    }

    if (value === null) {
      await database.runAsync('DELETE FROM app_settings WHERE key = ?', key);
      return;
    }

    await database.runAsync(
      'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
      key,
      value,
      updatedAt
    );
  }
}
