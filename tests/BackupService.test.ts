import * as DocumentPicker from 'expo-document-picker';
import {
  copyAsync,
  deleteAsync,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  readDirectoryAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { unzip, zip, listContents } from 'react-native-zip-archive';
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
  listContents: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///mock-cache/',
  documentDirectory: 'file:///mock-documents/',
  makeDirectoryAsync: jest.fn(),
  deleteAsync: jest.fn(),
  copyAsync: jest.fn(),
  getInfoAsync: jest.fn(),
  readAsStringAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
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
    (listContents as jest.Mock).mockResolvedValue([
      { path: 'manifest.json' },
      { path: 'database/meals.json' },
      { path: 'database/app_settings.json' },
      { path: 'photos/meal-20260422-01.jpg' },
    ]);
    (readDirectoryAsync as jest.Mock).mockResolvedValue(['meal-20260422-01.jpg']);
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

      // Cleanup called for staging directory, while temporary zip file is retained in cache directory for sharing
      expect(deleteAsync).toHaveBeenCalledTimes(1);
      expect(deleteAsync).toHaveBeenCalledWith(
        expect.stringContaining('/dm-export-'),
        { idempotent: true }
      );
      expect(deleteAsync).not.toHaveBeenCalledWith(
        expect.stringContaining('.zip'),
        expect.anything()
      );
    });

    test('cleans up staging files even if zip or share throws error', async () => {
      (zip as jest.Mock).mockRejectedValue(new Error('Zip failure'));

      await expect(BackupService.exportBackup()).rejects.toThrow('Zip failure');

      expect(deleteAsync).toHaveBeenCalled();
    });

    test('rejects exportBackup when referenced photo does not exist on device', async () => {
      (getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      await expect(BackupService.exportBackup()).rejects.toThrow('バックアップ対象の写真ファイルが端末内に見つかりません。');

      // zip and share are not executed
      expect(zip).not.toHaveBeenCalled();
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
      expect(deleteAsync).toHaveBeenCalled();
    });

    test('rejects exportBackup when copying a photo to staging fails', async () => {
      (copyAsync as jest.Mock).mockRejectedValue(new Error('Disk write error'));

      await expect(BackupService.exportBackup()).rejects.toThrow('写真ファイルのバックアップ一時領域へのコピーに失敗しました。');

      expect(zip).not.toHaveBeenCalled();
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
      expect(deleteAsync).toHaveBeenCalled();
    });

    test('rejects exportBackup when getInfoAsync throws error', async () => {
      (getInfoAsync as jest.Mock).mockRejectedValue(new Error('Permission denied'));

      await expect(BackupService.exportBackup()).rejects.toThrow('バックアップ対象の写真ファイルの読み取りに失敗しました。');

      expect(zip).not.toHaveBeenCalled();
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
      expect(deleteAsync).toHaveBeenCalled();
    });

    test('rejects exportBackup when meal has empty photo_path', async () => {
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([
        { ...mockMealRows[0], photo_path: '' },
      ]);

      await expect(BackupService.exportBackup()).rejects.toThrow('写真パスが指定されていないか不正です');

      expect(zip).not.toHaveBeenCalled();
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
      expect(deleteAsync).toHaveBeenCalled();
    });

    test('rejects exportBackup when meal has unsafe or traversal photo_path', async () => {
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([
        { ...mockMealRows[0], photo_path: 'file:///data/user/0/files/../../evil.jpg' },
      ]);

      await expect(BackupService.exportBackup()).rejects.toThrow('無効または非オリジナルの写真パス');

      expect(zip).not.toHaveBeenCalled();
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
      expect(deleteAsync).toHaveBeenCalled();
    });

    test('rejects exportBackup when meal photo_path points to thumbnail', async () => {
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([
        { ...mockMealRows[0], photo_path: 'file:///mock-documents/meal-20260422-01-thumb.jpg' },
      ]);

      await expect(BackupService.exportBackup()).rejects.toThrow('無効または非オリジナルの写真パス');

      expect(zip).not.toHaveBeenCalled();
      expect(Sharing.shareAsync).not.toHaveBeenCalled();
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
        JSON.stringify({
          formatVersion: 99,
          appId: 'com.tahosook.diningmemory',
          schemaVersion: 2,
          exportedAt: '2026-09-19T00:00:00.000Z',
          mealCount: 1,
          photoCount: 1,
        })
      );

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('新しいバージョンのアプリ');
    });

    // Test C: appId mismatch test
    test('rejects backup with mismatched or invalid appId', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picker/backup.zip' }],
      });

      (readAsStringAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('manifest.json')) {
          return Promise.resolve(
            JSON.stringify({
              formatVersion: 1,
              appId: 'com.other.maliciousapp',
              appVersion: '1.0.0',
              schemaVersion: 2,
              exportedAt: '2026-09-19T10:00:00.000Z',
              mealCount: 0,
              photoCount: 0,
            })
          );
        }
        return Promise.resolve('{}');
      });

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('別のアプリ');
    });

    // Test D: schemaVersion mismatch test
    test('rejects backup with schemaVersion mismatch', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picker/backup.zip' }],
      });

      (readAsStringAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('manifest.json')) {
          return Promise.resolve(
            JSON.stringify({
              formatVersion: 1,
              appId: 'com.tahosook.diningmemory',
              appVersion: '1.0.0',
              schemaVersion: 1, // Current DB schema is 2
              exportedAt: '2026-09-19T10:00:00.000Z',
              mealCount: 0,
              photoCount: 0,
            })
          );
        }
        return Promise.resolve('{}');
      });

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('データベーススキーマバージョン');
      expect(result.error).toContain('互換性がありません');
    });

    // Test A: Missing photo in archive test
    test('rejects backup when meals reference photos missing from photos directory', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picker/backup.zip' }],
      });

      const manifestContent = JSON.stringify({
        formatVersion: 1,
        appId: 'com.tahosook.diningmemory',
        appVersion: '1.0.0',
        schemaVersion: 2,
        exportedAt: '2026-09-19T10:00:00.000Z',
        mealCount: 2,
        photoCount: 2,
      });

      const mealsContent = JSON.stringify([
        {
          id: 'meal-1',
          uuid: 'uuid-1',
          meal_name: 'うどん',
          photo_file_name: 'meal-udon.jpg',
          is_homemade: 0,
          meal_datetime: 1713800000000,
          created_at: 1713800000000,
          updated_at: 1713800000000,
        },
        {
          id: 'meal-2',
          uuid: 'uuid-2',
          meal_name: 'そば',
          photo_file_name: 'meal-soba.jpg',
          is_homemade: 0,
          meal_datetime: 1713900000000,
          created_at: 1713900000000,
          updated_at: 1713900000000,
        },
      ]);

      (readAsStringAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('manifest.json')) return Promise.resolve(manifestContent);
        if (path.endsWith('meals.json')) return Promise.resolve(mealsContent);
        if (path.endsWith('app_settings.json')) return Promise.resolve('[]');
        return Promise.resolve('{}');
      });

      // photos/ contains 2 files, but meal-soba.jpg is missing (replaced by another file)
      (readDirectoryAsync as jest.Mock).mockResolvedValue(['meal-udon.jpg', 'other-photo.jpg']);

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('バックアップ内の写真が不足しています');
      expect(result.error).toContain('必要: 2枚, 検出: 1枚（不足: 1枚）');
    });

    // Test B: photoCount mismatch test
    test('rejects backup when actual photos count does not match manifest.photoCount', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picker/backup.zip' }],
      });

      const manifestContent = JSON.stringify({
        formatVersion: 1,
        appId: 'com.tahosook.diningmemory',
        appVersion: '1.0.0',
        schemaVersion: 2,
        exportedAt: '2026-09-19T10:00:00.000Z',
        mealCount: 1,
        photoCount: 5, // Manifest says 5
      });

      const mealsContent = JSON.stringify([
        {
          id: 'meal-1',
          uuid: 'uuid-1',
          meal_name: 'うどん',
          photo_file_name: 'meal-udon.jpg',
          is_homemade: 0,
          meal_datetime: 1713800000000,
          created_at: 1713800000000,
          updated_at: 1713800000000,
        },
      ]);

      (readAsStringAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('manifest.json')) return Promise.resolve(manifestContent);
        if (path.endsWith('meals.json')) return Promise.resolve(mealsContent);
        if (path.endsWith('app_settings.json')) return Promise.resolve('[]');
        return Promise.resolve('{}');
      });

      // Actual photos count is only 1
      (readDirectoryAsync as jest.Mock).mockResolvedValue(['meal-udon.jpg']);

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('写真ファイル数（1枚）がマニフェスト（5枚）と一致しません');
    });

    test('rejects backup if listContents fails', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picker/backup.zip' }],
      });

      (listContents as jest.Mock).mockRejectedValue(new Error('Zip format invalid'));

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('バックアップファイルの読み取りに失敗しました。ファイルが破損している可能性があります。');
      expect(unzip).not.toHaveBeenCalled();
    });

    test('rejects backup if listContents contains unallowed file paths', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picker/backup.zip' }],
      });

      (listContents as jest.Mock).mockResolvedValue([
        { path: 'manifest.json' },
        { path: 'unknown.txt' },
      ]);

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(false);
      expect(result.error).toBe('バックアップファイルに未許可のファイルが含まれています。');
      expect(unzip).not.toHaveBeenCalled();
    });

    // Test G: Zip Slip / malicious paths test
    test('rejects backup containing malicious path traversal in photos directory or meals', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picker/backup.zip' }],
      });

      (listContents as jest.Mock).mockResolvedValue([
        { path: 'manifest.json' },
        { path: '../evil.sh' },
      ]);

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
          meal_name: '不正',
          photo_file_name: '../../evil.jpg',
          is_homemade: 0,
          meal_datetime: 1713800000000,
          created_at: 1713800000000,
          updated_at: 1713800000000,
        },
      ]);

      (readAsStringAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('manifest.json')) return Promise.resolve(manifestContent);
        if (path.endsWith('meals.json')) return Promise.resolve(mealsContent);
        return Promise.resolve('{}');
      });

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(false);
    });

    test('rejects backup when app_settings.json has invalid JSON syntax', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picker/backup.zip' }],
      });

      const manifestContent = JSON.stringify({
        formatVersion: 1,
        appId: 'com.tahosook.diningmemory',
        appVersion: '1.0.0',
        schemaVersion: 2,
        exportedAt: '2026-09-19T10:00:00.000Z',
        mealCount: 0,
        photoCount: 0,
      });

      (getInfoAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('database/app_settings.json')) return Promise.resolve({ exists: true });
        return Promise.resolve({ exists: true });
      });

      (readAsStringAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('manifest.json')) return Promise.resolve(manifestContent);
        if (path.endsWith('meals.json')) return Promise.resolve('[]');
        if (path.endsWith('app_settings.json')) return Promise.resolve('{ broken json:');
        return Promise.resolve('{}');
      });

      (readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('JSON構文エラー');
    });

    test('rejects backup when app_settings.json fails schema validation', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picker/backup.zip' }],
      });

      const manifestContent = JSON.stringify({
        formatVersion: 1,
        appId: 'com.tahosook.diningmemory',
        appVersion: '1.0.0',
        schemaVersion: 2,
        exportedAt: '2026-09-19T10:00:00.000Z',
        mealCount: 0,
        photoCount: 0,
      });

      (getInfoAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('database/app_settings.json')) return Promise.resolve({ exists: true });
        return Promise.resolve({ exists: true });
      });

      (readAsStringAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('manifest.json')) return Promise.resolve(manifestContent);
        if (path.endsWith('meals.json')) return Promise.resolve('[]');
        // Array of invalid setting object (missing required key)
        if (path.endsWith('app_settings.json')) return Promise.resolve(JSON.stringify([{ invalid_key: 'value' }]));
        return Promise.resolve('{}');
      });

      (readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('設定データ');
      expect(result.error).toContain('キーが不正です');
    });

    test('rejects backup when database/app_settings.json does not exist (mandatory component)', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picker/backup.zip' }],
      });

      const manifestContent = JSON.stringify({
        formatVersion: 1,
        appId: 'com.tahosook.diningmemory',
        appVersion: '1.0.0',
        schemaVersion: 2,
        exportedAt: '2026-09-19T10:00:00.000Z',
        mealCount: 0,
        photoCount: 0,
      });

      (getInfoAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('database/app_settings.json')) return Promise.resolve({ exists: false });
        return Promise.resolve({ exists: true });
      });

      (readAsStringAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('manifest.json')) return Promise.resolve(manifestContent);
        if (path.endsWith('meals.json')) return Promise.resolve('[]');
        return Promise.resolve('{}');
      });

      (readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('database/app_settings.json');
      expect(result.error).toContain('見つかりません');
    });

    test('accepts backup when database/app_settings.json is valid empty array', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picker/backup.zip' }],
      });

      const manifestContent = JSON.stringify({
        formatVersion: 1,
        appId: 'com.tahosook.diningmemory',
        appVersion: '1.0.0',
        schemaVersion: 2,
        exportedAt: '2026-09-19T10:00:00.000Z',
        mealCount: 0,
        photoCount: 0,
      });

      (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

      (readAsStringAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('manifest.json')) return Promise.resolve(manifestContent);
        if (path.endsWith('meals.json')) return Promise.resolve('[]');
        if (path.endsWith('app_settings.json')) return Promise.resolve('[]');
        return Promise.resolve('{}');
      });

      (readDirectoryAsync as jest.Mock).mockResolvedValue([]);

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(true);
      expect(result.appSettings).toEqual([]);
    });

    test('rejects backup when photos directory contains unreferenced extraneous photos', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'file:///mock-picker/backup.zip' }],
      });

      const manifestContent = JSON.stringify({
        formatVersion: 1,
        appId: 'com.tahosook.diningmemory',
        appVersion: '1.0.0',
        schemaVersion: 2,
        exportedAt: '2026-09-19T10:00:00.000Z',
        mealCount: 1,
        photoCount: 2,
      });

      const mealsContent = JSON.stringify([
        {
          id: 'meal-1',
          uuid: 'uuid-1',
          meal_name: 'うどん',
          photo_file_name: 'meal-udon.jpg',
          is_homemade: 0,
          meal_datetime: 1713800000000,
          created_at: 1713800000000,
          updated_at: 1713800000000,
        },
      ]);

      (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

      (readAsStringAsync as jest.Mock).mockImplementation((path: string) => {
        if (path.endsWith('manifest.json')) return Promise.resolve(manifestContent);
        if (path.endsWith('meals.json')) return Promise.resolve(mealsContent);
        if (path.endsWith('app_settings.json')) return Promise.resolve('[]');
        return Promise.resolve('{}');
      });

      // photos/ has 2 files: meal-udon.jpg (referenced) and extra-unreferenced.jpg (not referenced)
      (readDirectoryAsync as jest.Mock).mockResolvedValue(['meal-udon.jpg', 'extra-unreferenced.jpg']);

      const result = await BackupService.pickAndValidateBackup();
      expect(result.valid).toBe(false);
      expect(result.error).toContain('余分な写真');
    });
  });

  describe('restoreVerifiedBackup', () => {
    // Test H: Full valid backup restored completely
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

    test('cleans up orphaned old photos and thumbnails not referenced in restored database', async () => {
      // Setup mock files in documentDirectory:
      // - old unreferenced photo: meal-old.jpg
      // - old unreferenced thumbnail: meal-old-thumb.jpg
      // - new photo being restored: meal-20260422-01.jpg
      // - non-photo file: DiningMemory.db
      (readDirectoryAsync as jest.Mock).mockImplementation((path: string) => {
        if (path === 'file:///mock-documents/' || path === 'file:///mock-documents') {
          return Promise.resolve([
            'meal-old.jpg',
            'meal-old-thumb.jpg',
            'meal-20260422-01.jpg',
            'DiningMemory.db',
          ]);
        }
        return Promise.resolve([]);
      });

      // After restore, DB only references meal-20260422-01.jpg
      (getAllPersistedMealRows as jest.Mock).mockResolvedValue([
        {
          id: 'meal-1',
          photo_path: 'file:///mock-documents/meal-20260422-01.jpg',
          photo_thumbnail_path: null,
          is_deleted: 0,
        },
      ]);

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
      };

      await BackupService.restoreVerifiedBackup(validationResult);

      // Orphan old photos were deleted
      expect(deleteAsync).toHaveBeenCalledWith(
        'file:///mock-documents/meal-old.jpg',
        { idempotent: true }
      );
      expect(deleteAsync).toHaveBeenCalledWith(
        'file:///mock-documents/meal-old-thumb.jpg',
        { idempotent: true }
      );

      // Restored photo and DB file were NOT deleted
      expect(deleteAsync).not.toHaveBeenCalledWith(
        'file:///mock-documents/meal-20260422-01.jpg',
        expect.anything()
      );
      expect(deleteAsync).not.toHaveBeenCalledWith(
        'file:///mock-documents/DiningMemory.db',
        expect.anything()
      );
    });

    // Test E: Photo copy failure rollback
    test('rolls back photo changes when copying a photo fails midway, without modifying DB', async () => {

      const validationResult = {
        valid: true,
        stagingDirectory: 'file:///mock-cache/dm-import-123/',
        meals: [
          {
            id: 'meal-1',
            uuid: 'uuid-1',
            meal_name: '既存上書き写真の食事',
            photo_file_name: 'existing-photo.jpg',
            is_homemade: 0,
            is_deleted: 0,
            meal_datetime: 1713800000000,
            created_at: 1713800000000,
            updated_at: 1713800000000,
          },
          {
            id: 'meal-2',
            uuid: 'uuid-2',
            meal_name: '新規写真の食事',
            photo_file_name: 'new-photo.jpg',
            is_homemade: 0,
            is_deleted: 0,
            meal_datetime: 1713900000000,
            created_at: 1713900000000,
            updated_at: 1713900000000,
          },
        ],
      };

      // Mock getInfoAsync:
      // - existing-photo.jpg exists in documentDirectory
      // - new-photo.jpg does NOT exist in documentDirectory initially
      // - staging photos exist
      (getInfoAsync as jest.Mock).mockImplementation((path: string) => {
        if (path === 'file:///mock-documents/existing-photo.jpg') {
          return Promise.resolve({ exists: true });
        }
        if (path === 'file:///mock-documents/new-photo.jpg') {
          return Promise.resolve({ exists: false });
        }
        return Promise.resolve({ exists: true });
      });

      // Fail when copying new-photo.jpg
      (copyAsync as jest.Mock).mockImplementation((options: { from: string; to: string }) => {
        if (options.to === 'file:///mock-documents/new-photo.jpg') {
          return Promise.reject(new Error('ストレージ容量不足（Disk full）'));
        }
        return Promise.resolve(undefined);
      });

      await expect(BackupService.restoreVerifiedBackup(validationResult)).rejects.toThrow('Disk full');

      // Database replace was NEVER called
      expect(replaceDatabaseWithBackup).not.toHaveBeenCalled();

      // Overwritten existing photo was restored from rollback directory
      expect(copyAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.stringMatching(/file:\/\/\/mock-cache\/dm-restore-rollback-\d+\/existing-photo\.jpg/),
          to: 'file:///mock-documents/existing-photo.jpg',
        })
      );

      // Rollback directory and staging directory were deleted
      expect(deleteAsync).toHaveBeenCalledWith(
        expect.stringMatching(/file:\/\/\/mock-cache\/dm-restore-rollback-\d+\//),
        { idempotent: true }
      );
      expect(deleteAsync).toHaveBeenCalledWith('file:///mock-cache/dm-import-123/', { idempotent: true });
    });

    // Test F: DB transaction failure rollback
    test('rolls back photos when replaceDatabaseWithBackup throws error', async () => {
      const validationResult = {
        valid: true,
        stagingDirectory: 'file:///mock-cache/dm-import-123/',
        meals: [
          {
            id: 'meal-1',
            uuid: 'uuid-1',
            meal_name: '既存上書き写真の食事',
            photo_file_name: 'existing-photo.jpg',
            is_homemade: 0,
            is_deleted: 0,
            meal_datetime: 1713800000000,
            created_at: 1713800000000,
            updated_at: 1713800000000,
          },
          {
            id: 'meal-2',
            uuid: 'uuid-2',
            meal_name: '新規写真の食事',
            photo_file_name: 'new-photo.jpg',
            is_homemade: 0,
            is_deleted: 0,
            meal_datetime: 1713900000000,
            created_at: 1713900000000,
            updated_at: 1713900000000,
          },
        ],
      };

      let newPhotoCopied = false;
      (copyAsync as jest.Mock).mockImplementation((options: { from: string; to: string }) => {
        if (options.to === 'file:///mock-documents/new-photo.jpg') {
          newPhotoCopied = true;
        }
        return Promise.resolve(undefined);
      });

      (getInfoAsync as jest.Mock).mockImplementation((path: string) => {
        if (path === 'file:///mock-documents/existing-photo.jpg') {
          return Promise.resolve({ exists: true });
        }
        if (path === 'file:///mock-documents/new-photo.jpg') {
          return Promise.resolve({ exists: newPhotoCopied });
        }
        return Promise.resolve({ exists: true });
      });

      (replaceDatabaseWithBackup as jest.Mock).mockRejectedValue(new Error('SQLite transaction failed'));

      await expect(BackupService.restoreVerifiedBackup(validationResult)).rejects.toThrow('SQLite transaction failed');

      // 1. Existing photo is restored from rollback dir
      expect(copyAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          from: expect.stringMatching(/file:\/\/\/mock-cache\/dm-restore-rollback-\d+\/existing-photo\.jpg/),
          to: 'file:///mock-documents/existing-photo.jpg',
        })
      );

      // 2. Newly created photo is deleted from documentDirectory
      expect(deleteAsync).toHaveBeenCalledWith('file:///mock-documents/new-photo.jpg', { idempotent: true });

      // 3. Rollback directory and staging directory are cleaned up
      expect(deleteAsync).toHaveBeenCalledWith(
        expect.stringMatching(/file:\/\/\/mock-cache\/dm-restore-rollback-\d+\//),
        { idempotent: true }
      );
      expect(deleteAsync).toHaveBeenCalledWith('file:///mock-cache/dm-import-123/', { idempotent: true });
    });

    test('warns and reports error when photo rollback restoration itself fails', async () => {
      const validationResult = {
        valid: true,
        stagingDirectory: 'file:///mock-cache/dm-import-123/',
        meals: [
          {
            id: 'meal-1',
            uuid: 'uuid-1',
            meal_name: '既存上書き写真の食事',
            photo_file_name: 'existing-photo.jpg',
            is_homemade: 0,
            is_deleted: 0,
            meal_datetime: 1713800000000,
            created_at: 1713800000000,
            updated_at: 1713800000000,
          },
        ],
      };

      (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (copyAsync as jest.Mock).mockImplementation((options: { from: string; to: string }) => {
        // Rollback copy: restoring existing-photo.jpg from rollback directory to mock-documents
        if (options.from.includes('/dm-restore-rollback-')) {
          return Promise.reject(new Error('Rollback copy failed'));
        }
        return Promise.resolve(undefined);
      });

      (replaceDatabaseWithBackup as jest.Mock).mockRejectedValue(new Error('DB failure'));

      await expect(BackupService.restoreVerifiedBackup(validationResult)).rejects.toThrow(
        '写真のロールバック復元にも一部失敗しました'
      );
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
