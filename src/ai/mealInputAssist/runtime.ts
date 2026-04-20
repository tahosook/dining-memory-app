import { getLocalRuntimePrototypeAvailability } from './localRuntimePrototype';
import { MockMealInputAssistProvider } from './provider';
import type { MealInputAssistProviderMode, MealInputAssistRuntimeAvailability } from './types';

export { createNoopRuntimeAvailability, createOverrideRuntimeAvailability, createUnavailableRuntimeAvailability } from './runtimeAvailability';

export async function loadMealInputAssistRuntimeAvailability(
  mode: MealInputAssistProviderMode
): Promise<MealInputAssistRuntimeAvailability> {
  if (mode === 'mock') {
    return {
      kind: 'ready',
      mode: 'mock',
      description: 'Local mock meal input assist provider',
      provider: new MockMealInputAssistProvider(),
    };
  }

  if (mode === 'override') {
    throw new Error('Override mode requires an injected provider.');
  }

  return getLocalRuntimePrototypeAvailability();
}
