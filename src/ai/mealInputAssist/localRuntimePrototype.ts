import type { MealInputAssistProvider, MealInputAssistProviderResult, MealInputAssistRequest, MealInputAssistRuntimeAvailability } from './types';

const LOCAL_RUNTIME_PROTOTYPE_STATUS = {
  hasNativeRuntimeIntegration: false,
  hasBundledModel: false,
} as const;

export class LocalRuntimePrototypeMealInputAssistProvider implements MealInputAssistProvider {
  async suggest(_request: MealInputAssistRequest): Promise<MealInputAssistProviderResult> {
    throw new Error('Local runtime prototype is not available in this build.');
  }
}

export async function getLocalRuntimePrototypeAvailability(): Promise<MealInputAssistRuntimeAvailability> {
  await Promise.resolve();

  if (!LOCAL_RUNTIME_PROTOTYPE_STATUS.hasNativeRuntimeIntegration) {
    return {
      kind: 'unavailable',
      mode: 'local-runtime-prototype',
      code: 'runtime_unavailable',
      reason: 'この build には端末内 AI runtime がまだ組み込まれていません。',
    };
  }

  if (!LOCAL_RUNTIME_PROTOTYPE_STATUS.hasBundledModel) {
    return {
      kind: 'unavailable',
      mode: 'local-runtime-prototype',
      code: 'model_unavailable',
      reason: '端末内 AI model がまだ準備されていません。',
    };
  }

  return {
    kind: 'ready',
    mode: 'local-runtime-prototype',
    description: 'Local runtime prototype provider',
    provider: new LocalRuntimePrototypeMealInputAssistProvider(),
  };
}
