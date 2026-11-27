import { createDownloadResumable, type DownloadProgressData } from 'expo-file-system/legacy';
import { AppSettingsService } from '../../../database/services/AppSettingsService';
import {
  DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID,
  RETIRED_MEDIAPIPE_MODEL_FILE_NAMES,
  type MediaPipeClassifierModelId,
} from '../../../domain/ai/mediapipeModelIds';
import { getMediaPipeMealInputAssistNativeModule } from '../mediapipeStaticImageProvider';
import {
  MEDIAPIPE_CLASSIFIER_MODELS,
  MEDIAPIPE_MODEL_CONFIG,
  MEDIAPIPE_MODEL_DISPLAY_NAME,
  resolveMealInputAssistFilePath,
  resolveMealInputAssistModelDirectoryPath,
  resolveMediaPipeModelPath,
  type MediaPipeClassifierModelMeta,
} from '../modelConfig';
import type { MediaPipeModelInstallerOptions, MediaPipeModelStatus } from '../types';
import {
  cleanupFile,
  createTemporaryDownloadPath,
  ensureModelDirectory,
  fileExists,
  safelyReplaceFile,
  safelyReplaceFilePair,
  toInstallerErrorMessage,
} from './fileOperations';
import {
  persistMediaPipeErrorStateForModel,
  persistMediaPipeNotInstalledStateForModel,
  persistMediaPipeReadyStateForModel,
  readMediaPipeModelPersistedStateForModel,
} from './modelStateStore';

const ORPHANED_DUAL_MODEL_STATUS_ERROR_MESSAGE =
  '主菜・副菜モデルの片方のみが端末に残っています。モデルを再ダウンロードしてください。';
const ORPHANED_DUAL_MODEL_CLEANUP_ERROR_MESSAGE =
  '主菜・副菜モデルの片方のみが端末に残っていたためクリーンアップしました。モデルを再ダウンロードしてください。';
const ORPHANED_DUAL_MODEL_CLEANUP_FAILED_ERROR_MESSAGE =
  '主菜・副菜モデルの片方のみが端末に残っており、残存ファイルの削除に失敗しました。モデルを再ダウンロードしてください。';

function resolveDualModelPaths(modelMeta: MediaPipeClassifierModelMeta) {
  if (!modelMeta.isDual || !modelMeta.files) {
    return null;
  }

  const mainPath = resolveMealInputAssistFilePath(modelMeta.files.personal_main_dish.fileName);
  const sidePath = resolveMealInputAssistFilePath(modelMeta.files.personal_side_dish.fileName);
  const expectedPaths = [mainPath, sidePath].filter((p): p is string => Boolean(p));

  return {
    mainFile: modelMeta.files.personal_main_dish,
    sideFile: modelMeta.files.personal_side_dish,
    mainPath,
    sidePath,
    expectedPaths,
  };
}

/** Deletes retired MediaPipe model binaries and migrates/cleans legacy settings keys. */
export async function cleanupRetiredMediaPipeModels(): Promise<void> {
  const directoryPath = resolveMealInputAssistModelDirectoryPath();
  if (directoryPath) {
    await Promise.all(
      RETIRED_MEDIAPIPE_MODEL_FILE_NAMES.map(file => cleanupFile(`${directoryPath}/${file}`))
    );
  }
  await AppSettingsService.migrateLegacyMediaPipeModelSettings().catch(() => false);
  await AppSettingsService.cleanupLegacyMediaPipeModelSettings().catch(() => {});
}

async function downloadAndVerifyModelFile({
  directoryPath,
  fileName,
  url,
  expectedSha256,
  options,
  label,
}: {
  directoryPath: string;
  fileName: string;
  url: string;
  expectedSha256: string;
  options?: MediaPipeModelInstallerOptions;
  label: string;
}): Promise<string> {
  const temporaryPath = createTemporaryDownloadPath(directoryPath, fileName);
  let shouldCleanup = true;

  try {
    options?.onProgress?.({
      phase: 'preparing',
      bytesWritten: 0,
      bytesExpected: null,
      progress: null,
    });

    const downloadTask = createDownloadResumable(
      url,
      temporaryPath,
      {},
      (progressEvent: DownloadProgressData) => {
        const bytesExpected =
          progressEvent.totalBytesExpectedToWrite > 0
            ? progressEvent.totalBytesExpectedToWrite
            : null;
        const progress =
          bytesExpected && bytesExpected > 0
            ? Math.max(0, Math.min(1, progressEvent.totalBytesWritten / bytesExpected))
            : null;

        options?.onProgress?.({
          phase: 'downloading',
          bytesWritten: progressEvent.totalBytesWritten,
          bytesExpected,
          progress,
        });
      }
    );

    const result = await downloadTask.downloadAsync();
    if (!result) {
      throw new Error(`${label} のダウンロードが完了しませんでした。`);
    }

    options?.onProgress?.({
      phase: 'verifying',
      bytesWritten: 0,
      bytesExpected: null,
      progress: null,
    });

    const nativeModule = getMediaPipeMealInputAssistNativeModule();
    if (!nativeModule?.verifyFileSha256) {
      throw new Error('MediaPipe native module verifyFileSha256 が利用できません。');
    }

    const isValid = await nativeModule.verifyFileSha256(temporaryPath, expectedSha256);
    if (!isValid) {
      throw new Error(`${label} のハッシュ検証に失敗しました (SHA256 不一致)。`);
    }

    shouldCleanup = false;
    return temporaryPath;
  } finally {
    if (shouldCleanup) {
      await cleanupFile(temporaryPath);
    }
  }
}

async function installDualMediaPipeModel(
  modelId: MediaPipeClassifierModelId,
  modelMeta: MediaPipeClassifierModelMeta,
  directoryPath: string,
  version: string,
  options?: MediaPipeModelInstallerOptions
): Promise<void> {
  const dualPaths = resolveDualModelPaths(modelMeta);
  if (!dualPaths || !dualPaths.mainPath || !dualPaths.sidePath) {
    throw new Error('Dual MediaPipe model paths could not be resolved.');
  }

  let tempMainPath: string | null = null;
  let tempSidePath: string | null = null;

  try {
    tempMainPath = await downloadAndVerifyModelFile({
      directoryPath,
      fileName: dualPaths.mainFile.fileName,
      url: options?.url ?? dualPaths.mainFile.url,
      expectedSha256: options?.expectedSha256 ?? dualPaths.mainFile.sha256,
      options,
      label: `${modelMeta.label} (主菜)`,
    });

    tempSidePath = await downloadAndVerifyModelFile({
      directoryPath,
      fileName: dualPaths.sideFile.fileName,
      url: dualPaths.sideFile.url,
      expectedSha256: dualPaths.sideFile.sha256,
      options,
      label: `${modelMeta.label} (副菜)`,
    });

    options?.onProgress?.({
      phase: 'installing',
      bytesWritten: 0,
      bytesExpected: null,
      progress: 1,
    });

    const placedMainTempPath = tempMainPath;
    const placedSideTempPath = tempSidePath;
    tempMainPath = null;
    tempSidePath = null;

    await safelyReplaceFilePair({
      targetMainPath: dualPaths.mainPath,
      targetSidePath: dualPaths.sidePath,
      tempMainPath: placedMainTempPath,
      tempSidePath: placedSideTempPath,
      commit: () => persistMediaPipeReadyStateForModel(modelId, version),
    });
  } catch (error) {
    const message = toInstallerErrorMessage(
      error,
      `${modelMeta.label} model のダウンロードに失敗しました`
    );
    await persistMediaPipeErrorStateForModel(modelId, message, version);
    throw new Error(message);
  } finally {
    await Promise.all([cleanupFile(tempMainPath), cleanupFile(tempSidePath)]);
  }
}

async function installSingleMediaPipeModel(
  modelId: MediaPipeClassifierModelId,
  modelMeta: MediaPipeClassifierModelMeta,
  directoryPath: string,
  version: string,
  options?: MediaPipeModelInstallerOptions
): Promise<void> {
  const url = options?.url ?? modelMeta.url ?? MEDIAPIPE_MODEL_CONFIG.url;
  const expectedSha256 =
    options?.expectedSha256 ?? modelMeta.sha256 ?? MEDIAPIPE_MODEL_CONFIG.sha256;
  if (!expectedSha256 || expectedSha256.trim() === '') {
    throw new Error(
      'MediaPipe model SHA-256 が定義されていないためダウンロード検証を実行できません。'
    );
  }

  const targetPath = resolveMediaPipeModelPath(modelId);
  if (!targetPath) {
    throw new Error('MediaPipe model path could not be resolved.');
  }

  const modelLabel =
    modelId === DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID
      ? MEDIAPIPE_MODEL_DISPLAY_NAME
      : modelMeta.label;

  let downloadedTemporaryPath: string | null = null;

  try {
    downloadedTemporaryPath = await downloadAndVerifyModelFile({
      directoryPath,
      fileName: modelMeta.fileName,
      url,
      expectedSha256,
      options,
      label: modelLabel,
    });

    options?.onProgress?.({
      phase: 'installing',
      bytesWritten: 0,
      bytesExpected: null,
      progress: 1,
    });

    await safelyReplaceFile(downloadedTemporaryPath, targetPath);
    downloadedTemporaryPath = null;

    await persistMediaPipeReadyStateForModel(modelId, version);
  } catch (error) {
    const message = toInstallerErrorMessage(
      error,
      `${modelLabel} model のダウンロードに失敗しました`
    );
    await persistMediaPipeErrorStateForModel(modelId, message, version);
    throw new Error(message);
  } finally {
    await cleanupFile(downloadedTemporaryPath);
  }
}

/** Downloads, verifies SHA-256, and atomically installs the specified MediaPipe model. */
export async function installMediaPipeModelForModel(
  modelId: MediaPipeClassifierModelId,
  options?: MediaPipeModelInstallerOptions
): Promise<void> {
  const directoryPath = resolveMealInputAssistModelDirectoryPath();
  if (!directoryPath) {
    throw new Error('MediaPipe model path could not be resolved.');
  }

  const modelMeta = MEDIAPIPE_CLASSIFIER_MODELS[modelId];
  if (!modelMeta) {
    throw new Error(`Unknown MediaPipe classifier model: ${modelId}`);
  }

  const version = options?.version ?? modelMeta.version;

  if (modelMeta.isDual && modelMeta.files) {
    await ensureModelDirectory(directoryPath);
    await cleanupRetiredMediaPipeModels().catch(() => {});
    await installDualMediaPipeModel(modelId, modelMeta, directoryPath, version, options);
    return;
  }

  const expectedSha256 =
    options?.expectedSha256 ?? modelMeta.sha256 ?? MEDIAPIPE_MODEL_CONFIG.sha256;
  if (!expectedSha256 || expectedSha256.trim() === '') {
    throw new Error(
      'MediaPipe model SHA-256 が定義されていないためダウンロード検証を実行できません。'
    );
  }

  await ensureModelDirectory(directoryPath);
  await cleanupRetiredMediaPipeModels().catch(() => {});
  await installSingleMediaPipeModel(modelId, modelMeta, directoryPath, version, options);
}

/** Installs the specified MediaPipe model, defaulting to the default classifier model. */
export async function installMediaPipeModel(
  options?: MediaPipeModelInstallerOptions & { modelId?: MediaPipeClassifierModelId }
): Promise<void> {
  const modelId = options?.modelId ?? DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID;
  await installMediaPipeModelForModel(modelId, options);
}

/** Re-downloads and replaces the specified MediaPipe model, defaulting to the default model. */
export async function redownloadMediaPipeModel(
  options?: MediaPipeModelInstallerOptions & { modelId?: MediaPipeClassifierModelId }
): Promise<void> {
  await installMediaPipeModel(options);
}

/** Re-downloads and replaces a specific MediaPipe classifier model. */
export async function redownloadMediaPipeModelForModel(
  modelId: MediaPipeClassifierModelId,
  options?: MediaPipeModelInstallerOptions
): Promise<void> {
  await installMediaPipeModelForModel(modelId, options);
}

/**
 * Reads the installation status of a MediaPipe classifier model without mutating files or DB state.
 */
export async function getMediaPipeModelStatusForModel(
  modelId: MediaPipeClassifierModelId
): Promise<MediaPipeModelStatus> {
  const modelMeta = MEDIAPIPE_CLASSIFIER_MODELS[modelId];
  const persisted = await readMediaPipeModelPersistedStateForModel(modelId);

  if (modelMeta?.isDual && modelMeta.files) {
    const dualPaths = resolveDualModelPaths(modelMeta);
    if (!dualPaths) {
      return {
        kind: 'not_installed',
        version: persisted.version,
        downloadedAt: persisted.downloadedAt,
        errorMessage: null,
        expectedPath: null,
        expectedPaths: [],
        modelExists: false,
      };
    }

    const [mainExists, sideExists] = await Promise.all([
      fileExists(dualPaths.mainPath),
      fileExists(dualPaths.sidePath),
    ]);

    if (mainExists && sideExists) {
      return {
        kind: 'ready',
        version: persisted.version ?? modelMeta.version,
        downloadedAt: persisted.downloadedAt,
        errorMessage: null,
        expectedPath: dualPaths.mainPath,
        expectedPaths: dualPaths.expectedPaths,
        modelExists: true,
      };
    }

    if (mainExists !== sideExists) {
      return {
        kind: 'error',
        version: persisted.version,
        downloadedAt: persisted.downloadedAt,
        errorMessage: ORPHANED_DUAL_MODEL_STATUS_ERROR_MESSAGE,
        expectedPath: dualPaths.mainPath,
        expectedPaths: dualPaths.expectedPaths,
        modelExists: false,
        isOrphanedPartialFiles: true,
      };
    }

    if (persisted.status === 'error') {
      return {
        kind: 'error',
        version: persisted.version,
        downloadedAt: persisted.downloadedAt,
        errorMessage: persisted.errorMessage ?? 'MediaPipe model のダウンロード状態が不正です。',
        expectedPath: dualPaths.mainPath,
        expectedPaths: dualPaths.expectedPaths,
        modelExists: false,
      };
    }

    return {
      kind: 'not_installed',
      version: persisted.version,
      downloadedAt: persisted.downloadedAt,
      errorMessage: null,
      expectedPath: dualPaths.mainPath,
      expectedPaths: dualPaths.expectedPaths,
      modelExists: false,
    };
  }

  const targetPath = resolveMediaPipeModelPath(modelId);
  const modelExists = await fileExists(targetPath);

  if (modelExists) {
    return {
      kind: 'ready',
      version: persisted.version ?? modelMeta?.version ?? MEDIAPIPE_MODEL_CONFIG.version,
      downloadedAt: persisted.downloadedAt,
      errorMessage: null,
      expectedPath: targetPath,
      expectedPaths: targetPath ? [targetPath] : [],
      modelExists: true,
    };
  }

  if (persisted.status === 'error') {
    return {
      kind: 'error',
      version: persisted.version,
      downloadedAt: persisted.downloadedAt,
      errorMessage: persisted.errorMessage ?? 'MediaPipe model のダウンロード状態が不正です。',
      expectedPath: targetPath,
      expectedPaths: targetPath ? [targetPath] : [],
      modelExists: false,
    };
  }

  return {
    kind: 'not_installed',
    version: persisted.version,
    downloadedAt: persisted.downloadedAt,
    errorMessage: null,
    expectedPath: targetPath,
    expectedPaths: targetPath ? [targetPath] : [],
    modelExists: false,
  };
}

/**
 * Cleans up an orphaned single binary of a dual MediaPipe model and persists an error status
 * so the user is prompted to re-download. Returns null when the model is not orphaned.
 */
export async function cleanupOrphanedDualMediaPipeModel(
  modelId: MediaPipeClassifierModelId
): Promise<MediaPipeModelStatus | null> {
  const modelMeta = MEDIAPIPE_CLASSIFIER_MODELS[modelId];
  const dualPaths = modelMeta ? resolveDualModelPaths(modelMeta) : null;
  if (!dualPaths) {
    return null;
  }

  const [mainExists, sideExists] = await Promise.all([
    fileExists(dualPaths.mainPath),
    fileExists(dualPaths.sidePath),
  ]);

  if (mainExists === sideExists) {
    return null;
  }

  await Promise.all([
    mainExists ? cleanupFile(dualPaths.mainPath) : Promise.resolve(),
    sideExists ? cleanupFile(dualPaths.sidePath) : Promise.resolve(),
  ]);

  const [remainingMainExists, remainingSideExists] = await Promise.all([
    fileExists(dualPaths.mainPath),
    fileExists(dualPaths.sidePath),
  ]);

  const persisted = await readMediaPipeModelPersistedStateForModel(modelId);
  const bothExistAfter = remainingMainExists && remainingSideExists;
  if (bothExistAfter) {
    const resolvedVersion =
      persisted.version ?? modelMeta?.version ?? MEDIAPIPE_MODEL_CONFIG.version;
    await persistMediaPipeReadyStateForModel(modelId, resolvedVersion).catch(() => {});
    return {
      kind: 'ready',
      version: resolvedVersion,
      downloadedAt: persisted.downloadedAt,
      errorMessage: null,
      expectedPath: dualPaths.mainPath,
      expectedPaths: dualPaths.expectedPaths,
      modelExists: true,
      isOrphanedPartialFiles: false,
    };
  }

  const stillOrphaned = remainingMainExists !== remainingSideExists;
  const errorMessage = stillOrphaned
    ? ORPHANED_DUAL_MODEL_CLEANUP_FAILED_ERROR_MESSAGE
    : ORPHANED_DUAL_MODEL_CLEANUP_ERROR_MESSAGE;

  await persistMediaPipeErrorStateForModel(modelId, errorMessage, persisted.version).catch(
    () => {}
  );

  return {
    kind: 'error',
    version: persisted.version,
    downloadedAt: persisted.downloadedAt,
    errorMessage,
    expectedPath: dualPaths.mainPath,
    expectedPaths: dualPaths.expectedPaths,
    modelExists: false,
    isOrphanedPartialFiles: stillOrphaned,
  };
}

/** Reads installation status for the default MediaPipe classifier model. */
export async function getMediaPipeModelStatus(): Promise<MediaPipeModelStatus> {
  return getMediaPipeModelStatusForModel(DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID);
}

/** Deletes a MediaPipe classifier model's files and resets its persisted state. */
export async function deleteMediaPipeModelForModel(
  modelId: MediaPipeClassifierModelId
): Promise<void> {
  const modelMeta = MEDIAPIPE_CLASSIFIER_MODELS[modelId];
  const dualPaths = modelMeta ? resolveDualModelPaths(modelMeta) : null;
  if (dualPaths) {
    await Promise.all([cleanupFile(dualPaths.mainPath), cleanupFile(dualPaths.sidePath)]);
  } else {
    await cleanupFile(resolveMediaPipeModelPath(modelId));
  }
  await persistMediaPipeNotInstalledStateForModel(modelId);
}

/** Deletes the default MediaPipe classifier model's files and resets its persisted state. */
export async function deleteMediaPipeModel(): Promise<void> {
  await deleteMediaPipeModelForModel(DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID);
}
