import {
  getLocalRuntimePrototypeAvailability,
  resolveMealInputAssistModelPath,
  resolveMealInputAssistProjectorPath,
} from '../mealInputAssist/localRuntimePrototype';
import { getLocalLlamaTextEmbeddingAvailability, resolveSemanticSearchModelPath } from './localLlama';
import type {
  AiCapabilityAvailability,
  AiRuntimeUnavailableCode,
  LocalAiRuntimeStatusCapability,
  LocalAiRuntimeStatusEntry,
  LocalAiRuntimeStatusSnapshot,
} from './types';

function compactExpectedPaths(paths: Array<string | null>) {
  return paths.filter((path): path is string => Boolean(path));
}

function createReadyReason(capability: LocalAiRuntimeStatusCapability) {
  if (capability === 'semantic-search') {
    return '端末内 semantic search runtime を利用できます。';
  }

  return '端末内 AI 入力補助 runtime を利用できます。';
}

function toStatusEntry<TProvider>(
  capability: LocalAiRuntimeStatusCapability,
  availability: AiCapabilityAvailability<TProvider>,
  expectedPaths: string[]
): LocalAiRuntimeStatusEntry {
  if (availability.kind === 'ready') {
    return {
      capability,
      kind: 'ready',
      mode: 'local-runtime-prototype',
      reason: createReadyReason(capability),
      expectedPaths,
    };
  }

  return {
    capability,
    kind: 'unavailable',
    mode: availability.mode,
    code: availability.code,
    reason: availability.reason,
    expectedPaths,
  };
}

function toMealInputAssistStatusEntry(
  availability: Awaited<ReturnType<typeof getLocalRuntimePrototypeAvailability>>
): LocalAiRuntimeStatusEntry {
  const expectedPaths = compactExpectedPaths([
    resolveMealInputAssistModelPath(),
    resolveMealInputAssistProjectorPath(),
  ]);

  if (availability.kind === 'ready') {
    return {
      capability: 'meal-input-assist',
      kind: 'ready',
      mode: 'local-runtime-prototype',
      reason: createReadyReason('meal-input-assist'),
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
  const [semanticSearchAvailability, mealInputAssistAvailability] = await Promise.all([
    getLocalLlamaTextEmbeddingAvailability(),
    getLocalRuntimePrototypeAvailability(),
  ]);

  return {
    semanticSearch: toStatusEntry(
      'semantic-search',
      semanticSearchAvailability,
      compactExpectedPaths([resolveSemanticSearchModelPath()])
    ),
    mealInputAssist: toMealInputAssistStatusEntry(mealInputAssistAvailability),
  };
}
