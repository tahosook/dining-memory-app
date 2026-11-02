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
  DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID,
  MEDIAPIPE_MODEL_CONFIG,
  MEDIAPIPE_MODEL_DISPLAY_NAME,
  MEDIAPIPE_CLASSIFIER_MODELS,
  resolveMealInputAssistFilePath,
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
  MediaPipeClassifierModelId,
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

async function persistMediaPipeReadyStateForModel(
  modelId: MediaPipeClassifierModelId,
  version: string
) {
  await Promise.all([
    AppSettingsService.setMediaPipeModelVersionForModel(modelId, version),
    AppSettingsService.setMediaPipeModelStatusForModel(modelId, 'ready'),
    AppSettingsService.setMediaPipeModelDownloadedAtForModel(modelId, Date.now()),
    AppSettingsService.setMediaPipeModelErrorMessageForModel(modelId, null),
  ]);
  if (modelId === DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID) {
    await persistMediaPipeReadyState(version);
  }
}

async function persistMediaPipeErrorStateForModel(
  modelId: MediaPipeClassifierModelId,
  message: string,
  version?: string | null
) {
  const modelMeta = MEDIAPIPE_CLASSIFIER_MODELS[modelId];
  await Promise.all([
    AppSettingsService.setMediaPipeModelVersionForModel(
      modelId,
      version ?? modelMeta?.version ?? MEDIAPIPE_MODEL_CONFIG.version
    ),
    AppSettingsService.setMediaPipeModelStatusForModel(modelId, 'error'),
    AppSettingsService.setMediaPipeModelErrorMessageForModel(modelId, message),
  ]);
  if (modelId === DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID) {
    await persistMediaPipeErrorState(message, version);
  }
}

async function persistMediaPipeNotInstalledStateForModel(modelId: MediaPipeClassifierModelId) {
  await Promise.all([
    AppSettingsService.setMediaPipeModelVersionForModel(modelId, null),
    AppSettingsService.setMediaPipeModelStatusForModel(modelId, 'not_installed'),
    AppSettingsService.setMediaPipeModelDownloadedAtForModel(modelId, null),
    AppSettingsService.setMediaPipeModelErrorMessageForModel(modelId, null),
  ]);
  if (modelId === DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID) {
    await persistMediaPipeNotInstalledState();
  }
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

  await Promise.all([
    persistNotInstalledState(),
    persistMediaPipeNotInstalledState(),
    persistMediaPipeNotInstalledStateForModel('cooking_method_9class'),
    persistMediaPipeNotInstalledStateForModel('universal_dining_23class'),
    persistMediaPipeNotInstalledStateForModel('personal_dual_dish'),
  ]);
}

export async function cleanupRetiredMediaPipeModels(): Promise<void> {
  const directoryPath = resolveMealInputAssistModelDirectoryPath();
  if (!directoryPath) {
    return;
  }
  const retiredFiles = [
    'personal_multilabel_44tag.task',
    'personal_household_8class.task',
    'universal_scene_7class.task',
  ];
  await Promise.all(retiredFiles.map(file => cleanupFile(`${directoryPath}/${file}`)));
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
  const temporaryPath = `${directoryPath}/${fileName}.download-${Date.now()}-${Crypto.randomUUID().slice(0, 8)}`;
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

export async function installMediaPipeModelForModel(
  modelId: MediaPipeClassifierModelId,
  options?: MediaPipeModelInstallerOptions
): Promise<void> {
  const directoryPath = resolveMealInputAssistModelDirectoryPath();
  if (!directoryPath) {
    throw new Error('MediaPipe model path could not be resolved.');
  }

  await makeDirectoryAsync(directoryPath, { intermediates: true });

  const modelMeta = MEDIAPIPE_CLASSIFIER_MODELS[modelId];
  if (!modelMeta) {
    throw new Error(`Unknown MediaPipe classifier model: ${modelId}`);
  }

  const version = options?.version ?? modelMeta.version;

  if (modelMeta.isDual && modelMeta.files) {
    const mainFile = modelMeta.files.personal_main_dish;
    const sideFile = modelMeta.files.personal_side_dish;

    const targetMainPath = resolveMealInputAssistFilePath(mainFile.fileName);
    const targetSidePath = resolveMealInputAssistFilePath(sideFile.fileName);

    if (!targetMainPath || !targetSidePath) {
      throw new Error('Dual MediaPipe model paths could not be resolved.');
    }

    let tempMainPath: string | null = null;
    let tempSidePath: string | null = null;
    let backupMainPath: string | null = null;
    let backupSidePath: string | null = null;
    let mainPlaced = false;
    let sidePlaced = false;

    try {
      tempMainPath = await downloadAndVerifyModelFile({
        directoryPath,
        fileName: mainFile.fileName,
        url: options?.url ?? mainFile.url,
        expectedSha256: options?.expectedSha256 ?? mainFile.sha256,
        options,
        label: `${modelMeta.label} (主菜)`,
      });

      tempSidePath = await downloadAndVerifyModelFile({
        directoryPath,
        fileName: sideFile.fileName,
        url: sideFile.url,
        expectedSha256: sideFile.sha256,
        options,
        label: `${modelMeta.label} (副菜)`,
      });

      options?.onProgress?.({
        phase: 'installing',
        bytesWritten: 0,
        bytesExpected: null,
        progress: 1,
      });

      // 1. バックアップ退避: 既存の主菜・副菜ファイルが存在する場合は両方を退避
      const [existingMain, existingSide] = await Promise.all([
        getInfoAsync(targetMainPath),
        getInfoAsync(targetSidePath),
      ]);

      if (existingMain.exists) {
        backupMainPath = `${targetMainPath}.backup-${Date.now()}-${Crypto.randomUUID().slice(0, 8)}`;
        await moveAsync({ from: targetMainPath, to: backupMainPath });
      }

      if (existingSide.exists) {
        backupSidePath = `${targetSidePath}.backup-${Date.now()}-${Crypto.randomUUID().slice(0, 8)}`;
        await moveAsync({ from: targetSidePath, to: backupSidePath });
      }

      // 2. 新ファイルの配置
      await moveAsync({ from: tempMainPath, to: targetMainPath });
      mainPlaced = true;
      tempMainPath = null;

      await moveAsync({ from: tempSidePath, to: targetSidePath });
      sidePlaced = true;
      tempSidePath = null;

      // 3. 状態の永続化（両ファイル配置後に ready を記録）
      await persistMediaPipeReadyStateForModel(modelId, version);

      // 4. トランザクション完了: すべて成功したため旧ファイルのバックアップを削除
      await Promise.all([cleanupFile(backupMainPath), cleanupFile(backupSidePath)]);
      backupMainPath = null;
      backupSidePath = null;
    } catch (error) {
      // ロールバック: 新規配置したファイルを削除し、退避した旧ファイルを復元
      if (mainPlaced) {
        await cleanupFile(targetMainPath);
      }
      if (sidePlaced) {
        await cleanupFile(targetSidePath);
      }

      if (backupMainPath) {
        await moveAsync({ from: backupMainPath, to: targetMainPath }).catch(() => {});
        backupMainPath = null;
      }
      if (backupSidePath) {
        await moveAsync({ from: backupSidePath, to: targetSidePath }).catch(() => {});
        backupSidePath = null;
      }

      const message = toErrorMessage(
        error,
        `${modelMeta.label} model のダウンロードに失敗しました`
      );
      await persistMediaPipeErrorStateForModel(modelId, message, version);
      throw new Error(message);
    } finally {
      await Promise.all([
        cleanupFile(tempMainPath),
        cleanupFile(tempSidePath),
        cleanupFile(backupMainPath),
        cleanupFile(backupSidePath),
      ]);
    }
    return;
  }

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

    await safelyReplaceMediaPipeModelFile(downloadedTemporaryPath, targetPath);
    downloadedTemporaryPath = null;

    await persistMediaPipeReadyStateForModel(modelId, version);
  } catch (error) {
    const message = toErrorMessage(error, `${modelLabel} model のダウンロードに失敗しました`);
    await persistMediaPipeErrorStateForModel(modelId, message, version);
    throw new Error(message);
  } finally {
    await cleanupFile(downloadedTemporaryPath);
  }
}

export async function installMediaPipeModel(
  options?: MediaPipeModelInstallerOptions & { modelId?: MediaPipeClassifierModelId }
): Promise<void> {
  const modelId = options?.modelId ?? DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID;
  await installMediaPipeModelForModel(modelId, options);
}

export async function getMediaPipeModelStatus(): Promise<MediaPipeModelStatus> {
  return getMediaPipeModelStatusForModel(DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID);
}

export async function deleteMediaPipeModel(): Promise<void> {
  await deleteMediaPipeModelForModel(DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID);
}

export async function redownloadMediaPipeModel(
  options?: MediaPipeModelInstallerOptions & { modelId?: MediaPipeClassifierModelId }
): Promise<void> {
  await installMediaPipeModel(options);
}

export async function redownloadMediaPipeModelForModel(
  modelId: MediaPipeClassifierModelId,
  options?: MediaPipeModelInstallerOptions
): Promise<void> {
  await installMediaPipeModelForModel(modelId, options);
}

export async function getMediaPipeModelStatusForModel(
  modelId: MediaPipeClassifierModelId
): Promise<MediaPipeModelStatus> {
  await cleanupRetiredMediaPipeModels().catch(() => {});

  const modelMeta = MEDIAPIPE_CLASSIFIER_MODELS[modelId];
  const [persistedStatus, persistedVersion, downloadedAt, persistedErrorMessage] =
    await Promise.all([
      AppSettingsService.getMediaPipeModelStatusForModel(modelId),
      AppSettingsService.getMediaPipeModelVersionForModel(modelId),
      AppSettingsService.getMediaPipeModelDownloadedAtForModel(modelId),
      AppSettingsService.getMediaPipeModelErrorMessageForModel(modelId),
    ]);

  if (modelMeta?.isDual && modelMeta.files) {
    const mainPath = resolveMealInputAssistFilePath(modelMeta.files.personal_main_dish.fileName);
    const sidePath = resolveMealInputAssistFilePath(modelMeta.files.personal_side_dish.fileName);
    const expectedPaths = [mainPath, sidePath].filter((p): p is string => Boolean(p));

    const [mainInfo, sideInfo] = await Promise.all([
      mainPath ? getInfoAsync(mainPath) : Promise.resolve({ exists: false }),
      sidePath ? getInfoAsync(sidePath) : Promise.resolve({ exists: false }),
    ]);

    const bothExist = Boolean(mainInfo.exists && sideInfo.exists);

    if (bothExist) {
      return {
        kind: 'ready',
        version: persistedVersion ?? modelMeta.version,
        downloadedAt,
        errorMessage: null,
        expectedPath: mainPath,
        expectedPaths,
        modelExists: true,
      };
    }

    // 片肺状態（片方のみ存在）の処理: 残存ファイルを掃除したうえで kind: 'error'（再ダウンロード案内）を返す
    const isOneMissing =
      (mainInfo.exists && !sideInfo.exists) || (!mainInfo.exists && sideInfo.exists);
    if (isOneMissing) {
      await Promise.all([
        mainInfo.exists && mainPath ? cleanupFile(mainPath) : Promise.resolve(),
        sideInfo.exists && sidePath ? cleanupFile(sidePath) : Promise.resolve(),
      ]);

      const errorMessage =
        '主菜・副菜モデルの片方のみが端末に残っていたためクリーンアップしました。モデルを再ダウンロードしてください。';
      await persistMediaPipeErrorStateForModel(modelId, errorMessage, persistedVersion).catch(
        () => {}
      );

      return {
        kind: 'error',
        version: persistedVersion,
        downloadedAt,
        errorMessage,
        expectedPath: mainPath,
        expectedPaths,
        modelExists: false,
      };
    }

    if (persistedStatus === 'error') {
      return {
        kind: 'error',
        version: persistedVersion,
        downloadedAt,
        errorMessage: persistedErrorMessage ?? 'MediaPipe model のダウンロード状態が不正です。',
        expectedPath: mainPath,
        expectedPaths,
        modelExists: false,
      };
    }

    return {
      kind: 'not_installed',
      version: persistedVersion,
      downloadedAt,
      errorMessage: null,
      expectedPath: mainPath,
      expectedPaths,
      modelExists: false,
    };
  }

  const targetPath = resolveMediaPipeModelPath(modelId);
  const fileInfo = targetPath ? await getInfoAsync(targetPath) : { exists: false };
  const modelExists = Boolean(fileInfo.exists);

  if (modelExists) {
    return {
      kind: 'ready',
      version: persistedVersion ?? modelMeta?.version ?? MEDIAPIPE_MODEL_CONFIG.version,
      downloadedAt,
      errorMessage: null,
      expectedPath: targetPath,
      expectedPaths: targetPath ? [targetPath] : [],
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
      expectedPaths: targetPath ? [targetPath] : [],
      modelExists: false,
    };
  }

  return {
    kind: 'not_installed',
    version: persistedVersion,
    downloadedAt,
    errorMessage: null,
    expectedPath: targetPath,
    expectedPaths: targetPath ? [targetPath] : [],
    modelExists: false,
  };
}

export async function deleteMediaPipeModelForModel(
  modelId: MediaPipeClassifierModelId
): Promise<void> {
  const modelMeta = MEDIAPIPE_CLASSIFIER_MODELS[modelId];
  if (modelMeta?.isDual && modelMeta.files) {
    const mainPath = resolveMealInputAssistFilePath(modelMeta.files.personal_main_dish.fileName);
    const sidePath = resolveMealInputAssistFilePath(modelMeta.files.personal_side_dish.fileName);
    await Promise.all([cleanupFile(mainPath), cleanupFile(sidePath)]);
  } else {
    await cleanupFile(resolveMediaPipeModelPath(modelId));
  }
  await persistMediaPipeNotInstalledStateForModel(modelId);
}
