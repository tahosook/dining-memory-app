import { normalizeMealInputAssistResult } from '../src/ai/mealInputAssist';

describe('normalizeMealInputAssistResult', () => {
  test('drops empty values, deduplicates candidates, and filters invalid cuisine values', () => {
    const normalized = normalizeMealInputAssistResult({
      source: ' mock-local ',
      mealNames: [' 親子丼 ', '', { value: '親子丼', confidence: 0.3 }, null],
      cuisineTypes: ['和食', 'タイ料理', { value: '和食', confidence: 0.6 }, undefined],
      homemade: [true, '自炊', { value: '外食', confidence: -1 }, { value: '外食', confidence: 0.4 }],
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
    expect(normalized.homemade).toEqual([
      {
        value: true,
        label: '自炊',
        source: 'mock-local',
      },
      {
        value: false,
        label: '外食',
        confidence: 0,
        source: 'mock-local',
      },
    ]);
  });

  test('returns empty suggestion groups for zero-result responses', () => {
    const normalized = normalizeMealInputAssistResult({
      source: '',
      mealNames: [],
      cuisineTypes: [],
      homemade: [],
    });

    expect(normalized).toEqual({
      source: 'mock-local',
      mealNames: [],
      cuisineTypes: [],
      homemade: [],
    });
  });
});
