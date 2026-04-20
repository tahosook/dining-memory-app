import type {
  AiCapability,
  AiCapabilityAvailability,
  AiRuntimeMode,
  AiRuntimeUnavailableCode,
} from './types';

interface CreateReadyAiCapabilityAvailabilityParams<TProvider> {
  capability: AiCapability;
  mode: AiRuntimeMode;
  description: string;
  provider: TProvider;
}

export function createReadyAiCapabilityAvailability<TProvider>({
  capability,
  mode,
  description,
  provider,
}: CreateReadyAiCapabilityAvailabilityParams<TProvider>): AiCapabilityAvailability<TProvider> {
  return {
    kind: 'ready',
    capability,
    mode,
    description,
    provider,
  };
}

export function createOverrideAiCapabilityAvailability<TProvider>(
  capability: AiCapability,
  provider: TProvider,
  description = 'Injected AI runtime provider'
): AiCapabilityAvailability<TProvider> {
  return createReadyAiCapabilityAvailability({
    capability,
    mode: 'override',
    description,
    provider,
  });
}

export function createUnavailableAiCapabilityAvailability<TProvider>(
  capability: AiCapability,
  code: AiRuntimeUnavailableCode,
  reason: string
): AiCapabilityAvailability<TProvider> {
  return {
    kind: 'unavailable',
    capability,
    mode: 'local-runtime-prototype',
    code,
    reason,
  };
}

export function createUnsupportedArchitectureAiCapabilityAvailability<TProvider>(
  capability: AiCapability,
  reason: string
): AiCapabilityAvailability<TProvider> {
  return createUnavailableAiCapabilityAvailability(capability, 'unsupported_architecture', reason);
}

export function createNoopAiCapabilityAvailability<TProvider>(
  capability: AiCapability,
  provider: TProvider,
  description = 'Injected noop AI runtime provider'
): AiCapabilityAvailability<TProvider> {
  return createReadyAiCapabilityAvailability({
    capability,
    mode: 'override',
    description,
    provider,
  });
}
