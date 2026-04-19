import { createMealInputAssistPolicy } from '../src/ai/mealInputAssist';

const request = {
  photoUri: 'file:///tmp/meal-photo.jpg',
  mealName: '',
  cuisineType: '',
  notes: '',
  locationName: '',
  isHomemade: true,
} as const;

const readyRuntimeAvailability = {
  kind: 'ready' as const,
  mode: 'override' as const,
  description: 'Test runtime',
  provider: {
    suggest: jest.fn(),
  },
};

describe('createMealInputAssistPolicy', () => {
  test('returns disabled when settings keep AI input assist off', () => {
    const policy = createMealInputAssistPolicy({
      isEnabled: false,
      runtimeAvailability: readyRuntimeAvailability,
    });

    expect(policy(request)).toEqual({
      kind: 'disabled',
      reason: '設定画面でAI入力補助をオンにすると利用できます。',
    });
  });

  test('returns disabled when runtime is unavailable', () => {
    const policy = createMealInputAssistPolicy({
      isEnabled: true,
      runtimeAvailability: {
        kind: 'unavailable',
        mode: 'local-runtime-prototype',
        code: 'model_unavailable',
        reason: '端末内 AI model がまだ準備されていません。',
      },
    });

    expect(policy(request)).toEqual({
      kind: 'disabled',
      reason: '端末内 AI model がまだ準備されていません。',
    });
  });

  test('returns enabled when settings are on and runtime is ready', () => {
    const policy = createMealInputAssistPolicy({
      isEnabled: true,
      runtimeAvailability: readyRuntimeAvailability,
    });

    expect(policy(request)).toEqual({ kind: 'enabled' });
  });
});
