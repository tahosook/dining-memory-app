import {
  getLocalRuntimePrototypeAvailability,
} from '../mealInputAssist/localRuntimePrototype';
import { getMealInputAssistExpectedPaths } from '../mealInputAssist/modelConfig';
import type {
  AiRuntimeUnavailableCode,
  LocalAiRuntimeStatusEntry,
  LocalAiRuntimeStatusSnapshot,
} from './types';

function createReadyReason() {
  return '端末内 AI 入力補助 runtime を利用できます。';
}

function toMealInputAssistStatusEntry(
  availability: Awaited<ReturnType<typeof getLocalRuntimePrototypeAvailability>>
): LocalAiRuntimeStatusEntry {
  const expectedPaths = getMealInputAssistExpectedPaths();

  if (availability.kind === 'ready') {
    return {
      capability: 'meal-input-assist',
      kind: 'ready',
      mode: 'local-runtime-prototype',
      reason: createReadyReason(),
      expectedPaths,
    };
  }

  return {
    capability: 'meal-input-assist',
    kind: 'unavailable',
    mode: availability.mode,
    code: availability.code as AiRuntimeUnavailableCode,
    reason: availability.reason,
    expectedPaths,
  };
}

export async function getLocalAiRuntimeStatusSnapshot(): Promise<LocalAiRuntimeStatusSnapshot> {
  const mealInputAssistAvailability = await getLocalRuntimePrototypeAvailability();

  return {
    mealInputAssist: toMealInputAssistStatusEntry(mealInputAssistAvailability),
  };
}
