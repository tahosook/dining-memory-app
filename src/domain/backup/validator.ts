import { isOriginalPhotoFileName, validateSafeFileName } from './pathNormalizer';
import type { PortableAppSettingRecord, PortableMealRecord } from './types';

export interface ValidateMealsResult {
  valid: boolean;
  meals?: PortableMealRecord[];
  error?: string;
}

export interface ValidateAppSettingsResult {
  valid: boolean;
  appSettings?: PortableAppSettingRecord[];
  error?: string;
}

export function validatePortableMeals(raw: unknown): ValidateMealsResult {
  if (!Array.isArray(raw)) {
    return { valid: false, error: '食事データ（meals.json）が配列形式ではありません。' };
  }

  const meals: PortableMealRecord[] = [];

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') {
      return { valid: false, error: `食事データ #${i + 1} の形式が不正です。` };
    }

    const row = item as Record<string, unknown>;

    if (typeof row.id !== 'string' || !row.id) {
      return { valid: false, error: `食事データ #${i + 1} のIDが不正です。` };
    }

    if (typeof row.uuid !== 'string' || !row.uuid) {
      return { valid: false, error: `食事データ #${i + 1} のUUIDが不正です。` };
    }

    if (typeof row.meal_name !== 'string') {
      return { valid: false, error: `食事データ #${i + 1} の料理名が不正です。` };
    }

    if (typeof row.photo_file_name !== 'string' || !row.photo_file_name) {
      return { valid: false, error: `食事データ #${i + 1} の写真ファイル名が不正です。` };
    }

    if (
      !validateSafeFileName(row.photo_file_name) ||
      !isOriginalPhotoFileName(row.photo_file_name)
    ) {
      return {
        valid: false,
        error: `食事データ #${i + 1} の写真ファイル名が不正または非オリジナルです。`,
      };
    }

    if (typeof row.meal_datetime !== 'number' || Number.isNaN(row.meal_datetime)) {
      return { valid: false, error: `食事データ #${i + 1} の日時が不正です。` };
    }

    if (typeof row.created_at !== 'number' || Number.isNaN(row.created_at)) {
      return { valid: false, error: `食事データ #${i + 1} の作成日時が不正です。` };
    }

    if (typeof row.updated_at !== 'number' || Number.isNaN(row.updated_at)) {
      return { valid: false, error: `食事データ #${i + 1} の更新日時が不正です。` };
    }

    meals.push({
      id: row.id,
      uuid: row.uuid,
      meal_name: row.meal_name,
      meal_type: typeof row.meal_type === 'string' ? row.meal_type : null,
      cuisine_type: typeof row.cuisine_type === 'string' ? row.cuisine_type : null,
      ai_confidence: typeof row.ai_confidence === 'number' ? row.ai_confidence : null,
      ai_source: typeof row.ai_source === 'string' ? row.ai_source : null,
      notes: typeof row.notes === 'string' ? row.notes : null,
      cooking_level: typeof row.cooking_level === 'string' ? row.cooking_level : null,
      is_homemade: row.is_homemade ? 1 : 0,
      photo_file_name: row.photo_file_name,
      location_name: typeof row.location_name === 'string' ? row.location_name : null,
      latitude: typeof row.latitude === 'number' ? row.latitude : null,
      longitude: typeof row.longitude === 'number' ? row.longitude : null,
      meal_datetime: row.meal_datetime,
      search_text: typeof row.search_text === 'string' ? row.search_text : null,
      tags: typeof row.tags === 'string' ? row.tags : null,
      is_deleted: row.is_deleted ? 1 : 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    });
  }

  return { valid: true, meals };
}

export function validatePortableAppSettings(raw: unknown): ValidateAppSettingsResult {
  if (!Array.isArray(raw)) {
    return { valid: false, error: '設定データ（app_settings.json）が配列形式ではありません。' };
  }

  const appSettings: PortableAppSettingRecord[] = [];

  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') {
      return { valid: false, error: `設定データ #${i + 1} の形式が不正です。` };
    }

    const row = item as Record<string, unknown>;

    if (typeof row.key !== 'string' || !row.key) {
      return { valid: false, error: `設定データ #${i + 1} のキーが不正です。` };
    }

    if (typeof row.updated_at !== 'number' || Number.isNaN(row.updated_at)) {
      return { valid: false, error: `設定データ #${i + 1} の更新日時が不正です。` };
    }

    appSettings.push({
      key: row.key,
      value: typeof row.value === 'string' ? row.value : null,
      updated_at: row.updated_at,
    });
  }

  return { valid: true, appSettings };
}
