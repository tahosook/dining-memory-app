import {
  getDatabase,
  getInMemoryAppSettings,
  initializeDatabase,
  isUsingNativeDatabase,
  setInMemoryAppSettings,
  type PersistedAppSettingRow,
} from './localDatabase';

const AI_INPUT_ASSIST_ENABLED_KEY = 'ai_input_assist_enabled';

function parseBooleanSetting(value: string | null | undefined, defaultValue: boolean) {
  if (typeof value !== 'string') {
    return defaultValue;
  }

  return value === 'true';
}

function serializeBooleanSetting(value: boolean) {
  return value ? 'true' : 'false';
}

export class AppSettingsService {
  static async getAiInputAssistEnabled(): Promise<boolean> {
    return this.getBoolean(AI_INPUT_ASSIST_ENABLED_KEY, false);
  }

  static async setAiInputAssistEnabled(enabled: boolean): Promise<void> {
    await this.setBoolean(AI_INPUT_ASSIST_ENABLED_KEY, enabled);
  }

  static async getBoolean(key: string, defaultValue: boolean): Promise<boolean> {
    await initializeDatabase();

    if (!isUsingNativeDatabase()) {
      const appSettings = getInMemoryAppSettings();
      return parseBooleanSetting(appSettings[key], defaultValue);
    }

    const database = getDatabase();
    if (!database) {
      return defaultValue;
    }

    const row = await database.getFirstAsync<PersistedAppSettingRow>(
      'SELECT key, value, updated_at FROM app_settings WHERE key = ?',
      key
    );

    return parseBooleanSetting(row?.value, defaultValue);
  }

  static async setBoolean(key: string, value: boolean): Promise<void> {
    await initializeDatabase();

    const serializedValue = serializeBooleanSetting(value);
    const updatedAt = Date.now();

    if (!isUsingNativeDatabase()) {
      const appSettings = getInMemoryAppSettings();
      appSettings[key] = serializedValue;
      setInMemoryAppSettings(appSettings);
      return;
    }

    const database = getDatabase();
    if (!database) {
      return;
    }

    await database.runAsync(
      'INSERT OR REPLACE INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
      key,
      serializedValue,
      updatedAt
    );
  }
}
