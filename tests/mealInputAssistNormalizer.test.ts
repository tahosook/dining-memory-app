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
    expect(normalized.noteDraft).toBeNull();
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
      noteDraft: null,
      mealNames: [],
      cuisineTypes: [],
    });
  });

  test('normalizes noteDraft and clamps confidence', () => {
    const normalized = normalizeMealInputAssistResult({
      source: ' mock-local ',
      noteDraft: {
        value: '  料理名: 刺身盛り合わせ\nメモ: 海鮮の一皿に見える  ',
        confidence: 1.4,
      },
    });

    expect(normalized.noteDraft).toEqual({
      value: '料理名: 刺身盛り合わせ\nメモ: 海鮮の一皿に見える',
      label: '料理名: 刺身盛り合わせ\nメモ: 海鮮の一皿に見える',
      confidence: 1,
      source: 'mock-local',
    });
  });

  test('tolerates missing source and malformed object candidates', () => {
    const normalized = normalizeMealInputAssistResult({
      source: undefined as unknown as string,
      mealNames: [{ value: undefined }, { value: '  カツ丼  ' }] as unknown as Array<{
        value: string;
      }>,
      cuisineTypes: [{ value: undefined }, { value: '和食' }] as unknown as Array<{
        value: string;
      }>,
    });

    expect(normalized).toEqual({
      source: 'mock-local',
      noteDraft: null,
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
      cuisineTypes: [{ value: '中華', confidence: 0.93 }],
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
    expect(reviewSuggestions.mealNames.map(candidate => candidate.value)).toEqual([
      'ラーメン',
      '寿司',
      '飲み物',
    ]);
    expect(reviewSuggestions.cuisineTypes.map(candidate => candidate.value)).toEqual(['中華']);
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
      cuisineTypes: [{ value: 'その他', confidence: 1 }],
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

  test('suppresses other_or_exclude from suggestions while recording it in metadata', () => {
    const normalized = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/other-photo.jpg',
      categories: [
        { label: 'other_or_exclude', score: 0.95 },
        { label: 'curry_rice', score: 0.4 },
      ],
      classifierName: 'food-classifier',
      modelVersion: 'v2',
    });
    const reviewSuggestions = normalizeMealInputAssistResult(normalized.providerResult);

    expect(normalized.providerResult).toEqual({
      source: 'mediapipe-static-image',
      mealNames: [{ value: 'カレーライス', confidence: 0.4 }],
      cuisineTypes: [{ value: '洋食', confidence: 0.4 }],
    });
    expect(normalized.metadata).toEqual({
      categoryCount: 2,
      matchedCategoryCount: 2,
      droppedCategoryCount: 0,
      topCategoryLabel: 'other_or_exclude',
      topCategoryScore: 0.95,
      classifierName: 'food-classifier',
      modelVersion: 'v2',
    });
    expect(reviewSuggestions.mealNames.map(candidate => candidate.value)).toEqual(['カレーライス']);
    expect(reviewSuggestions.cuisineTypes.map(candidate => candidate.value)).toEqual(['洋食']);
  });

  test('normalizes universal dining scene classes and suppresses non_food_or_exclude', () => {
    const normalized = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/scene-photo.jpg',
      categories: [
        { label: 'home_teishoku_set', score: 0.85 },
        { label: 'one_plate_or_curry', score: 0.72 },
        { label: 'non_food_or_exclude', score: 0.99 },
      ],
      classifierName: 'universal-scene-classifier',
      modelVersion: 'v1',
    });
    const reviewSuggestions = normalizeMealInputAssistResult(normalized.providerResult);

    expect(normalized.providerResult).toEqual({
      source: 'mediapipe-static-image',
      mealNames: [
        { value: 'おうち定食', confidence: 0.85 },
        { value: 'ワンプレート・カレー', confidence: 0.72 },
      ],
      cuisineTypes: [{ value: '和食', confidence: 0.85 }],
    });
    expect(normalized.metadata.topCategoryLabel).toBe('non_food_or_exclude');
    expect(reviewSuggestions.mealNames.map(candidate => candidate.value)).toEqual([
      'おうち定食',
      'ワンプレート・カレー',
    ]);
  });

  test('normalizes personal household classes into suggestions', () => {
    const normalized = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/personal-photo.jpg',
      categories: [
        { label: 'wife_nordic_one_plate', score: 0.91 },
        { label: 'wife_curry_or_ethnic_plate', score: 0.65 },
        { label: 'wife_morning_salmon_natto', score: 0.52 },
      ],
    });
    const reviewSuggestions = normalizeMealInputAssistResult(normalized.providerResult);

    expect(normalized.providerResult).toEqual({
      source: 'mediapipe-static-image',
      mealNames: [
        { value: '北欧大皿ワンプレート', confidence: 0.91 },
        { value: '特製カレー・エスニック皿', confidence: 0.65 },
        { value: '焼き鮭＆納豆の和朝食', confidence: 0.52 },
      ],
      cuisineTypes: [{ value: '洋食', confidence: 0.91 }],
    });
    expect(reviewSuggestions.mealNames.map(c => c.value)).toEqual([
      '北欧大皿ワンプレート',
      '特製カレー・エスニック皿',
      '焼き鮭＆納豆の和朝食',
    ]);
  });

  test('normalizes universal dining 23 classes and suppresses non_food_exclude', () => {
    const normalized = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/univ23-photo.jpg',
      categories: [
        { label: 'non_food_exclude', score: 0.98 },
        { label: 'teishoku_pork_ginger_stirfry', score: 0.82 },
        { label: 'teishoku_fish', score: 0.74 },
        { label: 'noodles_ramen', score: 0.55 },
      ],
      classifierName: 'universal-23class-classifier',
      modelVersion: 'v1.0.0',
    });
    const reviewSuggestions = normalizeMealInputAssistResult(normalized.providerResult);

    expect(normalized.providerResult).toEqual({
      source: 'mediapipe-static-image',
      mealNames: [
        { value: '生姜焼き・豚肉炒め定食', confidence: 0.82 },
        { value: '焼き魚定食', confidence: 0.74 },
        { value: 'ラーメン・中華麺', confidence: 0.55 },
      ],
      cuisineTypes: [{ value: '和食', confidence: 0.82 }],
    });
    expect(normalized.metadata.topCategoryLabel).toBe('non_food_exclude');
    expect(reviewSuggestions.mealNames.map(c => c.value)).toEqual([
      '生姜焼き・豚肉炒め定食',
      '焼き魚定食',
      'ラーメン・中華麺',
    ]);
    expect(reviewSuggestions.cuisineTypes.map(c => c.value)).toEqual(['和食']);
  });

  test('normalizes personal 3-axis multi-label categories and synthesizes noteDraft', () => {
    const normalized = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/personal-3axis-photo.jpg',
      categories: [
        { label: 'main_pork_ginger_stirfry', score: 0.35 },
        { label: 'side_simmered_pumpkin', score: 0.22 },
        { label: 'side_tonjiru_soup', score: 0.18 },
        { label: 'scene_teishoku_multi_dish', score: 0.25 },
        // Below threshold category
        { label: 'side_kinpira', score: 0.02 },
      ],
      classifierName: 'personal-44tag-classifier',
      modelVersion: 'v1.0.0',
    });
    const reviewSuggestions = normalizeMealInputAssistResult(normalized.providerResult);

    expect(normalized.providerResult.mealNames).toEqual([
      { value: '生姜焼き・豚肉炒め定食', confidence: 0.35 },
    ]);
    expect(normalized.providerResult.cuisineTypes).toEqual([{ value: '和食', confidence: 0.35 }]);
    expect(normalized.providerResult.noteDraft).toEqual({
      value:
        'かぼちゃの煮物と具だくさん豚汁がついた生姜焼き。一汁三菜・夕定食スタイルのごはんです。',
      confidence: 0.35,
    });
    expect(reviewSuggestions.mealNames.map(c => c.value)).toEqual(['生姜焼き・豚肉炒め定食']);
    expect(reviewSuggestions.noteDraft?.value).toBe(
      'かぼちゃの煮物と具だくさん豚汁がついた生姜焼き。一汁三菜・夕定食スタイルのごはんです。'
    );
  });

  test('synthesizes graceful noteDraft fallback when main dish is missing or side is missing', () => {
    // Only side and scene
    const sideOnly = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/side-only.jpg',
      categories: [
        { label: 'side_simmered_pumpkin', score: 0.45 },
        { label: 'side_tonjiru_soup', score: 0.3 },
        { label: 'scene_teishoku_multi_dish', score: 0.25 },
      ],
    });
    expect(normalizeMealInputAssistResult(sideOnly.providerResult).noteDraft?.value).toBe(
      'かぼちゃの煮物と具だくさん豚汁が並ぶ食卓。一汁三菜・夕定食スタイルのごはんです。'
    );

    // Only main dish
    const mainOnly = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/main-only.jpg',
      categories: [{ label: 'main_hamburg', score: 0.5 }],
    });
    expect(normalizeMealInputAssistResult(mainOnly.providerResult).noteDraft?.value).toBe(
      'ハンバーグの食卓です。'
    );

    // Only side dishes (no main, no scene) -> must not produce "食卓の食卓"
    const sideOnlyNoScene = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/side-no-scene.jpg',
      categories: [
        { label: 'side_miso_soup', score: 0.45 },
        { label: 'side_kinpira', score: 0.35 },
      ],
    });
    const sideDraft = normalizeMealInputAssistResult(sideOnlyNoScene.providerResult).noteDraft
      ?.value;
    expect(sideDraft).toBe('お味噌汁ときんぴらごぼうが並ぶ食卓です。');
    expect(sideDraft).not.toContain('食卓の食卓');
  });
});
