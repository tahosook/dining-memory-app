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
    const { getAllByText } = render(<RootNavigator />);

    // ヘッダーコンポーネント（HeaderTitle / Header）の描画有無を判定するヘルパー。
    // React Navigation の Bottom Tabs において：
    // - headerShown: false の画面ではヘッダー要素・コンテナは一切レンダリングされず、
    //   画面内に存在するタイトルテキストは下部タブバー（BottomTabBar）のボタンラベル 1 件のみとなる。
    // - headerShown: true の画面では下部タブバーに加え、上部ヘッダー（Header / HeaderTitle）内にも
    //   タイトルテキストが描画され、合計 2 件のテキストが存在する。
    // role="heading" などの a11y 属性に依存せず、描画ツリー内のヘッダーコンポーネントの有無を直接検証する。
    const getAncestorNames = (node: any): string[] => {
      const names: string[] = [];
      let curr = node.parent;
      while (curr) {
        const name =
          typeof curr.type === 'string'
            ? curr.type
            : curr.type?.name || curr.type?.displayName || '';
        if (name) names.push(name);
        curr = curr.parent;
      }
      return names;
    };

    const isHeaderRendered = (title: string): boolean => {
      const elements = getAllByText(title);
      return elements.some((el) => {
        const ancestors = getAncestorNames(el);
        return ancestors.some((a) => a === 'HeaderTitle' || a === 'Header');
      });
    };

    // 1. Camera: headerShown === false
    // 初期タブ Camera ではヘッダーコンポーネントが描画されず、タブバーのラベル 1 件のみ
    expect(isHeaderRendered('撮影')).toBe(false);
    expect(getAllByText('撮影')).toHaveLength(1);

    // 2. Records: headerShown === false
    // Records タブに切り替え後もヘッダーコンポーネントは描画されず、タブバーのラベル 1 件のみ
    fireEvent.press(getAllByText('記録')[0]);
    expect(isHeaderRendered('記録')).toBe(false);
    expect(getAllByText('記録')).toHaveLength(1);

    // 3. Search: headerShown === true
    // Search タブでは上部ヘッダー（HeaderTitle）と下部タブバーの両方に描画される（合計 2 件）
    fireEvent.press(getAllByText('検索')[0]);
    expect(isHeaderRendered('検索')).toBe(true);
    expect(getAllByText('検索')).toHaveLength(2);

    // 4. Stats: headerShown === true
    // Stats タブでも上部ヘッダー（HeaderTitle）と下部タブバーの両方に描画される（合計 2 件）
    fireEvent.press(getAllByText('統計')[0]);
    expect(isHeaderRendered('統計')).toBe(true);
    expect(getAllByText('統計')).toHaveLength(2);

    // 5. Settings: headerShown === true
    // Settings タブでも上部ヘッダー（HeaderTitle）と下部タブバーの両方に描画される（合計 2 件）
    fireEvent.press(getAllByText('設定')[0]);
    expect(isHeaderRendered('設定')).toBe(true);
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
