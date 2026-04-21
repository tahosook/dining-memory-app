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
  mealName: string;
  cuisineType: CuisineTypeOption;
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
    .map((category) => toSortableCategory(category))
    .filter((category): category is { label: string; score: number } => Boolean(category))
    .sort((left, right) => right.score - left.score);

  let matchedCategoryCount = 0;

  sortableCategories.forEach((category) => {
    const mapping = LABEL_MAPPING[category.label];
    if (!mapping) {
      return;
    }

    matchedCategoryCount += 1;

    if (mealNames.length < MAX_MEAL_NAME_SUGGESTIONS && !seenMealNames.has(mapping.mealName)) {
      seenMealNames.add(mapping.mealName);
      mealNames.push({
        value: mapping.mealName,
        confidence: category.score,
      });
    }

    if (cuisineTypes.length < MAX_CUISINE_SUGGESTIONS && !seenCuisineTypes.has(mapping.cuisineType)) {
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
