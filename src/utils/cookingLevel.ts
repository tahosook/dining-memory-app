import type { CookingLevel } from '../types/MealTypes';

const COOKING_LEVEL_LABELS: Record<CookingLevel, string> = {
  quick: '時短',
  daily: '日常',
  gourmet: '本格',
};

const LEGACY_COOKING_LEVEL_MAP: Record<string, CookingLevel> = {
  easy: 'quick',
  medium: 'daily',
  hard: 'gourmet',
};

const QUICK_KEYWORDS = [
  'トースト',
  '納豆',
  '卵かけ',
  'おにぎり',
  'サンドイッチ',
  'サラダ',
  'ヨーグルト',
  'シリアル',
  '冷奴',
  '目玉焼き',
  'インスタント',
  'カップ麺',
  'レトルト',
  '冷凍',
  '惣菜',
];

const DAILY_KEYWORDS = [
  'カレー',
  '親子丼',
  '牛丼',
  '生姜焼き',
  '野菜炒め',
  '焼きそば',
  'チャーハン',
  '味噌汁',
  '豚汁',
  '唐揚げ',
  'ハンバーグ',
  'パスタ',
  'オムライス',
  '鍋',
  'うどん',
  'そば',
];

const GOURMET_KEYWORDS = [
  'ローストビーフ',
  '角煮',
  '煮込み',
  'ビーフシチュー',
  'スペアリブ',
  '手打ち',
  '手作り餃子',
  '天ぷら',
  'ちらし寿司',
  '茶碗蒸し',
  'おせち',
  'クリスマス',
  '誕生日',
  '記念日',
];

type CookingLevelInferenceInput = {
  mealName?: string | null;
  cuisineType?: string | null;
  notes?: string | null;
  isHomemade?: boolean | null;
};

export function normalizeCookingLevel(value: unknown): CookingLevel | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return undefined;
  }

  if (normalizedValue === 'quick' || normalizedValue === 'daily' || normalizedValue === 'gourmet') {
    return normalizedValue;
  }

  return LEGACY_COOKING_LEVEL_MAP[normalizedValue];
}

export function formatCookingLevel(value: unknown): string {
  const normalizedValue = normalizeCookingLevel(value);
  return normalizedValue ? COOKING_LEVEL_LABELS[normalizedValue] : '未設定';
}

export function inferCookingLevel(input: CookingLevelInferenceInput): CookingLevel | undefined {
  if (input.isHomemade === false) {
    return undefined;
  }

  const text = [input.mealName, input.cuisineType, input.notes]
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
    .join(' ');

  if (!text.trim() || text.trim().length < 2) {
    return undefined;
  }

  if (GOURMET_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 'gourmet';
  }

  if (QUICK_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 'quick';
  }

  if (DAILY_KEYWORDS.some((keyword) => text.includes(keyword))) {
    return 'daily';
  }

  return 'daily';
}
