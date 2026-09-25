import React from 'react';
import { Alert, Text } from 'react-native';
import { act, cleanup, fireEvent, render } from '@testing-library/react-native';

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

jest.mock('expo-media-library', () => ({
  createAssetAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
  Album: {
    get: jest.fn(),
    create: jest.fn(),
  },
  Asset: {
    create: jest.fn(),
  },
}));

jest.mock('../src/media/mealThumbnail', () => ({
  requestMealThumbnails: jest.fn(),
}));

jest.mock('../src/database/services/MealService', () => ({
  MealService: {
    getRecentMeals: jest.fn(),
  },
}));

import { RecordsScreen } from '../src/screens/RecordsScreen/RecordsScreen';
import { MealService } from '../src/database/services/MealService';
import { requestMealThumbnails } from '../src/media/mealThumbnail';

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
    cleanup();
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

  test('groups meals across today, yesterday, and older dates in correct order', async () => {
    const now = new Date();
    const todayTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0).getTime();
    const yesterdayTimestamp = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0).getTime();
    const olderDate = new Date(2026, 3, 10, 12, 0, 0); // 2026-04-10
    const olderTimestamp = olderDate.getTime();

    (MealService.getRecentMeals as jest.Mock).mockResolvedValue([
      {
        id: '1',
        uuid: '1',
        meal_name: '今日のランチ',
        meal_datetime: todayTimestamp,
        is_homemade: false,
        photo_path: 'file:///today.jpg',
        is_deleted: false,
        created_at: todayTimestamp,
        updated_at: todayTimestamp,
      },
      {
        id: '2',
        uuid: '2',
        meal_name: '昨日のディナー',
        meal_datetime: yesterdayTimestamp,
        is_homemade: true,
        photo_path: 'file:///yesterday.jpg',
        is_deleted: false,
        created_at: yesterdayTimestamp,
        updated_at: yesterdayTimestamp,
      },
      {
        id: '3',
        uuid: '3',
        meal_name: '過去のカレー',
        meal_datetime: olderTimestamp,
        is_homemade: true,
        photo_path: 'file:///older.jpg',
        is_deleted: false,
        created_at: olderTimestamp,
        updated_at: olderTimestamp,
      },
    ]);

    const { findByText, getAllByTestId, UNSAFE_getAllByType } = render(<RecordsScreen />);
    await triggerLatestFocus();

    await findByText('今日のランチ');

    // Verify section headers appear in strict descending order: 1. 今日, 2. 昨日, 3. 過去の日付 (4月10日)
    const headerTexts = UNSAFE_getAllByType(Text)
      .map(node => node.props.children)
      .filter(text => text === '今日' || text === '昨日' || text === '4月10日');
    expect(headerTexts).toEqual(['今日', '昨日', '4月10日']);

    // Verify full chronological sequence of headers and meal items
    const renderedSequence = UNSAFE_getAllByType(Text)
      .map(node => node.props.children)
      .filter(t => ['今日', '今日のランチ', '昨日', '昨日のディナー', '4月10日', '過去のカレー'].includes(t));
    expect(renderedSequence).toEqual([
      '今日',
      '今日のランチ',
      '昨日',
      '昨日のディナー',
      '4月10日',
      '過去のカレー',
    ]);

    // Verify card element order
    const cardIds = getAllByTestId(/^meal-card-/).map(el => el.props.testID);
    expect(cardIds).toEqual(['meal-card-1', 'meal-card-2', 'meal-card-3']);
  });

  test('orders meals within the same date in descending order of meal_datetime', async () => {
    const targetDate = new Date(2026, 3, 15); // 2026-04-15
    const timestamp08 = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 8, 0, 0).getTime();
    const timestamp12 = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 12, 0, 0).getTime();
    const timestamp18 = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 18, 0, 0).getTime();

    // MealService.getRecentMeals guarantees sort order by meal_datetime DESC.
    // The component relies on this and does not perform redundant sorting.
    (MealService.getRecentMeals as jest.Mock).mockResolvedValue([
      {
        id: 'meal-18',
        uuid: 'meal-18',
        meal_name: '夜ごはん (18:00)',
        meal_datetime: timestamp18,
        is_homemade: false,
        photo_path: 'file:///dinner.jpg',
        is_deleted: false,
        created_at: timestamp18,
        updated_at: timestamp18,
      },
      {
        id: 'meal-12',
        uuid: 'meal-12',
        meal_name: '昼ごはん (12:00)',
        meal_datetime: timestamp12,
        is_homemade: true,
        photo_path: 'file:///lunch.jpg',
        is_deleted: false,
        created_at: timestamp12,
        updated_at: timestamp12,
      },
      {
        id: 'meal-08',
        uuid: 'meal-08',
        meal_name: '朝ごはん (08:00)',
        meal_datetime: timestamp08,
        is_homemade: true,
        photo_path: 'file:///breakfast.jpg',
        is_deleted: false,
        created_at: timestamp08,
        updated_at: timestamp08,
      },
    ]);

    const { findByText, getAllByTestId, UNSAFE_getAllByType } = render(<RecordsScreen />);
    await triggerLatestFocus();

    await findByText('朝ごはん (08:00)');

    // Only one section header for 4月15日 should be rendered
    const dateHeaders = UNSAFE_getAllByType(Text)
      .map(node => node.props.children)
      .filter(text => text === '4月15日');
    expect(dateHeaders).toHaveLength(1);

    // Verify meals within the same date are sorted descending: 18:00 -> 12:00 -> 08:00
    const mealNames = UNSAFE_getAllByType(Text)
      .map(node => node.props.children)
      .filter(t => ['朝ごはん (08:00)', '昼ごはん (12:00)', '夜ごはん (18:00)'].includes(t));
    expect(mealNames).toEqual([
      '夜ごはん (18:00)',
      '昼ごはん (12:00)',
      '朝ごはん (08:00)',
    ]);

    // Verify card testID order
    const cardIds = getAllByTestId(/^meal-card-/).map(el => el.props.testID);
    expect(cardIds).toEqual(['meal-card-meal-18', 'meal-card-meal-12', 'meal-card-meal-08']);
  });

  test('groups meals according to local date boundaries (00:01 and 23:59 on the same local date)', async () => {
    // Construct times explicitly using local Date methods to guarantee timezone-independent determinism
    const startOfDay = new Date(2026, 4, 20, 0, 1, 0).getTime();
    const endOfDay = new Date(2026, 4, 20, 23, 59, 0).getTime();
    const prevDayEnd = new Date(2026, 4, 19, 23, 59, 0).getTime();

    (MealService.getRecentMeals as jest.Mock).mockResolvedValue([
      {
        id: 'boundary-end',
        uuid: 'boundary-end',
        meal_name: '夜食 (23:59)',
        meal_datetime: endOfDay,
        is_homemade: false,
        photo_path: 'file:///late.jpg',
        is_deleted: false,
        created_at: endOfDay,
        updated_at: endOfDay,
      },
      {
        id: 'boundary-start',
        uuid: 'boundary-start',
        meal_name: '深夜食 (00:01)',
        meal_datetime: startOfDay,
        is_homemade: true,
        photo_path: 'file:///midnight.jpg',
        is_deleted: false,
        created_at: startOfDay,
        updated_at: startOfDay,
      },
      {
        id: 'prev-day-end',
        uuid: 'prev-day-end',
        meal_name: '前日の夜食 (23:59)',
        meal_datetime: prevDayEnd,
        is_homemade: true,
        photo_path: 'file:///prev.jpg',
        is_deleted: false,
        created_at: prevDayEnd,
        updated_at: prevDayEnd,
      },
    ]);

    const { findByText, UNSAFE_getAllByType } = render(<RecordsScreen />);
    await triggerLatestFocus();

    await findByText('深夜食 (00:01)');

    // Verify there are exactly two date sections: 5月20日 and 5月19日
    const dateHeaders = UNSAFE_getAllByType(Text)
      .map(node => node.props.children)
      .filter(text => text === '5月20日' || text === '5月19日');
    expect(dateHeaders).toEqual(['5月20日', '5月19日']);

    // Verify the items order: May 20 (23:59) -> May 20 (00:01) -> May 19 (23:59)
    const mealNames = UNSAFE_getAllByType(Text)
      .map(node => node.props.children)
      .filter(t => ['深夜食 (00:01)', '夜食 (23:59)', '前日の夜食 (23:59)'].includes(t));
    expect(mealNames).toEqual([
      '夜食 (23:59)',
      '深夜食 (00:01)',
      '前日の夜食 (23:59)',
    ]);
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

  test('passes the flat list and tapped meal index to the detail screen', async () => {
    const newerMeal = {
      id: '1',
      uuid: '1',
      meal_name: '朝ごはん',
      meal_datetime: new Date('2026-04-12T08:00:00+09:00').getTime(),
      is_homemade: true,
      photo_path: 'file:///breakfast.jpg',
      is_deleted: false,
      created_at: 1,
      updated_at: 1,
    };
    const selectedMeal = {
      id: '2',
      uuid: '2',
      meal_name: '昼ごはん',
      meal_datetime: new Date('2026-04-12T12:00:00+09:00').getTime(),
      is_homemade: false,
      photo_path: 'file:///lunch.jpg',
      is_deleted: false,
      created_at: 2,
      updated_at: 2,
    };
    const olderMeal = {
      id: '3',
      uuid: '3',
      meal_name: '夜ごはん',
      meal_datetime: new Date('2026-04-11T19:00:00+09:00').getTime(),
      is_homemade: true,
      photo_path: 'file:///dinner.jpg',
      is_deleted: false,
      created_at: 3,
      updated_at: 3,
    };
    const meals = [newerMeal, selectedMeal, olderMeal];
    (MealService.getRecentMeals as jest.Mock).mockResolvedValue(meals);

    const { findByTestId } = render(<RecordsScreen />);
    await triggerLatestFocus();

    fireEvent.press(await findByTestId('meal-card-2'));

    expect(mockNavigate).toHaveBeenCalledWith('MealDetail', {
      meal: selectedMeal,
      meals,
      initialIndex: 1,
    });
  });

  test('triggers requestMealThumbnails to lazily fill missing thumbnails when records load', async () => {
    const meal = {
      id: '1',
      uuid: '1',
      meal_name: '朝ごはん',
      meal_datetime: new Date('2026-04-12T08:00:00+09:00').getTime(),
      is_homemade: true,
      photo_path: 'file:///breakfast.jpg',
      is_deleted: false,
      created_at: 1,
      updated_at: 1,
    };
    (MealService.getRecentMeals as jest.Mock).mockResolvedValue([meal]);

    render(<RecordsScreen />);
    await triggerLatestFocus();

    expect(requestMealThumbnails).toHaveBeenCalledWith([meal], {
      onGenerated: expect.any(Function),
    });
  });

  test('does not update state when onGenerated fires after component unmount', async () => {
    let capturedOnGenerated: ((mealId: string, thumbUri: string) => void) | undefined;
    (requestMealThumbnails as jest.Mock).mockImplementation((_meals, options) => {
      capturedOnGenerated = options?.onGenerated;
    });

    const meal = {
      id: '1',
      uuid: '1',
      meal_name: '朝ごはん',
      meal_datetime: new Date('2026-04-12T08:00:00+09:00').getTime(),
      is_homemade: true,
      photo_path: 'file:///breakfast.jpg',
      is_deleted: false,
      created_at: 1,
      updated_at: 1,
    };
    (MealService.getRecentMeals as jest.Mock).mockResolvedValue([meal]);

    const { unmount } = render(<RecordsScreen />);
    await triggerLatestFocus();

    expect(capturedOnGenerated).toBeDefined();

    unmount();

    expect(() => {
      capturedOnGenerated?.('1', 'file:///thumb.jpg');
    }).not.toThrow();
  });

  test('loads initial page with limit 50', async () => {
    (MealService.getRecentMeals as jest.Mock).mockResolvedValue([]);

    render(<RecordsScreen />);
    await triggerLatestFocus();

    expect(MealService.getRecentMeals).toHaveBeenCalledWith(50);
  });

  test('loads additional meals when onEndReached is triggered using cursor', async () => {
    const page1Meals = Array.from({ length: 50 }, (_, i) => ({
      id: `meal-page1-${i}`,
      uuid: `uuid-page1-${i}`,
      meal_name: `料理 Page1-${i}`,
      meal_datetime: new Date('2026-04-12T12:00:00+09:00').getTime() - i * 1000,
      is_homemade: false,
      photo_path: `file:///page1-${i}.jpg`,
      is_deleted: false,
      created_at: 1,
      updated_at: 1,
    }));

    const page2Meals = [
      {
        id: 'meal-page2-0',
        uuid: 'uuid-page2-0',
        meal_name: '過去のカレー',
        meal_datetime: new Date('2026-04-11T12:00:00+09:00').getTime(),
        is_homemade: true,
        photo_path: 'file:///curry.jpg',
        is_deleted: false,
        created_at: 1,
        updated_at: 1,
      },
    ];

    (MealService.getRecentMeals as jest.Mock)
      .mockResolvedValueOnce(page1Meals)
      .mockResolvedValueOnce(page2Meals);

    const { getByTestId, findByTestId } = render(<RecordsScreen />);
    await triggerLatestFocus();

    expect(await findByTestId('meal-card-meal-page1-0')).toBeTruthy();
    expect(MealService.getRecentMeals).toHaveBeenCalledWith(50);

    const lastMealOfPage1 = page1Meals[49];

    // SectionList の onEndReached を発火
    const sectionList = getByTestId('records-section-list');
    await act(async () => {
      sectionList.props.onEndReached?.();
      await Promise.resolve();
    });

    expect(MealService.getRecentMeals).toHaveBeenCalledWith({
      limit: 50,
      beforeMealDatetime: lastMealOfPage1.meal_datetime,
      beforeId: lastMealOfPage1.id,
    });

    // タップ時に遷移先へ渡される meals に全51件（2ページ目を含む）が含まれることを検証
    fireEvent.press(await findByTestId('meal-card-meal-page1-0'));
    expect(mockNavigate).toHaveBeenCalledWith('MealDetail', {
      meal: page1Meals[0],
      meals: [...page1Meals, ...page2Meals],
      initialIndex: 0,
    });
  });

  test('does not drop meals when new meals are added before loading next page', async () => {
    // 50件の初期データを取得
    const page1Meals = Array.from({ length: 50 }, (_, i) => ({
      id: `meal-initial-${50 - i}`,
      uuid: `uuid-initial-${50 - i}`,
      meal_name: `初期料理 ${50 - i}`,
      meal_datetime: 1000000 - i * 1000,
      is_homemade: false,
      photo_path: `file:///init-${50 - i}.jpg`,
      is_deleted: false,
      created_at: 1,
      updated_at: 1,
    }));

    // 初回取得後に新しい食事（最新タイムスタンプ）が追加された想定
    // OFFSET 方式だと 50件目（meal-initial-1）が再取得されて重複したり、境界ズレが起きるが、
    // カーソル方式では page1Meals の末尾（meal-initial-1）より古いレコードが確実に取得される
    const expectedNextMeals = [
      {
        id: 'meal-past-51',
        uuid: 'uuid-past-51',
        meal_name: '過去の重要料理51',
        meal_datetime: page1Meals[49].meal_datetime - 1000,
        is_homemade: true,
        photo_path: 'file:///past-51.jpg',
        is_deleted: false,
        created_at: 1,
        updated_at: 1,
      },
    ];

    (MealService.getRecentMeals as jest.Mock)
      .mockResolvedValueOnce(page1Meals)
      .mockResolvedValueOnce(expectedNextMeals);

    const { getByTestId, findByTestId } = render(<RecordsScreen />);
    await triggerLatestFocus();

    const lastMealOfPage1 = page1Meals[49];

    // onEndReached 発火
    const sectionList = getByTestId('records-section-list');
    await act(async () => {
      sectionList.props.onEndReached?.();
      await Promise.resolve();
    });

    // カーソル（lastMeal の meal_datetime と id）が渡され、過去データが欠落せず取得される
    expect(MealService.getRecentMeals).toHaveBeenLastCalledWith({
      limit: 50,
      beforeMealDatetime: lastMealOfPage1.meal_datetime,
      beforeId: lastMealOfPage1.id,
    });

    fireEvent.press(await findByTestId('meal-card-meal-initial-50'));
    expect(mockNavigate).toHaveBeenCalledWith('MealDetail', {
      meal: page1Meals[0],
      meals: [...page1Meals, ...expectedNextMeals],
      initialIndex: 0,
    });
  });

  test('does not drop meals when existing meals are deleted before loading next page', async () => {
    // 50件の初期データを取得
    const page1Meals = Array.from({ length: 50 }, (_, i) => ({
      id: `meal-del-test-${50 - i}`,
      uuid: `uuid-del-test-${50 - i}`,
      meal_name: `料理 ${50 - i}`,
      meal_datetime: 1000000 - i * 1000,
      is_homemade: false,
      photo_path: `file:///del-${50 - i}.jpg`,
      is_deleted: false,
      created_at: 1,
      updated_at: 1,
    }));

    // もし OFFSET 方式であれば、取得済みデータから1件削除されると
    // DB 内の 51件目（meal-next-boundary）が 50件目に繰り上がるため、OFFSET 50 でフェッチするとスキップされて欠落する。
    // カーソル方式であれば、DB 内で削除が発生しても手持ちの最古レコードの過去から取得するため欠落しない。
    const boundaryMeal = {
      id: 'meal-next-boundary',
      uuid: 'uuid-next-boundary',
      meal_name: '境界の料理（欠落してはいけない）',
      meal_datetime: page1Meals[49].meal_datetime - 1000,
      is_homemade: true,
      photo_path: 'file:///boundary.jpg',
      is_deleted: false,
      created_at: 1,
      updated_at: 1,
    };

    (MealService.getRecentMeals as jest.Mock)
      .mockResolvedValueOnce(page1Meals)
      .mockResolvedValueOnce([boundaryMeal]);

    const { getByTestId, findByTestId } = render(<RecordsScreen />);
    await triggerLatestFocus();

    const lastMealOfPage1 = page1Meals[49];

    // onEndReached 発火
    const sectionList = getByTestId('records-section-list');
    await act(async () => {
      sectionList.props.onEndReached?.();
      await Promise.resolve();
    });

    expect(MealService.getRecentMeals).toHaveBeenLastCalledWith({
      limit: 50,
      beforeMealDatetime: lastMealOfPage1.meal_datetime,
      beforeId: lastMealOfPage1.id,
    });

    fireEvent.press(await findByTestId('meal-card-meal-del-test-50'));
    expect(mockNavigate).toHaveBeenCalledWith('MealDetail', {
      meal: page1Meals[0],
      meals: [...page1Meals, boundaryMeal],
      initialIndex: 0,
    });
  });

  test('shows loading-more indicator while fetching additional meals', async () => {
    const page1Meals = Array.from({ length: 50 }, (_, i) => ({
      id: `meal-page1-${i}`,
      uuid: `uuid-page1-${i}`,
      meal_name: `料理 Page1-${i}`,
      meal_datetime: new Date('2026-04-12T12:00:00+09:00').getTime() - i * 1000,
      is_homemade: false,
      photo_path: `file:///page1-${i}.jpg`,
      is_deleted: false,
      created_at: 1,
      updated_at: 1,
    }));

    let resolvePage2!: (value: unknown) => void;
    const page2Promise = new Promise(resolve => {
      resolvePage2 = resolve;
    });

    (MealService.getRecentMeals as jest.Mock)
      .mockResolvedValueOnce(page1Meals)
      .mockReturnValueOnce(page2Promise);

    const { getByTestId, findByTestId, queryByTestId } = render(<RecordsScreen />);
    await triggerLatestFocus();

    expect(await findByTestId('meal-card-meal-page1-0')).toBeTruthy();
    expect(queryByTestId('records-loading-more')).toBeNull();

    const sectionList = getByTestId('records-section-list');
    act(() => {
      sectionList.props.onEndReached?.();
    });

    // フェッチ中はインジケーターが表示される
    expect(queryByTestId('records-loading-more')).toBeTruthy();

    await act(async () => {
      resolvePage2([]);
      await Promise.resolve();
    });

    // 完了後はインジケーターが非表示になる
    expect(queryByTestId('records-loading-more')).toBeNull();
  });

  test('does not trigger handleLoadMore when hasMore is false (fewer than 50 items returned)', async () => {
    const fewMeals = [
      {
        id: 'single-meal',
        uuid: 'single-uuid',
        meal_name: 'うどん',
        meal_datetime: new Date('2026-04-12T12:00:00+09:00').getTime(),
        is_homemade: false,
        photo_path: 'file:///udon.jpg',
        is_deleted: false,
        created_at: 1,
        updated_at: 1,
      },
    ];

    (MealService.getRecentMeals as jest.Mock).mockResolvedValueOnce(fewMeals);

    const { getByTestId, findByText } = render(<RecordsScreen />);
    await triggerLatestFocus();

    expect(await findByText('うどん')).toBeTruthy();
    expect(MealService.getRecentMeals).toHaveBeenCalledTimes(1);

    const sectionList = getByTestId('records-section-list');
    await act(async () => {
      sectionList.props.onEndReached?.();
      await Promise.resolve();
    });

    // 件数が 50 未満のため hasMore が false となり追加フェッチは呼ばれない
    expect(MealService.getRecentMeals).toHaveBeenCalledTimes(1);
  });

  test('refreshes from offset 0 when pull-to-refresh is executed', async () => {
    const initialMeals = Array.from({ length: 50 }, (_, i) => ({
      id: `initial-${i}`,
      uuid: `uuid-${i}`,
      meal_name: `初期料理 ${i}`,
      meal_datetime: new Date('2026-04-12T12:00:00+09:00').getTime() - i * 1000,
      is_homemade: false,
      photo_path: `file:///init-${i}.jpg`,
      is_deleted: false,
      created_at: 1,
      updated_at: 1,
    }));

    (MealService.getRecentMeals as jest.Mock).mockResolvedValue(initialMeals);

    const { getByTestId } = render(<RecordsScreen />);
    await triggerLatestFocus();

    expect(MealService.getRecentMeals).toHaveBeenCalledWith(50);

    const sectionList = getByTestId('records-section-list');
    await act(async () => {
      fireEvent(sectionList, 'refresh');
    });

    // リフレッシュ時も先頭から再フェッチされる
    expect(MealService.getRecentMeals).toHaveBeenLastCalledWith(50);
  });
});
