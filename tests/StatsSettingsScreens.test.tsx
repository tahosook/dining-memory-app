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
        topCuisines: [{ label: '和食', count: 3 }],
        topLocations: [{ label: '自宅', count: 3 }],
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

  test('shows period selector, reflection text, balance bar, and top rankings', async () => {
    (MealService.getStatistics as jest.Mock).mockResolvedValue({
      totalMeals: 18,
      homemadeMeals: 12,
      takeoutMeals: 6,
      favoriteCuisine: '和食',
      favoriteLocation: '自宅',
      topCuisines: [
        { label: '和食', count: 8 },
        { label: '洋食', count: 5 },
        { label: '中華', count: 3 },
      ],
      topLocations: [
        { label: '自宅', count: 10 },
        { label: '神田', count: 4 },
        { label: '銀座', count: 2 },
      ],
    });

    const { findByText, getByTestId } = render(<StatsScreen />);
    await triggerLatestFocus();

    expect(await findByText(/今月は18件の食事を記録しました。/)).toBeTruthy();
    expect(await findByText('自炊 12件 / 外食 6件（自炊 67%）')).toBeTruthy();
    expect(await findByText('よく食べたジャンル Top 3')).toBeTruthy();
    expect(await findByText('1. 和食')).toBeTruthy();
    expect(await findByText('8件')).toBeTruthy();
    expect(await findByText('よく行った場所 Top 3')).toBeTruthy();
    expect(await findByText('1. 自宅')).toBeTruthy();
    expect(MealService.getStatistics).toHaveBeenCalledWith(expect.objectContaining({
      dateFrom: expect.any(Date),
      dateTo: expect.any(Date),
    }));

    fireEvent.press(getByTestId('stats-period-all'));

    await waitFor(() => {
      expect(MealService.getStatistics).toHaveBeenCalledWith({});
    });
  });

  test('shows empty reflection and ranking copy when there are no meals in the period', async () => {
    (MealService.getStatistics as jest.Mock).mockResolvedValue({
      totalMeals: 0,
      homemadeMeals: 0,
      takeoutMeals: 0,
      topCuisines: [],
      topLocations: [],
    });

    const { findByText } = render(<StatsScreen />);
    await triggerLatestFocus();

    expect(await findByText('この期間の食事記録はまだありません。')).toBeTruthy();
    expect(await findByText('まだ集計できるジャンルがありません')).toBeTruthy();
    expect(await findByText('まだ集計できる場所がありません')).toBeTruthy();
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

  test('shows user-facing settings sections without technical details by default', async () => {
    const { getByText, getByTestId, queryAllByText, queryByText, queryByTestId } = render(<SettingsScreen />);
    await triggerLatestFocus();

    expect(getByText('プライバシー')).toBeTruthy();
    expect(getByText('AI入力補助')).toBeTruthy();
    expect(getByText('データ管理')).toBeTruthy();
    expect(getByText('アプリ情報')).toBeTruthy();
    expect(getByText('自動的な外部送信はしない設計です。Records 詳細などからユーザーが明示的に共有した場合のみ、外部アプリに渡ります。')).toBeTruthy();
    expect(getByText('AI入力補助は写真を外部送信しません。ただし、AI入力補助のモデルデータをダウンロードする時だけ外部通信が発生します。')).toBeTruthy();
    expect(getByText('状態: 未準備')).toBeTruthy();
    expect(getByText('モデルをダウンロードすると利用できます。')).toBeTruthy();
    expect(getByTestId('meal-input-assist-model-download-button')).toBeTruthy();
    expect(queryByTestId('ai-input-assist-toggle')).toBeNull();
    expect(queryByText('Local AI Runtime Status')).toBeNull();
    expect(queryByText('現在の機能範囲')).toBeNull();
    expect(queryByText('クラウドバックアップ')).toBeNull();
    expect(queryByText('Qwen2.5-VL-3B-Instruct (meal input assist)')).toBeNull();
    expect(queryAllByText('file:///documents/ai-models/meal-input-assist.gguf')).toHaveLength(0);

    fireEvent.press(getByText('すべての食事記録を削除'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'すべての食事記録を削除',
      '端末内の食事記録をすべて削除します。この操作は元に戻せません。',
      expect.arrayContaining([
        expect.objectContaining({ text: 'キャンセル', style: 'cancel' }),
        expect.objectContaining({ text: '削除する', style: 'destructive' }),
      ])
    );
  });

  test('shows model and runtime technical details only after opening details', async () => {
    const { getByText, getByTestId, queryAllByText, queryByText } = render(<SettingsScreen />);
    await triggerLatestFocus();

    expect(queryByText('Local AI Runtime Status')).toBeNull();
    expect(queryByText('Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf')).toBeNull();
    expect(queryAllByText('file:///documents/ai-models/meal-input-assist.gguf')).toHaveLength(0);

    fireEvent.press(getByTestId('toggle-ai-details-button'));

    expect(getByTestId('ai-details')).toBeTruthy();
    expect(getByText('Local AI Runtime Status')).toBeTruthy();
    expect(getByText('Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf')).toBeTruthy();
    expect(getByText('mmproj-Qwen2.5-VL-3B-Instruct-Q8_0.gguf')).toBeTruthy();
    expect(queryAllByText('file:///documents/ai-models/meal-input-assist.gguf').length).toBeGreaterThan(0);
    expect(getByText('meal input assist projector が見つかりません: file:///documents/ai-models/meal-input-assist.mmproj')).toBeTruthy();
  });

  test('enables the AI input assist switch only when model and runtime are ready', async () => {
    (AppSettingsService.getAiInputAssistEnabled as jest.Mock).mockResolvedValue(false);
    (getMealInputAssistModelStatus as jest.Mock).mockResolvedValue(createModelStatus('ready'));
    (getLocalAiRuntimeStatusSnapshot as jest.Mock).mockResolvedValue(createRuntimeStatus('ready'));

    const { getByTestId, findByText } = render(<SettingsScreen />);
    await triggerLatestFocus();

    expect(await findByText('状態: 利用可能')).toBeTruthy();
    expect(getByTestId('ai-input-assist-toggle').props.disabled).toBe(false);
    expect(getByTestId('meal-input-assist-model-redownload-button')).toBeTruthy();

    fireEvent(getByTestId('ai-input-assist-toggle'), 'valueChange', true);
    await waitFor(() => {
      expect(AppSettingsService.setAiInputAssistEnabled).toHaveBeenCalledWith(true);
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

    expect(await findByText('状態: ダウンロード中')).toBeTruthy();
    expect(await findByText('進捗の目安: 25%')).toBeTruthy();
    expect(await findByText('現在: Qwen2.5-VL-3B-Instruct-Q4_K_M.gguf')).toBeTruthy();

    await act(async () => {
      deferred.resolve();
      await Promise.resolve();
    });

    expect(await findByText('状態: 利用可能')).toBeTruthy();
    expect(await findByText('写真を外部送信せず、端末内で食事メモの下書きを作成できます。')).toBeTruthy();
    expect(getByTestId('ai-input-assist-toggle')).toBeTruthy();
  });

  test('shows a redownload action for model error and keeps details collapsed by default', async () => {
    (getMealInputAssistModelStatus as jest.Mock).mockResolvedValue(createModelStatus('error'));

    const { findByText, getByTestId, queryByText } = render(<SettingsScreen />);
    await triggerLatestFocus();

    expect(await findByText('状態: エラー')).toBeTruthy();
    expect(await findByText('AI入力補助の準備に問題があります。再ダウンロードを試してください。')).toBeTruthy();
    expect(getByTestId('meal-input-assist-model-redownload-button')).toBeTruthy();
    expect(queryByText('meal input assist model のダウンロードに失敗しました。')).toBeNull();

    fireEvent.press(getByTestId('toggle-ai-details-button'));

    expect(await findByText('meal input assist model のダウンロードに失敗しました。')).toBeTruthy();
  });

  test('shows redownload action on ready status and reloads after deleting downloaded model data', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((title, message, buttons) => {
      if (title === 'ダウンロード済みモデルを削除') {
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
    expect(await findByText('状態: 未準備')).toBeTruthy();

    alertSpy.mockRestore();
  });
});
