import {
  createUnavailableRuntimeAvailability,
} from './runtimeAvailability';
import type {
  MealInputAssistProviderMode,
  MealInputAssistRuntimeAvailability,
} from './types';

export interface MealInputAssistEnvironment {
  isAiInputAssistEnabled: boolean;
  runtimeAvailability: MealInputAssistRuntimeAvailability | null;
}

export interface MealInputAssistEnvironmentLoaderDependencies {
  loadAiInputAssistEnabledSetting: () => Promise<boolean>;
  loadRuntimeAvailability: () => Promise<MealInputAssistRuntimeAvailability>;
}

type MealInputAssistRuntimeModule = typeof import('./runtime');

export async function loadDefaultMealInputAssistRuntimeAvailability(
  mode: MealInputAssistProviderMode = 'local-runtime-prototype'
) {
  const {
    loadMealInputAssistRuntimeAvailability,
  } = require('./runtime') as MealInputAssistRuntimeModule;

  return loadMealInputAssistRuntimeAvailability(mode);
}

export async function loadMealInputAssistEnvironment({
  loadAiInputAssistEnabledSetting,
  loadRuntimeAvailability,
}: MealInputAssistEnvironmentLoaderDependencies): Promise<MealInputAssistEnvironment> {
  const isAiInputAssistEnabled = await loadAiInputAssistEnabledSetting();

  if (!isAiInputAssistEnabled) {
    return {
      isAiInputAssistEnabled,
      runtimeAvailability: null,
    };
  }

  return {
    isAiInputAssistEnabled,
    runtimeAvailability: await loadRuntimeAvailability(),
  };
}

export function createMealInputAssistEnvironmentLoadFailure(): MealInputAssistEnvironment {
  return {
    isAiInputAssistEnabled: false,
    runtimeAvailability: createUnavailableRuntimeAvailability(
      'runtime_unavailable',
      'この build には端末内 AI runtime がまだ組み込まれていません。'
    ),
  };
}
