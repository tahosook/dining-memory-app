import type { CuisineTypeOption } from '../../constants/MealOptions';
import type { MealInputAssistProviderResult, MealInputAssistTextProviderCandidate } from './types';
import type {
  MediaPipeStaticImageCategory,
  MediaPipeStaticImageNormalizedResult,
  MediaPipeStaticImageRawResult,
} from './mediapipeStaticImageTypes';

export const MEDIAPIPE_STATIC_IMAGE_SOURCE = 'mediapipe-static-image';

const MAX_MEAL_NAME_SUGGESTIONS = 3;
const MAX_CUISINE_SUGGESTIONS = 1;

// Per-Axis Dynamic Thresholds for Personal Dual Dish / 3-Axis Multi-Label Model
export const PERSONAL_MAIN_MIN_THRESHOLD = 0.3;
export const PERSONAL_SIDE_MIN_THRESHOLD = 0.2;
export const PERSONAL_SCENE_MIN_THRESHOLD = 0.05;
export const PERSONAL_MAX_SIDE_SUGGESTIONS = 2;

type LabelMapping = {
  mealName?: string;
  cuisineType?: CuisineTypeOption;
  excludeFromSuggestions?: boolean;
  axis?: 'main' | 'side' | 'scene';
  cleanName?: string;
};

const LABEL_MAPPING: Record<string, LabelMapping> = {
  // --- Legacy 9 Classes & Historical Models ---
  ramen: { mealName: 'ラーメン', cuisineType: '中華' },
  udon: { mealName: 'うどん', cuisineType: '和食' },
  soba: { mealName: 'そば', cuisineType: '和食' },
  sushi: { mealName: '寿司', cuisineType: '和食' },
  curry_rice: { mealName: 'カレーライス', cuisineType: '洋食' },
  set_meal: { mealName: '定食', cuisineType: '和食' },
  dessert: { mealName: 'デザート', cuisineType: 'その他' },
  drink: { mealName: '飲み物', cuisineType: 'その他' },
  bento: { mealName: '弁当', cuisineType: '和食' },
  fish_dish: { mealName: '魚料理', cuisineType: '和食' },
  fried_dish: { mealName: '揚げ物', cuisineType: 'その他' },
  meat_dish: { mealName: '肉料理', cuisineType: 'その他' },
  noodles: { mealName: '麺類', cuisineType: 'その他' },
  simmered_dish: { mealName: '煮物', cuisineType: '和食' },
  stir_fry: { mealName: '炒め物', cuisineType: '中華' },
  other_or_exclude: { excludeFromSuggestions: true },

  // --- Universal Dining Scene (7 classes, Issue-23) ---
  home_teishoku_set: { mealName: 'おうち定食', cuisineType: '和食' },
  one_plate_or_curry: { mealName: 'ワンプレート・カレー', cuisineType: '洋食' },
  izakaya_bistro_or_party: { mealName: '晩酌・パーティー', cuisineType: 'その他' },
  noodles_or_single_bowl: { mealName: '麺・単品ボウル', cuisineType: 'その他' },
  dining_out_or_tray_meal: { mealName: '外食・トレイ飯', cuisineType: 'その他' },
  drink_or_bottle_record: { mealName: 'お酒・ドリンク', cuisineType: 'その他' },
  non_food_or_exclude: { excludeFromSuggestions: true },

  // --- Personal Household & Wife's Cooking (8 classes, Issue-23) ---
  wife_multi_dish_teishoku: { mealName: '一汁複数菜・夕定食', cuisineType: '和食' },
  wife_nordic_one_plate: { mealName: '北欧大皿ワンプレート', cuisineType: '洋食' },
  wife_curry_or_ethnic_plate: { mealName: '特製カレー・エスニック皿', cuisineType: '洋食' },
  wife_morning_salmon_natto: { mealName: '焼き鮭＆納豆の和朝食', cuisineType: '和食' },
  wife_bistro_baguette_bal: { mealName: '洋風ビストロ・おうちバル', cuisineType: '洋食' },
  wife_izakaya_small_dishes: { mealName: 'おうち居酒屋・染付晩酌膳', cuisineType: '和食' },
  household_pot_noodles_or_ramen_rice: { mealName: '鍋麺・ラーメンライス', cuisineType: 'その他' },
  special_takeout_party_feast: { mealName: 'テイクアウト宴席', cuisineType: 'その他' },

  // =========================================================================
  // --- Universal Dining 23 Classes (Issue-24) ---
  // =========================================================================
  teishoku_fish: { mealName: '焼き魚定食', cuisineType: '和食' },
  teishoku_pork_ginger_stirfry: { mealName: '生姜焼き・豚肉炒め定食', cuisineType: '和食' },
  teishoku_chicken: { mealName: 'チキンソテー・鶏肉料理定食', cuisineType: '和食' },
  teishoku_fried_meat: { mealName: '唐揚げ・フライ定食', cuisineType: 'その他' },
  teishoku_hamburg: { mealName: 'ハンバーグ定食', cuisineType: '洋食' },
  teishoku_simmered_stew: { mealName: '肉じゃが・煮物定食', cuisineType: '和食' },
  teishoku_general_multi_dish: { mealName: '一汁三菜・おうち定食', cuisineType: '和食' },
  breakfast_japanese_natto: { mealName: '納豆・味噌汁の和朝食', cuisineType: '和食' },
  breakfast_western_toast: { mealName: 'トースト＆目玉焼き朝食', cuisineType: '洋食' },
  noodles_ramen: { mealName: 'ラーメン・中華麺', cuisineType: '中華' },
  noodles_udon: { mealName: 'うどん', cuisineType: '和食' },
  noodles_soba: { mealName: 'そば', cuisineType: '和食' },
  pasta_dishes: { mealName: 'パスタ・スパゲッティ', cuisineType: '洋食' },
  curry_keema: { mealName: '特製キーマカレー', cuisineType: '洋食' },
  curry_hayashi_ethnic: { mealName: 'カレー・ハヤシライス', cuisineType: '洋食' },
  donburi_omurice: { mealName: '丼もの・オムライス', cuisineType: 'その他' },
  fried_rice_pilaf: { mealName: 'チャーハン・炊き込みご飯', cuisineType: '中華' },
  pot_stew_nabe: { mealName: '鍋料理・すき焼き', cuisineType: '和食' },
  izakaya_appetizers: { mealName: 'おうち居酒屋・おつまみ小鉢', cuisineType: '和食' },
  bal_ajillo_pizza: { mealName: 'おうちバル・アヒージョ', cuisineType: '洋食' },
  chuka_gyoza_mapo: { mealName: '餃子・麻婆豆腐', cuisineType: '中華' },
  alcohol_drink_record: { mealName: 'お酒・ドリンク', cuisineType: 'その他' },
  non_food_exclude: { excludeFromSuggestions: true },

  // =========================================================================
  // --- Personal 3-Axis Multi-Label 44 Tags (Issue-25) ---
  // =========================================================================
  // 1. Main Dish (20 tags)
  main_grilled_fish: {
    axis: 'main',
    mealName: '焼き魚定食',
    cleanName: '焼き魚',
    cuisineType: '和食',
  },
  main_pork_ginger_stirfry: {
    axis: 'main',
    mealName: '生姜焼き・豚肉炒め定食',
    cleanName: '生姜焼き',
    cuisineType: '和食',
  },
  main_chicken_dish: {
    axis: 'main',
    mealName: 'チキンソテー・鶏肉料理定食',
    cleanName: 'チキンソテー',
    cuisineType: '和食',
  },
  main_fried_meat: {
    axis: 'main',
    mealName: '唐揚げ・フライ定食',
    cleanName: '唐揚げ',
    cuisineType: 'その他',
  },
  main_hamburg: {
    axis: 'main',
    mealName: 'ハンバーグ定食',
    cleanName: 'ハンバーグ',
    cuisineType: '洋食',
  },
  main_simmered_meat_potato: {
    axis: 'main',
    mealName: '肉じゃが・角煮定食',
    cleanName: '肉じゃが',
    cuisineType: '和食',
  },
  main_keema_curry: {
    axis: 'main',
    mealName: '特製キーマカレー',
    cleanName: '特製キーマカレー',
    cuisineType: '洋食',
  },
  main_curry_hayashi: {
    axis: 'main',
    mealName: 'カレー・ハヤシライス',
    cleanName: 'カレーライス',
    cuisineType: '洋食',
  },
  main_ethnic_gapao: {
    axis: 'main',
    mealName: 'ガパオ・エスニック',
    cleanName: 'ガパオライス',
    cuisineType: '洋食',
  },
  main_ramen: {
    axis: 'main',
    mealName: 'ラーメン・つけ麺',
    cleanName: 'ラーメン',
    cuisineType: '中華',
  },
  main_udon: { axis: 'main', mealName: 'うどん', cleanName: 'うどん', cuisineType: '和食' },
  main_soba: { axis: 'main', mealName: 'そば', cleanName: 'そば', cuisineType: '和食' },
  main_japanese_noodles: {
    axis: 'main',
    mealName: 'うどん・そば',
    cleanName: 'うどん・そば',
    cuisineType: '和食',
  },
  main_pasta: {
    axis: 'main',
    mealName: 'パスタ・スパゲッティ',
    cleanName: 'パスタ',
    cuisineType: '洋食',
  },
  main_gyoza_dimsum: {
    axis: 'main',
    mealName: '焼き餃子・点心',
    cleanName: '焼き餃子',
    cuisineType: '中華',
  },
  main_mapo_chuka: {
    axis: 'main',
    mealName: '麻婆豆腐・中華炒め',
    cleanName: '麻婆豆腐',
    cuisineType: '中華',
  },
  main_hotpot: {
    axis: 'main',
    mealName: '卓上鍋・すき焼き',
    cleanName: '鍋料理',
    cuisineType: '和食',
  },
  main_bal_ajillo: {
    axis: 'main',
    mealName: 'アヒージョ・バル主菜',
    cleanName: 'アヒージョ',
    cuisineType: '洋食',
  },
  main_donburi: { axis: 'main', mealName: '丼もの', cleanName: '丼もの', cuisineType: 'その他' },
  main_fried_rice: {
    axis: 'main',
    mealName: 'チャーハン・炒飯',
    cleanName: 'チャーハン',
    cuisineType: '中華',
  },
  main_sashimi_seafood: {
    axis: 'main',
    mealName: 'お刺身・海鮮',
    cleanName: 'お刺身',
    cuisineType: '和食',
  },

  // 2. Side Dish & Soup (14 tags)
  side_simmered_pumpkin: { axis: 'side', cleanName: 'かぼちゃの煮物' },
  side_kinpira: { axis: 'side', cleanName: 'きんぴらごぼう' },
  side_tonjiru_soup: { axis: 'side', cleanName: '具だくさん豚汁' },
  side_miso_soup: { axis: 'side', cleanName: 'お味噌汁' },
  side_veggie_soup: { axis: 'side', cleanName: '野菜スープ' },
  side_tofu_hiyayakko: { axis: 'side', cleanName: '冷奴' },
  side_natto_pack: { axis: 'side', cleanName: '納豆' },
  side_egg_dish: { axis: 'side', cleanName: 'たまご料理' },
  side_salad_greens: { axis: 'side', cleanName: 'サラダ' },
  side_chikuzenni_root: { axis: 'side', cleanName: '筑前煮' },
  side_sauteed_mushrooms: { axis: 'side', cleanName: '舞茸ソテー' },
  side_pickles_kimchi: { axis: 'side', cleanName: 'お漬物' },
  side_cut_fruit: { axis: 'side', cleanName: 'カットフルーツ' },
  side_izakaya_appetizer: { axis: 'side', cleanName: 'おつまみ小鉢' },
  side_none: { axis: 'side', excludeFromSuggestions: true, cleanName: '' },

  // 3. Scene (10 tags)
  scene_teishoku_multi_dish: { axis: 'scene', cleanName: '一汁三菜・夕定食' },
  scene_one_plate: { axis: 'scene', cleanName: 'ワンプレート' },
  scene_quick_single_meal: { axis: 'scene', cleanName: 'サクッと平日飯' },
  scene_japanese_breakfast: { axis: 'scene', cleanName: '定番の和朝食' },
  scene_western_breakfast: { axis: 'scene', cleanName: 'パンの洋朝食' },
  scene_izakaya_night: { axis: 'scene', cleanName: 'おうち居酒屋・晩酌' },
  scene_weekend_bal: { axis: 'scene', cleanName: '週末おうちバル' },
  scene_holiday_noodles: { axis: 'scene', cleanName: '休日のあつあつ麺' },
  scene_tabletop_hotpot: { axis: 'scene', cleanName: '冬の団らん卓上鍋' },
  scene_party_feast: { axis: 'scene', cleanName: 'ごちそう宴席パーティー' },
};

function normalizeScore(score: number | null | undefined): number | null {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return null;
  }
  return Math.max(0, Math.min(1, score));
}

function normalizeLabel(label: string | null | undefined): string {
  if (typeof label !== 'string') {
    return '';
  }
  return label
    .trim()
    .toLocaleLowerCase()
    .replace(/[\s-]+/g, '_');
}

function toSortableCategory(category: MediaPipeStaticImageCategory | null | undefined) {
  if (!category) {
    return null;
  }

  const label = normalizeLabel(category.label);
  const score = normalizeScore(category.score);

  if (!label || score === null || label === 'unknown') {
    return null;
  }

  return { label, score };
}

function toProviderResult(
  mealNames: MealInputAssistTextProviderCandidate[],
  cuisineTypes: MealInputAssistTextProviderCandidate[],
  noteDraft?: MealInputAssistTextProviderCandidate | null
): MealInputAssistProviderResult {
  const result: MealInputAssistProviderResult = {
    source: MEDIAPIPE_STATIC_IMAGE_SOURCE,
    mealNames,
    cuisineTypes,
  };
  if (noteDraft) {
    result.noteDraft = noteDraft;
  }
  return result;
}

/**
 * Synthesizes a natural, safe Japanese note draft text from detected main, side, and scene tags.
 * Ensures deduplication and graceful fallback when main dish is absent.
 */
export function composeMultiAxisNoteDraft(
  mainDish: string | null,
  sideDishes: string[],
  scene: string | null
): string | null {
  const cleanMain = mainDish?.trim() || null;
  const cleanSides = Array.from(new Set(sideDishes.map(s => s.trim()).filter(Boolean)));
  const cleanScene = scene?.trim() || null;

  if (!cleanMain && cleanSides.length === 0 && !cleanScene) {
    return null;
  }

  const parts: string[] = [];

  if (cleanSides.length > 0) {
    parts.push(cleanSides.join('と'));
  }

  if (cleanMain) {
    if (parts.length > 0) {
      parts.push(`がついた${cleanMain}`);
    } else {
      parts.push(`${cleanMain}`);
    }
  } else if (parts.length > 0) {
    parts.push('が並ぶ食卓');
  }

  const sentenceBase = parts.join('');

  if (cleanScene) {
    if (sentenceBase) {
      return `${sentenceBase}。${cleanScene}スタイルのごはんです。`;
    }
    return `${cleanScene}スタイルの食卓です。`;
  }

  if (!sentenceBase) {
    return null;
  }

  return cleanMain ? `${sentenceBase}の食卓です。` : `${sentenceBase}です。`;
}

export interface SceneDerivationInput {
  mainDishLabel?: string | null;
  sideDishLabels?: string[];
  timestamp?: number | Date | null;
}

/**
 * Deterministically derives a scene label from detected main dish and side dishes,
 * mapping to one of the 10 canonical scene types defined in the app.
 * Returns null if no rule matches.
 */
export function deriveSceneFromDishes(input: SceneDerivationInput): string | null {
  const main = input.mainDishLabel ?? null;
  const sides = new Set(input.sideDishLabels ?? []);
  const date = input.timestamp ? new Date(input.timestamp) : new Date();
  const hour = date.getHours();
  const isMorning = hour >= 4 && hour < 11;
  const isNight = hour >= 18 || hour < 4;

  // 1. 冬の団らん卓上鍋: 鍋料理
  if (main === 'main_hotpot') {
    return '冬の団らん卓上鍋';
  }

  // 2. 休日のあつあつ麺: ラーメン・うどん・そば・麺類
  if (
    main === 'main_ramen' ||
    main === 'main_japanese_noodles' ||
    main === 'main_udon' ||
    main === 'main_soba'
  ) {
    return '休日のあつあつ麺';
  }

  // 3. おうち居酒屋・晩酌: おつまみ小鉢、刺身、または夜の晩酌膳
  if (
    main === 'main_sashimi_seafood' ||
    sides.has('side_izakaya_appetizer') ||
    (isNight && sides.has('side_tofu_hiyayakko') && !main)
  ) {
    return 'おうち居酒屋・晩酌';
  }

  // 4. 定番の和朝食: 納豆、または朝の焼き魚 / たまご料理
  if (
    sides.has('side_natto_pack') ||
    (isMorning && (main === 'main_grilled_fish' || sides.has('side_egg_dish')))
  ) {
    return '定番の和朝食';
  }

  // 5. パンの洋朝食: 朝かつ洋風副菜（サラダ / カットフルーツ / たまご）で和食系主菜なし
  if (
    isMorning &&
    (sides.has('side_salad_greens') || sides.has('side_cut_fruit') || sides.has('side_egg_dish')) &&
    !main
  ) {
    return 'パンの洋朝食';
  }

  // 6. ワンプレート: カレー、ハヤシ、キーマ、ガパオ、炒飯、丼もの
  if (
    main === 'main_curry_hayashi' ||
    main === 'main_keema_curry' ||
    main === 'main_ethnic_gapao' ||
    main === 'main_fried_rice' ||
    main === 'main_donburi'
  ) {
    return 'ワンプレート';
  }

  // 7. 一汁三菜・夕定食: 主菜あり ＋ 汁物（味噌汁/豚汁/野菜スープ） ＋ 汁物以外の小鉢
  const hasSoup =
    sides.has('side_miso_soup') || sides.has('side_tonjiru_soup') || sides.has('side_veggie_soup');
  const nonSoupSidesCount = Array.from(sides).filter(
    s => s !== 'side_miso_soup' && s !== 'side_tonjiru_soup' && s !== 'side_veggie_soup'
  ).length;

  if (main && hasSoup && nonSoupSidesCount >= 1) {
    return '一汁三菜・夕定食';
  }

  return null;
}

export function normalizeMediaPipeStaticImageResult(
  rawResult: MediaPipeStaticImageRawResult
): MediaPipeStaticImageNormalizedResult {
  const sortableCategories = (rawResult.categories ?? [])
    .map(category => toSortableCategory(category))
    .filter((category): category is { label: string; score: number } => Boolean(category))
    .sort((left, right) => right.score - left.score);

  // Check if result is from Personal 3-Axis Multi-Label model
  const hasAxisTags = sortableCategories.some(c => {
    const mapping = LABEL_MAPPING[c.label];
    return Boolean(mapping?.axis);
  });

  if (hasAxisTags) {
    return normalizePersonal3AxisResult(rawResult, sortableCategories);
  }

  return normalizeSingleClassificationResult(rawResult, sortableCategories);
}

/**
 * Normalization for standard single-label classification (23 classes, 9 classes, 7 classes).
 */
function normalizeSingleClassificationResult(
  rawResult: MediaPipeStaticImageRawResult,
  sortableCategories: Array<{ label: string; score: number }>
): MediaPipeStaticImageNormalizedResult {
  const mealNames: MealInputAssistTextProviderCandidate[] = [];
  const cuisineTypes: MealInputAssistTextProviderCandidate[] = [];
  const seenMealNames = new Set<string>();
  const seenCuisineTypes = new Set<CuisineTypeOption>();
  let matchedCategoryCount = 0;

  sortableCategories.forEach(category => {
    const mapping = LABEL_MAPPING[category.label];
    if (!mapping) {
      return;
    }

    matchedCategoryCount += 1;

    if (mapping.excludeFromSuggestions) {
      return;
    }

    if (
      mapping.mealName &&
      mealNames.length < MAX_MEAL_NAME_SUGGESTIONS &&
      !seenMealNames.has(mapping.mealName)
    ) {
      seenMealNames.add(mapping.mealName);
      mealNames.push({
        value: mapping.mealName,
        confidence: category.score,
      });
    }

    if (
      mapping.cuisineType &&
      cuisineTypes.length < MAX_CUISINE_SUGGESTIONS &&
      !seenCuisineTypes.has(mapping.cuisineType)
    ) {
      seenCuisineTypes.add(mapping.cuisineType);
      cuisineTypes.push({
        value: mapping.cuisineType,
        confidence: category.score,
      });
    }
  });

  return {
    providerResult: toProviderResult(mealNames, cuisineTypes),
    metadata: {
      categoryCount: rawResult.categories?.length ?? 0,
      matchedCategoryCount,
      droppedCategoryCount: (rawResult.categories?.length ?? 0) - matchedCategoryCount,
      topCategoryLabel: sortableCategories[0]?.label,
      topCategoryScore: sortableCategories[0]?.score,
      classifierName: rawResult.classifierName ?? null,
      modelVersion: rawResult.modelVersion ?? null,
    },
  };
}

/**
 * Normalization for Personal Dual Dish / 3-Axis Multi-Label model.
 * Applies per-axis dynamic thresholds, Top-2 side dish suggestions (excluding side_none),
 * rule-based scene derivation, and noteDraft composition.
 */
function normalizePersonal3AxisResult(
  rawResult: MediaPipeStaticImageRawResult,
  sortableCategories: Array<{ label: string; score: number }>
): MediaPipeStaticImageNormalizedResult {
  const mealNames: MealInputAssistTextProviderCandidate[] = [];
  const cuisineTypes: MealInputAssistTextProviderCandidate[] = [];
  const detectedSideDishes: string[] = [];
  const detectedSideLabels: string[] = [];
  let detectedMainClean: string | null = null;
  let detectedMainLabel: string | null = null;
  let detectedSceneClean: string | null = null;
  let highestMainConfidence = 0;
  let matchedCategoryCount = 0;

  // Separate categories by axis
  const mainCategories: Array<{ label: string; score: number }> = [];
  const sideCategories: Array<{ label: string; score: number }> = [];
  const sceneCategories: Array<{ label: string; score: number }> = [];

  sortableCategories.forEach(category => {
    const mapping = LABEL_MAPPING[category.label];
    if (!mapping) {
      return;
    }
    matchedCategoryCount += 1;

    if (mapping.axis === 'main') {
      mainCategories.push(category);
    } else if (mapping.axis === 'side') {
      sideCategories.push(category);
    } else if (mapping.axis === 'scene') {
      sceneCategories.push(category);
    }
  });

  // 1. Main Dish Axis (Top-1, threshold >= 0.30)
  if (mainCategories.length > 0) {
    const topMain = mainCategories[0];
    const mapping = LABEL_MAPPING[topMain.label];
    if (topMain.score >= PERSONAL_MAIN_MIN_THRESHOLD && mapping) {
      if (mapping.mealName) {
        mealNames.push({
          value: mapping.mealName,
          confidence: topMain.score,
        });
      }
      if (mapping.cuisineType) {
        cuisineTypes.push({
          value: mapping.cuisineType,
          confidence: topMain.score,
        });
      }
      detectedMainClean = mapping.cleanName || mapping.mealName || null;
      detectedMainLabel = topMain.label;
      highestMainConfidence = topMain.score;
    }
  }

  // 2. Side Dish & Soup Axis (Top-2, threshold >= 0.20, side_none excluded)
  const validSides = sideCategories.filter(c => {
    if (c.label === 'side_none') {
      return false;
    }
    const mapping = LABEL_MAPPING[c.label];
    return Boolean(mapping?.cleanName) && c.score >= PERSONAL_SIDE_MIN_THRESHOLD;
  });

  for (let i = 0; i < Math.min(validSides.length, PERSONAL_MAX_SIDE_SUGGESTIONS); i++) {
    const category = validSides[i];
    const mapping = LABEL_MAPPING[category.label];
    if (mapping?.cleanName) {
      detectedSideDishes.push(mapping.cleanName);
      detectedSideLabels.push(category.label);
      if (mealNames.length < MAX_MEAL_NAME_SUGGESTIONS) {
        mealNames.push({
          value: mapping.cleanName,
          confidence: category.score,
        });
      }
    }
  }

  // 3. Scene Axis (Legacy explicit scene tag fallback, or rule-based derivation)
  const validScene = sceneCategories.find(c => c.score >= PERSONAL_SCENE_MIN_THRESHOLD);
  if (validScene) {
    const mapping = LABEL_MAPPING[validScene.label];
    if (mapping?.cleanName) {
      detectedSceneClean = mapping.cleanName;
    }
  }
  if (!detectedSceneClean) {
    detectedSceneClean = deriveSceneFromDishes({
      mainDishLabel: detectedMainLabel,
      sideDishLabels: detectedSideLabels,
      timestamp: rawResult.timestamp,
    });
  }

  // Low confidence fallback: If both main dish and side dishes are missing, return empty suggestions
  if (!detectedMainClean && detectedSideDishes.length === 0) {
    return {
      providerResult: toProviderResult([], []),
      metadata: {
        categoryCount: rawResult.categories?.length ?? 0,
        matchedCategoryCount,
        droppedCategoryCount: (rawResult.categories?.length ?? 0) - matchedCategoryCount,
        topCategoryLabel: sortableCategories[0]?.label,
        topCategoryScore: sortableCategories[0]?.score,
        classifierName: rawResult.classifierName ?? null,
        modelVersion: rawResult.modelVersion ?? null,
      },
    };
  }

  // Synthesize noteDraft
  const draftText = composeMultiAxisNoteDraft(
    detectedMainClean,
    detectedSideDishes,
    detectedSceneClean
  );
  const noteDraft: MealInputAssistTextProviderCandidate | null = draftText
    ? {
        value: draftText,
        confidence: highestMainConfidence || validSides[0]?.score || 0.5,
      }
    : null;

  return {
    providerResult: toProviderResult(mealNames, cuisineTypes, noteDraft),
    metadata: {
      categoryCount: rawResult.categories?.length ?? 0,
      matchedCategoryCount,
      droppedCategoryCount: (rawResult.categories?.length ?? 0) - matchedCategoryCount,
      topCategoryLabel: sortableCategories[0]?.label,
      topCategoryScore: sortableCategories[0]?.score,
      classifierName: rawResult.classifierName ?? null,
      modelVersion: rawResult.modelVersion ?? null,
    },
  };
}
