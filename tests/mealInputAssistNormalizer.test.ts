import {
  normalizeMealInputAssistResult,
  normalizeMediaPipeStaticImageResult,
} from '../src/ai/mealInputAssist';

describe('normalizeMealInputAssistResult', () => {
  test('drops empty values, deduplicates candidates, and filters invalid cuisine values', () => {
    const normalized = normalizeMealInputAssistResult({
      source: ' mock-local ',
      mealNames: [' 親子丼 ', '', { value: '親子丼', confidence: 0.3 }, null],
      cuisineTypes: ['和食', 'タイ料理', { value: '和食', confidence: 0.6 }, undefined],
    });

    expect(normalized.source).toBe('mock-local');
    expect(normalized.mealNames).toEqual([
      {
        value: '親子丼',
        label: '親子丼',
        source: 'mock-local',
      },
    ]);
    expect(normalized.cuisineTypes).toEqual([
      {
        value: '和食',
        label: '和食',
        source: 'mock-local',
      },
    ]);
  });

  test('returns empty suggestion groups for zero-result responses', () => {
    const normalized = normalizeMealInputAssistResult({
      source: '',
      mealNames: [],
      cuisineTypes: [],
    });

    expect(normalized).toEqual({
      source: 'mock-local',
      mealNames: [],
      cuisineTypes: [],
    });
  });

  test('tolerates missing source and malformed object candidates', () => {
    const normalized = normalizeMealInputAssistResult({
      source: undefined as unknown as string,
      mealNames: [{ value: undefined }, { value: '  カツ丼  ' }] as unknown as Array<{ value: string }>,
      cuisineTypes: [{ value: undefined }, { value: '和食' }] as unknown as Array<{ value: string }>,
    });

    expect(normalized).toEqual({
      source: 'mock-local',
      mealNames: [
        {
          value: 'カツ丼',
          label: 'カツ丼',
          source: 'mock-local',
        },
      ],
      cuisineTypes: [
        {
          value: '和食',
          label: '和食',
          source: 'mock-local',
        },
      ],
    });
  });
});

describe('normalizeMediaPipeStaticImageResult', () => {
  test('maps coarse classifier labels into existing suggestion groups', () => {
    const normalized = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/meal-photo.jpg',
      categories: [
        { label: 'drink', score: 0.42 },
        { label: 'ramen', score: 0.93 },
        { label: 'sushi', score: 0.81 },
      ],
      classifierName: 'food-classifier',
      modelVersion: 'v1',
    });
    const reviewSuggestions = normalizeMealInputAssistResult(normalized.providerResult);

    expect(normalized.providerResult).toEqual({
      source: 'mediapipe-static-image',
      mealNames: [
        { value: 'ラーメン', confidence: 0.93 },
        { value: '寿司', confidence: 0.81 },
        { value: '飲み物', confidence: 0.42 },
      ],
      cuisineTypes: [
        { value: '中華', confidence: 0.93 },
      ],
    });
    expect(normalized.metadata).toEqual({
      categoryCount: 3,
      matchedCategoryCount: 3,
      droppedCategoryCount: 0,
      topCategoryLabel: 'ramen',
      topCategoryScore: 0.93,
      classifierName: 'food-classifier',
      modelVersion: 'v1',
    });
    expect(reviewSuggestions.mealNames.map((candidate) => candidate.value)).toEqual([
      'ラーメン',
      '寿司',
      '飲み物',
    ]);
    expect(reviewSuggestions.cuisineTypes.map((candidate) => candidate.value)).toEqual(['中華']);
  });

  test('drops unknown, invalid, and duplicate categories before they reach the review UI', () => {
    const normalized = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/meal-photo.jpg',
      categories: [
        { label: 'unknown', score: 0.99 },
        { label: '  ', score: 0.8 },
        { label: 'bento', score: Number.NaN },
        { label: 'ramen', score: 0.88 },
        { label: 'ramen', score: 0.51 },
        { label: 'drink', score: 1.2 },
      ],
    });

    expect(normalized.providerResult).toEqual({
      source: 'mediapipe-static-image',
      mealNames: [
        { value: '飲み物', confidence: 1 },
        { value: 'ラーメン', confidence: 0.88 },
      ],
      cuisineTypes: [
        { value: 'その他', confidence: 1 },
      ],
    });
    expect(normalized.metadata).toEqual({
      categoryCount: 6,
      matchedCategoryCount: 3,
      droppedCategoryCount: 3,
      topCategoryLabel: 'drink',
      topCategoryScore: 1,
      classifierName: null,
      modelVersion: null,
    });
  });
});
