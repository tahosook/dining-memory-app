import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

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

let consoleErrorSpy: jest.SpiedFunction<typeof console.error>;

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createMeal(overrides: Partial<Record<string, unknown>> = {}) {
  return {
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
    ...overrides,
  };
}

async function triggerLatestFocus() {
  await act(async () => {
    focusCallbacks[focusCallbacks.length - 1]?.();
    await Promise.resolve();
  });
}

describe('SearchScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    focusCallbacks.length = 0;
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(jest.fn());
  });

  afterEach(() => {
    jest.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  test('shows loading state during the first search', async () => {
    const deferred = createDeferred<unknown[]>();
    (MealService.searchMeals as jest.Mock).mockReturnValue(deferred.promise);

    const { getByTestId, findByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    expect(getByTestId('search-loading')).toBeTruthy();

    await act(async () => {
      deferred.resolve([]);
      await Promise.resolve();
    });
    expect(await findByTestId('search-empty')).toBeTruthy();
  });

  test('shows zero-result state when there are no matches', async () => {
    (MealService.searchMeals as jest.Mock).mockResolvedValue([]);

    const { findByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    expect(await findByTestId('search-empty')).toBeTruthy();
  });

  test('shows an error card and retry action when the initial search fails', async () => {
    (MealService.searchMeals as jest.Mock)
      .mockRejectedValueOnce(new Error('search failed'))
      .mockResolvedValueOnce([]);

    const { findByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    expect(await findByTestId('search-error')).toBeTruthy();

    fireEvent.press(await findByTestId('search-error-action'));

    await waitFor(() => {
      expect(MealService.searchMeals).toHaveBeenCalledTimes(2);
    });
  });

  test('keeps stale results visible when a refresh fails', async () => {
    (MealService.searchMeals as jest.Mock)
      .mockResolvedValueOnce([createMeal()])
      .mockRejectedValueOnce(new Error('refresh failed'));

    const { findByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    expect(await findByTestId('search-result-1')).toBeTruthy();

    await triggerLatestFocus();

    expect(await findByTestId('search-error')).toBeTruthy();
    expect(await findByTestId('search-result-1')).toBeTruthy();
  });

  test('opens a result in the shared detail screen', async () => {
    const firstMeal = createMeal({ id: '1', meal_name: 'ラーメン' });
    const selectedMeal = createMeal({ id: '2', meal_name: 'カレー' });
    const results = [firstMeal, selectedMeal];
    (MealService.searchMeals as jest.Mock).mockResolvedValue(results);

    const { findByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    fireEvent.press(await findByTestId('search-result-2'));

    expect(mockNavigate).toHaveBeenCalledWith('MealDetail', {
      meal: selectedMeal,
      meals: results,
      initialIndex: 1,
    });
  });

  test('has accessibility attributes on search result items', async () => {
    const meal = createMeal({ id: '1', meal_name: 'ラーメン' });
    (MealService.searchMeals as jest.Mock).mockResolvedValue([meal]);

    const { findByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    const resultItem = await findByTestId('search-result-1');
    expect(resultItem.props.accessibilityRole).toBe('button');
    expect(resultItem.props.accessibilityLabel).toBe('ラーメン');
  });

  test('shows only the text search and filter toggle by default', async () => {
    (MealService.searchMeals as jest.Mock).mockResolvedValue([]);

    const { getByTestId, queryByPlaceholderText, queryByTestId, queryByText } = render(<SearchScreen />);
    await triggerLatestFocus();

    expect(getByTestId('search-input')).toBeTruthy();
    expect(getByTestId('search-filter-toggle')).toBeTruthy();
    expect(queryByTestId('search-cuisine-和食')).toBeNull();
    expect(queryByPlaceholderText('場所フィルター')).toBeNull();
    expect(queryByText('自炊のみ')).toBeNull();
    expect(queryByText('検索する')).toBeNull();
  });

  test('automatically searches after text input changes', async () => {
    jest.useFakeTimers();
    (MealService.searchMeals as jest.Mock).mockResolvedValue([]);

    const { getByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    fireEvent.changeText(getByTestId('search-input'), 'カレー');

    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(MealService.searchMeals).toHaveBeenLastCalledWith(
      expect.objectContaining({
        text: 'カレー',
      })
    );
    jest.useRealTimers();
  });

  test('opens optional filters and automatically searches with filter values', async () => {
    jest.useFakeTimers();
    (MealService.searchMeals as jest.Mock).mockResolvedValue([]);

    const { findByTestId, getByTestId, getByText } = render(<SearchScreen />);
    await triggerLatestFocus();

    fireEvent.press(getByTestId('search-filter-toggle'));

    expect(await findByTestId('search-cuisine-和食')).toBeTruthy();
    expect(getByTestId('search-location-input')).toBeTruthy();
    expect(getByTestId('search-homemade-switch')).toBeTruthy();

    fireEvent.press(await findByTestId('search-cuisine-和食'));
    fireEvent.changeText(getByTestId('search-location-input'), '神田');
    fireEvent(getByTestId('search-homemade-switch'), 'valueChange', true);

    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });

    expect(MealService.searchMeals).toHaveBeenLastCalledWith(
      expect.objectContaining({
        cuisine_type: '和食',
        location_name: '神田',
        is_homemade: true,
      })
    );
    expect(getByText('条件あり')).toBeTruthy();
    jest.useRealTimers();
  });

  test('renders search results as a photo grid', async () => {
    (MealService.searchMeals as jest.Mock).mockResolvedValue([
      createMeal({
        id: '1',
        photo_path: 'file:///full-photo.jpg',
        photo_thumbnail_path: 'file:///thumb-photo.jpg',
      }),
      createMeal({
        id: '2',
        meal_name: '写真なし',
        photo_path: '',
        photo_thumbnail_path: undefined,
      }),
    ]);

    const { findByTestId, queryByText } = render(<SearchScreen />);
    await triggerLatestFocus();

    expect((await findByTestId('search-result-image-1')).props.source).toEqual({ uri: 'file:///thumb-photo.jpg' });
    expect(await findByTestId('search-result-placeholder-2')).toBeTruthy();
    expect(queryByText('ラーメン')).toBeNull();
    expect(queryByText('神田')).toBeNull();
  });

  test('does not trigger redundant debounced search on initial focus', async () => {
    jest.useFakeTimers();
    (MealService.searchMeals as jest.Mock).mockResolvedValue([]);

    render(<SearchScreen />);
    await triggerLatestFocus();

    expect(MealService.searchMeals).toHaveBeenCalledTimes(1);

    // 300ms 経過してもフィルター未変更のため2回目の検索は走らない
    await act(async () => {
      jest.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(MealService.searchMeals).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  test('ignores stale search results when newer search completes earlier', async () => {
    const firstDeferred = createDeferred<unknown[]>();
    const secondDeferred = createDeferred<unknown[]>();

    (MealService.searchMeals as jest.Mock)
      .mockReturnValueOnce(firstDeferred.promise)
      .mockReturnValueOnce(secondDeferred.promise);

    const { findByTestId, queryByTestId } = render(<SearchScreen />);
    await triggerLatestFocus(); // searchId = 1

    // 2回目の検索（searchId = 2）
    await triggerLatestFocus();

    // 2回目（最新）が先に解決
    await act(async () => {
      secondDeferred.resolve([createMeal({ id: '2', meal_name: '最新の食事' })]);
      await Promise.resolve();
    });

    expect(await findByTestId('search-result-2')).toBeTruthy();

    // 1回目（遅延した古い結果）が後から解決
    await act(async () => {
      firstDeferred.resolve([createMeal({ id: '1', meal_name: '古い食事' })]);
      await Promise.resolve();
    });

    // 最新の '2' のみが残っており、'1' で上書きされていないことを検証
    expect(await findByTestId('search-result-2')).toBeTruthy();
    expect(queryByTestId('search-result-1')).toBeNull();
  });

  test('initial search requests paginated results with limit 60 and offset 0', async () => {
    (MealService.searchMeals as jest.Mock).mockResolvedValue([]);

    render(<SearchScreen />);
    await triggerLatestFocus();

    expect(MealService.searchMeals).toHaveBeenCalledWith(
      expect.objectContaining({
        limit: 60,
        offset: 0,
      })
    );
  });

  test('loads next page and appends results when onEndReached is triggered', async () => {
    const page1Meals = Array.from({ length: 60 }, (_, i) =>
      createMeal({ id: `page1-${i}`, meal_name: `食事1-${i}` })
    );
    const page2Meals = [
      createMeal({ id: 'page2-0', meal_name: '食事2-0' }),
      createMeal({ id: 'page2-1', meal_name: '食事2-1' }),
    ];

    (MealService.searchMeals as jest.Mock)
      .mockResolvedValueOnce(page1Meals)
      .mockResolvedValueOnce(page2Meals);

    const { findByTestId, getByText } = render(<SearchScreen />);
    await triggerLatestFocus();

    // 1ページ目の結果（60件）が表示され、hasMore=true のため 60件+ と表示
    expect(await findByTestId('search-result-page1-0')).toBeTruthy();
    expect(getByText('60件+')).toBeTruthy();

    // FlatList の onEndReached を発火して次ページをロード
    const flatList = await findByTestId('search-results-list');
    await act(async () => {
      flatList.props.onEndReached?.();
      await Promise.resolve();
    });

    // 2回目の searchMeals は offset: 60, limit: 60 で呼ばれる
    expect(MealService.searchMeals).toHaveBeenLastCalledWith(
      expect.objectContaining({
        limit: 60,
        offset: 60,
      })
    );
    expect(MealService.searchMeals).toHaveBeenCalledTimes(2);

    // 2ページ目の結果が追加され、全62件となり hasMore=false のため 62件 と表示
    expect(getByText('62件')).toBeTruthy();

    // タップ時に遷移先へ渡される meals に全62件（2ページ目を含む）が含まれることを検証
    fireEvent.press(await findByTestId('search-result-page1-0'));
    expect(mockNavigate).toHaveBeenCalledWith('MealDetail', {
      meal: page1Meals[0],
      meals: [...page1Meals, ...page2Meals],
      initialIndex: 0,
    });
  });

  test('does not trigger additional search when hasMore is false', async () => {
    const fewMeals = [createMeal({ id: 'few-1', meal_name: '少数' })];
    (MealService.searchMeals as jest.Mock).mockResolvedValueOnce(fewMeals);

    const { findByTestId, getByText } = render(<SearchScreen />);
    await triggerLatestFocus();

    expect(await findByTestId('search-result-few-1')).toBeTruthy();
    expect(getByText('1件')).toBeTruthy();
    expect(MealService.searchMeals).toHaveBeenCalledTimes(1);

    // 取得件数が 60 未満なので hasMore=false、onEndReached を呼んでも追加リクエストは発生しない
    const flatList = await findByTestId('search-results-list');
    await act(async () => {
      flatList.props.onEndReached?.();
      await Promise.resolve();
    });

    expect(MealService.searchMeals).toHaveBeenCalledTimes(1);
  });

  test('discards stale loadMore results when search query changes during loadMore', async () => {
    const page1Meals = Array.from({ length: 60 }, (_, i) =>
      createMeal({ id: `item-${i}` })
    );
    const deferredLoadMore = createDeferred<unknown[]>();

    (MealService.searchMeals as jest.Mock)
      .mockResolvedValueOnce(page1Meals)
      .mockReturnValueOnce(deferredLoadMore.promise)
      .mockResolvedValueOnce([createMeal({ id: 'curry-1', meal_name: 'カレーライス' })]);

    const { findByTestId, getByTestId, queryByTestId } = render(<SearchScreen />);
    await triggerLatestFocus();

    expect(await findByTestId('search-result-item-0')).toBeTruthy();

    // 1. loadMore を発火（非同期保留中）
    const flatList = await findByTestId('search-results-list');
    await act(async () => {
      flatList.props.onEndReached?.();
      await Promise.resolve();
    });

    // 2. loadMore が解決する前にユーザーが検索クエリを変更（新しい検索開始）
    jest.useFakeTimers();
    fireEvent.changeText(getByTestId('search-input'), 'カレー');
    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });
    jest.useRealTimers();

    // 3. 遅延していた古い loadMore が解決
    await act(async () => {
      deferredLoadMore.resolve([createMeal({ id: 'stale-page2' })]);
      await Promise.resolve();
    });

    // 新しい検索結果 'curry-1' のみが表示され、古い loadMore の 'stale-page2' は混入しない
    expect(await findByTestId('search-result-curry-1')).toBeTruthy();
    expect(queryByTestId('search-result-stale-page2')).toBeNull();
  });
});

