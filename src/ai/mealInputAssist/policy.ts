import type { MealInputAssistPolicy } from './types';

export const defaultMealInputAssistPolicy: MealInputAssistPolicy = (request) => {
  if (!request.photoUri.trim()) {
    return {
      kind: 'disabled',
      reason: '写真を確認できないため、AI候補を提案できません。',
    };
  }

  return { kind: 'enabled' };
};
