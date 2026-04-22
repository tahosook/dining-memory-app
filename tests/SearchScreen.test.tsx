import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const focusCallbacks: Array<() => void> = [];
const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    focusCallbacks.push(callback);
  },
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('../src/database/services/MealService', () => ({
  MealService: {
    searchMeals: jest.fn(),
  },
}));

import { SearchScreen } from '../src/screens/SearchScreen/SearchScreen';
import { MealService } from '../src/database/services/MealService';

let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createMeal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '1',
    meal_name: 'ラーメン',
    meal_datetime: new Date('2026-04-12T12:00:00+09:00').getTime(),
    is_homemade: false,
    location_name: '神田',
    photo_path: 'file:///ramen.jpg',
    uuid: '1',
    is_deleted: false,
    created_at: 1,
    updated_at: 1,
    ...overrides,
  };
}

async function triggerLatestFocus() {
  await act(async () => {
    focusCallbacks[focusCallbacks.length - 1]?.();
    await Promise.resolve();
  });
}

describe('SearchScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    focusCallbacks.length = 0;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(jest.fn());
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  test('shows loading state during the first search', async () => {
    const deferred = createDeferred<unknown[]>();
    (MealService.searchMeals as jest.Mock).mockReturnValue(deferred.promise);

    const { getByTestId, findByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    expect(getByTestId('search-loading')).toBeTruthy();

    await act(async () => {
      deferred.resolve([]);
      await Promise.resolve();
    });
    expect(await findByTestId('search-empty')).toBeTruthy();
  });

  test('shows zero-result state when there are no matches', async () => {
    (MealService.searchMeals as jest.Mock).mockResolvedValue([]);

    const { findByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    expect(await findByTestId('search-empty')).toBeTruthy();
  });

  test('shows an error card and retry action when the initial search fails', async () => {
    (MealService.searchMeals as jest.Mock)
      .mockRejectedValueOnce(new Error('search failed'))
      .mockResolvedValueOnce([]);

    const { findByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    expect(await findByTestId('search-error')).toBeTruthy();

    fireEvent.press(await findByTestId('search-error-action'));

    await waitFor(() => {
      expect(MealService.searchMeals).toHaveBeenCalledTimes(2);
    });
  });

  test('keeps stale results visible when a refresh fails', async () => {
    (MealService.searchMeals as jest.Mock)
      .mockResolvedValueOnce([createMeal()])
      .mockRejectedValueOnce(new Error('refresh failed'));

    const { findByText, findByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    expect(await findByText('ラーメン')).toBeTruthy();

    await triggerLatestFocus();

    expect(await findByTestId('search-error')).toBeTruthy();
    expect(await findByText('ラーメン')).toBeTruthy();
  });

  test('opens a result in the shared detail screen', async () => {
    const meal = createMeal();
    (MealService.searchMeals as jest.Mock).mockResolvedValue([meal]);

    const { findByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    fireEvent.press(await findByTestId('search-result-1'));

    expect(mockNavigate).toHaveBeenCalledWith('Records', {
      screen: 'MealDetail',
      params: {
        meal,
      },
    });
  });

  test('passes cuisine type filter to the search service', async () => {
    (MealService.searchMeals as jest.Mock).mockResolvedValue([]);

    const { findByTestId, getByText } = render(<SearchScreen />);
    await triggerLatestFocus();

    fireEvent.press(await findByTestId('search-cuisine-和食'));
    fireEvent.press(getByText('検索する'));

    await waitFor(() => {
      expect(MealService.searchMeals).toHaveBeenLastCalledWith(
        expect.objectContaining({
          cuisine_type: '和食',
        })
      );
    });
  });
});
