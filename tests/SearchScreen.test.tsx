import React from 'react';
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
  },
}));

import { SearchScreen } from '../src/screens/SearchScreen/SearchScreen';
import { MealService } from '../src/database/services/MealService';

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
  });

  test('shows empty state when there are no matches', async () => {
    (MealService.searchMeals as jest.Mock).mockResolvedValue([]);

    const { findByText } = render(<SearchScreen />);
    await triggerLatestFocus();

    expect(await findByText('条件に合う記録がありません')).toBeTruthy();
  });

  test('renders search results from the service', async () => {
    (MealService.searchMeals as jest.Mock).mockResolvedValue([
      {
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
      },
    ]);

    const { getByTestId, findByText } = render(<SearchScreen />);
    await triggerLatestFocus();
    fireEvent.changeText(getByTestId('search-input'), 'ラーメン');

    await waitFor(() => {
      expect(MealService.searchMeals).toHaveBeenCalled();
    });

    expect(await findByText('ラーメン')).toBeTruthy();
  });

  test('reruns the current search when focus is regained', async () => {
    (MealService.searchMeals as jest.Mock).mockResolvedValue([]);

    const { getByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    fireEvent.changeText(getByTestId('search-input'), '定食');

    await waitFor(() => {
      expect(MealService.searchMeals).toHaveBeenCalled();
    });

    const callsAfterTyping = (MealService.searchMeals as jest.Mock).mock.calls.length;
    await triggerLatestFocus();

    await waitFor(() => {
      expect((MealService.searchMeals as jest.Mock).mock.calls.length).toBeGreaterThan(callsAfterTyping);
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
