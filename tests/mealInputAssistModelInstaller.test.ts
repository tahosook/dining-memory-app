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

import { AppSettingsService } from '../src/database/services/AppSettingsService';
import {
  resolveMealInputAssistModelDirectoryPath,
  resolveMealInputAssistModelPath,
  resolveMealInputAssistProjectorPath,
} from '../src/ai/mealInputAssist';
import {
  deleteAllDownloadedLocalAiModels,
  deleteMealInputAssistModel,
  getMealInputAssistModelStatus,
  installMealInputAssistModel,
  redownloadMealInputAssistModel,
} from '../src/ai/mealInputAssist/modelInstaller';

const fileSystemMock = jest.requireMock('expo-file-system/legacy') as {
  __mock: {
    existingFiles: Set<string>;
    downloads: Map<string, string>;
    reset: () => void;
  };
  createDownloadResumable: jest.Mock;
};

describe('meal input assist model installer', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    fileSystemMock.__mock.reset();
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
