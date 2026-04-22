import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const focusCallbacks: Array<() => void> = [];

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    focusCallbacks.push(callback);
  },
}));

import StatsScreen from '../src/screens/StatsScreen/StatsScreen';
import SettingsScreen from '../src/screens/SettingsScreen/SettingsScreen';
import { MealService } from '../src/database/services/MealService';
import { AppSettingsService } from '../src/database/services/AppSettingsService';
import { getLocalAiRuntimeStatusSnapshot } from '../src/ai/runtime';
import {
  deleteAllDownloadedLocalAiModels,
  deleteMealInputAssistModel,
  getMealInputAssistModelStatus,
  installMealInputAssistModel,
  redownloadMealInputAssistModel,
} from '../src/ai/mealInputAssist/modelInstaller';

let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

jest.mock('../src/database/services/MealService', () => ({
  MealService: {
    getStatistics: jest.fn(),
    clearAllMeals: jest.fn(),
  },
}));

jest.mock('../src/database/services/AppSettingsService', () => ({
  AppSettingsService: {
    getAiInputAssistEnabled: jest.fn(),
    setAiInputAssistEnabled: jest.fn(),
  },
}));

jest.mock('../src/ai/runtime', () => ({
  getLocalAiRuntimeStatusSnapshot: jest.fn(),
}));

jest.mock('../src/ai/mealInputAssist/modelInstaller', () => ({
  deleteAllDownloadedLocalAiModels: jest.fn(),
  getMealInputAssistModelStatus: jest.fn(),
  installMealInputAssistModel: jest.fn(),
  redownloadMealInputAssistModel: jest.fn(),
  deleteMealInputAssistModel: jest.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

async function triggerLatestFocus() {
  await act(async () => {
    focusCallbacks[focusCallbacks.length - 1]?.();
    await Promise.resolve();
  });
}

function createModelStatus(kind: 'not_installed' | 'ready' | 'error') {
  return {
    kind,
    version: kind === 'not_installed' ? null : 'qwen2.5-vl-3b-instruct-q4km-2026-04-20',
    downloadedAt: kind === 'ready' ? 1713590400000 : null,
    errorMessage: kind === 'error' ? 'meal input assist model のダウンロードに失敗しました。' : null,
    expectedPaths: [
      'file:///documents/ai-models/meal-input-assist.gguf',
      'file:///documents/ai-models/meal-input-assist.mmproj',
    ],
    files: {
      modelExists: kind === 'ready',
      projectorExists: kind === 'ready',
    },
  };
}

function createRuntimeStatus(kind: 'ready' | 'unavailable') {
  return {
    mealInputAssist: kind === 'ready'
      ? {
        capability: 'meal-input-assist' as const,
        kind: 'ready' as const,
        mode: 'local-runtime-prototype' as const,
        reason: '端末内 AI 入力補助 runtime を利用できます。',
        expectedPaths: [
          'file:///documents/ai-models/meal-input-assist.gguf',
          'file:///documents/ai-models/meal-input-assist.mmproj',
        ],
      }
      : {
        capability: 'meal-input-assist' as const,
        kind: 'unavailable' as const,
        mode: 'local-runtime-prototype' as const,
        code: 'model_unavailable' as const,
        reason: 'meal input assist projector が見つかりません: file:///documents/ai-models/meal-input-assist.mmproj',
        expectedPaths: [
          'file:///documents/ai-models/meal-input-assist.gguf',
          'file:///documents/ai-models/meal-input-assist.mmproj',
        ],
      },
  };
}

function createDownloadProgress() {
  return {
    phase: 'downloading' as const,
    completedFiles: 0,
    totalFiles: 2,
    overallProgress: 0.25,
    currentFileKey: 'model' as const,
    currentFileLabel: 'Model',
    currentFileFileName: 'meal-input-assist.gguf',
    currentFileSourceFileName: 'Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf',
    currentFileBytesWritten: 256,
    currentFileBytesExpected: 1024,
    currentFileProgress: 0.25,
  };
}

describe('StatsScreen', () => {
  beforeEach(() => {
    focusCallbacks.length = 0;
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(jest.fn());
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('shows loading state on the initial render', async () => {
    const deferred = createDeferred<{
      totalMeals: number;
      homemadeMeals: number;
      takeoutMeals: number;
    }>();
    (MealService.getStatistics as jest.Mock).mockReturnValue(deferred.promise);

    const { getByTestId } = render(<StatsScreen />);
    await triggerLatestFocus();

    expect(getByTestId('stats-loading')).toBeTruthy();

    await act(async () => {
      deferred.resolve({
        totalMeals: 0,
        homemadeMeals: 0,
        takeoutMeals: 0,
      });
      await Promise.resolve();
    });
  });

  test('shows an error card with retry when the initial load fails', async () => {
    (MealService.getStatistics as jest.Mock)
      .mockRejectedValueOnce(new Error('stats failed'))
      .mockResolvedValueOnce({
        totalMeals: 0,
        homemadeMeals: 0,
        takeoutMeals: 0,
      });

    const { findByTestId } = render(<StatsScreen />);
    await triggerLatestFocus();

    expect(await findByTestId('stats-error')).toBeTruthy();

    fireEvent.press(await findByTestId('stats-error-action'));

    await waitFor(() => {
      expect(MealService.getStatistics).toHaveBeenCalledTimes(2);
    });
  });

  test('keeps previous summary visible when a refresh fails', async () => {
    (MealService.getStatistics as jest.Mock)
      .mockResolvedValueOnce({
        totalMeals: 5,
        homemadeMeals: 3,
        takeoutMeals: 2,
        favoriteCuisine: '和食',
        favoriteLocation: '自宅',
      })
      .mockRejectedValueOnce(new Error('refresh failed'));

    const { findByText, findByTestId } = render(<StatsScreen />);
    await triggerLatestFocus();

    expect(await findByText('5件')).toBeTruthy();

    await triggerLatestFocus();

    expect(await findByTestId('stats-error')).toBeTruthy();
    expect(await findByText('5件')).toBeTruthy();
  });

  test('reloads statistics when focus is regained', async () => {
    (MealService.getStatistics as jest.Mock).mockResolvedValue({
      totalMeals: 1,
      homemadeMeals: 1,
      takeoutMeals: 0,
    });

    render(<StatsScreen />);
    await triggerLatestFocus();

    expect(MealService.getStatistics).toHaveBeenCalledTimes(1);

    await triggerLatestFocus();

    await waitFor(() => {
      expect(MealService.getStatistics).toHaveBeenCalledTimes(2);
    });
  });
});

describe('SettingsScreen', () => {
  beforeEach(() => {
    focusCallbacks.length = 0;
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(jest.fn());
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    (AppSettingsService.getAiInputAssistEnabled as jest.Mock).mockResolvedValue(false);
    (AppSettingsService.setAiInputAssistEnabled as jest.Mock).mockResolvedValue(undefined);
    (getMealInputAssistModelStatus as jest.Mock).mockResolvedValue(createModelStatus('not_installed'));
    (getLocalAiRuntimeStatusSnapshot as jest.Mock).mockResolvedValue(createRuntimeStatus('unavailable'));
    (installMealInputAssistModel as jest.Mock).mockResolvedValue(undefined);
    (redownloadMealInputAssistModel as jest.Mock).mockResolvedValue(undefined);
    (deleteMealInputAssistModel as jest.Mock).mockResolvedValue(undefined);
    (deleteAllDownloadedLocalAiModels as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('shows AI toggle, meal input assist model status, runtime status, and no semantic search entry', async () => {
    const { getByText, getByTestId, queryAllByText, queryByText, queryByTestId } = render(<SettingsScreen />);
    await triggerLatestFocus();

    expect(getByText('端末内 AI 入力補助を有効にする')).toBeTruthy();
    expect(getByText('AI model ダウンロード')).toBeTruthy();
    expect(getByText('Local AI Runtime Status')).toBeTruthy();
    expect(getByText('未導入')).toBeTruthy();
    expect(getByText('Qwen2.5-VL-3B-Instruct (meal input assist)')).toBeTruthy();
    expect(getByText('Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf')).toBeTruthy();
    expect(getByText('mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf')).toBeTruthy();
    expect(getByTestId('meal-input-assist-model-download-button')).toBeTruthy();
    expect(getByText('meal input assist projector が見つかりません: file:///documents/ai-models/meal-input-assist.mmproj')).toBeTruthy();
    expect(queryAllByText('file:///documents/ai-models/meal-input-assist.gguf').length).toBeGreaterThan(0);
    expect(queryByText('セマンティック検索')).toBeNull();
    expect(queryByTestId('semantic-search-runtime-status')).toBeNull();

    fireEvent(getByTestId('ai-input-assist-toggle'), 'valueChange', true);
    await waitFor(() => {
      expect(AppSettingsService.setAiInputAssistEnabled).toHaveBeenCalledWith(true);
    });

    expect(getByText('クラウドバックアップ')).toBeTruthy();
    fireEvent.press(getByText('ローカルデータを削除'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
    });
  });

  test('shows downloading then ready when the model download succeeds', async () => {
    const deferred = createDeferred<void>();
    (installMealInputAssistModel as jest.Mock).mockImplementation(({ onProgress }: { onProgress?: (progress: ReturnType<typeof createDownloadProgress>) => void } = {}) => {
      onProgress?.(createDownloadProgress());
      return deferred.promise;
    });
    (getMealInputAssistModelStatus as jest.Mock)
      .mockResolvedValueOnce(createModelStatus('not_installed'))
      .mockResolvedValueOnce(createModelStatus('ready'));
    (getLocalAiRuntimeStatusSnapshot as jest.Mock)
      .mockResolvedValueOnce(createRuntimeStatus('unavailable'))
      .mockResolvedValueOnce(createRuntimeStatus('ready'));

    const { getByTestId, findByText } = render(<SettingsScreen />);
    await triggerLatestFocus();

    fireEvent.press(getByTestId('meal-input-assist-model-download-button'));

    expect(await findByText('ダウンロード中')).toBeTruthy();
    expect(await findByText('進捗の目安: 25%')).toBeTruthy();
    expect(await findByText('現在: Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf')).toBeTruthy();

    await act(async () => {
      deferred.resolve();
      await Promise.resolve();
    });

    expect(await findByText('利用可能')).toBeTruthy();
    expect(await findByText('端末内 AI 入力補助 runtime を利用できます。')).toBeTruthy();
  });

  test('shows error state for a failed model status lookup result', async () => {
    (getMealInputAssistModelStatus as jest.Mock).mockResolvedValue(createModelStatus('error'));

    const { findByText, getByTestId } = render(<SettingsScreen />);
    await triggerLatestFocus();

    expect(await findByText('エラー')).toBeTruthy();
    expect(await findByText('meal input assist model のダウンロードに失敗しました。')).toBeTruthy();
    expect(getByTestId('meal-input-assist-model-redownload-button')).toBeTruthy();
  });

  test('shows redownload action on ready status and reloads after delete', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      if (title === 'ダウンロード済み AI model を全て削除') {
        buttons?.[1]?.onPress?.();
      }
    });
    (getMealInputAssistModelStatus as jest.Mock)
      .mockResolvedValueOnce(createModelStatus('ready'))
      .mockResolvedValueOnce(createModelStatus('ready'))
      .mockResolvedValueOnce(createModelStatus('not_installed'));
    (getLocalAiRuntimeStatusSnapshot as jest.Mock)
      .mockResolvedValueOnce(createRuntimeStatus('ready'))
      .mockResolvedValueOnce(createRuntimeStatus('ready'))
      .mockResolvedValueOnce(createRuntimeStatus('unavailable'));

    const { getByTestId, findByText } = render(<SettingsScreen />);
    await triggerLatestFocus();

    fireEvent.press(getByTestId('meal-input-assist-model-redownload-button'));
    await waitFor(() => {
      expect(redownloadMealInputAssistModel).toHaveBeenCalledTimes(1);
    });

    fireEvent.press(getByTestId('delete-all-downloaded-ai-models-button'));

    await waitFor(() => {
      expect(deleteAllDownloadedLocalAiModels).toHaveBeenCalledTimes(1);
    });
    expect(await findByText('未導入')).toBeTruthy();

    alertSpy.mockRestore();
  });
});
