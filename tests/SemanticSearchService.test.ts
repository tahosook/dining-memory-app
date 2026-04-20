describe('SemanticSearchService', () => {
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
    let semanticSearchModule!: typeof import('../src/database/services/SemanticSearchService');

    jest.isolateModules(() => {
      localDatabase = require('../src/database/services/localDatabase');
      mealEmbeddingModule = require('../src/database/services/MealEmbeddingService');
      semanticSearchModule = require('../src/database/services/SemanticSearchService');
    });

    localDatabase.resetInMemoryDatabase();

    return {
      localDatabase,
      MealEmbeddingService: mealEmbeddingModule.MealEmbeddingService,
      SemanticSearchService: semanticSearchModule.SemanticSearchService,
      getLocalLlamaTextEmbeddingAvailability,
    };
  }

  test('returns an empty result when the runtime is unavailable', async () => {
    const { SemanticSearchService, getLocalLlamaTextEmbeddingAvailability } = await loadServiceModules();

    await expect(
      SemanticSearchService.scoreMeals('丼', [{ id: 'meal-1' }])
    ).resolves.toEqual([]);

    expect(getLocalLlamaTextEmbeddingAvailability).toHaveBeenCalledTimes(1);
  });

  test('scores only candidate meals with compatible vectors and sorts by similarity', async () => {
    const provider = {
      modelId: 'local-semantic-search',
      generateEmbedding: jest.fn(async () => ({
        vector: [1, 0],
        modelId: 'local-semantic-search',
        dimension: 2,
      })),
    };
    const { MealEmbeddingService, SemanticSearchService } = await loadServiceModules({
      availability: {
        kind: 'ready',
        capability: 'text-embedding',
        mode: 'local-runtime-prototype',
        description: 'test embedding provider',
        provider,
      },
    });

    await MealEmbeddingService.upsertEmbedding({
      mealId: 'meal-1',
      vector: [1, 0],
      vectorModel: 'local-semantic-search',
      indexedText: '海鮮丼',
      textVersion: 1,
    });
    await MealEmbeddingService.upsertEmbedding({
      mealId: 'meal-2',
      vector: [0.6, 0.8],
      vectorModel: 'local-semantic-search',
      indexedText: 'ラーメン',
      textVersion: 1,
    });
    await MealEmbeddingService.upsertEmbedding({
      mealId: 'meal-3',
      vector: [-1, 0],
      vectorModel: 'local-semantic-search',
      indexedText: '苦手',
      textVersion: 1,
    });
    await MealEmbeddingService.upsertEmbedding({
      mealId: 'meal-4',
      vector: [1, 0],
      vectorModel: 'other-model',
      indexedText: '別モデル',
      textVersion: 1,
    });

    const matches = await SemanticSearchService.scoreMeals('丼', [
      { id: 'meal-1' },
      { id: 'meal-2' },
      { id: 'meal-3' },
      { id: 'meal-4' },
    ]);

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({ mealId: 'meal-1' });
    expect(matches[1]).toMatchObject({ mealId: 'meal-2' });
    expect(matches[0].score).toBeGreaterThan(matches[1].score);
    expect(provider.generateEmbedding).toHaveBeenCalledWith('丼');
  });

  test('returns an empty result when embedding generation throws', async () => {
    const provider = {
      modelId: 'local-semantic-search',
      generateEmbedding: jest.fn(async () => {
        throw new Error('embedding failed');
      }),
    };
    const { SemanticSearchService } = await loadServiceModules({
      availability: {
        kind: 'ready',
        capability: 'text-embedding',
        mode: 'local-runtime-prototype',
        description: 'test embedding provider',
        provider,
      },
    });

    await expect(
      SemanticSearchService.scoreMeals('丼', [{ id: 'meal-1' }])
    ).resolves.toEqual([]);
  });
});
