import { MealService } from '../src/database/services/MealService';
import { isUsingNativeDatabase, getDatabase } from '../src/database/services/localDatabase';
import { buildStatisticsSummary, filterRowsForStatistics } from '../src/domain/meals/statistics';

jest.mock('../src/database/services/localDatabase', () => {
  type MockMealRow = Record<string, unknown>;
  let meals: MockMealRow[] = [];

  return {
    initializeDatabase: jest.fn(async () => {}),
    getDatabase: jest.fn(() => null),
    isUsingNativeDatabase: jest.fn(() => false),
    getInMemoryMeals: jest.fn(() => [...meals]),
    setInMemoryMeals: jest.fn((nextMeals) => {
      meals = [...nextMeals];
    }),
    resetInMemoryDatabase: jest.fn(() => {
      meals = [];
    }),
    mapRowToMeal: jest.fn((row) => ({
      ...row,
      is_homemade: Boolean(row.is_homemade),
      is_deleted: Boolean(row.is_deleted),
      meal_type: row.meal_type ?? undefined,
      cuisine_type: row.cuisine_type ?? undefined,
      ai_confidence: row.ai_confidence ?? undefined,
      ai_source: row.ai_source ?? undefined,
      notes: row.notes ?? undefined,
      cooking_level: row.cooking_level ?? undefined,
      photo_thumbnail_path: row.photo_thumbnail_path ?? undefined,
      location_name: row.location_name ?? undefined,
      latitude: row.latitude ?? undefined,
      longitude: row.longitude ?? undefined,
      search_text: row.search_text ?? undefined,
      tags: row.tags ?? undefined,
    })),
  };
});

describe('MealService', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await MealService.clearAllMeals();
  });

  test('creates and returns recent meals', async () => {
    await MealService.createMeal({
      meal_name: '親子丼',
      is_homemade: true,
      photo_path: 'file:///oyako.jpg',
      meal_datetime: new Date('2026-04-12T12:00:00+09:00'),
      location_name: '自宅',
      notes: '昼食',
    });

    const meals = await MealService.getRecentMeals();

    expect(meals).toHaveLength(1);
    expect(meals[0].meal_name).toBe('親子丼');
    expect(meals[0].is_homemade).toBe(true);
  });

  test('retrieves a meal by id and returns null if not found', async () => {
    const created = await MealService.createMeal({
      meal_name: '親子丼',
      is_homemade: true,
      photo_path: 'file:///oyako.jpg',
      meal_datetime: new Date('2026-04-12T12:00:00+09:00'),
    });

    const found = await MealService.getMealById(created.id);
    expect(found).not.toBeNull();
    expect(found?.id).toBe(created.id);
    expect(found?.meal_name).toBe('親子丼');

    const notFound = await MealService.getMealById('non-existent-id');
    expect(notFound).toBeNull();
  });

  test('updateMealThumbnail updates photo_thumbnail_path only when photo_path matches', async () => {
    const created = await MealService.createMeal({
      meal_name: '親子丼',
      is_homemade: true,
      photo_path: 'file:///photo-A.jpg',
      meal_datetime: new Date('2026-04-12T12:00:00+09:00'),
    });

    // 1. photo_path matches -> update succeeds
    const success = await MealService.updateMealThumbnail(
      created.id,
      'file:///photo-A-thumb.jpg',
      'file:///photo-A.jpg'
    );
    expect(success).toBe(true);

    const updatedMeal = await MealService.getMealById(created.id);
    expect(updatedMeal?.photo_thumbnail_path).toBe('file:///photo-A-thumb.jpg');

    // 2. User replaced photo to photo-B.jpg
    await MealService.updateMeal(created.id, {
      photo_path: 'file:///photo-B.jpg',
    });

    // 3. Stale update with expectedPhotoPath = photo-A.jpg fails (0 rows updated)
    const staleResult = await MealService.updateMealThumbnail(
      created.id,
      'file:///stale-A-thumb.jpg',
      'file:///photo-A.jpg'
    );
    expect(staleResult).toBe(false);

    // photo_thumbnail_path remains unchanged (not overwritten by stale thumbnail)
    const currentMeal = await MealService.getMealById(created.id);
    expect(currentMeal?.photo_path).toBe('file:///photo-B.jpg');
    expect(currentMeal?.photo_thumbnail_path).toBe('file:///photo-A-thumb.jpg');

    // 4. Non-existent id returns false
    const notFound = await MealService.updateMealThumbnail(
      'unknown-id',
      'file:///thumb.jpg',
      'file:///photo-A.jpg'
    );
    expect(notFound).toBe(false);
  });

  test('filters search results by text and location', async () => {
    await MealService.createMeal({
      meal_name: '醤油ラーメン',
      is_homemade: false,
      photo_path: 'file:///ramen.jpg',
      meal_datetime: new Date('2026-04-11T19:00:00+09:00'),
      location_name: '神田',
      notes: '仕事帰り',
    });
    await MealService.createMeal({
      meal_name: 'カレー',
      is_homemade: true,
      photo_path: 'file:///curry.jpg',
      meal_datetime: new Date('2026-04-10T19:00:00+09:00'),
      location_name: '自宅',
    });

    const meals = await MealService.searchMeals({
      text: 'ラーメン',
      location_name: '神田',
    });

    expect(meals).toHaveLength(1);
    expect(meals[0].meal_name).toBe('醤油ラーメン');
  });

  test('keeps lexical search strictly text/filter-only', async () => {
    await MealService.createMeal({
      meal_name: '醤油ラーメン',
      is_homemade: false,
      photo_path: 'file:///ramen-lexical.jpg',
      meal_datetime: new Date('2026-04-17T19:00:00+09:00'),
      location_name: '神田',
    });
    await MealService.createMeal({
      meal_name: 'チキンカレー',
      is_homemade: true,
      photo_path: 'file:///curry-lexical.jpg',
      meal_datetime: new Date('2026-04-16T19:00:00+09:00'),
      location_name: '自宅',
      notes: 'スパイス',
    });

    const meals = await MealService.searchMeals({
      text: 'ラーメン',
    });

    expect(meals.map((meal) => meal.meal_name)).toEqual(['醤油ラーメン']);
  });

  test('applies limit and offset pagination in InMemory mode', async () => {
    for (let i = 1; i <= 5; i++) {
      await MealService.createMeal({
        meal_name: `ラーメン${i}`,
        is_homemade: false,
        photo_path: `file:///ramen${i}.jpg`,
        meal_datetime: new Date(`2026-04-${10 + i}T12:00:00+09:00`),
      });
    }

    const page1 = await MealService.searchMeals({
      text: 'ラーメン',
      limit: 2,
      offset: 0,
    });
    expect(page1).toHaveLength(2);
    expect(page1.map((m) => m.meal_name)).toEqual(['ラーメン5', 'ラーメン4']);

    const page2 = await MealService.searchMeals({
      text: 'ラーメン',
      limit: 2,
      offset: 2,
    });
    expect(page2).toHaveLength(2);
    expect(page2.map((m) => m.meal_name)).toEqual(['ラーメン3', 'ラーメン2']);

    const page3 = await MealService.searchMeals({
      text: 'ラーメン',
      limit: 2,
      offset: 4,
    });
    expect(page3).toHaveLength(1);
    expect(page3.map((m) => m.meal_name)).toEqual(['ラーメン1']);
  });

  test('aggregates summary statistics', async () => {
    await MealService.createMeal({
      meal_name: 'パスタ',
      cuisine_type: '洋食',
      is_homemade: true,
      photo_path: 'file:///pasta.jpg',
      meal_datetime: new Date('2026-04-09T19:00:00+09:00'),
      location_name: '自宅',
    });
    await MealService.createMeal({
      meal_name: 'ラーメン',
      cuisine_type: '中華',
      is_homemade: false,
      photo_path: 'file:///ramen2.jpg',
      meal_datetime: new Date('2026-04-08T19:00:00+09:00'),
      location_name: '神田',
    });

    const stats = await MealService.getStatistics();

    expect(stats.totalMeals).toBe(2);
    expect(stats.homemadeMeals).toBe(1);
    expect(stats.takeoutMeals).toBe(1);
    expect(stats.favoriteLocation).toBeDefined();
  });

  test('excludes deleted meals from statistics', async () => {
    const kept = await MealService.createMeal({
      meal_name: 'パスタ',
      cuisine_type: '洋食',
      is_homemade: true,
      photo_path: 'file:///stats-kept.jpg',
      meal_datetime: new Date('2026-04-09T19:00:00+09:00'),
      location_name: '自宅',
    });
    const deleted = await MealService.createMeal({
      meal_name: 'ラーメン',
      cuisine_type: '中華',
      is_homemade: false,
      photo_path: 'file:///stats-deleted.jpg',
      meal_datetime: new Date('2026-04-08T19:00:00+09:00'),
      location_name: '神田',
    });
    await MealService.softDeleteMeal(deleted.id);

    const stats = await MealService.getStatistics();

    expect(kept.id).toBeDefined();
    expect(stats.totalMeals).toBe(1);
    expect(stats.favoriteCuisine).toBe('洋食');
  });

  test('filters statistics by meal_datetime period', async () => {
    await MealService.createMeal({
      meal_name: '今月のカレー',
      cuisine_type: '洋食',
      is_homemade: true,
      photo_path: 'file:///stats-this-month.jpg',
      meal_datetime: new Date('2026-04-10T19:00:00+09:00'),
    });
    await MealService.createMeal({
      meal_name: '先月のラーメン',
      cuisine_type: '中華',
      is_homemade: false,
      photo_path: 'file:///stats-last-month.jpg',
      meal_datetime: new Date('2026-03-10T19:00:00+09:00'),
    });

    const stats = await MealService.getStatistics({
      dateFrom: new Date('2026-04-01T00:00:00+09:00'),
      dateTo: new Date('2026-04-30T23:59:59.999+09:00'),
    });

    expect(stats.totalMeals).toBe(1);
    expect(stats.favoriteCuisine).toBe('洋食');
  });

  test('returns top cuisine and location rankings with stable ordering and blank values ignored', async () => {
    const meals = [
      ['カレー1', '洋食', '自宅'],
      ['カレー2', '洋食', '自宅'],
      ['寿司', '和食', '銀座'],
      ['そば', '和食', '銀座'],
      ['ラーメン', '中華', '神田'],
      ['不明', '   ', '   '],
      ['タイ料理', 'タイ', '渋谷'],
    ] as const;

    for (const [mealName, cuisineType, locationName] of meals) {
      await MealService.createMeal({
        meal_name: mealName,
        cuisine_type: cuisineType,
        location_name: locationName,
        is_homemade: false,
        photo_path: `file:///${mealName}.jpg`,
        meal_datetime: new Date('2026-04-20T19:00:00+09:00'),
      });
    }

    const stats = await MealService.getStatistics();

    expect(stats.topCuisines).toEqual([
      { label: '洋食', count: 2 },
      { label: '和食', count: 2 },
      { label: 'タイ', count: 1 },
    ]);
    expect(stats.topLocations).toEqual([
      { label: '銀座', count: 2 },
      { label: '自宅', count: 2 },
      { label: '渋谷', count: 1 },
    ]);
  });

  test('returns empty ranking arrays when there is no statistics data', async () => {
    const stats = await MealService.getStatistics();

    expect(stats.totalMeals).toBe(0);
    expect(stats.topCuisines).toEqual([]);
    expect(stats.topLocations).toEqual([]);
  });

  test('reuses a nearby saved location name when a new meal is within 100m and location text is empty', async () => {
    await MealService.createMeal({
      meal_name: '寿司',
      is_homemade: false,
      photo_path: 'file:///sushi.jpg',
      meal_datetime: new Date('2026-04-07T19:00:00+09:00'),
      location_name: '神田駅前',
      latitude: 35.6917,
      longitude: 139.7709,
    });

    const nearbyMeal = await MealService.createMeal({
      meal_name: '天丼',
      is_homemade: false,
      photo_path: 'file:///tendon.jpg',
      meal_datetime: new Date('2026-04-07T20:00:00+09:00'),
      latitude: 35.69175,
      longitude: 139.77095,
    });

    expect(nearbyMeal.location_name).toBe('神田駅前');
  });

  test('prefers the most recent nearby location name when multiple rows are within 100m', async () => {
    await MealService.createMeal({
      meal_name: '朝定食',
      is_homemade: false,
      photo_path: 'file:///old-nearby.jpg',
      meal_datetime: new Date('2026-04-05T08:00:00+09:00'),
      location_name: '古い候補',
      latitude: 35.6812,
      longitude: 139.7671,
    });

    await MealService.createMeal({
      meal_name: '昼定食',
      is_homemade: false,
      photo_path: 'file:///new-nearby.jpg',
      meal_datetime: new Date('2026-04-20T12:00:00+09:00'),
      location_name: '新しい候補',
      latitude: 35.68122,
      longitude: 139.76712,
    });

    const meal = await MealService.createMeal({
      meal_name: '夜定食',
      is_homemade: false,
      photo_path: 'file:///target-nearby.jpg',
      meal_datetime: new Date('2026-04-21T19:00:00+09:00'),
      latitude: 35.68121,
      longitude: 139.76711,
    });

    expect(meal.location_name).toBe('新しい候補');
  });

  test('returns the most recent nearby homemade default within 80m and one week', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-30T12:00:00+09:00'));

    try {
      await MealService.createMeal({
        meal_name: '古い自炊',
        is_homemade: true,
        photo_path: 'file:///old-home.jpg',
        meal_datetime: new Date('2026-04-24T12:00:00+09:00'),
        latitude: 35.681236,
        longitude: 139.767125,
      });
      await MealService.createMeal({
        meal_name: '遠い外食',
        is_homemade: false,
        photo_path: 'file:///far-takeout.jpg',
        meal_datetime: new Date('2026-04-29T12:00:00+09:00'),
        latitude: 35.7001,
        longitude: 139.8001,
      });
      await MealService.createMeal({
        meal_name: '新しい自炊',
        is_homemade: true,
        photo_path: 'file:///new-home.jpg',
        meal_datetime: new Date('2026-04-29T13:00:00+09:00'),
        latitude: 35.68124,
        longitude: 139.76713,
      });

      await expect(
        MealService.getRecentNearbyHomemadeDefault({
          latitude: 35.681236,
          longitude: 139.767125,
        })
      ).resolves.toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });

  test('returns the most recent nearby homemade default even when a farther row is newer', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-30T12:00:00+09:00'));

    try {
      await MealService.createMeal({
        meal_name: '近い自炊',
        is_homemade: true,
        photo_path: 'file:///near-home.jpg',
        meal_datetime: new Date('2026-04-28T12:00:00+09:00'),
        latitude: 35.681236,
        longitude: 139.767125,
      });
      await MealService.createMeal({
        meal_name: '近い外食',
        is_homemade: false,
        photo_path: 'file:///near-takeout.jpg',
        meal_datetime: new Date('2026-04-29T12:00:00+09:00'),
        latitude: 35.68124,
        longitude: 139.76713,
      });
      await MealService.createMeal({
        meal_name: '遠い自炊',
        is_homemade: true,
        photo_path: 'file:///far-home.jpg',
        meal_datetime: new Date('2026-04-29T13:00:00+09:00'),
        latitude: 35.7001,
        longitude: 139.8001,
      });

      await expect(
        MealService.getRecentNearbyHomemadeDefault({
          latitude: 35.681236,
          longitude: 139.767125,
        })
      ).resolves.toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  test('returns null when only stale or distant meals exist', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-30T12:00:00+09:00'));

    try {
      await MealService.createMeal({
        meal_name: '古い自炊',
        is_homemade: true,
        photo_path: 'file:///stale-home.jpg',
        meal_datetime: new Date('2026-04-20T12:00:00+09:00'),
        latitude: 35.681236,
        longitude: 139.767125,
      });
      await MealService.createMeal({
        meal_name: '遠い外食',
        is_homemade: false,
        photo_path: 'file:///distant-takeout.jpg',
        meal_datetime: new Date('2026-04-29T12:00:00+09:00'),
        latitude: 35.7001,
        longitude: 139.8001,
      });

      await expect(
        MealService.getRecentNearbyHomemadeDefault({
          latitude: 35.681236,
          longitude: 139.767125,
        })
      ).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  test('prefers the most recent nearby location when building default meal name', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-04-29T12:00:00+09:00'));

    try {
      await MealService.createMeal({
        meal_name: '先週の食事',
        is_homemade: false,
        photo_path: 'file:///default-old.jpg',
        meal_datetime: new Date('2026-04-22T12:00:00+09:00'),
        location_name: '古い店名',
        latitude: 35.7001,
        longitude: 139.7001,
      });

      await MealService.createMeal({
        meal_name: '昨日の食事',
        is_homemade: false,
        photo_path: 'file:///default-new.jpg',
        meal_datetime: new Date('2026-04-28T12:00:00+09:00'),
        location_name: '新しい店名',
        latitude: 35.70012,
        longitude: 139.70012,
      });

      const meal = await MealService.createMeal({
        meal_name: '   ',
        is_homemade: false,
        photo_path: 'file:///default-target.jpg',
        meal_datetime: new Date(2026, 3, 29, 12, 0, 0),
        latitude: 35.70011,
        longitude: 139.70011,
      });

      expect(meal.meal_name).toBe('新しい店名 の 昼食');
    } finally {
      jest.useRealTimers();
    }
  });

  test('updates meals without any semantic-search side work', async () => {
    const created = await MealService.createMeal({
      meal_name: 'カレー',
      cuisine_type: '洋食',
      is_homemade: true,
      photo_path: 'file:///curry-update.jpg',
      meal_datetime: new Date('2026-04-14T19:00:00+09:00'),
      notes: '初回',
    });
    const updated = await MealService.updateMeal(created.id, {
      notes: '更新後',
      tags: 'スパイス',
    });

    expect(updated?.notes).toBe('更新後');
    expect(updated?.tags).toBe('スパイス');
  });

  test('does not save cooking level for eating out meals', async () => {
    const meal = await MealService.createMeal({
      meal_name: 'カレー',
      is_homemade: false,
      cooking_level: 'daily',
      photo_path: 'file:///outside-curry.jpg',
      meal_datetime: new Date('2026-04-15T19:00:00+09:00'),
    });

    expect(meal.cooking_level).toBeUndefined();
  });

  test('infers homemade style for common homemade meals', async () => {
    const curry = await MealService.createMeal({
      meal_name: 'カレー',
      is_homemade: true,
      photo_path: 'file:///curry-style.jpg',
      meal_datetime: new Date('2026-04-16T19:00:00+09:00'),
    });
    const natto = await MealService.createMeal({
      meal_name: '納豆ご飯',
      is_homemade: true,
      photo_path: 'file:///natto.jpg',
      meal_datetime: new Date('2026-04-17T07:00:00+09:00'),
    });
    const roastBeef = await MealService.createMeal({
      meal_name: 'ローストビーフ',
      is_homemade: true,
      photo_path: 'file:///roast-beef.jpg',
      meal_datetime: new Date('2026-04-18T19:00:00+09:00'),
    });

    expect(curry.cooking_level).toBe('daily');
    expect(natto.cooking_level).toBe('quick');
    expect(roastBeef.cooking_level).toBe('gourmet');
  });

  test('clears cooking level when a homemade meal is updated to eating out', async () => {
    const created = await MealService.createMeal({
      meal_name: 'カレー',
      is_homemade: true,
      photo_path: 'file:///curry-clear.jpg',
      meal_datetime: new Date('2026-04-19T19:00:00+09:00'),
    });

    const updated = await MealService.updateMeal(created.id, {
      is_homemade: false,
    });

    expect(updated?.cooking_level).toBeUndefined();
  });

  describe('native database direct SQL operations', () => {
    let mockDb: {
      getAllAsync: jest.Mock;
      getFirstAsync: jest.Mock;
      runAsync: jest.Mock;
    };

    beforeEach(() => {
      mockDb = {
        getAllAsync: jest.fn(),
        getFirstAsync: jest.fn(),
        runAsync: jest.fn().mockResolvedValue(undefined),
      };
      (isUsingNativeDatabase as jest.Mock).mockReturnValue(true);
      (getDatabase as jest.Mock).mockReturnValue(mockDb);
    });

    afterEach(() => {
      (isUsingNativeDatabase as jest.Mock).mockReturnValue(false);
      (getDatabase as jest.Mock).mockReturnValue(null);
    });

    test('executes direct SQL for getRecentMeals with LIMIT and WHERE is_deleted = 0', async () => {
      mockDb.getAllAsync.mockResolvedValue([
        {
          id: 'native-1',
          uuid: 'native-1',
          meal_name: 'ステーキ',
          meal_datetime: 1000,
          is_homemade: 0,
          photo_path: 'file:///steak.jpg',
          is_deleted: 0,
          created_at: 1000,
          updated_at: 1000,
        },
      ]);

      const meals = await MealService.getRecentMeals(10);

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM meals WHERE is_deleted = 0 ORDER BY meal_datetime DESC LIMIT ?',
        10
      );
      expect(meals).toHaveLength(1);
      expect(meals[0].meal_name).toBe('ステーキ');
    });

    test('executes direct UPDATE for softDeleteMeal', async () => {
      await MealService.softDeleteMeal('target-id');

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE meals SET is_deleted = 1, updated_at = ? WHERE id = ?',
        expect.any(Number),
        'target-id'
      );
    });

    test('executes targeted SELECT for updateMeal instead of full table scan', async () => {
      mockDb.getFirstAsync.mockResolvedValue({
        id: 'target-id',
        uuid: 'target-uuid',
        meal_name: 'パスタ',
        meal_datetime: 2000,
        is_homemade: 1,
        photo_path: 'file:///pasta.jpg',
        is_deleted: 0,
        created_at: 2000,
        updated_at: 2000,
      });

      const updated = await MealService.updateMeal('target-id', {
        meal_name: 'トマトパスタ',
      });

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        'SELECT * FROM meals WHERE id = ? LIMIT 1',
        'target-id'
      );
      expect(updated?.meal_name).toBe('トマトパスタ');
    });

    test('executes indexed WHERE clause for searchMeals in native DB mode', async () => {
      mockDb.getAllAsync.mockResolvedValue([
        {
          id: 's-1',
          uuid: 's-1',
          meal_name: '味噌ラーメン',
          cuisine_type: '和食',
          location_name: '神田店',
          notes: '濃厚',
          search_text: '味噌ラーメン 和食 神田店 濃厚',
          cooking_level: null,
          meal_datetime: 3000,
          is_homemade: 0,
          photo_path: 'file:///miso.jpg',
          is_deleted: 0,
          created_at: 3000,
          updated_at: 3000,
        },
      ]);

      const meals = await MealService.searchMeals({
        cuisine_type: '和食',
        is_homemade: false,
        location_name: '神田',
        text: '味噌',
      });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        "SELECT * FROM meals WHERE is_deleted = 0 AND cuisine_type = ? AND is_homemade = ? AND location_name LIKE ? ESCAPE '\\' AND (search_text LIKE ? ESCAPE '\\' OR meal_name LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR location_name LIKE ? ESCAPE '\\') ORDER BY meal_datetime DESC",
        '和食',
        0,
        '%神田%',
        '%味噌%',
        '%味噌%',
        '%味噌%',
        '%味噌%'
      );
      expect(meals).toHaveLength(1);
      expect(meals[0].meal_name).toBe('味噌ラーメン');
    });

    test('supports legacy cooking_level aliases in SQL query', async () => {
      mockDb.getAllAsync.mockResolvedValue([
        {
          id: 'c-1',
          uuid: 'c-1',
          meal_name: '卵かけご飯',
          cooking_level: 'easy', // legacy value
          meal_datetime: 4000,
          is_homemade: 1,
          photo_path: 'file:///tkg.jpg',
          is_deleted: 0,
          created_at: 4000,
          updated_at: 4000,
        },
      ]);

      // 'quick' で検索しても SQL 側で 'quick' と 'easy' の両方を検索
      const meals = await MealService.searchMeals({
        cooking_level: 'quick',
      });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM meals WHERE is_deleted = 0 AND cooking_level IN (?, ?) ORDER BY meal_datetime DESC',
        'quick',
        'easy'
      );
      expect(meals).toHaveLength(1);
      expect(meals[0].meal_name).toBe('卵かけご飯');
      expect(meals[0].cooking_level).toBe('easy'); // raw mock row value preserved
    });

    test('escapes special LIKE characters in text and location queries', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      await MealService.searchMeals({
        location_name: '100%_store',
        text: '50%_discount',
      });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        "SELECT * FROM meals WHERE is_deleted = 0 AND location_name LIKE ? ESCAPE '\\' AND (search_text LIKE ? ESCAPE '\\' OR meal_name LIKE ? ESCAPE '\\' OR notes LIKE ? ESCAPE '\\' OR location_name LIKE ? ESCAPE '\\') ORDER BY meal_datetime DESC",
        '%100\\%\\_store%',
        '%50\\%\\_discount%',
        '%50\\%\\_discount%',
        '%50\\%\\_discount%',
        '%50\\%\\_discount%'
      );
    });

    test('appends LIMIT and OFFSET clauses in SQL query when pagination parameters are provided', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      await MealService.searchMeals({
        limit: 60,
        offset: 120,
      });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM meals WHERE is_deleted = 0 ORDER BY meal_datetime DESC LIMIT ? OFFSET ?',
        60,
        120
      );
    });

    test('appends LIMIT clause without OFFSET when only limit is provided', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      await MealService.searchMeals({
        limit: 60,
      });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM meals WHERE is_deleted = 0 ORDER BY meal_datetime DESC LIMIT ?',
        60
      );
    });

    test('appends LIMIT -1 OFFSET clause when only offset is provided', async () => {
      mockDb.getAllAsync.mockResolvedValue([]);

      await MealService.searchMeals({
        offset: 30,
      });

      expect(mockDb.getAllAsync).toHaveBeenCalledWith(
        'SELECT * FROM meals WHERE is_deleted = 0 ORDER BY meal_datetime DESC LIMIT -1 OFFSET ?',
        30
      );
    });

    test('relies purely on SQL filtering without duplicate JS filtering in native DB mode', async () => {
      const mockRows = [
        {
          id: 'sql-1',
          uuid: 'sql-1',
          meal_name: '特製ラーメン',
          cuisine_type: 'ラーメン',
          location_name: '東京駅',
          notes: '魚介豚骨',
          search_text: '特製ラーメン ラーメン 東京駅 魚介豚骨',
          cooking_level: null,
          meal_datetime: 5000,
          is_homemade: 0,
          photo_path: 'file:///ramen.jpg',
          is_deleted: 0,
          created_at: 5000,
          updated_at: 5000,
        },
      ];
      mockDb.getAllAsync.mockResolvedValue(mockRows);

      const meals = await MealService.searchMeals({
        text: '特製',
        location_name: '東京',
        limit: 10,
        offset: 0,
      });

      // SQL provides the single filtering guarantee; rows returned from SQL are directly mapped
      expect(meals).toHaveLength(1);
      expect(meals[0].id).toBe('sql-1');
      expect(meals[0].meal_name).toBe('特製ラーメン');
    });

    test('executes conditional atomic UPDATE for updateMealThumbnail in native DB mode', async () => {
      mockDb.runAsync.mockResolvedValueOnce({ changes: 1, lastInsertRowId: 1 });

      const success = await MealService.updateMealThumbnail(
        'meal-123',
        'file:///thumb.jpg',
        'file:///photo-orig.jpg'
      );

      expect(mockDb.runAsync).toHaveBeenCalledWith(
        'UPDATE meals SET photo_thumbnail_path = ?, updated_at = ? WHERE id = ? AND photo_path = ? AND is_deleted = 0',
        'file:///thumb.jpg',
        expect.any(Number),
        'meal-123',
        'file:///photo-orig.jpg'
      );
      expect(success).toBe(true);

      mockDb.runAsync.mockResolvedValueOnce({ changes: 0, lastInsertRowId: 0 });

      const failure = await MealService.updateMealThumbnail(
        'meal-123',
        'file:///thumb.jpg',
        'file:///stale-photo.jpg'
      );

      expect(failure).toBe(false);
    });

    test('executes direct SQL aggregation for getStatistics and never executes SELECT * FROM meals', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ total: 5, homemade: 3 });
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          { label: '和食', count: 3 },
          { label: '洋食', count: 2 },
        ])
        .mockResolvedValueOnce([
          { label: '自宅', count: 4 },
          { label: '銀座', count: 1 },
        ]);

      const stats = await MealService.getStatistics();

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        'SELECT COUNT(*) AS total, SUM(CASE WHEN is_homemade = 1 THEN 1 ELSE 0 END) AS homemade FROM meals WHERE is_deleted = 0'
      );
      expect(mockDb.getAllAsync).toHaveBeenNthCalledWith(
        1,
        "SELECT TRIM(cuisine_type) AS label, COUNT(*) AS count FROM meals WHERE is_deleted = 0 AND cuisine_type IS NOT NULL AND TRIM(cuisine_type) != '' GROUP BY TRIM(cuisine_type) ORDER BY count DESC"
      );
      expect(mockDb.getAllAsync).toHaveBeenNthCalledWith(
        2,
        "SELECT TRIM(location_name) AS label, COUNT(*) AS count FROM meals WHERE is_deleted = 0 AND location_name IS NOT NULL AND TRIM(location_name) != '' GROUP BY TRIM(location_name) ORDER BY count DESC"
      );

      // Verify SELECT * was NEVER called
      const allSqlCalls = [
        ...mockDb.getFirstAsync.mock.calls.map((call) => call[0]),
        ...mockDb.getAllAsync.mock.calls.map((call) => call[0]),
      ];
      expect(allSqlCalls.some((sql) => typeof sql === 'string' && sql.includes('SELECT *'))).toBe(false);

      expect(stats.totalMeals).toBe(5);
      expect(stats.homemadeMeals).toBe(3);
      expect(stats.takeoutMeals).toBe(2);
      expect(stats.favoriteCuisine).toBe('和食');
      expect(stats.favoriteLocation).toBe('自宅');
      expect(stats.topCuisines).toEqual([
        { label: '和食', count: 3 },
        { label: '洋食', count: 2 },
      ]);
      expect(stats.topLocations).toEqual([
        { label: '自宅', count: 4 },
        { label: '銀座', count: 1 },
      ]);
    });

    test('Case 1: handles empty dataset gracefully in native DB mode', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ total: 0, homemade: null });
      mockDb.getAllAsync.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const stats = await MealService.getStatistics();

      expect(stats).toEqual({
        totalMeals: 0,
        homemadeMeals: 0,
        takeoutMeals: 0,
        favoriteCuisine: undefined,
        favoriteLocation: undefined,
        topCuisines: [],
        topLocations: [],
      });
    });

    test('Case 2: handles single record correctly in native DB mode', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ total: 1, homemade: 1 });
      mockDb.getAllAsync
        .mockResolvedValueOnce([{ label: '和食', count: 1 }])
        .mockResolvedValueOnce([{ label: '自宅', count: 1 }]);

      const stats = await MealService.getStatistics();

      expect(stats).toEqual({
        totalMeals: 1,
        homemadeMeals: 1,
        takeoutMeals: 0,
        favoriteCuisine: '和食',
        favoriteLocation: '自宅',
        topCuisines: [{ label: '和食', count: 1 }],
        topLocations: [{ label: '自宅', count: 1 }],
      });
    });

    test('Case 3: includes is_deleted = 0 in all native statistics SQL queries', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ total: 0, homemade: 0 });
      mockDb.getAllAsync.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      await MealService.getStatistics();

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        expect.stringContaining('is_deleted = 0')
      );
      expect(mockDb.getAllAsync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining('is_deleted = 0')
      );
      expect(mockDb.getAllAsync).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining('is_deleted = 0')
      );
    });

    test('Case 4 & 5: excludes NULL and blank/whitespace values in SQL and JS normalization', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ total: 3, homemade: 1 });
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          { label: '和食', count: 2 },
          { label: '   ', count: 1 },
          { label: '', count: 1 },
        ])
        .mockResolvedValueOnce([
          { label: '自宅', count: 2 },
          { label: '  ', count: 1 },
        ]);

      const stats = await MealService.getStatistics();

      // Check SQL queries contain NULL and TRIM checks
      expect(mockDb.getAllAsync).toHaveBeenNthCalledWith(
        1,
        expect.stringContaining("cuisine_type IS NOT NULL AND TRIM(cuisine_type) != ''")
      );
      expect(mockDb.getAllAsync).toHaveBeenNthCalledWith(
        2,
        expect.stringContaining("location_name IS NOT NULL AND TRIM(location_name) != ''")
      );

      // Verify JS post-normalization filters out any empty/whitespace rows
      expect(stats.topCuisines).toEqual([{ label: '和食', count: 2 }]);
      expect(stats.topLocations).toEqual([{ label: '自宅', count: 2 }]);
    });

    test('Case 6: limits top cuisines and locations to maximum 3 items', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ total: 10, homemade: 5 });
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          { label: '和食', count: 4 },
          { label: '洋食', count: 3 },
          { label: '中華', count: 2 },
          { label: 'イタリアン', count: 1 },
        ])
        .mockResolvedValueOnce([
          { label: '自宅', count: 4 },
          { label: '神田', count: 3 },
          { label: '銀座', count: 2 },
          { label: '渋谷', count: 1 },
        ]);

      const stats = await MealService.getStatistics();

      expect(stats.topCuisines).toHaveLength(3);
      expect(stats.topCuisines).toEqual([
        { label: '和食', count: 4 },
        { label: '洋食', count: 3 },
        { label: '中華', count: 2 },
      ]);
      expect(stats.topLocations).toHaveLength(3);
      expect(stats.topLocations).toEqual([
        { label: '自宅', count: 4 },
        { label: '神田', count: 3 },
        { label: '銀座', count: 2 },
      ]);
    });

    test('Case 7: breaks ties using ja localeCompare identically to existing JS implementation', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ total: 6, homemade: 2 });
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          { label: '和食', count: 2 },
          { label: '洋食', count: 2 },
          { label: 'タイ', count: 1 },
        ])
        .mockResolvedValueOnce([
          { label: '自宅', count: 2 },
          { label: '銀座', count: 2 },
          { label: '渋谷', count: 1 },
        ]);

      const stats = await MealService.getStatistics();

      expect(stats.topCuisines).toEqual([
        { label: '洋食', count: 2 },
        { label: '和食', count: 2 },
        { label: 'タイ', count: 1 },
      ]);
      expect(stats.topLocations).toEqual([
        { label: '銀座', count: 2 },
        { label: '自宅', count: 2 },
        { label: '渋谷', count: 1 },
      ]);
      expect(stats.favoriteCuisine).toBe('洋食');
      expect(stats.favoriteLocation).toBe('銀座');
    });

    test('Case 8: handles dateFrom and dateTo boundaries inclusively with correct SQL parameters', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ total: 2, homemade: 1 });
      mockDb.getAllAsync.mockResolvedValueOnce([]).mockResolvedValueOnce([]);

      const from = new Date('2026-04-01T00:00:00.000+09:00');
      const to = new Date('2026-04-30T23:59:59.999+09:00');

      await MealService.getStatistics({ dateFrom: from, dateTo: to });

      const expectedWhere =
        'is_deleted = 0 AND meal_datetime >= ? AND meal_datetime <= ?';

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        `SELECT COUNT(*) AS total, SUM(CASE WHEN is_homemade = 1 THEN 1 ELSE 0 END) AS homemade FROM meals WHERE ${expectedWhere}`,
        from.getTime(),
        to.getTime()
      );
      expect(mockDb.getAllAsync).toHaveBeenNthCalledWith(
        1,
        `SELECT TRIM(cuisine_type) AS label, COUNT(*) AS count FROM meals WHERE ${expectedWhere} AND cuisine_type IS NOT NULL AND TRIM(cuisine_type) != '' GROUP BY TRIM(cuisine_type) ORDER BY count DESC`,
        from.getTime(),
        to.getTime()
      );
      expect(mockDb.getAllAsync).toHaveBeenNthCalledWith(
        2,
        `SELECT TRIM(location_name) AS label, COUNT(*) AS count FROM meals WHERE ${expectedWhere} AND location_name IS NOT NULL AND TRIM(location_name) != '' GROUP BY TRIM(location_name) ORDER BY count DESC`,
        from.getTime(),
        to.getTime()
      );
    });

    test('Case 9: supports various date filter configurations (dateFrom only, dateTo only, neither)', async () => {
      const from = new Date('2026-04-01T00:00:00.000+09:00');
      const to = new Date('2026-04-30T23:59:59.999+09:00');

      // 1. dateFrom only
      mockDb.getFirstAsync.mockResolvedValueOnce({ total: 1, homemade: 0 });
      mockDb.getAllAsync.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      await MealService.getStatistics({ dateFrom: from });
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        'SELECT COUNT(*) AS total, SUM(CASE WHEN is_homemade = 1 THEN 1 ELSE 0 END) AS homemade FROM meals WHERE is_deleted = 0 AND meal_datetime >= ?',
        from.getTime()
      );

      // 2. dateTo only
      mockDb.getFirstAsync.mockResolvedValueOnce({ total: 1, homemade: 0 });
      mockDb.getAllAsync.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      await MealService.getStatistics({ dateTo: to });
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        'SELECT COUNT(*) AS total, SUM(CASE WHEN is_homemade = 1 THEN 1 ELSE 0 END) AS homemade FROM meals WHERE is_deleted = 0 AND meal_datetime <= ?',
        to.getTime()
      );

      // 3. neither (all period)
      mockDb.getFirstAsync.mockResolvedValueOnce({ total: 1, homemade: 0 });
      mockDb.getAllAsync.mockResolvedValueOnce([]).mockResolvedValueOnce([]);
      await MealService.getStatistics({});
      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        'SELECT COUNT(*) AS total, SUM(CASE WHEN is_homemade = 1 THEN 1 ELSE 0 END) AS homemade FROM meals WHERE is_deleted = 0'
      );
    });

    test('Unit Mock: Native SQLite aggregation query shape matches expected SQL and params', async () => {
      mockDb.getFirstAsync.mockResolvedValueOnce({ total: 7, homemade: 2 });
      mockDb.getAllAsync
        .mockResolvedValueOnce([
          { label: '洋食', count: 2 },
          { label: '和食', count: 2 },
          { label: 'タイ', count: 1 },
          { label: '中華', count: 1 },
        ])
        .mockResolvedValueOnce([
          { label: '自宅', count: 2 },
          { label: '銀座', count: 2 },
          { label: '渋谷', count: 1 },
          { label: '神田', count: 1 },
        ]);

      const nativeResult = await MealService.getStatistics();

      expect(mockDb.getFirstAsync).toHaveBeenCalledWith(
        'SELECT COUNT(*) AS total, SUM(CASE WHEN is_homemade = 1 THEN 1 ELSE 0 END) AS homemade FROM meals WHERE is_deleted = 0'
      );
      expect(mockDb.getAllAsync).toHaveBeenNthCalledWith(
        1,
        "SELECT TRIM(cuisine_type) AS label, COUNT(*) AS count FROM meals WHERE is_deleted = 0 AND cuisine_type IS NOT NULL AND TRIM(cuisine_type) != '' GROUP BY TRIM(cuisine_type) ORDER BY count DESC"
      );
      expect(mockDb.getAllAsync).toHaveBeenNthCalledWith(
        2,
        "SELECT TRIM(location_name) AS label, COUNT(*) AS count FROM meals WHERE is_deleted = 0 AND location_name IS NOT NULL AND TRIM(location_name) != '' GROUP BY TRIM(location_name) ORDER BY count DESC"
      );
      expect(nativeResult.totalMeals).toBe(7);
      expect(nativeResult.homemadeMeals).toBe(2);
      expect(nativeResult.takeoutMeals).toBe(5);
    });
  });

  describe('real SQLite parity tests', () => {
    function createRealSqliteDatabase() {
      const { DatabaseSync } = require('node:sqlite');
      const realDb = new DatabaseSync(':memory:');

      realDb.exec(`
        CREATE TABLE meals (
          id TEXT PRIMARY KEY NOT NULL,
          uuid TEXT NOT NULL,
          meal_name TEXT NOT NULL,
          meal_type TEXT,
          cuisine_type TEXT,
          ai_confidence REAL,
          ai_source TEXT,
          notes TEXT,
          cooking_level TEXT,
          is_homemade INTEGER NOT NULL DEFAULT 0,
          photo_path TEXT NOT NULL,
          photo_thumbnail_path TEXT,
          location_name TEXT,
          latitude REAL,
          longitude REAL,
          meal_datetime INTEGER NOT NULL,
          search_text TEXT,
          tags TEXT,
          is_deleted INTEGER NOT NULL DEFAULT 0,
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
      `);

      const insertStmt = realDb.prepare(`
        INSERT INTO meals (
          id, uuid, meal_name, meal_type, cuisine_type, ai_confidence, ai_source,
          notes, cooking_level, is_homemade, photo_path, photo_thumbnail_path,
          location_name, latitude, longitude, meal_datetime, search_text,
          tags, is_deleted, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      return {
        insertMeal(row: any) {
          insertStmt.run(
            row.id,
            row.uuid ?? row.id,
            row.meal_name,
            row.meal_type ?? null,
            row.cuisine_type ?? null,
            row.ai_confidence ?? null,
            row.ai_source ?? null,
            row.notes ?? null,
            row.cooking_level ?? null,
            row.is_homemade ? 1 : 0,
            row.photo_path ?? 'file:///photo.jpg',
            row.photo_thumbnail_path ?? null,
            row.location_name ?? null,
            row.latitude ?? null,
            row.longitude ?? null,
            row.meal_datetime,
            row.search_text ?? null,
            row.tags ?? null,
            row.is_deleted ? 1 : 0,
            row.created_at ?? row.meal_datetime,
            row.updated_at ?? row.meal_datetime
          );
        },
        adapter: {
          getAllAsync: async (sql: string, ...params: any[]) => {
            return realDb.prepare(sql).all(...params);
          },
          getFirstAsync: async (sql: string, ...params: any[]) => {
            return realDb.prepare(sql).get(...params) ?? null;
          },
          runAsync: async (sql: string, ...params: any[]) => {
            const info = realDb.prepare(sql).run(...params);
            return { changes: info.changes, lastInsertRowId: Number(info.lastInsertRowid) };
          },
        },
      };
    }

    const parityTestRows = [
      // 境界値1 (start boundary): 2000
      {
        id: '1',
        uuid: 'u1',
        meal_name: 'カレー1',
        cuisine_type: '洋食',
        location_name: '自宅',
        is_homemade: 1,
        meal_datetime: 2000,
        is_deleted: 0,
      },
      // 範囲内: 2500 (空白付き -> TRIM対象)
      {
        id: '2',
        uuid: 'u2',
        meal_name: 'カレー2',
        cuisine_type: '  洋食  ',
        location_name: '自宅',
        is_homemade: 0,
        meal_datetime: 2500,
        is_deleted: 0,
      },
      // 範囲内: 3000
      {
        id: '3',
        uuid: 'u3',
        meal_name: '寿司',
        cuisine_type: '和食',
        location_name: '銀座',
        is_homemade: 0,
        meal_datetime: 3000,
        is_deleted: 0,
      },
      // 範囲内: 4000
      {
        id: '4',
        uuid: 'u4',
        meal_name: 'そば',
        cuisine_type: '和食',
        location_name: '銀座',
        is_homemade: 1,
        meal_datetime: 4000,
        is_deleted: 0,
      },
      // 範囲内: 4500 (中華 1, 神田 1)
      {
        id: '5',
        uuid: 'u5',
        meal_name: 'ラーメン',
        cuisine_type: '中華',
        location_name: '神田',
        is_homemade: 0,
        meal_datetime: 4500,
        is_deleted: 0,
      },
      // 範囲内: 5000 (タイ 1, 渋谷 1)
      {
        id: '6',
        uuid: 'u6',
        meal_name: 'タイ料理',
        cuisine_type: 'タイ',
        location_name: '渋谷',
        is_homemade: 0,
        meal_datetime: 5000,
        is_deleted: 0,
      },
      // 境界値2 (end boundary): 6000 (空白のみ)
      {
        id: '7',
        uuid: 'u7',
        meal_name: '空白のみ',
        cuisine_type: '   ',
        location_name: '   ',
        is_homemade: 0,
        meal_datetime: 6000,
        is_deleted: 0,
      },
      // 範囲内: 3500 (NULL値)
      {
        id: '8',
        uuid: 'u8',
        meal_name: 'NULL値',
        cuisine_type: null,
        location_name: null,
        is_homemade: 0,
        meal_datetime: 3500,
        is_deleted: 0,
      },
      // 範囲内: 3600 (削除済み: is_deleted = 1)
      {
        id: '9',
        uuid: 'u9',
        meal_name: '削除済み',
        cuisine_type: 'イタリアン',
        location_name: '新宿',
        is_homemade: 1,
        meal_datetime: 3600,
        is_deleted: 1,
      },
      // 範囲外 (過去): 1000 (< 2000)
      {
        id: '10',
        uuid: 'u10',
        meal_name: '過去データ',
        cuisine_type: 'フレンチ',
        location_name: '六本木',
        is_homemade: 0,
        meal_datetime: 1000,
        is_deleted: 0,
      },
      // 範囲外 (未来): 7000 (> 6000)
      {
        id: '11',
        uuid: 'u11',
        meal_name: '未来データ',
        cuisine_type: '韓国料理',
        location_name: '新大久保',
        is_homemade: 1,
        meal_datetime: 7000,
        is_deleted: 0,
      },
    ];

    let realDbFixture: ReturnType<typeof createRealSqliteDatabase>;

    beforeEach(() => {
      realDbFixture = createRealSqliteDatabase();
      parityTestRows.forEach((row) => realDbFixture.insertMeal(row));

      (isUsingNativeDatabase as jest.Mock).mockReturnValue(true);
      (getDatabase as jest.Mock).mockReturnValue(realDbFixture.adapter);
    });

    afterEach(() => {
      (isUsingNativeDatabase as jest.Mock).mockReturnValue(false);
      (getDatabase as jest.Mock).mockReturnValue(null);
    });

    test('Parity: Real SQLite executes actual SQL aggregation matching InMemory baseline for all periods', async () => {
      // 1. InMemory基準値を算出（filterRowsForStatistics + buildStatisticsSummary）
      const inMemoryBaseline = buildStatisticsSummary(
        filterRowsForStatistics(parityTestRows as any[], {})
      );

      // 2. 実SQLiteに対して MealService.getStatistics を実行（クエリ結果をモックせず実SQL集計）
      const nativeResult = await MealService.getStatistics({});

      // 3. InMemory基準値と実SQLite集計結果の完全一致を検証
      expect(nativeResult).toEqual(inMemoryBaseline);

      // 主要な集計値の内訳を明示的に検証
      expect(nativeResult.totalMeals).toBe(10); // 11件中 is_deleted=1 の1件を除外
      expect(nativeResult.homemadeMeals).toBe(3); // id 1, 4, 11 (id 9は削除済)
      expect(nativeResult.takeoutMeals).toBe(7);

      // Top 3 とタイブレーク（localeCompare 'ja'）の動作を実SQLite集計データで検証
      expect(nativeResult.topCuisines).toEqual([
        { label: '洋食', count: 2 },
        { label: '和食', count: 2 },
        { label: 'タイ', count: 1 },
      ]);
      expect(nativeResult.favoriteCuisine).toBe('洋食');

      expect(nativeResult.topLocations).toEqual([
        { label: '銀座', count: 2 },
        { label: '自宅', count: 2 },
        { label: '渋谷', count: 1 },
      ]);
      expect(nativeResult.favoriteLocation).toBe('銀座');
    });

    test('Parity: Real SQLite executes actual SQL aggregation matching InMemory baseline with date range', async () => {
      const options = {
        dateFrom: new Date(2000), // 境界値 2000 は含む
        dateTo: new Date(6000), // 境界値 6000 は含む
      };

      // 1. InMemory基準値を算出
      const inMemoryBaseline = buildStatisticsSummary(
        filterRowsForStatistics(parityTestRows as any[], options)
      );

      // 2. 実SQLiteに対して日付範囲指定で集計実行（実SQL: meal_datetime >= 2000 AND meal_datetime <= 6000）
      const nativeResult = await MealService.getStatistics(options);

      // 3. 範囲内・境界値・範囲外（1000, 7000）・削除（3600）の除外がInMemoryと完全一致することを検証
      expect(nativeResult).toEqual(inMemoryBaseline);

      expect(nativeResult.totalMeals).toBe(8); // id 1..8 (id 9削除、10過去、11未来を除外)
      expect(nativeResult.homemadeMeals).toBe(2); // id 1, 4
      expect(nativeResult.takeoutMeals).toBe(6);
      expect(nativeResult.topCuisines).toEqual([
        { label: '洋食', count: 2 },
        { label: '和食', count: 2 },
        { label: 'タイ', count: 1 },
      ]);
      expect(nativeResult.topLocations).toEqual([
        { label: '銀座', count: 2 },
        { label: '自宅', count: 2 },
        { label: '渋谷', count: 1 },
      ]);
    });

    test('Parity: Real SQLite executes searchMeals with filters and pagination matching InMemory baseline', async () => {
      // 1. 複数条件（和食・外食）+ ページネーション（limit: 1, offset: 0）
      const nativePage1 = await MealService.searchMeals({
        cuisine_type: '和食',
        is_homemade: false,
        limit: 1,
        offset: 0,
      });
      expect(nativePage1).toHaveLength(1);
      expect(nativePage1[0].id).toBe('3'); // 寿司 (datetime: 3000)

      // 2. テキスト検索 ('ラーメン')
      const ramenResult = await MealService.searchMeals({
        text: 'ラーメン',
      });
      expect(ramenResult).toHaveLength(1);
      expect(ramenResult[0].id).toBe('5');
      expect(ramenResult[0].meal_name).toBe('ラーメン');

      // 3. 削除済みレコード (id: 9) が除外されること
      const allActive = await MealService.searchMeals({});
      expect(allActive.find((m) => m.id === '9')).toBeUndefined();
      expect(allActive).toHaveLength(10); // 11件中 削除1件を除外
    });
  });
});
