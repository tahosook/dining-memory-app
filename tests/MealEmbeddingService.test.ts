describe('MealEmbeddingService', () => {
  afterEach(() => {
    jest.resetModules();
    jest.dontMock('react-native');
    jest.dontMock('expo-sqlite');
    jest.dontMock('../src/ai/runtime');
  });

  async function loadServiceModules(options?: {
    availability?: Awaited<ReturnType<typeof import('../src/ai/runtime').getLocalLlamaTextEmbeddingAvailability>>;
  }) {
    jest.doMock('react-native', () => ({
      Platform: { OS: 'web' },
    }));
    jest.doMock('expo-sqlite', () => ({
      openDatabaseSync: jest.fn(),
    }));
    const getLocalLlamaTextEmbeddingAvailability = jest.fn(async () => (
      options?.availability ?? {
        kind: 'unavailable' as const,
        capability: 'text-embedding' as const,
        mode: 'local-runtime-prototype' as const,
        code: 'runtime_unavailable' as const,
        reason: 'test unavailable',
      }
    ));
    jest.doMock('../src/ai/runtime', () => ({
      getLocalLlamaTextEmbeddingAvailability,
    }));

    let localDatabase!: typeof import('../src/database/services/localDatabase');
    let mealEmbeddingModule!: typeof import('../src/database/services/MealEmbeddingService');

    jest.isolateModules(() => {
      localDatabase = require('../src/database/services/localDatabase');
      mealEmbeddingModule = require('../src/database/services/MealEmbeddingService');
    });

    localDatabase.resetInMemoryDatabase();

    return {
      localDatabase,
      MealEmbeddingService: mealEmbeddingModule.MealEmbeddingService,
      getLocalLlamaTextEmbeddingAvailability,
    };
  }

  test('upserts and retrieves meal embeddings in the in-memory fallback', async () => {
    const { MealEmbeddingService } = await loadServiceModules();

    const saved = await MealEmbeddingService.upsertEmbedding({
      mealId: 'meal-1',
      vector: [0.11, 0.22, 0.33],
      vectorModel: 'local-semantic-search',
      indexedText: '海鮮丼 和食',
      textVersion: 1,
    });

    expect(saved.vectorDimension).toBe(3);

    await expect(MealEmbeddingService.getEmbedding('meal-1')).resolves.toEqual(saved);
    await expect(MealEmbeddingService.listEmbeddings()).resolves.toEqual([saved]);
  });

  test('preserves createdAt when an embedding row is overwritten', async () => {
    const { MealEmbeddingService } = await loadServiceModules();

    const first = await MealEmbeddingService.upsertEmbedding({
      mealId: 'meal-2',
      vector: [0.1, 0.2],
      vectorModel: 'local-semantic-search',
      indexedText: '親子丼',
      textVersion: 1,
    });

    const second = await MealEmbeddingService.upsertEmbedding({
      mealId: 'meal-2',
      vector: [0.9, 0.8],
      vectorModel: 'local-semantic-search',
      indexedText: '親子丼 卵',
      textVersion: 2,
    });

    expect(second.createdAt).toBe(first.createdAt);
    expect(second.updatedAt).toBeGreaterThanOrEqual(first.updatedAt);
    expect(second.vector).toEqual([0.9, 0.8]);
    expect(second.textVersion).toBe(2);
  });

  test('deletes and clears embedding rows', async () => {
    const { MealEmbeddingService } = await loadServiceModules();

    await MealEmbeddingService.upsertEmbedding({
      mealId: 'meal-3',
      vector: [0.4, 0.5],
      vectorModel: 'local-semantic-search',
      indexedText: 'ラーメン',
      textVersion: 1,
    });
    await MealEmbeddingService.upsertEmbedding({
      mealId: 'meal-4',
      vector: [0.6, 0.7],
      vectorModel: 'local-semantic-search',
      indexedText: 'パスタ',
      textVersion: 1,
    });

    await MealEmbeddingService.deleteEmbedding('meal-3');
    await expect(MealEmbeddingService.getEmbedding('meal-3')).resolves.toBeNull();

    await MealEmbeddingService.clearAllEmbeddings();
    await expect(MealEmbeddingService.listEmbeddings()).resolves.toEqual([]);
  });

  test('marks stale rows only when text, version, or model changes', async () => {
    const { MealEmbeddingService } = await loadServiceModules();

    const current = await MealEmbeddingService.upsertEmbedding({
      mealId: 'meal-5',
      vector: [0.5, 0.6],
      vectorModel: 'local-semantic-search',
      indexedText: 'カレー 自宅',
      textVersion: 1,
    });

    expect(
      MealEmbeddingService.isStale(current, {
        indexedText: 'カレー 自宅',
        textVersion: 1,
        vectorModel: 'local-semantic-search',
      })
    ).toBe(false);

    expect(
      MealEmbeddingService.isStale(current, {
        indexedText: 'カレー 自宅 夜',
        textVersion: 1,
        vectorModel: 'local-semantic-search',
      })
    ).toBe(true);

    expect(
      MealEmbeddingService.isStale(current, {
        indexedText: 'カレー 自宅',
        textVersion: 2,
        vectorModel: 'local-semantic-search',
      })
    ).toBe(true);

    expect(
      MealEmbeddingService.isStale(current, {
        indexedText: 'カレー 自宅',
        textVersion: 1,
        vectorModel: 'other-model',
      })
    ).toBe(true);
  });

  test('generates and stores an embedding when a ready runtime is available', async () => {
    const provider = {
      modelId: 'local-semantic-search',
      generateEmbedding: jest.fn(async () => ({
        vector: [0.12, 0.34, 0.56],
        modelId: 'local-semantic-search',
        dimension: 3,
      })),
    };
    const { MealEmbeddingService } = await loadServiceModules({
      availability: {
        kind: 'ready',
        capability: 'text-embedding',
        mode: 'local-runtime-prototype',
        description: 'test embedding provider',
        provider,
      },
    });

    const saved = await MealEmbeddingService.refreshEmbeddingForMeal({
      id: 'meal-6',
      meal_name: '親子丼',
      cuisine_type: '和食',
      location_name: '自宅',
      notes: '夜ごはん',
      tags: '卵',
    });

    expect(provider.generateEmbedding).toHaveBeenCalledWith('親子丼\n和食\n自宅\n夜ごはん\n卵');
    expect(saved).toMatchObject({
      mealId: 'meal-6',
      vectorModel: 'local-semantic-search',
      vectorDimension: 3,
      indexedText: '親子丼\n和食\n自宅\n夜ごはん\n卵',
      textVersion: 1,
    });
  });

  test('skips refresh when the runtime is unavailable', async () => {
    const { MealEmbeddingService, getLocalLlamaTextEmbeddingAvailability } = await loadServiceModules();

    await expect(
      MealEmbeddingService.refreshEmbeddingForMeal({
        id: 'meal-7',
        meal_name: 'ラーメン',
      })
    ).resolves.toBeNull();

    expect(getLocalLlamaTextEmbeddingAvailability).toHaveBeenCalledTimes(1);
    await expect(MealEmbeddingService.listEmbeddings()).resolves.toEqual([]);
  });

  test('backfill is idempotent for meals whose indexed text is already current', async () => {
    const provider = {
      modelId: 'local-semantic-search',
      generateEmbedding: jest.fn(async () => ({
        vector: [0.1, 0.2, 0.3],
        modelId: 'local-semantic-search',
        dimension: 3,
      })),
    };
    const { MealEmbeddingService } = await loadServiceModules({
      availability: {
        kind: 'ready',
        capability: 'text-embedding',
        mode: 'local-runtime-prototype',
        description: 'test embedding provider',
        provider,
      },
    });
    const meals = [
      {
        id: 'meal-8',
        meal_name: 'カレー',
        cuisine_type: '洋食',
        location_name: '自宅',
        notes: '金曜',
        tags: '辛口',
      },
    ];

    await MealEmbeddingService.backfillMissingEmbeddings(meals);
    await MealEmbeddingService.backfillMissingEmbeddings(meals);

    expect(provider.generateEmbedding).toHaveBeenCalledTimes(1);
    await expect(MealEmbeddingService.listEmbeddings()).resolves.toHaveLength(1);
  });

  test('backfill continues after a single meal fails to embed', async () => {
    const provider = {
      modelId: 'local-semantic-search',
      generateEmbedding: jest.fn(async (text: string) => {
        if (text.includes('失敗')) {
          throw new Error('embedding failed');
        }

        return {
          vector: [0.7, 0.8],
          modelId: 'local-semantic-search',
          dimension: 2,
        };
      }),
    };
    const { MealEmbeddingService } = await loadServiceModules({
      availability: {
        kind: 'ready',
        capability: 'text-embedding',
        mode: 'local-runtime-prototype',
        description: 'test embedding provider',
        provider,
      },
    });

    await MealEmbeddingService.backfillMissingEmbeddings([
      {
        id: 'meal-9',
        meal_name: '失敗する食事',
      },
      {
        id: 'meal-10',
        meal_name: '成功する食事',
        notes: '継続',
      },
    ]);

    expect(provider.generateEmbedding).toHaveBeenCalledTimes(2);
    await expect(MealEmbeddingService.getEmbedding('meal-9')).resolves.toBeNull();
    await expect(MealEmbeddingService.getEmbedding('meal-10')).resolves.toMatchObject({
      mealId: 'meal-10',
      indexedText: '成功する食事\n継続',
    });
  });
});
