import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const focusCallbacks: Array<() => void> = [];

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    focusCallbacks.push(callback);
  },
}));

import StatsScreen from '../src/screens/StatsScreen/StatsScreen';
import { MealService } from '../src/database/services/MealService';

let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

jest.mock('../src/database/services/MealService', () => ({
  MealService: {
    getStatistics: jest.fn(),
    clearAllMeals: jest.fn(),
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
      .mockRejectedValueOnce(new Error('stats failed: /Users/developer/data/stats.db'))
      .mockResolvedValueOnce({
        totalMeals: 0,
        homemadeMeals: 0,
        takeoutMeals: 0,
      });

    const { findByTestId } = render(<StatsScreen />);
    await triggerLatestFocus();

    expect(await findByTestId('stats-error')).toBeTruthy();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      'Failed to load stats:',
      expect.objectContaining({
        message: 'stats failed: [MASKED_PATH]/stats.db',
      })
    );

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
    expect(MealService.getStatistics).toHaveBeenCalledWith(
      expect.objectContaining({
        dateFrom: expect.any(Date),
        dateTo: expect.any(Date),
      })
    );

    const allPeriodButton = getByTestId('stats-period-all');
    expect(allPeriodButton.props.accessibilityRole).toBe('button');
    expect(allPeriodButton.props.accessibilityState).toEqual({ selected: false });

    fireEvent.press(allPeriodButton);

    await waitFor(() => {
      expect(allPeriodButton.props.accessibilityState).toEqual({ selected: true });
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

  test('fetches statistics exactly once when changing periods', async () => {
    (MealService.getStatistics as jest.Mock).mockResolvedValue({
      totalMeals: 0,
      homemadeMeals: 0,
      takeoutMeals: 0,
      topCuisines: [],
      topLocations: [],
    });

    const { getByTestId } = render(<StatsScreen />);
    await triggerLatestFocus();

    expect(MealService.getStatistics).toHaveBeenCalledTimes(1);

    (MealService.getStatistics as jest.Mock).mockClear();

    fireEvent.press(getByTestId('stats-period-last7days'));

    await waitFor(() => {
      expect(MealService.getStatistics).toHaveBeenCalledTimes(1);
    });
  });
});
