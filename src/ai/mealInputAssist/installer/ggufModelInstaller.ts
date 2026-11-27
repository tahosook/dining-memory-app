import { createDownloadResumable, type DownloadProgressData } from 'expo-file-system/legacy';
import {
  getMealInputAssistExpectedPaths,
  getMealInputAssistManagedFiles,
  MEAL_INPUT_ASSIST_MODEL_CONFIG,
  MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME,
  resolveMealInputAssistModelDirectoryPath,
  resolveMealInputAssistModelPath,
  resolveMealInputAssistProjectorPath,
  type MealInputAssistManagedFile,
} from '../modelConfig';
import type {
  MealInputAssistModelDownloadProgress,
  MealInputAssistModelInstallerOptions,
  MealInputAssistModelStatus,
} from '../types';
import {
  cleanupFile,
  createTemporaryDownloadPath,
  ensureModelDirectory,
  fileExists,
  replaceFile,
  toInstallerErrorMessage,
} from './fileOperations';
import {
  persistMealInputAssistErrorState,
  persistMealInputAssistNotInstalledState,
  persistMealInputAssistReadyState,
  readMealInputAssistModelPersistedState,
} from './modelStateStore';

async function getInstalledFileState() {
  const [modelExists, projectorExists] = await Promise.all([
    fileExists(resolveMealInputAssistModelPath()),
    fileExists(resolveMealInputAssistProjectorPath()),
  ]);

  return {
    modelExists,
    projectorExists,
  };
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
): Promise<string> {
  const directoryPath = resolveMealInputAssistModelDirectoryPath();
  if (!directoryPath) {
    throw new Error('Document directory is not available.');
  }

  const temporaryPath = createTemporaryDownloadPath(directoryPath, file.fileName);

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

async function installModelFiles(options?: MealInputAssistModelInstallerOptions): Promise<void> {
  const directoryPath = resolveMealInputAssistModelDirectoryPath();
  const modelPath = resolveMealInputAssistModelPath();
  const projectorPath = resolveMealInputAssistProjectorPath();
  if (!directoryPath || !modelPath || !projectorPath) {
    throw new Error('Model path could not be resolved.');
  }

  const managedFiles = getMealInputAssistManagedFiles();
  const totalFiles = managedFiles.length;
  await ensureModelDirectory(directoryPath);

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

    await persistMealInputAssistReadyState();
  } catch (error) {
    const message = toInstallerErrorMessage(
      error,
      `${MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} model のダウンロードに失敗しました`
    );
    await persistMealInputAssistErrorState(message);
    throw new Error(message);
  } finally {
    await Promise.all([cleanupFile(temporaryModelPath), cleanupFile(temporaryProjectorPath)]);
  }
}

/** Reads the installation status of the local GGUF model and projector without mutating state. */
export async function getMealInputAssistModelStatus(): Promise<MealInputAssistModelStatus> {
  const [persisted, installedFiles] = await Promise.all([
    readMealInputAssistModelPersistedState(),
    getInstalledFileState(),
  ]);

  if (installedFiles.modelExists && installedFiles.projectorExists) {
    return {
      kind: 'ready',
      version: persisted.version ?? MEAL_INPUT_ASSIST_MODEL_CONFIG.version,
      downloadedAt: persisted.downloadedAt,
      errorMessage: null,
      expectedPaths: getMealInputAssistExpectedPaths(),
      files: installedFiles,
    };
  }

  if (installedFiles.modelExists || installedFiles.projectorExists) {
    return {
      kind: 'error',
      version: persisted.version,
      downloadedAt: persisted.downloadedAt,
      errorMessage:
        'model / projector の一部だけが端末に残っています。再ダウンロードしてください。',
      expectedPaths: getMealInputAssistExpectedPaths(),
      files: installedFiles,
    };
  }

  if (persisted.status === 'error') {
    return {
      kind: 'error',
      version: persisted.version,
      downloadedAt: persisted.downloadedAt,
      errorMessage:
        persisted.errorMessage ?? 'meal input assist model のダウンロード状態が不正です。',
      expectedPaths: getMealInputAssistExpectedPaths(),
      files: installedFiles,
    };
  }

  return {
    kind: 'not_installed',
    version: persisted.version,
    downloadedAt: persisted.downloadedAt,
    errorMessage: null,
    expectedPaths: getMealInputAssistExpectedPaths(),
    files: installedFiles,
  };
}

/** Installs the GGUF meal input assist model and projector into local storage. */
export async function installMealInputAssistModel(
  options?: MealInputAssistModelInstallerOptions
): Promise<void> {
  await installModelFiles(options);
}

/** Re-downloads and replaces the GGUF meal input assist model and projector. */
export async function redownloadMealInputAssistModel(
  options?: MealInputAssistModelInstallerOptions
): Promise<void> {
  await installModelFiles(options);
}

/** Deletes the GGUF model and projector files and resets persisted status. */
export async function deleteMealInputAssistModel(): Promise<void> {
  await Promise.all([
    cleanupFile(resolveMealInputAssistModelPath()),
    cleanupFile(resolveMealInputAssistProjectorPath()),
  ]);
  await persistMealInputAssistNotInstalledState();
}
