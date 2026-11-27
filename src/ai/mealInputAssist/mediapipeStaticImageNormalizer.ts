import type { CuisineTypeOption } from '../../constants/MealOptions';
import type { MealInputAssistProviderResult, MealInputAssistTextProviderCandidate } from './types';
import { LABEL_MAPPING } from './mediapipeLabelMappings';
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
 * Deterministically derives a scene label from detected main dish and side dishes.
 * Matches canonical scene types defined in the app (e.g. 冬の団らん卓上鍋, 休日のあつあつ麺,
 * おうち居酒屋・晩酌, 定番の和朝食, パンの洋朝食, ワンプレート, 一汁三菜・夕定食, サクッと平日飯).
 * Note: scene_party_feast (ごちそう宴席パーティー) and scene_weekend_bal (週末おうちバル)
 * cannot be determined from dishes, sides, and time alone, and are excluded from automatic rule derivation.
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

  // 8. サクッと平日飯: 主菜のみ（該当する副菜の条件に合わない・副菜なし等）
  if (main) {
    return 'サクッと平日飯';
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
