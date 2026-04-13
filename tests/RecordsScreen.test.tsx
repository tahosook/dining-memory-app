import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

const focusCallbacks: Array<() => void> = [];

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    focusCallbacks.push(callback);
  },
}));

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../src/database/services/MealService', () => ({
  MealService: {
    getRecentMeals: jest.fn(),
    updateMeal: jest.fn(),
    softDeleteMeal: jest.fn(),
  },
}));

import { RecordsScreen } from '../src/screens/RecordsScreen/RecordsScreen';
import { MealService } from '../src/database/services/MealService';

async function triggerLatestFocus() {
  await act(async () => {
    focusCallbacks[focusCallbacks.length - 1]?.();
    await Promise.resolve();
  });
}

describe('RecordsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    focusCallbacks.length = 0;
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('renders empty state when there are no records', async () => {
    (MealService.getRecentMeals as jest.Mock).mockResolvedValue([]);

    const { findByText } = render(<RecordsScreen />);
    await triggerLatestFocus();

    expect(await findByText('まだ食事記録がありません')).toBeTruthy();
  });

  test('renders records grouped by date', async () => {
    (MealService.getRecentMeals as jest.Mock).mockResolvedValue([
      {
        id: '1',
        uuid: '1',
        meal_name: 'ラーメン',
        meal_datetime: new Date('2026-04-12T12:00:00+09:00').getTime(),
        is_homemade: false,
        photo_path: 'file:///ramen.jpg',
      },
    ]);

    const { findByText } = render(<RecordsScreen />);
    await triggerLatestFocus();

    expect(await findByText('ラーメン')).toBeTruthy();
  });

  test('falls back to photo_path when thumbnail is missing', async () => {
    (MealService.getRecentMeals as jest.Mock).mockResolvedValue([
      {
        id: '1',
        uuid: '1',
        meal_name: 'カレー',
        meal_datetime: new Date('2026-04-12T12:00:00+09:00').getTime(),
        is_homemade: true,
        photo_path: 'file:///curry.jpg',
      },
    ]);

    const { findByTestId } = render(<RecordsScreen />);
    await triggerLatestFocus();

    expect(await findByTestId('meal-image-1')).toBeTruthy();
  });

  test('reloads meals when focus is regained', async () => {
    (MealService.getRecentMeals as jest.Mock).mockResolvedValue([]);

    render(<RecordsScreen />);
    await triggerLatestFocus();

    expect(MealService.getRecentMeals).toHaveBeenCalledTimes(1);

    await triggerLatestFocus();

    expect(MealService.getRecentMeals).toHaveBeenCalledTimes(2);
  });

  test('updates cuisine type from the edit modal', async () => {
    (MealService.getRecentMeals as jest.Mock).mockResolvedValue([
      {
        id: '1',
        uuid: '1',
        meal_name: 'ラーメン',
        meal_datetime: new Date('2026-04-12T12:00:00+09:00').getTime(),
        is_homemade: false,
        photo_path: 'file:///ramen.jpg',
      },
    ]);
    (MealService.updateMeal as jest.Mock).mockResolvedValue({
      id: '1',
      uuid: '1',
      meal_name: 'ラーメン',
      cuisine_type: '和食',
    });

    const { findByTestId, getByText } = render(<RecordsScreen />);
    await triggerLatestFocus();

    fireEvent.press(await findByTestId('meal-card-1'));

    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    const editButton = buttons.find((button: { text: string; onPress?: () => void }) => button.text === '編集');
    act(() => {
      editButton.onPress?.();
    });

    fireEvent.press(await findByTestId('edit-cuisine-和食'));
    fireEvent.press(getByText('保存'));

    await waitFor(() => {
      expect(MealService.updateMeal).toHaveBeenCalledWith(
        '1',
        expect.objectContaining({
          cuisine_type: '和食',
        })
      );
    });
  });
});
