import {
  createDownloadResumable,
  deleteAsync,
  getInfoAsync,
  makeDirectoryAsync,
  moveAsync,
  readDirectoryAsync,
  type DownloadProgressData,
} from 'expo-file-system/legacy';
import { AppSettingsService } from '../../database/services/AppSettingsService';
import * as Crypto from 'expo-crypto';
import {
  getMealInputAssistExpectedPaths,
  getMealInputAssistManagedFiles,
  MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME,
  MEAL_INPUT_ASSIST_MODEL_CONFIG,
  type MealInputAssistManagedFile,
  MEDIAPIPE_MODEL_CONFIG,
  MEDIAPIPE_MODEL_DISPLAY_NAME,
  resolveMealInputAssistModelDirectoryPath,
  resolveMealInputAssistModelPath,
  resolveMealInputAssistProjectorPath,
  resolveMediaPipeModelPath,
} from './modelConfig';
import { getMediaPipeMealInputAssistNativeModule } from './mediapipeStaticImageProvider';
import type {
  MealInputAssistModelDownloadProgress,
  MealInputAssistModelInstallerOptions,
  MealInputAssistModelStatus,
  MediaPipeModelInstallerOptions,
  MediaPipeModelStatus,
} from './types';

function toErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim()) {
    return `${fallbackMessage}: ${error.message}`;
  }

  return fallbackMessage;
}

async function cleanupFile(path: string | null) {
  if (!path) {
    return;
  }

  await deleteAsync(path, { idempotent: true }).catch(() => undefined);
}

async function getInstalledFileState() {
  const [modelPath, projectorPath] = [
    resolveMealInputAssistModelPath(),
    resolveMealInputAssistProjectorPath(),
  ];

  const [modelInfo, projectorInfo] = await Promise.all([
    modelPath ? getInfoAsync(modelPath) : Promise.resolve({ exists: false }),
    projectorPath ? getInfoAsync(projectorPath) : Promise.resolve({ exists: false }),
  ]);

  return {
    modelExists: modelInfo.exists,
    projectorExists: projectorInfo.exists,
  };
}

async function persistReadyState() {
  await Promise.all([
    AppSettingsService.setMealInputAssistModelVersion(MEAL_INPUT_ASSIST_MODEL_CONFIG.version),
    AppSettingsService.setMealInputAssistModelStatus('ready'),
    AppSettingsService.setMealInputAssistModelDownloadedAt(Date.now()),
    AppSettingsService.setMealInputAssistModelErrorMessage(null),
  ]);
}

async function persistErrorState(message: string) {
  await Promise.all([
    AppSettingsService.setMealInputAssistModelVersion(MEAL_INPUT_ASSIST_MODEL_CONFIG.version),
    AppSettingsService.setMealInputAssistModelStatus('error'),
    AppSettingsService.setMealInputAssistModelErrorMessage(message),
  ]);
}

async function persistNotInstalledState() {
  await Promise.all([
    AppSettingsService.setMealInputAssistModelVersion(null),
    AppSettingsService.setMealInputAssistModelStatus('not_installed'),
    AppSettingsService.setMealInputAssistModelDownloadedAt(null),
    AppSettingsService.setMealInputAssistModelErrorMessage(null),
  ]);
}

async function persistMediaPipeReadyState(version: string) {
  await Promise.all([
    AppSettingsService.setMediaPipeModelVersion(version),
    AppSettingsService.setMediaPipeModelStatus('ready'),
    AppSettingsService.setMediaPipeModelDownloadedAt(Date.now()),
    AppSettingsService.setMediaPipeModelErrorMessage(null),
  ]);
}

async function persistMediaPipeErrorState(message: string, version?: string | null) {
  await Promise.all([
    AppSettingsService.setMediaPipeModelVersion(version ?? MEDIAPIPE_MODEL_CONFIG.version),
    AppSettingsService.setMediaPipeModelStatus('error'),
    AppSettingsService.setMediaPipeModelErrorMessage(message),
  ]);
}

async function persistMediaPipeNotInstalledState() {
  await Promise.all([
    AppSettingsService.setMediaPipeModelVersion(null),
    AppSettingsService.setMediaPipeModelStatus('not_installed'),
    AppSettingsService.setMediaPipeModelDownloadedAt(null),
    AppSettingsService.setMediaPipeModelErrorMessage(null),
  ]);
}

async function replaceFile(from: string, to: string) {
  const existing = await getInfoAsync(to);
  if (existing.exists) {
    await deleteAsync(to, { idempotent: true });
  }

  await moveAsync({
    from,
    to,
  });
}

async function safelyReplaceMediaPipeModelFile(from: string, to: string) {
  const existing = await getInfoAsync(to);
  if (!existing.exists) {
    await moveAsync({ from, to });
    return;
  }

  const backupPath = `${to}.backup-${Date.now()}-${Crypto.randomUUID().slice(0, 8)}`;
  await moveAsync({ from: to, to: backupPath });

  try {
    await moveAsync({ from, to });
    await cleanupFile(backupPath);
  } catch (moveError) {
    try {
      await moveAsync({ from: backupPath, to });
    } catch {
      // 復元失敗時は何もしない
    }
    throw moveError;
  }
}

function getCurrentFileProgress(bytesWritten: number, bytesExpected: number | null) {
  if (!bytesExpected || bytesExpected <= 0) {
    return null;
  }

  return Math.max(0, Math.min(1, bytesWritten / bytesExpected));
}

function buildProgressSnapshot({
  phase,
  completedFiles,
  totalFiles,
  file,
  currentFileBytesWritten = 0,
  currentFileBytesExpected = null,
}: {
  phase: MealInputAssistModelDownloadProgress['phase'];
  completedFiles: number;
  totalFiles: number;
  file: MealInputAssistManagedFile | null;
  currentFileBytesWritten?: number;
  currentFileBytesExpected?: number | null;
}): MealInputAssistModelDownloadProgress {
  const currentFileProgress = getCurrentFileProgress(
    currentFileBytesWritten,
    currentFileBytesExpected
  );
  const boundedCompletedFiles = Math.max(0, Math.min(completedFiles, totalFiles));
  const overallProgress =
    totalFiles > 0
      ? Math.max(0, Math.min(1, (boundedCompletedFiles + (currentFileProgress ?? 0)) / totalFiles))
      : 1;

  return {
    phase,
    completedFiles: boundedCompletedFiles,
    totalFiles,
    overallProgress,
    currentFileKey: file?.key ?? null,
    currentFileLabel: file?.label ?? null,
    currentFileFileName: file?.fileName ?? null,
    currentFileSourceFileName: file?.sourceFileName ?? null,
    currentFileBytesWritten,
    currentFileBytesExpected,
    currentFileProgress,
  };
}

function reportProgress(
  options: MealInputAssistModelInstallerOptions | undefined,
  progress: MealInputAssistModelDownloadProgress
) {
  options?.onProgress?.(progress);
}

async function downloadToTemporaryFile(
  file: MealInputAssistManagedFile,
  options: MealInputAssistModelInstallerOptions | undefined,
  completedFiles: number,
  totalFiles: number
) {
  const directoryPath = resolveMealInputAssistModelDirectoryPath();
  if (!directoryPath) {
    throw new Error('Document directory is not available.');
  }

  const temporaryPath = `${directoryPath}/${file.fileName}.download-${Date.now()}-${Crypto.randomUUID().slice(0, 8)}`;

  reportProgress(
    options,
    buildProgressSnapshot({
      phase: 'downloading',
      completedFiles,
      totalFiles,
      file,
      currentFileBytesWritten: 0,
      currentFileBytesExpected: null,
    })
  );

  const downloadTask = createDownloadResumable(
    file.url,
    temporaryPath,
    {},
    (progressEvent: DownloadProgressData) => {
      const currentFileBytesExpected =
        progressEvent.totalBytesExpectedToWrite > 0
          ? progressEvent.totalBytesExpectedToWrite
          : null;

      reportProgress(
        options,
        buildProgressSnapshot({
          phase: 'downloading',
          completedFiles,
          totalFiles,
          file,
          currentFileBytesWritten: progressEvent.totalBytesWritten,
          currentFileBytesExpected,
        })
      );
    }
  );

  const result = await downloadTask.downloadAsync();
  if (!result) {
    throw new Error(`${file.sourceFileName} のダウンロードが完了しませんでした。`);
  }

  return temporaryPath;
}

async function installModelFiles(options?: MealInputAssistModelInstallerOptions) {
  const directoryPath = resolveMealInputAssistModelDirectoryPath();
  const modelPath = resolveMealInputAssistModelPath();
  const projectorPath = resolveMealInputAssistProjectorPath();
  if (!directoryPath || !modelPath || !projectorPath) {
    throw new Error('Model path could not be resolved.');
  }

  const managedFiles = getMealInputAssistManagedFiles();
  const totalFiles = managedFiles.length;
  await makeDirectoryAsync(directoryPath, { intermediates: true });

  let temporaryModelPath: string | null = null;
  let temporaryProjectorPath: string | null = null;

  reportProgress(
    options,
    buildProgressSnapshot({
      phase: 'preparing',
      completedFiles: 0,
      totalFiles,
      file: null,
    })
  );

  try {
    for (let index = 0; index < managedFiles.length; index += 1) {
      const file = managedFiles[index];
      const temporaryPath = await downloadToTemporaryFile(file, options, index, totalFiles);
      if (file.key === 'model') {
        temporaryModelPath = temporaryPath;
      } else {
        temporaryProjectorPath = temporaryPath;
      }
    }

    reportProgress(
      options,
      buildProgressSnapshot({
        phase: 'installing',
        completedFiles: totalFiles,
        totalFiles,
        file: null,
      })
    );

    if (!temporaryModelPath || !temporaryProjectorPath) {
      throw new Error('ダウンロード済み file の一時保存先を解決できませんでした。');
    }

    await replaceFile(temporaryModelPath, modelPath);
    temporaryModelPath = null;
    await replaceFile(temporaryProjectorPath, projectorPath);
    temporaryProjectorPath = null;

    await persistReadyState();
  } catch (error) {
    const message = toErrorMessage(
      error,
      `${MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} model のダウンロードに失敗しました`
    );
    await persistErrorState(message);
    throw new Error(message);
  } finally {
    await Promise.all([cleanupFile(temporaryModelPath), cleanupFile(temporaryProjectorPath)]);
  }
}

export async function getMealInputAssistModelStatus(): Promise<MealInputAssistModelStatus> {
  const [persistedStatus, persistedVersion, downloadedAt, persistedErrorMessage, installedFiles] =
    await Promise.all([
      AppSettingsService.getMealInputAssistModelStatus(),
      AppSettingsService.getMealInputAssistModelVersion(),
      AppSettingsService.getMealInputAssistModelDownloadedAt(),
      AppSettingsService.getMealInputAssistModelErrorMessage(),
      getInstalledFileState(),
    ]);

  if (installedFiles.modelExists && installedFiles.projectorExists) {
    return {
      kind: 'ready',
      version: persistedVersion ?? MEAL_INPUT_ASSIST_MODEL_CONFIG.version,
      downloadedAt,
      errorMessage: null,
      expectedPaths: getMealInputAssistExpectedPaths(),
      files: installedFiles,
    };
  }

  if (installedFiles.modelExists || installedFiles.projectorExists) {
    return {
      kind: 'error',
      version: persistedVersion,
      downloadedAt,
      errorMessage:
        'model / projector の一部だけが端末に残っています。再ダウンロードしてください。',
      expectedPaths: getMealInputAssistExpectedPaths(),
      files: installedFiles,
    };
  }

  if (persistedStatus === 'error') {
    return {
      kind: 'error',
      version: persistedVersion,
      downloadedAt,
      errorMessage:
        persistedErrorMessage ?? 'meal input assist model のダウンロード状態が不正です。',
      expectedPaths: getMealInputAssistExpectedPaths(),
      files: installedFiles,
    };
  }

  return {
    kind: 'not_installed',
    version: persistedVersion,
    downloadedAt,
    errorMessage: null,
    expectedPaths: getMealInputAssistExpectedPaths(),
    files: installedFiles,
  };
}

export async function installMealInputAssistModel(
  options?: MealInputAssistModelInstallerOptions
): Promise<void> {
  await installModelFiles(options);
}

export async function redownloadMealInputAssistModel(
  options?: MealInputAssistModelInstallerOptions
): Promise<void> {
  await installModelFiles(options);
}

export async function deleteMealInputAssistModel(): Promise<void> {
  await Promise.all([
    cleanupFile(resolveMealInputAssistModelPath()),
    cleanupFile(resolveMealInputAssistProjectorPath()),
  ]);
  await persistNotInstalledState();
}

export async function deleteAllDownloadedLocalAiModels(): Promise<void> {
  const directoryPath = resolveMealInputAssistModelDirectoryPath();

  if (directoryPath) {
    const entries = await readDirectoryAsync(directoryPath).catch(() => []);
    await Promise.all(entries.map(entry => cleanupFile(`${directoryPath}/${entry}`)));
  }

  await Promise.all([persistNotInstalledState(), persistMediaPipeNotInstalledState()]);
}

export async function installMediaPipeModel(
  options?: MediaPipeModelInstallerOptions
): Promise<void> {
  const directoryPath = resolveMealInputAssistModelDirectoryPath();
  const targetPath = resolveMediaPipeModelPath();
  if (!directoryPath || !targetPath) {
    throw new Error('MediaPipe model path could not be resolved.');
  }

  await makeDirectoryAsync(directoryPath, { intermediates: true });

  const url = options?.url ?? MEDIAPIPE_MODEL_CONFIG.url;
  const expectedSha256 = options?.expectedSha256 ?? MEDIAPIPE_MODEL_CONFIG.sha256;
  const version = options?.version ?? MEDIAPIPE_MODEL_CONFIG.version;

  const temporaryPath = `${directoryPath}/${MEDIAPIPE_MODEL_CONFIG.fileName}.download-${Date.now()}-${Crypto.randomUUID().slice(0, 8)}`;

  options?.onProgress?.({
    phase: 'preparing',
    bytesWritten: 0,
    bytesExpected: null,
    progress: null,
  });

  let downloadedTemporaryPath: string | null = null;

  try {
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
      throw new Error(`${MEDIAPIPE_MODEL_DISPLAY_NAME} のダウンロードが完了しませんでした。`);
    }

    downloadedTemporaryPath = temporaryPath;

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
      throw new Error(
        `${MEDIAPIPE_MODEL_DISPLAY_NAME} のハッシュ検証に失敗しました (SHA256 不一致)。`
      );
    }

    options?.onProgress?.({
      phase: 'installing',
      bytesWritten: 0,
      bytesExpected: null,
      progress: 1,
    });

    await safelyReplaceMediaPipeModelFile(temporaryPath, targetPath);
    downloadedTemporaryPath = null;

    await persistMediaPipeReadyState(version);
  } catch (error) {
    const message = toErrorMessage(
      error,
      `${MEDIAPIPE_MODEL_DISPLAY_NAME} model のダウンロードに失敗しました`
    );
    await persistMediaPipeErrorState(message, version);
    throw new Error(message);
  } finally {
    await cleanupFile(downloadedTemporaryPath);
  }
}

export async function getMediaPipeModelStatus(): Promise<MediaPipeModelStatus> {
  const targetPath = resolveMediaPipeModelPath();
  const [persistedStatus, persistedVersion, downloadedAt, persistedErrorMessage, fileInfo] =
    await Promise.all([
      AppSettingsService.getMediaPipeModelStatus(),
      AppSettingsService.getMediaPipeModelVersion(),
      AppSettingsService.getMediaPipeModelDownloadedAt(),
      AppSettingsService.getMediaPipeModelErrorMessage(),
      targetPath ? getInfoAsync(targetPath) : Promise.resolve({ exists: false }),
    ]);

  const modelExists = Boolean(fileInfo.exists);

  if (modelExists) {
    return {
      kind: 'ready',
      version: persistedVersion ?? MEDIAPIPE_MODEL_CONFIG.version,
      downloadedAt,
      errorMessage: null,
      expectedPath: targetPath,
      modelExists: true,
    };
  }

  if (persistedStatus === 'error') {
    return {
      kind: 'error',
      version: persistedVersion,
      downloadedAt,
      errorMessage: persistedErrorMessage ?? 'MediaPipe model のダウンロード状態が不正です。',
      expectedPath: targetPath,
      modelExists: false,
    };
  }

  return {
    kind: 'not_installed',
    version: persistedVersion,
    downloadedAt,
    errorMessage: null,
    expectedPath: targetPath,
    modelExists: false,
  };
}

export async function deleteMediaPipeModel(): Promise<void> {
  await cleanupFile(resolveMediaPipeModelPath());
  await persistMediaPipeNotInstalledState();
}

export async function redownloadMediaPipeModel(
  options?: MediaPipeModelInstallerOptions
): Promise<void> {
  await installMediaPipeModel(options);
}
