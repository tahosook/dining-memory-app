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

type LabelMapping = {
  mealName?: string;
  cuisineType?: CuisineTypeOption;
  excludeFromSuggestions?: boolean;
};

const LABEL_MAPPING: Record<string, LabelMapping> = {
  ramen: {
    mealName: 'ラーメン',
    cuisineType: '中華',
  },
  udon: {
    mealName: 'うどん',
    cuisineType: '和食',
  },
  soba: {
    mealName: 'そば',
    cuisineType: '和食',
  },
  sushi: {
    mealName: '寿司',
    cuisineType: '和食',
  },
  curry_rice: {
    mealName: 'カレーライス',
    cuisineType: '洋食',
  },
  set_meal: {
    mealName: '定食',
    cuisineType: '和食',
  },
  dessert: {
    mealName: 'デザート',
    cuisineType: 'その他',
  },
  drink: {
    mealName: '飲み物',
    cuisineType: 'その他',
  },
  bento: {
    mealName: '弁当',
    cuisineType: '和食',
  },
  fish_dish: {
    mealName: '魚料理',
    cuisineType: '和食',
  },
  fried_dish: {
    mealName: '揚げ物',
    cuisineType: 'その他',
  },
  meat_dish: {
    mealName: '肉料理',
    cuisineType: 'その他',
  },
  noodles: {
    mealName: '麺類',
    cuisineType: 'その他',
  },
  simmered_dish: {
    mealName: '煮物',
    cuisineType: '和食',
  },
  stir_fry: {
    mealName: '炒め物',
    cuisineType: '中華',
  },
  other_or_exclude: {
    excludeFromSuggestions: true,
  },
  // Model 1: Universal Dining Scene (7 classes)
  home_teishoku_set: {
    mealName: 'おうち定食',
    cuisineType: '和食',
  },
  one_plate_or_curry: {
    mealName: 'ワンプレート・カレー',
    cuisineType: '洋食',
  },
  izakaya_bistro_or_party: {
    mealName: '晩酌・パーティー',
    cuisineType: 'その他',
  },
  noodles_or_single_bowl: {
    mealName: '麺・単品ボウル',
    cuisineType: 'その他',
  },
  dining_out_or_tray_meal: {
    mealName: '外食・トレイ飯',
    cuisineType: 'その他',
  },
  drink_or_bottle_record: {
    mealName: 'お酒・ドリンク',
    cuisineType: 'その他',
  },
  non_food_or_exclude: {
    excludeFromSuggestions: true,
  },
  // Model 2: Personal Household & Wife's Cooking (8 classes)
  wife_multi_dish_teishoku: {
    mealName: '一汁複数菜・夕定食',
    cuisineType: '和食',
  },
  wife_nordic_one_plate: {
    mealName: '北欧大皿ワンプレート',
    cuisineType: '洋食',
  },
  wife_curry_or_ethnic_plate: {
    mealName: '特製カレー・エスニック皿',
    cuisineType: '洋食',
  },
  wife_morning_salmon_natto: {
    mealName: '焼き鮭＆納豆の和朝食',
    cuisineType: '和食',
  },
  wife_bistro_baguette_bal: {
    mealName: '洋風ビストロ・おうちバル',
    cuisineType: '洋食',
  },
  wife_izakaya_small_dishes: {
    mealName: 'おうち居酒屋・染付晩酌膳',
    cuisineType: '和食',
  },
  household_pot_noodles_or_ramen_rice: {
    mealName: '鍋麺・ラーメンライス',
    cuisineType: 'その他',
  },
  special_takeout_party_feast: {
    mealName: 'テイクアウト宴席',
    cuisineType: 'その他',
  },
};

function normalizeScore(score: number | null | undefined) {
  if (typeof score !== 'number' || Number.isNaN(score)) {
    return null;
  }

  return Math.max(0, Math.min(1, score));
}

function normalizeLabel(label: string | null | undefined) {
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

  return {
    label,
    score,
  };
}

function toProviderResult(
  mealNames: MealInputAssistTextProviderCandidate[],
  cuisineTypes: MealInputAssistTextProviderCandidate[]
): MealInputAssistProviderResult {
  return {
    source: MEDIAPIPE_STATIC_IMAGE_SOURCE,
    mealNames,
    cuisineTypes,
  };
}

export function normalizeMediaPipeStaticImageResult(
  rawResult: MediaPipeStaticImageRawResult
): MediaPipeStaticImageNormalizedResult {
  const mealNames: MealInputAssistTextProviderCandidate[] = [];
  const cuisineTypes: MealInputAssistTextProviderCandidate[] = [];
  const seenMealNames = new Set<string>();
  const seenCuisineTypes = new Set<CuisineTypeOption>();
  const sortableCategories = (rawResult.categories ?? [])
    .map(category => toSortableCategory(category))
    .filter((category): category is { label: string; score: number } => Boolean(category))
    .sort((left, right) => right.score - left.score);

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
