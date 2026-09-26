import type {
  PersistedAppSettingRow,
  PersistedMealRow,
} from '../../database/services/localDatabase';
import {
  extractPhotoFileName,
  isOriginalPhotoFileName,
  resolveRestoredPhotoUri,
  validateSafeFileName,
} from './pathNormalizer';
import type { PortableMealRecord, BackupValidationResult } from './types';

type PortableAppSettingRecord = NonNullable<BackupValidationResult['appSettings']>[number];

export interface SerializeMealsResult {
  portableMeals: PortableMealRecord[];
  photoFileNames: string[];
}

export function serializeMeals(meals: PersistedMealRow[]): SerializeMealsResult {
  const photoFileNameSet = new Set<string>();
  const portableMeals: PortableMealRecord[] = [];

  for (const meal of meals) {
    if (!meal.photo_path || typeof meal.photo_path !== 'string' || meal.photo_path.trim() === '') {
      throw new Error('食事記録の写真パスが指定されていないか不正です。');
    }

    if (meal.photo_path.includes('..')) {
      throw new Error('食事記録に無効または非オリジナルの写真パスが含まれています。');
    }

    const photoFileName = extractPhotoFileName(meal.photo_path);
    if (
      !photoFileName ||
      !validateSafeFileName(photoFileName) ||
      !isOriginalPhotoFileName(photoFileName)
    ) {
      throw new Error('食事記録に無効または非オリジナルの写真パスが含まれています。');
    }

    photoFileNameSet.add(photoFileName);

    portableMeals.push({
      id: meal.id,
      uuid: meal.uuid,
      meal_name: meal.meal_name,
      meal_type: meal.meal_type ?? null,
      cuisine_type: meal.cuisine_type ?? null,
      ai_confidence: meal.ai_confidence ?? null,
      ai_source: meal.ai_source ?? null,
      notes: meal.notes ?? null,
      cooking_level: meal.cooking_level ?? null,
      is_homemade: meal.is_homemade ? 1 : 0,
      photo_file_name: photoFileName,
      location_name: meal.location_name ?? null,
      latitude: meal.latitude ?? null,
      longitude: meal.longitude ?? null,
      meal_datetime: meal.meal_datetime,
      search_text: meal.search_text ?? null,
      tags: meal.tags ?? null,
      is_deleted: meal.is_deleted ? 1 : 0,
      created_at: meal.created_at,
      updated_at: meal.updated_at,
    });
  }

  return {
    portableMeals,
    photoFileNames: Array.from(photoFileNameSet),
  };
}

export function deserializeMeals(
  portableMeals: PortableMealRecord[],
  documentsDirectoryUri: string
): PersistedMealRow[] {
  return portableMeals.map(record => {
    const photoPath = resolveRestoredPhotoUri(record.photo_file_name, documentsDirectoryUri);

    return {
      id: record.id,
      uuid: record.uuid,
      meal_name: record.meal_name,
      meal_type: record.meal_type ?? null,
      cuisine_type: record.cuisine_type ?? null,
      ai_confidence: record.ai_confidence ?? null,
      ai_source: record.ai_source ?? null,
      notes: record.notes ?? null,
      cooking_level: record.cooking_level ?? null,
      is_homemade: record.is_homemade ? 1 : 0,
      photo_path: photoPath,
      photo_thumbnail_path: null, // Thumbnails are explicitly excluded and re-derived as fallback
      location_name: record.location_name ?? null,
      latitude: record.latitude ?? null,
      longitude: record.longitude ?? null,
      meal_datetime: record.meal_datetime,
      search_text: record.search_text ?? null,
      tags: record.tags ?? null,
      is_deleted: record.is_deleted ? 1 : 0,
      created_at: record.created_at,
      updated_at: record.updated_at,
    };
  });
}

export function serializeAppSettings(
  settings: PersistedAppSettingRow[]
): PortableAppSettingRecord[] {
  return settings.map(s => ({
    key: s.key,
    value: s.value ?? null,
    updated_at: s.updated_at,
  }));
}

export function deserializeAppSettings(
  portableSettings: PortableAppSettingRecord[]
): PersistedAppSettingRow[] {
  return portableSettings.map(s => ({
    key: s.key,
    value: s.value ?? null,
    updated_at: s.updated_at,
  }));
}
