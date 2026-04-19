import type { MealInputAssistPolicy, MealInputAssistRuntimeAvailability } from './types';

interface CreateMealInputAssistPolicyOptions {
  isEnabled: boolean | null;
  runtimeAvailability: MealInputAssistRuntimeAvailability | null;
}

export function createMealInputAssistPolicy({
  isEnabled,
  runtimeAvailability,
}: CreateMealInputAssistPolicyOptions): MealInputAssistPolicy {
  return (request) => {
    if (!request.photoUri.trim()) {
      return {
        kind: 'disabled',
        reason: '写真を確認できないため、AI候補を提案できません。',
      };
    }

    if (isEnabled === null || runtimeAvailability === null) {
      return {
        kind: 'disabled',
        reason: 'AI入力補助の準備を確認中です。',
      };
    }

    if (!isEnabled) {
      return {
        kind: 'disabled',
        reason: '設定画面でAI入力補助をオンにすると利用できます。',
      };
    }

    if (runtimeAvailability.kind === 'unavailable') {
      return {
        kind: 'disabled',
        reason: runtimeAvailability.reason,
      };
    }

    return { kind: 'enabled' };
  };
}

export const defaultMealInputAssistPolicy: MealInputAssistPolicy = (request) => {
  if (!request.photoUri.trim()) {
    return {
      kind: 'disabled',
      reason: '写真を確認できないため、AI候補を提案できません。',
    };
  }

  return { kind: 'enabled' };
};
