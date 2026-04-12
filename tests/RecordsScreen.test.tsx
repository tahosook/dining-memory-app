import React from 'react';
import { act, render } from '@testing-library/react-native';

const focusCallbacks: Array<() => void> = [];

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: (callback: () => void) => {
    const ReactModule = jest.requireActual('react') as typeof import('react');
    focusCallbacks.push(callback);
    ReactModule.useEffect(() => {
      callback();
    }, [callback]);
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

describe('RecordsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    focusCallbacks.length = 0;
  });

  test('renders empty state when there are no records', async () => {
    (MealService.getRecentMeals as jest.Mock).mockResolvedValue([]);

    const { findByText } = render(<RecordsScreen />);

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

    expect(await findByTestId('meal-image-1')).toBeTruthy();
  });

  test('reloads meals when focus is regained', async () => {
    (MealService.getRecentMeals as jest.Mock).mockResolvedValue([]);

    render(<RecordsScreen />);

    expect(MealService.getRecentMeals).toHaveBeenCalledTimes(1);

    act(() => {
      focusCallbacks[0]?.();
    });

    expect(MealService.getRecentMeals).toHaveBeenCalledTimes(2);
  });
});
