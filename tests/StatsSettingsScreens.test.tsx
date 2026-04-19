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

describe('StatsScreen', () => {
  beforeEach(() => {
    focusCallbacks.length = 0;
    jest.clearAllMocks();
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
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    (AppSettingsService.getAiInputAssistEnabled as jest.Mock).mockResolvedValue(false);
    (AppSettingsService.setAiInputAssistEnabled as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('shows AI toggle, disabled feature labels, and delete entry point', async () => {
    const { getByText, getByTestId } = render(<SettingsScreen />);
    await triggerLatestFocus();

    expect(getByText('端末内 AI 入力補助を有効にする')).toBeTruthy();
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
});
