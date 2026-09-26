// Note on expo-file-system/legacy:
// In Expo SDK 52/57, staging and file management operations rely on expo-file-system/legacy.
// Migration to modern FileSystem APIs is tracked as a future task.
import * as DocumentPicker from 'expo-document-picker';
import {
  cacheDirectory,
  copyAsync,
  deleteAsync,
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  readAsStringAsync,
  readDirectoryAsync,
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
  serializeAppSettings,
  serializeMeals,
  validateBackupManifest,
  validatePortableAppSettings,
  validatePortableMeals,
  validateSafeFileName,
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
import { cleanupOrphanedPhotoFiles } from '../../media/photoLifecycle';

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

      // Collect unique referenced original photos to export
      const requiredPhotoMap = new Map<string, string>();
      for (const meal of mealRows) {
        const fileName = extractPhotoFileName(meal.photo_path);
        if (!requiredPhotoMap.has(fileName)) {
          requiredPhotoMap.set(fileName, meal.photo_path);
        }
      }

      // Copy all referenced original photos to staging photos/ directory.
      // Must-fix 1 & 2: Fail-fast on any missing photo, read error, or copy failure.
      const copiedSet = new Set<string>();

      for (const [fileName, photoPath] of requiredPhotoMap.entries()) {
        let fileInfo;
        try {
          fileInfo = await getInfoAsync(photoPath);
        } catch {
          throw new Error('バックアップ対象の写真ファイルの読み取りに失敗しました。');
        }

        if (!fileInfo || !fileInfo.exists) {
          throw new Error('バックアップ対象の写真ファイルが端末内に見つかりません。');
        }

        try {
          await copyAsync({
            from: photoPath,
            to: `${photosDir}${fileName}`,
          });
        } catch {
          throw new Error('写真ファイルのバックアップ一時領域へのコピーに失敗しました。');
        }

        copiedSet.add(fileName);
      }

      if (copiedSet.size !== requiredPhotoMap.size) {
        throw new Error('バックアップ対象の写真コピー数と要求数が一致しません。');
      }

      const manifest: BackupManifest = createBackupManifest({
        appVersion: getAppVersion() ?? '1.0.0',
        schemaVersion: DATABASE_SCHEMA_VERSION,
        mealCount: portableMeals.length,
        photoCount: requiredPhotoMap.size,
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
        photoCount: requiredPhotoMap.size,
      };
    } finally {
      // Ensure staging directory is cleaned up (diagnostic log if failed).
      // Note: zipFilePath is deliberately kept in FileSystem.cacheDirectory so that
      // Sharing.shareAsync and the system share sheet / background file saver can access it.
      // The OS will automatically clean up the cache directory.
      await deleteAsync(stagingDir, { idempotent: true }).catch(err => {
        console.warn(
          '[BackupService] Failed to clean up export staging directory:',
          err instanceof Error ? err.message : err
        );
      });
    }
  }

  /**
   * Opens the file picker, extracts archive to a staging directory, and validates contents.
   * Does NOT modify database or existing photos.
   *
   * Note on staging lifecycle:
   * When validation succeeds, the staging directory is retained while the caller displays
   * the confirmation dialog to the user. The directory is cleaned up upon cancel
   * (via cleanupStaging) or after restore execution (via restoreVerifiedBackup's finally block).
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
          error:
            'バックアップファイルに manifest.json が見つかりません。対応外のアーカイブ形式です。',
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

      // 3. Validate database/app_settings.json (mandatory file in backup specification)
      const settingsInfo = await getInfoAsync(`${stagingDir}database/app_settings.json`);
      if (!settingsInfo.exists) {
        await this.cleanupStaging(stagingDir);
        return {
          valid: false,
          error: 'アプリ設定データ（database/app_settings.json）が見つかりません。',
        };
      }

      let rawSettings: unknown;
      try {
        rawSettings = JSON.parse(
          await readAsStringAsync(`${stagingDir}database/app_settings.json`)
        );
      } catch {
        await this.cleanupStaging(stagingDir);
        return {
          valid: false,
          error:
            'アプリ設定データ（database/app_settings.json）が破損しています（JSON構文エラー）。',
        };
      }

      const settingsValidation = validatePortableAppSettings(rawSettings);
      if (!settingsValidation.valid || !settingsValidation.appSettings) {
        await this.cleanupStaging(stagingDir);
        return {
          valid: false,
          error: settingsValidation.error ?? 'アプリ設定データの形式が不正です。',
        };
      }
      const appSettings: PortableAppSettingRecord[] = settingsValidation.appSettings;

      // Check meals count matches manifest
      if (mealsValidation.meals.length !== manifestValidation.manifest.mealCount) {
        await this.cleanupStaging(stagingDir);
        return {
          valid: false,
          error: `バックアップ内の食事記録件数（${mealsValidation.meals.length}件）がマニフェスト（${manifestValidation.manifest.mealCount}件）と一致しません。`,
        };
      }

      // 4. Verify photo files exist and match manifest
      const photosDir = `${stagingDir}photos`;
      const photosDirInfo = await getInfoAsync(photosDir);
      const actualPhotoFiles = photosDirInfo.exists
        ? await readDirectoryAsync(photosDir).catch(() => [])
        : [];

      // Ensure all filenames in photos/ are safe
      for (const entry of actualPhotoFiles) {
        if (!validateSafeFileName(entry)) {
          await this.cleanupStaging(stagingDir);
          return {
            valid: false,
            error: 'バックアップの写真ディレクトリに不正なファイル名が含まれています。',
          };
        }
      }

      // Verify photo count matches manifest
      if (actualPhotoFiles.length !== manifestValidation.manifest.photoCount) {
        await this.cleanupStaging(stagingDir);
        return {
          valid: false,
          error: `バックアップ内の写真ファイル数（${actualPhotoFiles.length}枚）がマニフェスト（${manifestValidation.manifest.photoCount}枚）と一致しません。`,
        };
      }

      // Collect all required unique photo files from meals
      const requiredPhotos = new Set<string>();
      for (const meal of mealsValidation.meals) {
        if (meal.photo_file_name) {
          if (!validateSafeFileName(meal.photo_file_name)) {
            await this.cleanupStaging(stagingDir);
            return {
              valid: false,
              error: '食事データに不正な写真ファイル名が含まれています。',
            };
          }
          requiredPhotos.add(meal.photo_file_name);
        }
      }

      // Ensure every single referenced photo exists in actualPhotoFiles
      const missingPhotos: string[] = [];
      for (const photoName of requiredPhotos) {
        if (!actualPhotoFiles.includes(photoName)) {
          missingPhotos.push(photoName);
        }
      }

      if (missingPhotos.length > 0) {
        console.warn(
          `[BackupService] Missing photos detected in backup archive (${missingPhotos.length} files):`,
          missingPhotos
        );
        await this.cleanupStaging(stagingDir);
        const foundCount = requiredPhotos.size - missingPhotos.length;
        return {
          valid: false,
          error: `バックアップ内の写真が不足しています。必要: ${requiredPhotos.size}枚, 検出: ${foundCount}枚（不足: ${missingPhotos.length}枚）。`,
        };
      }

      // Ensure no unreferenced / extraneous photos exist in photos/ directory
      const unreferencedPhotos: string[] = [];
      for (const actualFile of actualPhotoFiles) {
        if (!requiredPhotos.has(actualFile)) {
          unreferencedPhotos.push(actualFile);
        }
      }

      if (unreferencedPhotos.length > 0) {
        console.warn(
          `[BackupService] Unreferenced photos detected in backup archive (${unreferencedPhotos.length} files):`,
          unreferencedPhotos
        );
        await this.cleanupStaging(stagingDir);
        return {
          valid: false,
          error: `バックアップの写真ディレクトリに食事記録から参照されていない余分な写真が含まれています（${unreferencedPhotos.length}枚）。`,
        };
      }

      return {
        valid: true,
        manifest: manifestValidation.manifest,
        meals: mealsValidation.meals,
        appSettings,
        photoFileNames: Array.from(requiredPhotos),
        stagingDirectory: stagingDir,
      };
    } catch {
      await this.cleanupStaging(stagingDir);
      return {
        valid: false,
        error:
          'バックアップファイルの展開または検証中にエラーが発生しました。ファイルが破損している可能性があります。',
      };
    }
  }

  /**
   * Restores data from a previously validated staging directory.
   * Copies photos to documentDirectory and replaces database records in a transaction.
   * On failure, restores backed-up overwritten photos and removes newly created ones.
   */
  static async restoreVerifiedBackup(
    validationResult: BackupValidationResult
  ): Promise<RestoreBackupResult> {
    if (!validationResult.valid || !validationResult.stagingDirectory || !validationResult.meals) {
      throw new Error('復元に必要な検証データが不足しています。');
    }

    if (!documentDirectory || !cacheDirectory) {
      throw new Error('必要なストレージディレクトリを利用できません。');
    }

    const stagingDir = validationResult.stagingDirectory;
    const targetDocDir = ensureTrailingSlash(documentDirectory);
    const rollbackDir = `${ensureTrailingSlash(cacheDirectory)}dm-restore-rollback-${Date.now()}/`;

    const backedUpFiles: string[] = [];
    const newlyCreatedFiles: string[] = [];
    const copiedFiles = new Set<string>();

    try {
      await makeDirectoryAsync(rollbackDir, { intermediates: true });

      // Identify unique photo files to restore
      const uniquePhotosToRestore = new Set<string>();
      for (const meal of validationResult.meals) {
        if (meal.photo_file_name) {
          if (!validateSafeFileName(meal.photo_file_name)) {
            throw new Error('不正な写真ファイル名が含まれています。');
          }
          uniquePhotosToRestore.add(meal.photo_file_name);
        }
      }

      // 1. Prepare rollback state: backup existing files that would be overwritten
      await Promise.all(
        Array.from(uniquePhotosToRestore).map(async fileName => {
          const destPath = `${targetDocDir}${fileName}`;
          const destInfo = await getInfoAsync(destPath);
          if (destInfo.exists) {
            await copyAsync({
              from: destPath,
              to: `${rollbackDir}${fileName}`,
            });
            backedUpFiles.push(fileName);
          } else {
            newlyCreatedFiles.push(fileName);
          }
        })
      );

      // 2. Copy all verified photos to documentDirectory (Fail-fast: no best-effort)
      await Promise.all(
        Array.from(uniquePhotosToRestore).map(async fileName => {
          const sourcePath = `${stagingDir}photos/${fileName}`;
          const destPath = `${targetDocDir}${fileName}`;

          const sourceInfo = await getInfoAsync(sourcePath);
          if (!sourceInfo.exists) {
            throw new Error('写真ファイルが見つかりません。');
          }

          await copyAsync({
            from: sourcePath,
            to: destPath,
          });

          const destInfo = await getInfoAsync(destPath);
          if (!destInfo.exists) {
            throw new Error('写真ファイルのコピーに失敗しました。');
          }

          copiedFiles.add(fileName);
        })
      );

      // 3. Deserialize portable meals with rewritten photo_path and null thumbnail_path
      const restoredMeals = deserializeMeals(validationResult.meals, targetDocDir);
      const restoredSettings = deserializeAppSettings(validationResult.appSettings ?? []);

      // 4. Atomically replace database records inside SQLite transaction
      await replaceDatabaseWithBackup(restoredMeals, restoredSettings);

      // 5. Clean up orphaned photo and thumbnail files no longer referenced by the restored database
      try {
        await cleanupOrphanedPhotoFiles();
      } catch (cleanupError) {
        console.warn(
          '[BackupService] Non-fatal warning: Failed to clean up orphaned photos after restore:',
          cleanupError
        );
      }

      return {
        restoredMealCount: restoredMeals.length,
        restoredPhotoCount: copiedFiles.size,
      };
    } catch (restoreError) {
      // Rollback photo modifications if anything failed
      let rollbackFailedCount = 0;

      for (const fileName of newlyCreatedFiles) {
        if (copiedFiles.has(fileName)) {
          try {
            await deleteAsync(`${targetDocDir}${fileName}`, { idempotent: true });
          } catch {
            rollbackFailedCount++;
          }
        }
      }

      for (const fileName of backedUpFiles) {
        if (copiedFiles.has(fileName)) {
          try {
            await copyAsync({
              from: `${rollbackDir}${fileName}`,
              to: `${targetDocDir}${fileName}`,
            });
          } catch {
            rollbackFailedCount++;
          }
        }
      }

      if (rollbackFailedCount > 0) {
        console.warn(
          `[BackupService] Photo rollback encountered ${rollbackFailedCount} error(s) during recovery.`
        );
        const baseMessage =
          restoreError instanceof Error ? restoreError.message : '復元処理に失敗しました。';
        throw new Error(`${baseMessage}（写真のロールバック復元にも一部失敗しました）`);
      }

      throw restoreError;
    } finally {
      await deleteAsync(rollbackDir, { idempotent: true }).catch(err => {
        console.warn(
          '[BackupService] Failed to clean up rollback directory:',
          err instanceof Error ? err.message : err
        );
      });
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

    await deleteAsync(stagingDirectory, { idempotent: true }).catch(err => {
      console.warn(
        '[BackupService] Failed to clean up staging directory:',
        err instanceof Error ? err.message : err
      );
    });
  }
}
