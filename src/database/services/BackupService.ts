import * as DocumentPicker from 'expo-document-picker';
import {
  cacheDirectory,
  copyAsync,
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  writeAsStringAsync,
} from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { unzip, zip } from 'react-native-zip-archive';
import {
  createBackupManifest,
  deserializeAppSettings,
  deserializeMeals,
  extractPhotoFileName,
  generateBackupFileName,
  isOriginalPhotoFileName,
  serializeAppSettings,
  serializeMeals,
  validateBackupManifest,
  validatePortableAppSettings,
  validatePortableMeals,
  type BackupManifest,
  type BackupValidationResult,
  type PortableAppSettingRecord,
} from '../../domain/backup';
import { getAppVersion } from '../../utils/buildInfo';
import {
  DATABASE_SCHEMA_VERSION,
  getAllAppSettingsRows,
  getAllPersistedMealRows,
  replaceDatabaseWithBackup,
} from './localDatabase';

function stripFileScheme(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}

function ensureTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`;
}

export interface ExportBackupResult {
  zipFileName: string;
  mealCount: number;
  photoCount: number;
}

export interface RestoreBackupResult {
  restoredMealCount: number;
  restoredPhotoCount: number;
}

export class BackupService {
  /**
   * Exports all meal records, settings, and original photos into a ZIP archive
   * and displays the system share sheet.
   */
  static async exportBackup(): Promise<ExportBackupResult> {
    if (!cacheDirectory) {
      throw new Error('一時保存ディレクトリを利用できません。');
    }

    const stagingDir = `${ensureTrailingSlash(cacheDirectory)}dm-export-${Date.now()}/`;
    const dbDir = `${stagingDir}database/`;
    const photosDir = `${stagingDir}photos/`;
    const zipFileName = generateBackupFileName();
    const zipFilePath = `${ensureTrailingSlash(cacheDirectory)}${zipFileName}`;

    try {
      await makeDirectoryAsync(stagingDir, { intermediates: true });
      await makeDirectoryAsync(dbDir, { intermediates: true });
      await makeDirectoryAsync(photosDir, { intermediates: true });

      const [mealRows, appSettingsRows] = await Promise.all([
        getAllPersistedMealRows(),
        getAllAppSettingsRows(),
      ]);

      const { portableMeals } = serializeMeals(mealRows);
      const portableSettings = serializeAppSettings(appSettingsRows);

      await Promise.all([
        writeAsStringAsync(`${dbDir}meals.json`, JSON.stringify(portableMeals, null, 2)),
        writeAsStringAsync(`${dbDir}app_settings.json`, JSON.stringify(portableSettings, null, 2)),
      ]);

      // Copy referenced original photos to staging photos/ directory
      let copiedPhotoCount = 0;
      const copiedSet = new Set<string>();

      for (const meal of mealRows) {
        const fileName = extractPhotoFileName(meal.photo_path);
        if (!fileName || !isOriginalPhotoFileName(fileName) || copiedSet.has(fileName)) {
          continue;
        }

        try {
          const fileInfo = await getInfoAsync(meal.photo_path);
          if (fileInfo.exists) {
            await copyAsync({
              from: meal.photo_path,
              to: `${photosDir}${fileName}`,
            });
            copiedSet.add(fileName);
            copiedPhotoCount++;
          }
        } catch {
          // Skip unreadable photo without logging sensitive file path
        }
      }

      const manifest: BackupManifest = createBackupManifest({
        appVersion: getAppVersion() ?? '1.0.0',
        schemaVersion: DATABASE_SCHEMA_VERSION,
        mealCount: portableMeals.length,
        photoCount: copiedPhotoCount,
      });

      await writeAsStringAsync(`${stagingDir}manifest.json`, JSON.stringify(manifest, null, 2));

      // Native ZIP compression directly on file paths
      await zip(stripFileScheme(stagingDir), stripFileScheme(zipFilePath));

      const isShareAvailable = await Sharing.isAvailableAsync();
      if (!isShareAvailable) {
        throw new Error('ファイルの共有機能が利用できません。');
      }

      await Sharing.shareAsync(zipFilePath, {
        mimeType: 'application/zip',
        dialogTitle: '食事記録バックアップを保存',
        UTI: 'public.zip-archive',
      });

      return {
        zipFileName,
        mealCount: portableMeals.length,
        photoCount: copiedPhotoCount,
      };
    } finally {
      // Ensure staging files and temporary ZIP archive are cleaned up
      await deleteAsync(stagingDir, { idempotent: true }).catch(() => undefined);
      await deleteAsync(zipFilePath, { idempotent: true }).catch(() => undefined);
    }
  }

  /**
   * Opens the file picker, extracts archive to a staging directory, and validates contents.
   * Does NOT modify database or existing photos.
   */
  static async pickAndValidateBackup(): Promise<BackupValidationResult & { canceled?: boolean }> {
    if (!cacheDirectory) {
      return { valid: false, error: '一時保存ディレクトリを利用できません。' };
    }

    const pickerResult = await DocumentPicker.getDocumentAsync({
      type: ['application/zip', 'application/x-zip-compressed', 'application/octet-stream', '*/*'],
      copyToCacheDirectory: true,
    });

    if (pickerResult.canceled || !pickerResult.assets || pickerResult.assets.length === 0) {
      return { valid: false, canceled: true };
    }

    const pickedAsset = pickerResult.assets[0];
    const stagingDir = `${ensureTrailingSlash(cacheDirectory)}dm-import-${Date.now()}/`;

    try {
      await makeDirectoryAsync(stagingDir, { intermediates: true });

      // Native unzip to staging directory
      await unzip(stripFileScheme(pickedAsset.uri), stripFileScheme(stagingDir));

      // 1. Validate manifest.json
      const manifestInfo = await getInfoAsync(`${stagingDir}manifest.json`);
      if (!manifestInfo.exists) {
        await this.cleanupStaging(stagingDir);
        return {
          valid: false,
          error: 'バックアップファイルに manifest.json が見つかりません。対応外のアーカイブ形式です。',
        };
      }

      const rawManifest = JSON.parse(await readAsStringAsync(`${stagingDir}manifest.json`));
      const manifestValidation = validateBackupManifest(rawManifest, DATABASE_SCHEMA_VERSION);
      if (!manifestValidation.valid || !manifestValidation.manifest) {
        await this.cleanupStaging(stagingDir);
        return {
          valid: false,
          error: manifestValidation.error ?? 'マニフェストファイルが無効です。',
        };
      }

      // 2. Validate database/meals.json
      const mealsInfo = await getInfoAsync(`${stagingDir}database/meals.json`);
      if (!mealsInfo.exists) {
        await this.cleanupStaging(stagingDir);
        return {
          valid: false,
          error: '食事データ（database/meals.json）が見つかりません。',
        };
      }

      const rawMeals = JSON.parse(await readAsStringAsync(`${stagingDir}database/meals.json`));
      const mealsValidation = validatePortableMeals(rawMeals);
      if (!mealsValidation.valid || !mealsValidation.meals) {
        await this.cleanupStaging(stagingDir);
        return {
          valid: false,
          error: mealsValidation.error ?? '食事データの形式が不正です。',
        };
      }

      // 3. Validate database/app_settings.json (optional)
      let appSettings: PortableAppSettingRecord[] = [];
      const settingsInfo = await getInfoAsync(`${stagingDir}database/app_settings.json`);
      if (settingsInfo.exists) {
        const rawSettings = JSON.parse(await readAsStringAsync(`${stagingDir}database/app_settings.json`));
        const settingsValidation = validatePortableAppSettings(rawSettings);
        if (settingsValidation.valid && settingsValidation.appSettings) {
          appSettings = settingsValidation.appSettings;
        }
      }

      // 4. Verify photo files exist
      const photoFileNames: string[] = [];
      for (const meal of mealsValidation.meals) {
        if (meal.photo_file_name) {
          const photoInfo = await getInfoAsync(`${stagingDir}photos/${meal.photo_file_name}`);
          if (photoInfo.exists && !photoFileNames.includes(meal.photo_file_name)) {
            photoFileNames.push(meal.photo_file_name);
          }
        }
      }

      return {
        valid: true,
        manifest: manifestValidation.manifest,
        meals: mealsValidation.meals,
        appSettings,
        photoFileNames,
        stagingDirectory: stagingDir,
      };
    } catch {
      await this.cleanupStaging(stagingDir);
      return {
        valid: false,
        error: 'バックアップファイルの展開または検証中にエラーが発生しました。ファイルが破損している可能性があります。',
      };
    }
  }

  /**
   * Restores data from a previously validated staging directory.
   * Copies photos to documentDirectory and replaces database records in a transaction.
   */
  static async restoreVerifiedBackup(
    validationResult: BackupValidationResult
  ): Promise<RestoreBackupResult> {
    if (
      !validationResult.valid ||
      !validationResult.stagingDirectory ||
      !validationResult.meals
    ) {
      throw new Error('復元に必要な検証データが不足しています。');
    }

    if (!documentDirectory) {
      throw new Error('ドキュメント保存ディレクトリを利用できません。');
    }

    const stagingDir = validationResult.stagingDirectory;
    const targetDocDir = ensureTrailingSlash(documentDirectory);

    try {
      // 1. Copy photos to documentDirectory
      let restoredPhotoCount = 0;
      const copiedSet = new Set<string>();

      for (const meal of validationResult.meals) {
        const fileName = meal.photo_file_name;
        if (!fileName || copiedSet.has(fileName)) {
          continue;
        }

        const sourcePath = `${stagingDir}photos/${fileName}`;
        const destPath = `${targetDocDir}${fileName}`;

        try {
          const sourceInfo = await getInfoAsync(sourcePath);
          if (sourceInfo.exists) {
            await copyAsync({
              from: sourcePath,
              to: destPath,
            });
            copiedSet.add(fileName);
            restoredPhotoCount++;
          }
        } catch {
          // Best effort for individual photo copy without leaking paths
        }
      }

      // 2. Deserialize portable meals with rewritten photo_path and null thumbnail_path
      const restoredMeals = deserializeMeals(validationResult.meals, targetDocDir);
      const restoredSettings = deserializeAppSettings(validationResult.appSettings ?? []);

      // 3. Atomically replace database records
      await replaceDatabaseWithBackup(restoredMeals, restoredSettings);

      return {
        restoredMealCount: restoredMeals.length,
        restoredPhotoCount,
      };
    } finally {
      await this.cleanupStaging(stagingDir);
    }
  }

  /**
   * Cleans up an import staging directory.
   */
  static async cleanupStaging(stagingDirectory?: string): Promise<void> {
    if (!stagingDirectory) {
      return;
    }

    await deleteAsync(stagingDirectory, { idempotent: true }).catch(() => undefined);
  }
}
