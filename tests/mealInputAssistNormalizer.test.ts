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
        { label: 'side_simmered_pumpkin', score: 0.28 },
        { label: 'side_tonjiru_soup', score: 0.24 },
        { label: 'side_none', score: 0.15 },
        // Below threshold category (< 0.20)
        { label: 'side_kinpira', score: 0.12 },
      ],
      classifierName: 'personal-dual-dish-classifier',
      modelVersion: 'v2.0.0',
    });
    const reviewSuggestions = normalizeMealInputAssistResult(normalized.providerResult);

    expect(normalized.providerResult.mealNames).toEqual([
      { value: '生姜焼き・豚肉炒め定食', confidence: 0.35 },
      { value: 'かぼちゃの煮物', confidence: 0.28 },
      { value: '具だくさん豚汁', confidence: 0.24 },
    ]);
    expect(normalized.providerResult.cuisineTypes).toEqual([{ value: '和食', confidence: 0.35 }]);
    expect(normalized.providerResult.noteDraft).toEqual({
      value:
        'かぼちゃの煮物と具だくさん豚汁がついた生姜焼き。一汁三菜・夕定食スタイルのごはんです。',
      confidence: 0.35,
    });
    expect(reviewSuggestions.mealNames.map(c => c.value)).toEqual([
      '生姜焼き・豚肉炒め定食',
      'かぼちゃの煮物',
      '具だくさん豚汁',
    ]);
    expect(reviewSuggestions.noteDraft?.value).toBe(
      'かぼちゃの煮物と具だくさん豚汁がついた生姜焼き。一汁三菜・夕定食スタイルのごはんです。'
    );
  });

  test('excludes side_none and enforces side threshold 0.20 and main threshold 0.30', () => {
    const normalized = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/threshold-test.jpg',
      categories: [
        // Main below threshold (< 0.30)
        { label: 'main_hamburg', score: 0.28 },
        // Side none should be completely excluded even with high confidence
        { label: 'side_none', score: 0.85 },
        // Side dish above threshold (>= 0.20)
        { label: 'side_salad_greens', score: 0.4 },
        // Side dish below threshold (< 0.20)
        { label: 'side_cut_fruit', score: 0.18 },
      ],
    });
    const reviewSuggestions = normalizeMealInputAssistResult(normalized.providerResult);

    expect(normalized.providerResult.mealNames).toEqual([
      { value: 'サラダ', confidence: 0.4 },
    ]);
    expect(reviewSuggestions.mealNames.map(c => c.value)).toEqual(['サラダ']);
    expect(normalized.providerResult.cuisineTypes).toEqual([]);
    expect(reviewSuggestions.noteDraft?.value).toBe('サラダが並ぶ食卓です。');
  });

  test('falls back safely to empty suggestions when both main and side are below threshold', () => {
    const lowConfidence = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/low-confidence.jpg',
      categories: [
        { label: 'main_ramen', score: 0.25 },
        { label: 'side_miso_soup', score: 0.15 },
        { label: 'side_none', score: 0.4 },
      ],
    });

    expect(lowConfidence.providerResult.mealNames).toEqual([]);
    expect(lowConfidence.providerResult.cuisineTypes).toEqual([]);
    expect(lowConfidence.providerResult.noteDraft).toBeUndefined();

    const reviewSuggestions = normalizeMealInputAssistResult(lowConfidence.providerResult);
    expect(reviewSuggestions.mealNames).toEqual([]);
    expect(reviewSuggestions.cuisineTypes).toEqual([]);
    expect(reviewSuggestions.noteDraft).toBeNull();
  });

  test('derives scene deterministically from dishes according to rule engine', () => {
    // 1. Hotpot
    const hotpot = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/hotpot.jpg',
      categories: [{ label: 'main_hotpot', score: 0.6 }],
    });
    expect(normalizeMealInputAssistResult(hotpot.providerResult).noteDraft?.value).toBe(
      '鍋料理。冬の団らん卓上鍋スタイルのごはんです。'
    );

    // 2. Noodles
    const ramen = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/ramen.jpg',
      categories: [{ label: 'main_ramen', score: 0.7 }],
    });
    expect(normalizeMealInputAssistResult(ramen.providerResult).noteDraft?.value).toBe(
      'ラーメン。休日のあつあつ麺スタイルのごはんです。'
    );

    // 3. One plate curry
    const curry = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/curry.jpg',
      categories: [
        { label: 'main_curry_hayashi', score: 0.8 },
        { label: 'side_salad_greens', score: 0.3 },
      ],
    });
    expect(normalizeMealInputAssistResult(curry.providerResult).noteDraft?.value).toBe(
      'サラダがついたカレーライス。ワンプレートスタイルのごはんです。'
    );

    // 4. Izakaya
    const izakaya = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/izakaya.jpg',
      categories: [
        { label: 'main_sashimi_seafood', score: 0.65 },
        { label: 'side_izakaya_appetizer', score: 0.4 },
      ],
    });
    expect(normalizeMealInputAssistResult(izakaya.providerResult).noteDraft?.value).toBe(
      'おつまみ小鉢がついたお刺身。おうち居酒屋・晩酌スタイルのごはんです。'
    );

    // 5. Japanese breakfast
    const breakfast = normalizeMediaPipeStaticImageResult({
      photoUri: 'file:///tmp/breakfast.jpg',
      categories: [
        { label: 'main_grilled_fish', score: 0.5 },
        { label: 'side_natto_pack', score: 0.45 },
      ],
    });
    expect(normalizeMealInputAssistResult(breakfast.providerResult).noteDraft?.value).toBe(
      '納豆がついた焼き魚。定番の和朝食スタイルのごはんです。'
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
