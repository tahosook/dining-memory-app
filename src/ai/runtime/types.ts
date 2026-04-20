export type AiCapability = 'meal-input-assist';

export type AiRuntimeMode = 'local-runtime-prototype' | 'override';

export type AiRuntimeUnavailableCode = 'runtime_unavailable' | 'model_unavailable' | 'unsupported_architecture';

export type LocalAiRuntimeStatusCapability = 'meal-input-assist';

export interface AiReadyCapabilityAvailability<TProvider> {
  kind: 'ready';
  capability: AiCapability;
  mode: AiRuntimeMode;
  description: string;
  provider: TProvider;
}

export interface AiUnavailableCapabilityAvailability {
  kind: 'unavailable';
  capability: AiCapability;
  mode: 'local-runtime-prototype';
  code: AiRuntimeUnavailableCode;
  reason: string;
}

export type AiCapabilityAvailability<TProvider> =
  | AiReadyCapabilityAvailability<TProvider>
  | AiUnavailableCapabilityAvailability;

export interface LocalAiRuntimeStatusEntry {
  capability: LocalAiRuntimeStatusCapability;
  kind: 'ready' | 'unavailable';
  mode: 'local-runtime-prototype';
  code?: AiRuntimeUnavailableCode;
  reason: string;
  expectedPaths: string[];
}

export interface LocalAiRuntimeStatusSnapshot {
  mealInputAssist: LocalAiRuntimeStatusEntry;
}
