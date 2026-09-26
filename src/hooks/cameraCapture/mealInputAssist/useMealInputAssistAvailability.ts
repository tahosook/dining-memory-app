import { useMemo } from 'react';
import { createMealInputAssistPolicy } from '../../../ai/mealInputAssist/policy';
import type {
  MealInputAssistAvailability,
  MealInputAssistPolicy,
  MealInputAssistRuntimeAvailability,
} from '../../../ai/mealInputAssist/types';
import type { MealInputAssistRequest } from '../../../ai/mealInputAssist/types';

interface UseMealInputAssistAvailabilityParams {
  request: MealInputAssistRequest | null;
  policy?: MealInputAssistPolicy;
  isAiInputAssistEnabled: boolean | null;
  runtimeAvailability: MealInputAssistRuntimeAvailability | null;
}

export function useMealInputAssistAvailability({
  request,
  policy,
  isAiInputAssistEnabled,
  runtimeAvailability,
}: UseMealInputAssistAvailabilityParams) {
  const availability = useMemo<MealInputAssistAvailability>(() => {
    if (!request) {
      return { kind: 'enabled' };
    }

    if (policy) {
      return policy(request);
    }

    if (!request.photoUri.trim()) {
      return {
        kind: 'disabled',
        reason: '写真を確認できないため、AI候補を提案できません。',
      };
    }

    if (isAiInputAssistEnabled === null) {
      return {
        kind: 'disabled',
        reason: 'AI入力補助の準備を確認中です。',
      };
    }

    if (!isAiInputAssistEnabled) {
      return {
        kind: 'disabled',
        reason: '設定画面でAI入力補助をオンにすると利用できます。',
      };
    }

    if (runtimeAvailability === null) {
      return { kind: 'enabled' };
    }

    return createMealInputAssistPolicy({
      isEnabled: isAiInputAssistEnabled,
      runtimeAvailability,
    })(request);
  }, [isAiInputAssistEnabled, policy, request, runtimeAvailability]);

  return { availability };
}
