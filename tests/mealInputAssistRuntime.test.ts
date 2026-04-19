import { loadMealInputAssistRuntimeAvailability, normalizeMealInputAssistResult } from '../src/ai/mealInputAssist';

describe('meal input assist runtime availability', () => {
  test('reports the local runtime prototype as unavailable in the current build', async () => {
    const availability = await loadMealInputAssistRuntimeAvailability('local-runtime-prototype');

    expect(availability).toEqual({
      kind: 'unavailable',
      mode: 'local-runtime-prototype',
      code: 'runtime_unavailable',
      reason: 'この build には端末内 AI runtime がまだ組み込まれていません。',
    });
  });

  test('returns a ready mock provider that still maps through the existing normalizer', async () => {
    const availability = await loadMealInputAssistRuntimeAvailability('mock');

    expect(availability.kind).toBe('ready');

    if (availability.kind !== 'ready') {
      throw new Error('Expected mock runtime availability to be ready.');
    }

    const rawResult = await availability.provider.suggest({
      photoUri: 'file:///tmp/mock-meal.jpg',
      mealName: '',
      cuisineType: '',
      notes: '',
      locationName: '',
      isHomemade: true,
    });
    const normalized = normalizeMealInputAssistResult(rawResult);

    expect(normalized.source).toBe('mock-local');
    expect(normalized.mealNames.length).toBeGreaterThan(0);
  });
});
