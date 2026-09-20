import {
  CURRENT_BACKUP_FORMAT_VERSION,
  createBackupManifest,
  deserializeAppSettings,
  deserializeMeals,
  extractPhotoFileName,
  formatBackupTimestamp,
  generateBackupFileName,
  isOriginalPhotoFileName,
  resolveRestoredPhotoUri,
  serializeAppSettings,
  serializeMeals,
  validateBackupManifest,
  validatePortableAppSettings,
  validatePortableMeals,
  validateSafeFileName,
} from '../src/domain/backup';
import type { PersistedAppSettingRow, PersistedMealRow } from '../src/database/services/localDatabase';

describe('backup pathNormalizer', () => {
  test('extractPhotoFileName extracts clean filename from various URI forms', () => {
    expect(
      extractPhotoFileName('file:///data/user/0/com.tahosook.diningmemory/files/meal-20260422-213507-00.jpg')
    ).toBe('meal-20260422-213507-00.jpg');

    expect(
      extractPhotoFileName('file:///var/mobile/Containers/Data/Application/UUID/Documents/meal-20260422-01.jpg')
    ).toBe('meal-20260422-01.jpg');

    expect(
      extractPhotoFileName('/storage/emulated/0/DCIM/meal.jpeg?v=123')
    ).toBe('meal.jpeg');

    expect(extractPhotoFileName('')).toBe('');
  });

  test('validateSafeFileName detects and rejects path traversal and invalid characters', () => {
    expect(validateSafeFileName('meal-20260422-213507-00.jpg')).toBe(true);
    expect(validateSafeFileName('photo_123.jpeg')).toBe(true);
    expect(validateSafeFileName('image.png')).toBe(true);

    // Rejections (Zip Slip / Traversal / Suspicious extensions)
    expect(validateSafeFileName('../evil.jpg')).toBe(false);
    expect(validateSafeFileName('..\\evil.jpg')).toBe(false);
    expect(validateSafeFileName('../../etc/passwd')).toBe(false);
    expect(validateSafeFileName('/absolute/path.jpg')).toBe(false);
    expect(validateSafeFileName('subdir/file.jpg')).toBe(false);
    expect(validateSafeFileName('subdir\\file.jpg')).toBe(false);
    expect(validateSafeFileName('meal\0.jpg')).toBe(false);
    expect(validateSafeFileName('meal.exe')).toBe(false);
    expect(validateSafeFileName('meal.json')).toBe(false);
    expect(validateSafeFileName('')).toBe(false);
  });

  test('isOriginalPhotoFileName rejects thumbnails and keeps original photos', () => {
    expect(isOriginalPhotoFileName('meal-20260422-213507-00.jpg')).toBe(true);
    expect(isOriginalPhotoFileName('meal-20260422-213507-00-thumb.jpg')).toBe(false);
    expect(isOriginalPhotoFileName('photo-thumb.jpeg')).toBe(false);
  });

  test('resolveRestoredPhotoUri joins documentDirectory and safe filename', () => {
    expect(
      resolveRestoredPhotoUri('meal-01.jpg', 'file:///data/user/0/files/')
    ).toBe('file:///data/user/0/files/meal-01.jpg');

    expect(
      resolveRestoredPhotoUri('meal-01.jpg', 'file:///data/user/0/files')
    ).toBe('file:///data/user/0/files/meal-01.jpg');

    expect(() => {
      resolveRestoredPhotoUri('../evil.jpg', 'file:///data/user/0/files/');
    }).toThrow('Invalid or unsafe photo file name');
  });
});

describe('backupFileName', () => {
  test('generateBackupFileName formats filename as dining-memory-backup-YYYYMMDD-HHMMSS.zip', () => {
    const fixedDate = new Date(2026, 8, 19, 14, 30, 45); // Month is 0-indexed: 8 = Sept
    const fileName = generateBackupFileName(fixedDate);
    expect(fileName).toBe('dining-memory-backup-20260919-143045.zip');
    expect(formatBackupTimestamp(fixedDate)).toBe('20260919-143045');
  });
});

describe('backup manifest', () => {
  test('creates manifest with formatVersion, appId, counts, and ISO timestamp', () => {
    const fixedDate = new Date(2026, 8, 19, 10, 0, 0);
    const manifest = createBackupManifest({
      appVersion: '1.2.0',
      schemaVersion: 2,
      mealCount: 15,
      photoCount: 12,
      exportedAt: fixedDate,
    });

    expect(manifest.formatVersion).toBe(CURRENT_BACKUP_FORMAT_VERSION);
    expect(manifest.appId).toBe('com.tahosook.diningmemory');
    expect(manifest.appVersion).toBe('1.2.0');
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.mealCount).toBe(15);
    expect(manifest.photoCount).toBe(12);
    expect(manifest.exportedAt).toBe(fixedDate.toISOString());
  });

  test('validateBackupManifest validates valid manifest correctly', () => {
    const raw = {
      formatVersion: 1,
      appId: 'com.tahosook.diningmemory',
      appVersion: '1.0.0',
      schemaVersion: 2,
      exportedAt: '2026-09-19T10:00:00.000Z',
      mealCount: 5,
      photoCount: 5,
    };

    const result = validateBackupManifest(raw, 2);
    expect(result.valid).toBe(true);
    expect(result.manifest?.mealCount).toBe(5);
  });

  test('validateBackupManifest rejects future formatVersion', () => {
    const raw = {
      formatVersion: 99,
      appId: 'com.tahosook.diningmemory',
      schemaVersion: 2,
      exportedAt: '2026-09-19T10:00:00.000Z',
      mealCount: 1,
      photoCount: 1,
    };

    const result = validateBackupManifest(raw, 2);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('新しいバージョンのアプリ');
  });

  test('validateBackupManifest rejects mismatched or missing appId', () => {
    expect(
      validateBackupManifest(
        {
          formatVersion: 1,
          appId: 'com.other.app',
          schemaVersion: 2,
          exportedAt: '2026-09-19T10:00:00.000Z',
          mealCount: 1,
          photoCount: 1,
        },
        2
      ).valid
    ).toBe(false);

    expect(
      validateBackupManifest(
        {
          formatVersion: 1,
          schemaVersion: 2,
          exportedAt: '2026-09-19T10:00:00.000Z',
          mealCount: 1,
          photoCount: 1,
        },
        2
      ).valid
    ).toBe(false);
  });

  test('validateBackupManifest rejects mismatched schemaVersion', () => {
    // Newer schemaVersion
    expect(
      validateBackupManifest(
        {
          formatVersion: 1,
          appId: 'com.tahosook.diningmemory',
          schemaVersion: 999,
          exportedAt: '2026-09-19T10:00:00.000Z',
          mealCount: 1,
          photoCount: 1,
        },
        2
      ).valid
    ).toBe(false);

    // Older schemaVersion
    expect(
      validateBackupManifest(
        {
          formatVersion: 1,
          appId: 'com.tahosook.diningmemory',
          schemaVersion: 1,
          exportedAt: '2026-09-19T10:00:00.000Z',
          mealCount: 1,
          photoCount: 1,
        },
        2
      ).valid
    ).toBe(false);
  });

  test('validateBackupManifest rejects invalid counts or malformed date', () => {
    expect(
      validateBackupManifest(
        { formatVersion: 1, appId: 'com.tahosook.diningmemory', schemaVersion: 2, exportedAt: 'invalid-date', mealCount: 0, photoCount: 0 },
        2
      ).valid
    ).toBe(false);

    expect(
      validateBackupManifest(
        { formatVersion: 1, appId: 'com.tahosook.diningmemory', schemaVersion: 2, exportedAt: '2026-09-19T10:00:00.000Z', mealCount: -1, photoCount: 0 },
        2
      ).valid
    ).toBe(false);
  });
});

describe('backup serializer', () => {
  const mockRows: PersistedMealRow[] = [
    {
      id: 'meal-1',
      uuid: 'uuid-1',
      meal_name: 'しょうゆラーメン',
      meal_type: 'dinner',
      cuisine_type: 'ramen',
      ai_confidence: 0.95,
      ai_source: 'llama.rn',
      notes: '煮玉子トッピング',
      cooking_level: null,
      is_homemade: 0,
      photo_path: 'file:///data/user/0/app/files/meal-20260422-01.jpg',
      photo_thumbnail_path: 'file:///data/user/0/app/files/meal-20260422-01-thumb.jpg',
      location_name: '新宿',
      latitude: 35.69,
      longitude: 139.70,
      meal_datetime: 1713800000000,
      search_text: 'しょうゆラーメン 新宿',
      tags: 'ラーメン,夕食',
      is_deleted: 0,
      created_at: 1713800000000,
      updated_at: 1713800000000,
    },
    {
      id: 'meal-2',
      uuid: 'uuid-2',
      meal_name: '自炊カレー',
      meal_type: 'lunch',
      cuisine_type: 'curry',
      ai_confidence: null,
      ai_source: null,
      notes: null,
      cooking_level: 'daily',
      is_homemade: 1,
      photo_path: 'file:///data/user/0/app/files/meal-20260423-01.jpg',
      photo_thumbnail_path: 'file:///data/user/0/app/files/meal-20260423-01-thumb.jpg',
      location_name: null,
      latitude: null,
      longitude: null,
      meal_datetime: 1713900000000,
      search_text: '自炊カレー',
      tags: null,
      is_deleted: 0,
      created_at: 1713900000000,
      updated_at: 1713900000000,
    },
  ];

  test('serializeMeals omits thumbnail path and extracts photo_file_name', () => {
    const result = serializeMeals(mockRows);

    expect(result.portableMeals).toHaveLength(2);
    expect(result.portableMeals[0].photo_file_name).toBe('meal-20260422-01.jpg');
    expect((result.portableMeals[0] as unknown as Record<string, unknown>).photo_thumbnail_path).toBeUndefined();
    expect((result.portableMeals[0] as unknown as Record<string, unknown>).photo_path).toBeUndefined();

    // Unique photo file names collected
    expect(result.photoFileNames).toEqual([
      'meal-20260422-01.jpg',
      'meal-20260423-01.jpg',
    ]);
  });

  test('serializeMeals rejects meals with empty or missing photo_path', () => {
    const invalidMeal = { ...mockRows[0], photo_path: '' };
    expect(() => serializeMeals([invalidMeal])).toThrow('写真パスが指定されていないか不正です');
  });

  test('serializeMeals rejects meals with thumbnail photo_path', () => {
    const thumbnailMeal = { ...mockRows[0], photo_path: 'file:///data/user/0/meal-thumb.jpg' };
    expect(() => serializeMeals([thumbnailMeal])).toThrow('無効または非オリジナルの写真パス');
  });

  test('serializeMeals rejects meals with path traversal or unsafe photo_path', () => {
    const traversalMeal = { ...mockRows[0], photo_path: 'file:///data/../../evil.jpg' };
    expect(() => serializeMeals([traversalMeal])).toThrow('無効または非オリジナルの写真パス');
  });

  test('deserializeMeals restores photo_path with target directory and sets thumbnail_path to null', () => {
    const { portableMeals } = serializeMeals(mockRows);
    const restoredRows = deserializeMeals(portableMeals, 'file:///new-device/files/');

    expect(restoredRows).toHaveLength(2);
    expect(restoredRows[0].photo_path).toBe('file:///new-device/files/meal-20260422-01.jpg');
    expect(restoredRows[0].photo_thumbnail_path).toBeNull();
    expect(restoredRows[0].meal_name).toBe('しょうゆラーメン');
    expect(restoredRows[0].ai_source).toBe('llama.rn');
    expect(restoredRows[1].cooking_level).toBe('daily');
    expect(restoredRows[1].is_homemade).toBe(1);
  });

  test('app settings serialize and deserialize preserve keys and values', () => {
    const mockSettings: PersistedAppSettingRow[] = [
      { key: 'ai_input_assist_enabled', value: 'true', updated_at: 1713800000000 },
      { key: 'meal_input_assist_model_status', value: 'ready', updated_at: 1713800000000 },
    ];

    const serialized = serializeAppSettings(mockSettings);
    expect(serialized).toHaveLength(2);
    expect(serialized[0].key).toBe('ai_input_assist_enabled');

    const deserialized = deserializeAppSettings(serialized);
    expect(deserialized).toEqual(mockSettings);
  });
});

describe('backup validator', () => {
  test('validatePortableMeals accepts valid records', () => {
    const validData = [
      {
        id: '1',
        uuid: 'uuid-1',
        meal_name: 'ラーメン',
        photo_file_name: 'meal-01.jpg',
        is_homemade: 0,
        meal_datetime: 1713800000000,
        created_at: 1713800000000,
        updated_at: 1713800000000,
      },
    ];

    const result = validatePortableMeals(validData);
    expect(result.valid).toBe(true);
    expect(result.meals).toHaveLength(1);
  });

  test('validatePortableMeals rejects non-array and corrupted records', () => {
    expect(validatePortableMeals('not an array').valid).toBe(false);
    expect(validatePortableMeals([{ id: '1' }]).valid).toBe(false); // missing fields
    expect(
      validatePortableMeals([
        {
          id: '1',
          uuid: 'u-1',
          meal_name: '危険',
          photo_file_name: '../../evil.jpg',
          meal_datetime: 123,
          created_at: 123,
          updated_at: 123,
        },
      ]).valid
    ).toBe(false);
  });

  test('validatePortableAppSettings accepts valid settings and rejects invalid', () => {
    expect(
      validatePortableAppSettings([
        { key: 'ai_input_assist_enabled', value: 'true', updated_at: 12345 },
      ]).valid
    ).toBe(true);

    expect(validatePortableAppSettings('not an array').valid).toBe(false);
    expect(validatePortableAppSettings([{ value: 'missing-key' }]).valid).toBe(false);
  });
});
