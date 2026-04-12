import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

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

describe('SearchScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('shows empty state when there are no matches', async () => {
    (MealService.searchMeals as jest.Mock).mockResolvedValue([]);

    const { findByText } = render(<SearchScreen />);

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
    fireEvent.changeText(getByTestId('search-input'), 'ラーメン');

    await waitFor(() => {
      expect(MealService.searchMeals).toHaveBeenCalled();
    });

    expect(await findByText('ラーメン')).toBeTruthy();
  });
});
