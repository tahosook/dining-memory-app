import type { MealInputAssistProvider, MealInputAssistProviderResult, MealInputAssistRequest } from './types';

const MOCK_VARIANTS: MealInputAssistProviderResult[] = [
  {
    source: 'mock-local',
    mealNames: [
      { value: '海鮮丼', confidence: 0.86 },
      { value: 'まぐろ丼', confidence: 0.72 },
      { value: '刺身定食', confidence: 0.61 },
    ],
    cuisineTypes: [{ value: '和食', confidence: 0.88 }],
    homemade: [{ value: '外食', confidence: 0.82 }],
  },
  {
    source: 'mock-local',
    mealNames: [
      { value: '親子丼', confidence: 0.81 },
      { value: '鶏そぼろ丼', confidence: 0.67 },
      { value: 'だし巻き定食', confidence: 0.51 },
    ],
    cuisineTypes: [{ value: '和食', confidence: 0.84 }],
    homemade: [
      { value: true, confidence: 0.58, label: '自炊' },
      { value: false, confidence: 0.42, label: '外食' },
    ],
  },
  {
    source: 'mock-local',
    mealNames: [
      { value: '醤油ラーメン', confidence: 0.83 },
      { value: 'チャーシュー麺', confidence: 0.69 },
      { value: '味玉ラーメン', confidence: 0.62 },
    ],
    cuisineTypes: [{ value: '中華', confidence: 0.87 }],
    homemade: [{ value: false, confidence: 0.79, label: '外食' }],
  },
  {
    source: 'mock-local',
    mealNames: [
      { value: 'トマトパスタ', confidence: 0.78 },
      { value: 'ナポリタン', confidence: 0.63 },
      { value: 'ミートソース', confidence: 0.55 },
    ],
    cuisineTypes: [{ value: '洋食', confidence: 0.83 }],
    homemade: [
      { value: true, confidence: 0.66, label: '自炊' },
      { value: false, confidence: 0.34, label: '外食' },
    ],
  },
];

function hashPhotoUri(photoUri: string) {
  let hash = 0;

  for (let index = 0; index < photoUri.length; index += 1) {
    hash = (hash * 31 + photoUri.charCodeAt(index)) % Number.MAX_SAFE_INTEGER;
  }

  return hash;
}

export class MockMealInputAssistProvider implements MealInputAssistProvider {
  async suggest(request: MealInputAssistRequest): Promise<MealInputAssistProviderResult> {
    await Promise.resolve();

    const variantIndex = hashPhotoUri(request.photoUri) % MOCK_VARIANTS.length;
    return MOCK_VARIANTS[variantIndex] ?? MOCK_VARIANTS[0];
  }
}

export const defaultMealInputAssistProvider: MealInputAssistProvider = new MockMealInputAssistProvider();
