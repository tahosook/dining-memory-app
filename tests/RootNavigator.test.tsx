import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

jest.mock('../src/screens/CameraScreen/CameraScreen', () => {
  const { Text, View } = require('react-native');
  return () => (
    <View testID="mock-camera-screen">
      <Text>Mock Camera Screen</Text>
    </View>
  );
});

jest.mock('../src/screens/RecordsScreen/RecordsScreen', () => {
  const { Button, Text, View } = require('react-native');
  return {
    RecordsScreen: ({ navigation }: any) => (
      <View testID="mock-records-screen">
        <Text>Mock Records Screen</Text>
        <Button
          testID="goto-detail-btn"
          title="Go to Detail"
          onPress={() =>
            navigation.navigate('MealDetail', {
              meal: { id: 'test-meal-1', meal_name: 'ラーメン' },
            })
          }
        />
      </View>
    ),
  };
});

jest.mock('../src/screens/SearchScreen/SearchScreen', () => {
  const { Text, View } = require('react-native');
  return {
    SearchScreen: () => (
      <View testID="mock-search-screen">
        <Text>Mock Search Screen</Text>
      </View>
    ),
  };
});

jest.mock('../src/screens/StatsScreen/StatsScreen', () => {
  const { Text, View } = require('react-native');
  return () => (
    <View testID="mock-stats-screen">
      <Text>Mock Stats Screen</Text>
    </View>
  );
});

jest.mock('../src/screens/SettingsScreen/SettingsScreen', () => {
  const { Text, View } = require('react-native');
  return () => (
    <View testID="mock-settings-screen">
      <Text>Mock Settings Screen</Text>
    </View>
  );
});

jest.mock('../src/screens/RecordsScreen/MealDetailScreen', () => {
  const { Text, View } = require('react-native');
  return {
    MealDetailScreen: () => (
      <View testID="mock-meal-detail-screen">
        <Text>Mock Meal Detail Screen</Text>
      </View>
    ),
  };
});

jest.mock('../src/database/services/DatabaseProvider', () => ({
  DatabaseProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import RootNavigator from '../src/navigation/RootNavigator';
import App from '../App';

describe('RootNavigator Integration', () => {
  test('renders initial tab as CameraScreen', async () => {
    const { getByTestId } = render(<RootNavigator />);

    expect(getByTestId('mock-camera-screen')).toBeTruthy();
  });

  test('switches tabs between Camera, Records, Search, Stats, and Settings', async () => {
    const { getByTestId, getByText } = render(<RootNavigator />);

    // Initially on Camera
    expect(getByTestId('mock-camera-screen')).toBeTruthy();

    // Navigate to Records
    fireEvent.press(getByText('記録'));
    expect(getByTestId('mock-records-screen')).toBeTruthy();

    // Navigate to Search
    fireEvent.press(getByText('検索'));
    expect(getByTestId('mock-search-screen')).toBeTruthy();

    // Navigate to Stats
    fireEvent.press(getByText('統計'));
    expect(getByTestId('mock-stats-screen')).toBeTruthy();

    // Navigate to Settings
    fireEvent.press(getByText('設定'));
    expect(getByTestId('mock-settings-screen')).toBeTruthy();

    // Navigate back to Camera
    fireEvent.press(getByText('撮影'));
    expect(getByTestId('mock-camera-screen')).toBeTruthy();
  });

  test('controls header visibility declaratively per screen (Camera: false, Records: false, Search: true, Stats: true, Settings: true)', async () => {
    const { getByText, getByRole, queryByRole } = render(<RootNavigator />);

    // 1. Camera: headerShown === false (no header with role="heading" and name="撮影")
    expect(queryByRole('heading', { name: '撮影' })).toBeNull();

    // 2. Records: headerShown === false (no header with role="heading" and name="記録")
    fireEvent.press(getByText('記録'));
    expect(queryByRole('heading', { name: '記録' })).toBeNull();

    // 3. Search: headerShown === true (header with role="heading" and name="検索" exists)
    fireEvent.press(getByText('検索'));
    expect(getByRole('heading', { name: '検索' })).toBeTruthy();

    // 4. Stats: headerShown === true (header with role="heading" and name="統計" exists)
    fireEvent.press(getByText('統計'));
    expect(getByRole('heading', { name: '統計' })).toBeTruthy();

    // 5. Settings: headerShown === true (header with role="heading" and name="設定" exists)
    fireEvent.press(getByText('設定'));
    expect(getByRole('heading', { name: '設定' })).toBeTruthy();
  });

  test('navigates from tab to stack screen MealDetail', async () => {
    const { getByTestId, getByText } = render(<RootNavigator />);

    // Switch to Records tab
    fireEvent.press(getByText('記録'));
    expect(getByTestId('mock-records-screen')).toBeTruthy();

    // Trigger navigation to MealDetail
    fireEvent.press(getByTestId('goto-detail-btn'));
    expect(getByTestId('mock-meal-detail-screen')).toBeTruthy();
  });

  test('renders RootNavigator within App component without crashing', async () => {
    const { getByTestId } = render(<App />);
    expect(getByTestId('mock-camera-screen')).toBeTruthy();
  });
});
