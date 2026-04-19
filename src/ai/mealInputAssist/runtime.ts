import { getLocalRuntimePrototypeAvailability } from './localRuntimePrototype';
import { MockMealInputAssistProvider } from './provider';
import type { MealInputAssistProvider, MealInputAssistProviderMode, MealInputAssistRuntimeAvailability } from './types';

export function createOverrideRuntimeAvailability(
  provider: MealInputAssistProvider,
  description = 'Injected meal input assist provider'
): MealInputAssistRuntimeAvailability {
  return {
    kind: 'ready',
    mode: 'override',
    description,
    provider,
  };
}

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
