import { MealService } from '../src/database/services/MealService';

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
});
