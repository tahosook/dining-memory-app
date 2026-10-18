import { createUnavailableRuntimeAvailability } from './runtimeAvailability';
import type { MealInputAssistProviderMode, MealInputAssistRuntimeAvailability } from './types';

export interface MealInputAssistEnvironment {
  isAiInputAssistEnabled: boolean;
  runtimeAvailability: MealInputAssistRuntimeAvailability | null;
}

export interface MealInputAssistEnvironmentLoaderDependencies {
  loadAiInputAssistEnabledSetting: () => Promise<boolean>;
  loadRuntimeAvailability: () => Promise<MealInputAssistRuntimeAvailability>;
}

let environmentRevision = 0;
const environmentListeners = new Set<() => void>();

export function getMealInputAssistEnvironmentRevision(): number {
  return environmentRevision;
}

export function invalidateMealInputAssistEnvironment(): void {
  environmentRevision += 1;
  environmentListeners.forEach(listener => {
    try {
      listener();
    } catch (error) {
      console.error('Failed to notify meal input assist environment listener:', error);
    }
  });
}

export function subscribeMealInputAssistEnvironmentChange(listener: () => void): () => void {
  environmentListeners.add(listener);
  return () => {
    environmentListeners.delete(listener);
  };
}

type MealInputAssistRuntimeModule = typeof import('./runtime');

export async function loadDefaultMealInputAssistRuntimeAvailability(
  mode: MealInputAssistProviderMode = 'mediapipe-static-image'
) {
  const { loadMealInputAssistRuntimeAvailability } =
    require('./runtime') as MealInputAssistRuntimeModule;

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
