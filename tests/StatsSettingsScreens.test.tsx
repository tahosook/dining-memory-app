import React from 'react';
import { Alert } from 'react-native';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
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
