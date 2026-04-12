import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

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

import StatsScreen from '../src/screens/StatsScreen/StatsScreen';
import SettingsScreen from '../src/screens/SettingsScreen/SettingsScreen';
import { MealService } from '../src/database/services/MealService';

jest.mock('../src/database/services/MealService', () => ({
  MealService: {
    getStatistics: jest.fn(),
    clearAllMeals: jest.fn(),
  },
}));

describe('StatsScreen', () => {
  beforeEach(() => {
    focusCallbacks.length = 0;
    jest.clearAllMocks();
  });

  test('renders statistics summary from service data', async () => {
    (MealService.getStatistics as jest.Mock).mockResolvedValue({
      totalMeals: 5,
      homemadeMeals: 3,
      takeoutMeals: 2,
      favoriteCuisine: '和食',
      favoriteLocation: '自宅',
    });

    const { findByText } = render(<StatsScreen />);

    expect(await findByText('5件')).toBeTruthy();
    expect(await findByText('料理ジャンル: 和食')).toBeTruthy();
  });

  test('reloads statistics when focus is regained', async () => {
    (MealService.getStatistics as jest.Mock).mockResolvedValue({
      totalMeals: 1,
      homemadeMeals: 1,
      takeoutMeals: 0,
    });

    render(<StatsScreen />);

    expect(MealService.getStatistics).toHaveBeenCalledTimes(1);

    focusCallbacks[0]?.();

    await waitFor(() => {
      expect(MealService.getStatistics).toHaveBeenCalledTimes(2);
    });
  });
});

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('shows disabled feature labels and delete entry point', async () => {
    const { getByText } = render(<SettingsScreen />);

    expect(getByText('クラウドバックアップ')).toBeTruthy();
    fireEvent.press(getByText('ローカルデータを削除'));

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalled();
    });
  });
});
