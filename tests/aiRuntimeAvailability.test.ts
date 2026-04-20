import {
  createNoopAiCapabilityAvailability,
  createOverrideAiCapabilityAvailability,
  createUnavailableAiCapabilityAvailability,
  createUnsupportedArchitectureAiCapabilityAvailability,
} from '../src/ai/runtime';

describe('ai runtime availability helpers', () => {
  const provider = {
    run: jest.fn(),
  };

  test('creates override-ready availability', () => {
    expect(
      createOverrideAiCapabilityAvailability('meal-input-assist', provider, 'Injected provider')
    ).toEqual({
      kind: 'ready',
      capability: 'meal-input-assist',
      mode: 'override',
      description: 'Injected provider',
      provider,
    });
  });

  test('creates explicit unavailable availability', () => {
    expect(
      createUnavailableAiCapabilityAvailability(
        'meal-input-assist',
        'model_unavailable',
        'Model file is missing.'
      )
    ).toEqual({
      kind: 'unavailable',
      capability: 'meal-input-assist',
      mode: 'local-runtime-prototype',
      code: 'model_unavailable',
      reason: 'Model file is missing.',
    });
  });

  test('creates explicit noop and unsupported-architecture helpers separately', () => {
    expect(
      createNoopAiCapabilityAvailability('meal-input-assist', provider, 'Injected noop provider')
    ).toEqual({
      kind: 'ready',
      capability: 'meal-input-assist',
      mode: 'override',
      description: 'Injected noop provider',
      provider,
    });

    expect(
      createUnsupportedArchitectureAiCapabilityAvailability(
        'meal-input-assist',
        'This device architecture is not supported.'
      )
    ).toEqual({
      kind: 'unavailable',
      capability: 'meal-input-assist',
      mode: 'local-runtime-prototype',
      code: 'unsupported_architecture',
      reason: 'This device architecture is not supported.',
    });
  });
});
