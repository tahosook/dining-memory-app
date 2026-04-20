import {
  createNoopAiCapabilityAvailability,
  createOverrideAiCapabilityAvailability,
  createUnavailableAiCapabilityAvailability,
} from '../runtime/availability';
import type { AiCapabilityAvailability, AiRuntimeUnavailableCode } from '../runtime/types';
import type { MealInputAssistProvider, MealInputAssistRuntimeAvailability } from './types';

const MEAL_INPUT_ASSIST_CAPABILITY = 'meal-input-assist' as const;

function toMealInputAssistRuntimeAvailability(
  availability: AiCapabilityAvailability<MealInputAssistProvider>
): MealInputAssistRuntimeAvailability {
  if (availability.kind === 'ready') {
    return {
      kind: 'ready',
      mode: availability.mode,
      description: availability.description,
      provider: availability.provider,
    };
  }

  return {
    kind: 'unavailable',
    mode: availability.mode,
    code: availability.code,
    reason: availability.reason,
  };
}

export function createOverrideRuntimeAvailability(
  provider: MealInputAssistProvider,
  description = 'Injected meal input assist provider'
): MealInputAssistRuntimeAvailability {
  return toMealInputAssistRuntimeAvailability(
    createOverrideAiCapabilityAvailability(MEAL_INPUT_ASSIST_CAPABILITY, provider, description)
  );
}

export function createUnavailableRuntimeAvailability(
  code: AiRuntimeUnavailableCode,
  reason: string
): MealInputAssistRuntimeAvailability {
  return toMealInputAssistRuntimeAvailability(
    createUnavailableAiCapabilityAvailability(MEAL_INPUT_ASSIST_CAPABILITY, code, reason)
  );
}

export function createNoopRuntimeAvailability(
  provider: MealInputAssistProvider,
  description = 'Injected noop meal input assist provider'
): MealInputAssistRuntimeAvailability {
  return toMealInputAssistRuntimeAvailability(
    createNoopAiCapabilityAvailability(MEAL_INPUT_ASSIST_CAPABILITY, provider, description)
  );
}
