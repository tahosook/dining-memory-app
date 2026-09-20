import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { NavigationContainerRef } from '@react-navigation/native';

let mockCapturedNav: NavigationContainerRef<any> | undefined;

jest.mock('../src/screens/CameraScreen/CameraScreen', () => {
  const ReactModule = require('react');
  const { Text, View } = require('react-native');
  const { NavigationContainerRefContext } = require('@react-navigation/native');
  return () => {
    const nav = ReactModule.useContext(NavigationContainerRefContext);
    if (nav) mockCapturedNav = nav;
    return (
      <View testID="mock-camera-screen">
        <Text>Mock Camera Screen</Text>
      </View>
    );
  };
});

jest.mock('../src/screens/RecordsScreen/RecordsScreen', () => {
  const ReactModule = require('react');
  const { Button, Text, View } = require('react-native');
  const { NavigationContainerRefContext } = require('@react-navigation/native');
  return {
    RecordsScreen: ({ navigation }: any) => {
      const nav = ReactModule.useContext(NavigationContainerRefContext);
      if (nav) mockCapturedNav = nav;
      return (
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
      );
    },
  };
});

jest.mock('../src/screens/SearchScreen/SearchScreen', () => {
  const ReactModule = require('react');
  const { Text, View } = require('react-native');
  const { NavigationContainerRefContext } = require('@react-navigation/native');
  return {
    SearchScreen: () => {
      const nav = ReactModule.useContext(NavigationContainerRefContext);
      if (nav) mockCapturedNav = nav;
      return (
        <View testID="mock-search-screen">
          <Text>Mock Search Screen</Text>
        </View>
      );
    },
  };
});

jest.mock('../src/screens/StatsScreen/StatsScreen', () => {
  const ReactModule = require('react');
  const { Text, View } = require('react-native');
  const { NavigationContainerRefContext } = require('@react-navigation/native');
  return () => {
    const nav = ReactModule.useContext(NavigationContainerRefContext);
    if (nav) mockCapturedNav = nav;
    return (
      <View testID="mock-stats-screen">
        <Text>Mock Stats Screen</Text>
      </View>
    );
  };
});

jest.mock('../src/screens/SettingsScreen/SettingsScreen', () => {
  const ReactModule = require('react');
  const { Text, View } = require('react-native');
  const { NavigationContainerRefContext } = require('@react-navigation/native');
  return () => {
    const nav = ReactModule.useContext(NavigationContainerRefContext);
    if (nav) mockCapturedNav = nav;
    return (
      <View testID="mock-settings-screen">
        <Text>Mock Settings Screen</Text>
      </View>
    );
  };
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
    const { getByText, getAllByText } = render(<RootNavigator />);

    expect(mockCapturedNav).toBeDefined();

    // 1. Camera: headerShown === false
    // React Navigation の公開 API (getCurrentOptions) による設定値と、実際のレンダリング結果（タブバーラベル1件のみ）を検証
    expect(mockCapturedNav?.getCurrentRoute()?.name).toBe('Camera');
    const cameraOptions = mockCapturedNav?.getCurrentOptions() as
      | Record<string, any>
      | undefined;
    expect(cameraOptions?.headerShown).toBe(false);
    expect(getAllByText('撮影')).toHaveLength(1);

    // 2. Records: headerShown === false
    fireEvent.press(getByText('記録'));
    expect(mockCapturedNav?.getCurrentRoute()?.name).toBe('Records');
    const recordsOptions = mockCapturedNav?.getCurrentOptions() as
      | Record<string, any>
      | undefined;
    expect(recordsOptions?.headerShown).toBe(false);
    expect(getAllByText('記録')).toHaveLength(1);

    // 3. Search: headerShown === true (React Navigation bottom-tabs のデフォルトは true)
    fireEvent.press(getAllByText('検索')[0]);
    expect(mockCapturedNav?.getCurrentRoute()?.name).toBe('Search');
    const searchOptions = mockCapturedNav?.getCurrentOptions() as
      | Record<string, any>
      | undefined;
    expect(searchOptions?.headerShown !== false).toBe(true);
    expect(getAllByText('検索')).toHaveLength(2);

    // 4. Stats: headerShown === true (デフォルト true)
    fireEvent.press(getAllByText('統計')[0]);
    expect(mockCapturedNav?.getCurrentRoute()?.name).toBe('Stats');
    const statsOptions = mockCapturedNav?.getCurrentOptions() as
      | Record<string, any>
      | undefined;
    expect(statsOptions?.headerShown !== false).toBe(true);
    expect(getAllByText('統計')).toHaveLength(2);

    // 5. Settings: headerShown === true (デフォルト true)
    fireEvent.press(getAllByText('設定')[0]);
    expect(mockCapturedNav?.getCurrentRoute()?.name).toBe('Settings');
    const settingsOptions = mockCapturedNav?.getCurrentOptions() as
      | Record<string, any>
      | undefined;
    expect(settingsOptions?.headerShown !== false).toBe(true);
    expect(getAllByText('設定')).toHaveLength(2);
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
