import * as DocumentPicker from 'expo-document-picker';
import {
  copyAsync,
  deleteAsync,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { unzip, zip } from 'react-native-zip-archive';
import { BackupService } from '../src/database/services/BackupService';
import {
  getAllAppSettingsRows,
  getAllPersistedMealRows,
  replaceDatabaseWithBackup,
  type PersistedAppSettingRow,
  type PersistedMealRow,
} from '../src/database/services/localDatabase';

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: jest.fn(),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(),
  shareAsync: jest.fn(),
}));

jest.mock('react-native-zip-archive', () => ({
  zip: jest.fn(),
  unzip: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock-cache/',
  documentDirectory: 'file:///mock-documents/',
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  copyAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  writeAsStringAsync: jest.fn(),
}));

jest.mock('../src/database/services/localDatabase', () => ({
  DATABASE_SCHEMA_VERSION: 2,
  getAllPersistedMealRows: jest.fn(),
  getAllAppSettingsRows: jest.fn(),
  replaceDatabaseWithBackup: jest.fn(),
}));

jest.mock('../src/utils/buildInfo', () => ({
  getAppVersion: jest.fn(() => '1.0.0'),
}));

describe('BackupService', () => {
  const mockMealRows: PersistedMealRow[] = [
    {
      id: 'meal-1',
      uuid: 'uuid-1',
      meal_name: 'とんかつ定食',
      meal_type: 'lunch',
      cuisine_type: 'japanese',
      ai_confidence: null,
      ai_source: null,
      notes: 'サクサク',
      cooking_level: null,
      is_homemade: 0,
      photo_path: 'file:///mock-documents/meal-20260422-01.jpg',
      photo_thumbnail_path: 'file:///mock-documents/meal-20260422-01-thumb.jpg',
      location_name: '新宿',
      latitude: 35.69,
      longitude: 139.70,
      meal_datetime: 1713800000000,
      search_text: 'とんかつ定食 新宿',
      tags: null,
      is_deleted: 0,
      created_at: 1713800000000,
      updated_at: 1713800000000,
    },
  ];

  const mockAppSettings: PersistedAppSettingRow[] = [
    { key: 'ai_input_assist_enabled', value: 'true', updated_at: 1713800000000 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    (makeDirectoryAsync as jest.Mock).mockResolvedValue(undefined);
    (deleteAsync as jest.Mock).mockResolvedValue(undefined);
    (copyAsync as jest.Mock).mockResolvedValue(undefined);
    (writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);
    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (getAllPersistedMealRows as jest.Mock).mockResolvedValue(mockMealRows);
    (getAllAppSettingsRows as jest.Mock).mockResolvedValue(mockAppSettings);
    (zip as jest.Mock).mockResolvedValue('file:///mock-cache/backup.zip');
    (unzip as jest.Mock).mockResolvedValue('file:///mock-cache/staging/');
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValue(true);
    (Sharing.shareAsync as jest.Mock).mockResolvedValue(undefined);
    (replaceDatabaseWithBackup as jest.Mock).mockResolvedValue(undefined);
  });

  describe('exportBackup', () => {
    test('exports meals, settings, original photos, creates manifest, zips and shares', async () => {
      const result = await BackupService.exportBackup();

      expect(result.mealCount).toBe(1);
      expect(result.photoCount).toBe(1);
      expect(result.zipFileName).toMatch(/^dining-memory-backup-\d{8}-\d{6}\.zip$/);

      // Directories created
      expect(makeDirectoryAsync).toHaveBeenCalledTimes(3);

      // JSON files written (meals.json, app_settings.json, manifest.json)
      expect(writeAsStringAsync).toHaveBeenCalledTimes(3);

      // Photo copied (only original, not thumbnail)
      expect(copyAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'file:///mock-documents/meal-20260422-01.jpg',
          to: expect.stringContaining('/photos/meal-20260422-01.jpg'),
        })
      );

      // Zip invoked
      expect(zip).toHaveBeenCalledTimes(1);

      // Share sheet opened
      expect(Sharing.shareAsync).toHaveBeenCalledWith(
        expect.stringContaining('dining-memory-backup-'),
        expect.objectContaining({
          mimeType: 'application/zip',
        })
      );

      // Cleanup called for staging directory and zip file
      expect(deleteAsync).toHaveBeenCalledTimes(2);
    });

    test('cleans up staging files even if zip or share throws error', async () => {
      (zip as jest.Mock).mockRejectedValue(new Error('Zip failure'));

      await expect(BackupService.exportBackup()).rejects.toThrow('Zip failure');

      expect(deleteAsync).toHaveBeenCalled();
    });
  });

  describe('pickAndValidateBackup', () => {
    test('returns canceled when user cancels document picker', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: true,
        assets: null,
      });

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(false);
      expect(result.canceled).toBe(true);
    });

    test('unzips and validates manifest, meals, and photos successfully', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picker/backup.zip', name: 'backup.zip' }],
      });

      const manifestContent = JSON.stringify({
        formatVersion: 1,
        appId: 'com.tahosook.diningmemory',
        appVersion: '1.0.0',
        schemaVersion: 2,
        exportedAt: '2026-09-19T10:00:00.000Z',
        mealCount: 1,
        photoCount: 1,
      });

      const mealsContent = JSON.stringify([
        {
          id: 'meal-1',
          uuid: 'uuid-1',
          meal_name: 'とんかつ定食',
          photo_file_name: 'meal-20260422-01.jpg',
          is_homemade: 0,
          meal_datetime: 1713800000000,
          created_at: 1713800000000,
          updated_at: 1713800000000,
        },
      ]);

      const settingsContent = JSON.stringify([
        { key: 'ai_input_assist_enabled', value: 'true', updated_at: 1713800000000 },
      ]);

      (readAsStringAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('manifest.json')) return Promise.resolve(manifestContent);
        if (path.endsWith('meals.json')) return Promise.resolve(mealsContent);
        if (path.endsWith('app_settings.json')) return Promise.resolve(settingsContent);
        return Promise.resolve('{}');
      });

      const result = await BackupService.pickAndValidateBackup();

      expect(result.valid).toBe(true);
      expect(result.manifest?.mealCount).toBe(1);
      expect(result.meals).toHaveLength(1);
      expect(result.appSettings).toHaveLength(1);
      expect(result.stagingDirectory).toBeTruthy();
    });

    test('rejects backup with missing manifest.json', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picker/backup.zip' }],
      });

      (getInfoAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('manifest.json')) return Promise.resolve({ exists: false });
        return Promise.resolve({ exists: true });
      });

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('manifest.json が見つかりません');
    });

    test('rejects backup with newer formatVersion', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picker/backup.zip' }],
      });

      (readAsStringAsync as jest.Mock).mockResolvedValue(
        JSON.stringify({ formatVersion: 99, schemaVersion: 2, exportedAt: '2026-09-19T00:00:00.000Z', mealCount: 1, photoCount: 1 })
      );

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('新しいバージョンのアプリ');
    });
  });

  describe('restoreVerifiedBackup', () => {
    test('copies photos to documentDirectory and replaces database records atomically', async () => {
      const validationResult = {
        valid: true,
        stagingDirectory: 'file:///mock-cache/dm-import-123/',
        meals: [
          {
            id: 'meal-1',
            uuid: 'uuid-1',
            meal_name: 'とんかつ定食',
            photo_file_name: 'meal-20260422-01.jpg',
            is_homemade: 0,
            is_deleted: 0,
            meal_datetime: 1713800000000,
            created_at: 1713800000000,
            updated_at: 1713800000000,
          },
        ],
        appSettings: [
          { key: 'ai_input_assist_enabled', value: 'true', updated_at: 1713800000000 },
        ],
      };

      const result = await BackupService.restoreVerifiedBackup(validationResult);

      expect(result.restoredMealCount).toBe(1);
      expect(result.restoredPhotoCount).toBe(1);

      // Photo copied to documentDirectory
      expect(copyAsync).toHaveBeenCalledWith({
        from: 'file:///mock-cache/dm-import-123/photos/meal-20260422-01.jpg',
        to: 'file:///mock-documents/meal-20260422-01.jpg',
      });

      // replaceDatabaseWithBackup called with rewritten photo_path and null thumbnail
      expect(replaceDatabaseWithBackup).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            id: 'meal-1',
            photo_path: 'file:///mock-documents/meal-20260422-01.jpg',
            photo_thumbnail_path: null,
          }),
        ]),
        expect.any(Array)
      );

      // Staging directory cleaned up
      expect(deleteAsync).toHaveBeenCalledWith('file:///mock-cache/dm-import-123/', { idempotent: true });
    });
  });

  describe('cleanupStaging', () => {
    test('deletes staging directory safely', async () => {
      await BackupService.cleanupStaging('file:///mock-cache/test-staging/');
      expect(deleteAsync).toHaveBeenCalledWith('file:///mock-cache/test-staging/', { idempotent: true });
    });

    test('handles undefined without error', async () => {
      await expect(BackupService.cleanupStaging(undefined)).resolves.not.toThrow();
    });
  });
});
