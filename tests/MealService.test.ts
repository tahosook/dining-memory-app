import { MealService } from '../src/database/services/MealService';
import { MealEmbeddingService } from '../src/database/services/MealEmbeddingService';
import { SemanticSearchService } from '../src/database/services/SemanticSearchService';

jest.mock('../src/ai/runtime', () => ({
  getLocalLlamaTextEmbeddingAvailability: jest.fn(async () => ({
    kind: 'unavailable',
    capability: 'text-embedding',
    mode: 'local-runtime-prototype',
    code: 'runtime_unavailable',
    reason: 'test unavailable',
  })),
}));

jest.mock('../src/database/services/SemanticSearchService', () => ({
  SemanticSearchService: {
    scoreMeals: jest.fn(async () => []),
  },
}));

jest.mock('../src/database/services/localDatabase', () => {
  type MockMealRow = Record<string, unknown>;
  type MockSearchVectorRow = Record<string, unknown>;
  let meals: MockMealRow[] = [];
  let searchVectors: MockSearchVectorRow[] = [];

  return {
    initializeDatabase: jest.fn(async () => {}),
    getDatabase: jest.fn(() => null),
    isUsingNativeDatabase: jest.fn(() => false),
    getInMemoryMeals: jest.fn(() => [...meals]),
    setInMemoryMeals: jest.fn((nextMeals) => {
      meals = [...nextMeals];
    }),
    getInMemorySearchVectors: jest.fn(() => [...searchVectors]),
    setInMemorySearchVectors: jest.fn((nextSearchVectors) => {
      searchVectors = [...nextSearchVectors];
    }),
    resetInMemoryDatabase: jest.fn(() => {
      meals = [];
      searchVectors = [];
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
    (SemanticSearchService.scoreMeals as jest.Mock).mockResolvedValue([]);
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

  test('keeps lexical matches ahead of semantic-only matches', async () => {
    const ramen = await MealService.createMeal({
      meal_name: '醤油ラーメン',
      is_homemade: false,
      photo_path: 'file:///ramen-hybrid.jpg',
      meal_datetime: new Date('2026-04-17T19:00:00+09:00'),
      location_name: '神田',
    });
    const curry = await MealService.createMeal({
      meal_name: 'チキンカレー',
      is_homemade: true,
      photo_path: 'file:///curry-hybrid.jpg',
      meal_datetime: new Date('2026-04-16T19:00:00+09:00'),
      location_name: '自宅',
    });
    (SemanticSearchService.scoreMeals as jest.Mock).mockResolvedValue([
      { mealId: curry.id, score: 0.95 },
      { mealId: ramen.id, score: 0.4 },
    ]);

    const meals = await MealService.searchMeals({
      text: 'ラーメン',
    });

    expect(meals.map((meal) => meal.id)).toEqual([ramen.id, curry.id]);
  });

  test('keeps non-text filters in front of semantic matches', async () => {
    const homeMeal = await MealService.createMeal({
      meal_name: '海鮮丼',
      is_homemade: true,
      photo_path: 'file:///kaisen-home.jpg',
      meal_datetime: new Date('2026-04-18T19:00:00+09:00'),
      location_name: '自宅',
    });
    const officeMeal = await MealService.createMeal({
      meal_name: 'サラダ',
      is_homemade: false,
      photo_path: 'file:///salad-office.jpg',
      meal_datetime: new Date('2026-04-18T12:00:00+09:00'),
      location_name: '会社',
    });
    (SemanticSearchService.scoreMeals as jest.Mock).mockResolvedValue([
      { mealId: officeMeal.id, score: 0.99 },
      { mealId: homeMeal.id, score: 0.75 },
    ]);

    const meals = await MealService.searchMeals({
      text: '魚料理',
      location_name: '自宅',
    });

    expect(meals.map((meal) => meal.id)).toEqual([homeMeal.id]);
    expect(SemanticSearchService.scoreMeals).toHaveBeenCalledWith(
      '魚料理',
      [expect.objectContaining({ id: homeMeal.id })]
    );
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

  test('createMeal does not wait for the embedding refresh promise', async () => {
    const refreshSpy = jest
      .spyOn(MealEmbeddingService, 'refreshEmbeddingForMeal')
      .mockImplementation(() => new Promise(() => {}));

    const result = await Promise.race([
      MealService.createMeal({
        meal_name: 'うどん',
        is_homemade: true,
        photo_path: 'file:///udon.jpg',
        meal_datetime: new Date('2026-04-13T12:00:00+09:00'),
      }).then((meal) => meal.meal_name),
      new Promise((resolve) => setTimeout(() => resolve('timeout'), 20)),
    ]);

    expect(result).toBe('うどん');
    expect(refreshSpy).toHaveBeenCalledTimes(1);
  });

  test('updateMeal refreshes embeddings with the saved fields', async () => {
    const refreshSpy = jest
      .spyOn(MealEmbeddingService, 'refreshEmbeddingForMeal')
      .mockResolvedValue(null);

    const created = await MealService.createMeal({
      meal_name: 'カレー',
      cuisine_type: '洋食',
      is_homemade: true,
      photo_path: 'file:///curry-update.jpg',
      meal_datetime: new Date('2026-04-14T19:00:00+09:00'),
      notes: '初回',
    });
    refreshSpy.mockClear();

    const updated = await MealService.updateMeal(created.id, {
      notes: '更新後',
      tags: 'スパイス',
    });

    expect(updated?.notes).toBe('更新後');
    expect(refreshSpy).toHaveBeenCalledWith(expect.objectContaining({
      id: created.id,
      meal_name: 'カレー',
      cuisine_type: '洋食',
      notes: '更新後',
      tags: 'スパイス',
    }));
  });

  test('backfillMissingEmbeddings only targets non-deleted meals', async () => {
    const backfillSpy = jest
      .spyOn(MealEmbeddingService, 'backfillMissingEmbeddings')
      .mockResolvedValue();

    const first = await MealService.createMeal({
      meal_name: '寿司',
      is_homemade: false,
      photo_path: 'file:///sushi-backfill.jpg',
      meal_datetime: new Date('2026-04-15T19:00:00+09:00'),
    });
    await MealService.createMeal({
      meal_name: 'パスタ',
      is_homemade: true,
      photo_path: 'file:///pasta-backfill.jpg',
      meal_datetime: new Date('2026-04-16T19:00:00+09:00'),
    });
    await MealService.softDeleteMeal(first.id);
    backfillSpy.mockClear();

    await MealService.backfillMissingEmbeddings();

    expect(backfillSpy).toHaveBeenCalledWith([
      expect.objectContaining({
        meal_name: 'パスタ',
      }),
    ]);
  });
});
