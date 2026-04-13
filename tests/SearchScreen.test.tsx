import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const focusCallbacks: Array<() => void> = [];

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    focusCallbacks.push(callback);
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('../src/database/services/MealService', () => ({
  MealService: {
    searchMeals: jest.fn(),
    updateMeal: jest.fn(),
    softDeleteMeal: jest.fn(),
  },
}));

import { SearchScreen } from '../src/screens/SearchScreen/SearchScreen';
import { MealService } from '../src/database/services/MealService';

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
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  test('opens a result and saves edits through the shared modal', async () => {
    (MealService.searchMeals as jest.Mock)
      .mockResolvedValueOnce([createMeal()])
      .mockResolvedValueOnce([createMeal({ cuisine_type: '和食' })]);
    (MealService.updateMeal as jest.Mock).mockResolvedValue(createMeal({ cuisine_type: '和食' }));

    const { findByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    fireEvent.press(await findByTestId('search-result-1'));

    const actionButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const editButton = actionButtons.find((button: { text: string; onPress?: () => void }) => button.text === '編集');
    act(() => {
      editButton.onPress?.();
    });

    fireEvent.press(await findByTestId('search-edit-cuisine-和食'));
    fireEvent.press(await findByTestId('search-edit-save-button'));

    await waitFor(() => {
      expect(MealService.updateMeal).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          cuisine_type: '和食',
        })
      );
    });

    await waitFor(() => {
      expect(MealService.searchMeals).toHaveBeenCalledTimes(2);
    });
  });

  test('deletes a result after confirmation and reruns the search', async () => {
    (MealService.searchMeals as jest.Mock)
      .mockResolvedValueOnce([createMeal()])
      .mockResolvedValueOnce([]);
    (MealService.softDeleteMeal as jest.Mock).mockResolvedValue(undefined);

    const { findByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    fireEvent.press(await findByTestId('search-result-1'));

    const actionButtons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const deleteButton = actionButtons.find((button: { text: string; onPress?: () => void }) => button.text === '削除');
    act(() => {
      deleteButton.onPress?.();
    });

    const confirmButtons = (Alert.alert as jest.Mock).mock.calls[1][2];
    const confirmDeleteButton = confirmButtons.find((button: { text: string; onPress?: () => void }) => button.text === '削除');
    await act(async () => {
      await confirmDeleteButton.onPress?.();
    });

    await waitFor(() => {
      expect(MealService.softDeleteMeal).toHaveBeenCalledWith('1');
    });

    await waitFor(() => {
      expect(MealService.searchMeals).toHaveBeenCalledTimes(2);
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
