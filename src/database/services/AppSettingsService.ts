import {
  getDatabase,
  getInMemoryAppSettings,
  initializeDatabase,
  isUsingNativeDatabase,
  setInMemoryAppSettings,
  type PersistedAppSettingRow,
} from './localDatabase';

const AI_INPUT_ASSIST_ENABLED_KEY = 'ai_input_assist_enabled';
const MEAL_INPUT_ASSIST_MODEL_VERSION_KEY = 'meal_input_assist_model_version';
const MEAL_INPUT_ASSIST_MODEL_STATUS_KEY = 'meal_input_assist_model_status';
const MEAL_INPUT_ASSIST_MODEL_DOWNLOADED_AT_KEY = 'meal_input_assist_model_downloaded_at';
const MEAL_INPUT_ASSIST_MODEL_ERROR_MESSAGE_KEY = 'meal_input_assist_model_error_message';

type MealInputAssistModelStatusSetting = 'not_installed' | 'ready' | 'error';

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
    return this.getString(MEAL_INPUT_ASSIST_MODEL_VERSION_KEY, null);
  }

  static async setMealInputAssistModelVersion(version: string | null): Promise<void> {
    await this.setString(MEAL_INPUT_ASSIST_MODEL_VERSION_KEY, version);
  }

  static async getMealInputAssistModelStatus(): Promise<MealInputAssistModelStatusSetting> {
    const value = await this.getString(MEAL_INPUT_ASSIST_MODEL_STATUS_KEY, 'not_installed');
    return value === 'ready' || value === 'error' ? value : 'not_installed';
  }

  static async setMealInputAssistModelStatus(status: MealInputAssistModelStatusSetting): Promise<void> {
    await this.setString(MEAL_INPUT_ASSIST_MODEL_STATUS_KEY, status);
  }

  static async getMealInputAssistModelDownloadedAt(): Promise<number | null> {
    return this.getNumber(MEAL_INPUT_ASSIST_MODEL_DOWNLOADED_AT_KEY, null);
  }

  static async setMealInputAssistModelDownloadedAt(downloadedAt: number | null): Promise<void> {
    await this.setNumber(MEAL_INPUT_ASSIST_MODEL_DOWNLOADED_AT_KEY, downloadedAt);
  }

  static async getMealInputAssistModelErrorMessage(): Promise<string | null> {
    return this.getString(MEAL_INPUT_ASSIST_MODEL_ERROR_MESSAGE_KEY, null);
  }

  static async setMealInputAssistModelErrorMessage(message: string | null): Promise<void> {
    await this.setString(MEAL_INPUT_ASSIST_MODEL_ERROR_MESSAGE_KEY, message);
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
