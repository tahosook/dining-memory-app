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
import {
  getMealInputAssistExpectedPaths,
  getMealInputAssistManagedFiles,
  MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME,
  MEAL_INPUT_ASSIST_MODEL_CONFIG,
  type MealInputAssistManagedFile,
  resolveMealInputAssistModelDirectoryPath,
  resolveMealInputAssistModelPath,
  resolveMealInputAssistProjectorPath,
} from './modelConfig';
import type {
  MealInputAssistModelDownloadProgress,
  MealInputAssistModelInstallerOptions,
  MealInputAssistModelStatus,
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

function getCurrentFileProgress(
  bytesWritten: number,
  bytesExpected: number | null
) {
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
  const overallProgress = totalFiles > 0
    ? Math.max(
      0,
      Math.min(1, (boundedCompletedFiles + (currentFileProgress ?? 0)) / totalFiles)
    )
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

  const temporaryPath = `${directoryPath}/${file.fileName}.download-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

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
      const currentFileBytesExpected = progressEvent.totalBytesExpectedToWrite > 0
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
    const message = toErrorMessage(error, `${MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} model のダウンロードに失敗しました`);
    await persistErrorState(message);
    throw new Error(message);
  } finally {
    await Promise.all([
      cleanupFile(temporaryModelPath),
      cleanupFile(temporaryProjectorPath),
    ]);
  }
}

export async function getMealInputAssistModelStatus(): Promise<MealInputAssistModelStatus> {
  const [
    persistedStatus,
    persistedVersion,
    downloadedAt,
    persistedErrorMessage,
    installedFiles,
  ] = await Promise.all([
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
      errorMessage: 'model / projector の一部だけが端末に残っています。再ダウンロードしてください。',
      expectedPaths: getMealInputAssistExpectedPaths(),
      files: installedFiles,
    };
  }

  if (persistedStatus === 'error') {
    return {
      kind: 'error',
      version: persistedVersion,
      downloadedAt,
      errorMessage: persistedErrorMessage ?? 'meal input assist model のダウンロード状態が不正です。',
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
    await Promise.all(
      entries.map((entry) => cleanupFile(`${directoryPath}/${entry}`))
    );
  }

  await persistNotInstalledState();
}
