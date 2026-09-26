jest.mock('expo-file-system/legacy', () => {
  const existingFiles = new Set<string>();
  const downloads = new Map<string, string>();
  const listEntries = (directoryPath: string) => {
    const prefix = `${directoryPath}/`;
    return Array.from(
      new Set(
        [...existingFiles, ...downloads.keys()]
          .filter((path) => path.startsWith(prefix))
          .map((path) => path.slice(prefix.length))
      )
    );
  };

  return {
    __mock: {
      existingFiles,
      downloads,
      reset() {
        existingFiles.clear();
        downloads.clear();
      },
    },
    documentDirectory: 'file:///documents/',
    getInfoAsync: jest.fn(async (path: string) => ({
      exists: existingFiles.has(path) || downloads.has(path),
    })),
    makeDirectoryAsync: jest.fn(async () => undefined),
    createDownloadResumable: jest.fn((url: string, fileUri: string, _options: unknown, onProgress?: (event: {
      totalBytesWritten: number;
      totalBytesExpectedToWrite: number;
    }) => void) => ({
      downloadAsync: jest.fn(async () => {
        onProgress?.({
          totalBytesWritten: 256,
          totalBytesExpectedToWrite: 1024,
        });
        onProgress?.({
          totalBytesWritten: 1024,
          totalBytesExpectedToWrite: 1024,
        });
        downloads.set(fileUri, url);
        return { uri: fileUri, status: 200, headers: {} };
      }),
    })),
    readDirectoryAsync: jest.fn(async (directoryPath: string) => listEntries(directoryPath)),
    moveAsync: jest.fn(async ({ from, to }: { from: string; to: string }) => {
      existingFiles.delete(from);
      downloads.delete(from);
      existingFiles.add(to);
    }),
    deleteAsync: jest.fn(async (path: string) => {
      existingFiles.delete(path);
      downloads.delete(path);
    }),
  };
});

jest.mock('../src/database/services/localDatabase', () => {
  let appSettings: Record<string, string> = {};

  return {
    initializeDatabase: jest.fn(async () => {}),
    getDatabase: jest.fn(() => null),
    isUsingNativeDatabase: jest.fn(() => false),
    getInMemoryAppSettings: jest.fn(() => ({ ...appSettings })),
    setInMemoryAppSettings: jest.fn((nextAppSettings: Record<string, string>) => {
      appSettings = { ...nextAppSettings };
    }),
  };
});

import { NativeModules } from 'react-native';
import { AppSettingsService } from '../src/database/services/AppSettingsService';
import {
  MEDIAPIPE_MODEL_CONFIG,
  resolveMealInputAssistModelDirectoryPath,
  resolveMealInputAssistModelPath,
  resolveMealInputAssistProjectorPath,
  resolveMediaPipeModelPath,
} from '../src/ai/mealInputAssist';
import {
  deleteAllDownloadedLocalAiModels,
  deleteMealInputAssistModel,
  deleteMediaPipeModel,
  getMealInputAssistModelStatus,
  getMediaPipeModelStatus,
  installMealInputAssistModel,
  installMediaPipeModel,
  redownloadMealInputAssistModel,
  redownloadMediaPipeModel,
} from '../src/ai/mealInputAssist/modelInstaller';

const fileSystemMock = jest.requireMock('expo-file-system/legacy') as {
  __mock: {
    existingFiles: Set<string>;
    downloads: Map<string, string>;
    reset: () => void;
  };
  createDownloadResumable: jest.Mock;
  moveAsync: jest.Mock;
};

const defaultMoveAsync = async ({ from, to }: { from: string; to: string }) => {
  fileSystemMock.__mock.existingFiles.delete(from);
  fileSystemMock.__mock.downloads.delete(from);
  fileSystemMock.__mock.existingFiles.add(to);
};

describe('meal input assist model installer', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    fileSystemMock.__mock.reset();
    fileSystemMock.moveAsync.mockImplementation(defaultMoveAsync);
    await AppSettingsService.setMealInputAssistModelStatus('not_installed');
    await AppSettingsService.setMealInputAssistModelVersion(null);
    await AppSettingsService.setMealInputAssistModelDownloadedAt(null);
    await AppSettingsService.setMealInputAssistModelErrorMessage(null);
  });

  test('reports not_installed when neither fixed-path file exists', async () => {
    await expect(getMealInputAssistModelStatus()).resolves.toMatchObject({
      kind: 'not_installed',
      files: {
        modelExists: false,
        projectorExists: false,
      },
    });
  });

  test('installs both files into the fixed paths and becomes ready', async () => {
    await installMealInputAssistModel();

    expect(fileSystemMock.createDownloadResumable).toHaveBeenCalledTimes(2);
    expect(fileSystemMock.__mock.existingFiles.has(resolveMealInputAssistModelPath()!)).toBe(true);
    expect(fileSystemMock.__mock.existingFiles.has(resolveMealInputAssistProjectorPath()!)).toBe(true);
    await expect(getMealInputAssistModelStatus()).resolves.toMatchObject({
      kind: 'ready',
      files: {
        modelExists: true,
        projectorExists: true,
      },
    });
  });

  test('reports progress updates with the actual source file names while downloading', async () => {
    const onProgress = jest.fn();

    await installMealInputAssistModel({ onProgress });

    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'preparing',
      totalFiles: 2,
    }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'downloading',
      currentFileSourceFileName: 'Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf',
    }));
    expect(onProgress).toHaveBeenCalledWith(expect.objectContaining({
      phase: 'downloading',
      currentFileSourceFileName: 'mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf',
    }));
    expect(onProgress).toHaveBeenLastCalledWith(expect.objectContaining({
      phase: 'installing',
      completedFiles: 2,
      totalFiles: 2,
      overallProgress: 1,
    }));
  });

  test('does not report ready when only one fixed-path file exists', async () => {
    fileSystemMock.__mock.existingFiles.add(resolveMealInputAssistModelPath()!);

    await expect(getMealInputAssistModelStatus()).resolves.toMatchObject({
      kind: 'error',
      files: {
        modelExists: true,
        projectorExists: false,
      },
    });
  });

  test('returns to not_installed after deleting the model files', async () => {
    fileSystemMock.__mock.existingFiles.add(resolveMealInputAssistModelPath()!);
    fileSystemMock.__mock.existingFiles.add(resolveMealInputAssistProjectorPath()!);

    await deleteMealInputAssistModel();

    await expect(getMealInputAssistModelStatus()).resolves.toMatchObject({
      kind: 'not_installed',
      files: {
        modelExists: false,
        projectorExists: false,
      },
    });
  });

  test('deletes every downloaded local AI model file under ai-models', async () => {
    const directoryPath = resolveMealInputAssistModelDirectoryPath()!;
    fileSystemMock.__mock.existingFiles.add(resolveMealInputAssistModelPath()!);
    fileSystemMock.__mock.existingFiles.add(resolveMealInputAssistProjectorPath()!);
    fileSystemMock.__mock.existingFiles.add(`${directoryPath}/legacy-debug-model.gguf`);

    await deleteAllDownloadedLocalAiModels();

    expect(fileSystemMock.__mock.existingFiles.size).toBe(0);
    await expect(getMealInputAssistModelStatus()).resolves.toMatchObject({
      kind: 'not_installed',
      files: {
        modelExists: false,
        projectorExists: false,
      },
    });
  });

  test('keeps existing ready files when redownload fails before replacement', async () => {
    fileSystemMock.__mock.existingFiles.add(resolveMealInputAssistModelPath()!);
    fileSystemMock.__mock.existingFiles.add(resolveMealInputAssistProjectorPath()!);
    fileSystemMock.createDownloadResumable.mockImplementationOnce(() => ({
      downloadAsync: jest.fn(async () => {
        throw new Error('network failed');
      }),
    }));

    await expect(redownloadMealInputAssistModel()).rejects.toThrow('Qwen2.5-VL-3B-Instruct model のダウンロードに失敗しました');

    expect(fileSystemMock.__mock.existingFiles.has(resolveMealInputAssistModelPath()!)).toBe(true);
    expect(fileSystemMock.__mock.existingFiles.has(resolveMealInputAssistProjectorPath()!)).toBe(true);
    await expect(getMealInputAssistModelStatus()).resolves.toMatchObject({
      kind: 'ready',
    });
  });
});

describe('MediaPipe model installer', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    fileSystemMock.__mock.reset();
    fileSystemMock.moveAsync.mockImplementation(defaultMoveAsync);
    NativeModules.MediaPipeMealInputAssist = {
      verifyFileSha256: jest.fn().mockResolvedValue(true),
    };
    await AppSettingsService.setMediaPipeModelStatus('not_installed');
    await AppSettingsService.setMediaPipeModelVersion(null);
    await AppSettingsService.setMediaPipeModelDownloadedAt(null);
    await AppSettingsService.setMediaPipeModelErrorMessage(null);
  });

  test('reports not_installed when MediaPipe model file does not exist', async () => {
    await expect(getMediaPipeModelStatus()).resolves.toMatchObject({
      kind: 'not_installed',
      modelExists: false,
    });
  });

  test('installs model file into fixed path after hash verification and becomes ready', async () => {
    await installMediaPipeModel();

    expect(fileSystemMock.createDownloadResumable).toHaveBeenCalledTimes(1);
    expect(NativeModules.MediaPipeMealInputAssist.verifyFileSha256).toHaveBeenCalledWith(
      expect.stringContaining('meal-input-assist.task.download-'),
      MEDIAPIPE_MODEL_CONFIG.sha256
    );
    expect(fileSystemMock.__mock.existingFiles.has(resolveMediaPipeModelPath()!)).toBe(true);
    await expect(getMediaPipeModelStatus()).resolves.toMatchObject({
      kind: 'ready',
      modelExists: true,
      version: MEDIAPIPE_MODEL_CONFIG.version,
    });
  });

  test('reports progress updates through preparing, downloading, verifying, and installing', async () => {
    const onProgress = jest.fn();

    await installMediaPipeModel({ onProgress });

    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'preparing',
      })
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'downloading',
        bytesWritten: 1024,
      })
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'verifying',
      })
    );
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        phase: 'installing',
        progress: 1,
      })
    );
  });

  test('fails and cleans up temporary file when hash verification fails', async () => {
    NativeModules.MediaPipeMealInputAssist.verifyFileSha256 = jest.fn().mockResolvedValue(false);

    await expect(installMediaPipeModel()).rejects.toThrow(
      'MediaPipe Meal Classifier model のダウンロードに失敗しました: MediaPipe Meal Classifier のハッシュ検証に失敗しました (SHA256 不一致)。'
    );

    expect(fileSystemMock.__mock.existingFiles.has(resolveMediaPipeModelPath()!)).toBe(false);
    expect(fileSystemMock.__mock.downloads.size).toBe(0);
    await expect(getMediaPipeModelStatus()).resolves.toMatchObject({
      kind: 'error',
      modelExists: false,
      errorMessage: expect.stringContaining('SHA256 不一致'),
    });
  });

  test('cleans up temporary file when download fails', async () => {
    fileSystemMock.createDownloadResumable.mockImplementationOnce(() => ({
      downloadAsync: jest.fn(async () => {
        throw new Error('network failed');
      }),
    }));

    await expect(installMediaPipeModel()).rejects.toThrow('network failed');

    expect(fileSystemMock.__mock.existingFiles.has(resolveMediaPipeModelPath()!)).toBe(false);
    expect(fileSystemMock.__mock.downloads.size).toBe(0);
    await expect(getMediaPipeModelStatus()).resolves.toMatchObject({
      kind: 'error',
      modelExists: false,
    });
  });

  test('returns to not_installed after deleting the MediaPipe model file', async () => {
    fileSystemMock.__mock.existingFiles.add(resolveMediaPipeModelPath()!);
    await AppSettingsService.setMediaPipeModelStatus('ready');

    await deleteMediaPipeModel();

    expect(fileSystemMock.__mock.existingFiles.has(resolveMediaPipeModelPath()!)).toBe(false);
    await expect(getMediaPipeModelStatus()).resolves.toMatchObject({
      kind: 'not_installed',
      modelExists: false,
    });
  });

  test('deleteAllDownloadedLocalAiModels cleans up MediaPipe model and resets state', async () => {
    fileSystemMock.__mock.existingFiles.add(resolveMediaPipeModelPath()!);
    await AppSettingsService.setMediaPipeModelStatus('ready');

    await deleteAllDownloadedLocalAiModels();

    expect(fileSystemMock.__mock.existingFiles.has(resolveMediaPipeModelPath()!)).toBe(false);
    await expect(getMediaPipeModelStatus()).resolves.toMatchObject({
      kind: 'not_installed',
      modelExists: false,
    });
  });

  test('reports not_installed when persisted status is ready but physical file is missing', async () => {
    await AppSettingsService.setMediaPipeModelStatus('ready');
    await AppSettingsService.setMediaPipeModelVersion('v1');

    await expect(getMediaPipeModelStatus()).resolves.toMatchObject({
      kind: 'not_installed',
      modelExists: false,
    });
  });

  test('keeps existing ready file when redownload fails before replacement', async () => {
    fileSystemMock.__mock.existingFiles.add(resolveMediaPipeModelPath()!);
    await AppSettingsService.setMediaPipeModelStatus('ready');
    await AppSettingsService.setMediaPipeModelVersion('v1');

    fileSystemMock.createDownloadResumable.mockImplementationOnce(() => ({
      downloadAsync: jest.fn(async () => {
        throw new Error('network disconnected');
      }),
    }));

    await expect(redownloadMediaPipeModel()).rejects.toThrow('network disconnected');

    expect(fileSystemMock.__mock.existingFiles.has(resolveMediaPipeModelPath()!)).toBe(true);
    await expect(getMediaPipeModelStatus()).resolves.toMatchObject({
      kind: 'ready',
      modelExists: true,
    });
  });

  test('supports options overrides for url, expectedSha256, and version', async () => {
    await installMediaPipeModel({
      url: 'https://example.com/custom-model.task',
      expectedSha256: 'custom-sha256-hash',
      version: 'custom-version-2.0',
    });

    expect(fileSystemMock.createDownloadResumable).toHaveBeenCalledWith(
      'https://example.com/custom-model.task',
      expect.any(String),
      expect.any(Object),
      expect.any(Function)
    );
    expect(NativeModules.MediaPipeMealInputAssist.verifyFileSha256).toHaveBeenCalledWith(
      expect.any(String),
      'custom-sha256-hash'
    );
    await expect(getMediaPipeModelStatus()).resolves.toMatchObject({
      kind: 'ready',
      version: 'custom-version-2.0',
      modelExists: true,
    });
  });

  test('restores existing model file when new file placement fails during redownload', async () => {
    const targetPath = resolveMediaPipeModelPath()!;
    fileSystemMock.__mock.existingFiles.add(targetPath);
    await AppSettingsService.setMediaPipeModelStatus('ready');
    await AppSettingsService.setMediaPipeModelVersion('v1');

    fileSystemMock.moveAsync.mockImplementation(async ({ from, to }: { from: string; to: string }) => {
      if (to === targetPath && !from.includes('.backup-')) {
        throw new Error('disk full during model placement');
      }
      return defaultMoveAsync({ from, to });
    });

    try {
      await expect(redownloadMediaPipeModel()).rejects.toThrow('disk full during model placement');

      expect(fileSystemMock.__mock.existingFiles.has(targetPath)).toBe(true);
      expect(Array.from(fileSystemMock.__mock.existingFiles).some(path => path.includes('.backup-'))).toBe(false);
      expect(fileSystemMock.__mock.downloads.size).toBe(0);

      await expect(getMediaPipeModelStatus()).resolves.toMatchObject({
        kind: 'ready',
        modelExists: true,
      });
    } finally {
      fileSystemMock.moveAsync.mockImplementation(defaultMoveAsync);
    }
  });

  test('cleans up temporary backup file after successful replacement during redownload', async () => {
    const targetPath = resolveMediaPipeModelPath()!;
    fileSystemMock.__mock.existingFiles.add(targetPath);
    await AppSettingsService.setMediaPipeModelStatus('ready');
    await AppSettingsService.setMediaPipeModelVersion('v1');

    await redownloadMediaPipeModel({
      version: 'v2',
    });

    expect(fileSystemMock.__mock.existingFiles.has(targetPath)).toBe(true);
    expect(Array.from(fileSystemMock.__mock.existingFiles).some(path => path.includes('.backup-'))).toBe(false);
    await expect(getMediaPipeModelStatus()).resolves.toMatchObject({
      kind: 'ready',
      version: 'v2',
      modelExists: true,
    });
  });
});
