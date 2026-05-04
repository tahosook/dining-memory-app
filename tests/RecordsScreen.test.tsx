import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';

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

jest.mock('expo-status-bar', () => ({
  StatusBar: () => null,
}));

jest.mock('react-native-safe-area-context', () => ({
  SafeAreaView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('../src/database/services/MealService', () => ({
  MealService: {
    getRecentMeals: jest.fn(),
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
        is_deleted: false,
        created_at: 1,
        updated_at: 1,
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
        cooking_level: 'quick',
        photo_path: 'file:///curry.jpg',
        is_deleted: false,
        created_at: 1,
        updated_at: 1,
      },
    ]);

    const { findByTestId, findByText, queryByText } = render(<RecordsScreen />);
    await triggerLatestFocus();

    expect(await findByTestId('meal-image-1')).toBeTruthy();
    expect(await findByText('時短')).toBeTruthy();
    expect(queryByText('quick')).toBeNull();
  });

  test('reloads meals when focus is regained', async () => {
    (MealService.getRecentMeals as jest.Mock).mockResolvedValue([]);

    render(<RecordsScreen />);
    await triggerLatestFocus();

    expect(MealService.getRecentMeals).toHaveBeenCalledTimes(1);

    await triggerLatestFocus();

    expect(MealService.getRecentMeals).toHaveBeenCalledTimes(2);
  });

  test('navigates to detail screen instead of opening an alert when a meal is tapped', async () => {
    const meal = {
      id: '1',
      uuid: '1',
      meal_name: 'ラーメン',
      meal_datetime: new Date('2026-04-12T12:00:00+09:00').getTime(),
      is_homemade: false,
      photo_path: 'file:///ramen.jpg',
      is_deleted: false,
      created_at: 1,
      updated_at: 1,
    };
    (MealService.getRecentMeals as jest.Mock).mockResolvedValue([meal]);

    const { findByTestId } = render(<RecordsScreen />);
    await triggerLatestFocus();

    fireEvent.press(await findByTestId('meal-card-1'));

    expect(mockNavigate).toHaveBeenCalledWith('MealDetail', {
      meal,
      meals: [meal],
      initialIndex: 0,
    });
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
