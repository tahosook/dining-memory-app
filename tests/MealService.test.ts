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
});
