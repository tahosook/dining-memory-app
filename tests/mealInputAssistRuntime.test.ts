jest.mock('llama.rn', () => require('llama.rn/jest/mock'));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(),
}));

import { NativeModules, Platform } from 'react-native';
import { getInfoAsync } from 'expo-file-system/legacy';
import * as llamaRn from 'llama.rn';
import { loadMealInputAssistRuntimeAvailability, normalizeMealInputAssistResult } from '../src/ai/mealInputAssist';
import {
  resolveMealInputAssistModelPath,
  resolveMealInputAssistProjectorPath,
} from '../src/ai/mealInputAssist/localRuntimePrototype';

describe('meal input assist runtime availability', () => {
  beforeEach(() => {
    jest.restoreAllMocks();

    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'ios',
    });

    NativeModules.RNLlama = {
      install: jest.fn().mockResolvedValue(true),
    };
    NativeModules.PlatformConstants = {};

    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
  });

  test('resolves the fixed app-local meal input assist paths', () => {
    expect(resolveMealInputAssistModelPath()).toBe('file:///documents/ai-models/meal-input-assist.gguf');
    expect(resolveMealInputAssistProjectorPath()).toBe('file:///documents/ai-models/meal-input-assist.mmproj');
  });

  test('returns a ready local runtime provider when native runtime, model, and projector are available', async () => {
    const availability = await loadMealInputAssistRuntimeAvailability('local-runtime-prototype');

    expect(availability).toEqual(expect.objectContaining({
      kind: 'ready',
      mode: 'local-runtime-prototype',
      description: 'Local multimodal meal input assist provider',
    }));
  });

  test('parses real-runtime suggestion output through the existing normalizer', async () => {
    const fakeContext = {
      clearCache: jest.fn().mockResolvedValue(undefined),
      initMultimodal: jest.fn().mockResolvedValue(true),
      getMultimodalSupport: jest.fn().mockResolvedValue({ vision: true, audio: false }),
      completion: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          mealNames: [{ value: '海鮮丼', confidence: 0.91 }],
          cuisineTypes: [{ value: '和食', confidence: 0.82 }],
          homemade: [{ value: '外食', confidence: 0.76 }],
        }),
      }),
    };
    jest.spyOn(llamaRn, 'initLlama').mockResolvedValue(fakeContext as never);

    const availability = await loadMealInputAssistRuntimeAvailability('local-runtime-prototype');

    expect(availability.kind).toBe('ready');

    expect(availability.kind).toBe('ready');

    if (availability.kind !== 'ready') {
      throw new Error('Expected local runtime availability to be ready.');
    }

    const rawResult = await availability.provider.suggest({
      photoUri: 'file:///tmp/mock-meal.jpg',
      mealName: '',
      cuisineType: '',
      notes: '',
      locationName: '',
      isHomemade: true,
    });
    const normalized = normalizeMealInputAssistResult(rawResult);

    expect(fakeContext.initMultimodal).toHaveBeenCalledWith({
      path: 'file:///documents/ai-models/meal-input-assist.mmproj',
      image_max_tokens: 224,
    });
    expect(llamaRn.initLlama).toHaveBeenCalledWith(expect.objectContaining({
      model: 'file:///documents/ai-models/meal-input-assist.gguf',
      n_ctx: 4096,
      ctx_shift: false,
      n_batch: 128,
      use_mmap: true,
    }), expect.any(Function));
    expect(fakeContext.completion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'system',
            content: 'あなたは食事記録アプリの AI 入力補助です。返答は JSON オブジェクトだけにしてください。',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: expect.stringContaining('写真を見て、保存候補だけを JSON で返してください。'),
              },
              {
                type: 'image_url',
                image_url: {
                  url: 'file:///tmp/mock-meal.jpg',
                },
              },
            ],
          },
        ],
        n_predict: 96,
      }),
      expect.any(Function)
    );
    expect(fakeContext.completion.mock.calls[0]?.[0]?.response_format).toBeUndefined();
    expect(normalized.source).toBe('local-meal-input-assist');
    expect(normalized.mealNames[0]?.value).toBe('海鮮丼');
    expect(normalized.cuisineTypes[0]?.value).toBe('和食');
  });

  test('throws a descriptive error when the runtime returns no text payload', async () => {
    const fakeContext = {
      clearCache: jest.fn().mockResolvedValue(undefined),
      initMultimodal: jest.fn().mockResolvedValue(true),
      getMultimodalSupport: jest.fn().mockResolvedValue({ vision: true, audio: false }),
      completion: jest.fn().mockResolvedValue({
        text: '',
        content: undefined,
        tokens_predicted: 0,
        tokens_evaluated: 488,
        stopped_eos: true,
        interrupted: false,
        context_full: false,
        truncated: false,
        stopped_limit: 0,
        stopped_word: '',
        stopping_word: '',
      }),
    };
    jest.spyOn(llamaRn, 'initLlama').mockResolvedValue(fakeContext as never);

    const availability = await loadMealInputAssistRuntimeAvailability('local-runtime-prototype');
    expect(availability.kind).toBe('ready');

    if (availability.kind !== 'ready') {
      throw new Error('Expected local runtime availability to be ready.');
    }

    await expect(availability.provider.suggest({
      photoUri: 'file:///tmp/mock-meal.jpg',
      mealName: '',
      cuisineType: '',
      notes: '',
      locationName: '',
      isHomemade: false,
    })).rejects.toThrow('Meal input assist response was empty.');
  });

  test('logs a raw response preview when the model returns no provider candidates', async () => {
    const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(jest.fn());
    const fakeContext = {
      clearCache: jest.fn().mockResolvedValue(undefined),
      initMultimodal: jest.fn().mockResolvedValue(true),
      getMultimodalSupport: jest.fn().mockResolvedValue({ vision: true, audio: false }),
      completion: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          mealNames: [],
          cuisineTypes: [],
          homemade: [],
        }),
        tokens_predicted: 18,
        tokens_evaluated: 312,
      }),
    };
    jest.spyOn(llamaRn, 'initLlama').mockResolvedValue(fakeContext as never);

    const availability = await loadMealInputAssistRuntimeAvailability('local-runtime-prototype');
    expect(availability.kind).toBe('ready');

    if (availability.kind !== 'ready') {
      throw new Error('Expected local runtime availability to be ready.');
    }

    await expect(availability.provider.suggest({
      photoUri: 'file:///tmp/mock-meal.jpg',
      mealName: '',
      cuisineType: '',
      notes: '',
      locationName: '',
      isHomemade: false,
    })).resolves.toEqual({
      source: 'local-meal-input-assist',
      mealNames: [],
      cuisineTypes: [],
      homemade: [],
    });

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      'Meal input assist model response contained no provider candidates.',
      expect.objectContaining({
        candidateCounts: {
          mealNames: 0,
          cuisineTypes: 0,
          homemade: 0,
        },
        tokensPredicted: 18,
        tokensEvaluated: 312,
        rawResponsePreview: expect.stringContaining('"mealNames":[]'),
      })
    );

    consoleInfoSpy.mockRestore();
  });

  test('returns model_unavailable when the projector file is missing', async () => {
    (getInfoAsync as jest.Mock).mockImplementation(async (path: string) => ({
      exists: !path.endsWith('meal-input-assist.mmproj'),
    }));

    await expect(loadMealInputAssistRuntimeAvailability('local-runtime-prototype')).resolves.toEqual({
      kind: 'unavailable',
      mode: 'local-runtime-prototype',
      code: 'model_unavailable',
      reason: 'meal input assist projector が見つかりません: file:///documents/ai-models/meal-input-assist.mmproj',
    });
  });

  test('returns runtime_unavailable when the native module is not linked', async () => {
    NativeModules.RNLlama = undefined;

    await expect(loadMealInputAssistRuntimeAvailability('local-runtime-prototype')).resolves.toEqual({
      kind: 'unavailable',
      mode: 'local-runtime-prototype',
      code: 'runtime_unavailable',
      reason: 'この build には端末内 AI runtime がまだ組み込まれていません。',
    });
  });

  test('returns unsupported_architecture on Android when only unsupported ABIs are exposed', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    NativeModules.PlatformConstants = {
      SupportedAbis: ['armeabi-v7a'],
    };

    await expect(loadMealInputAssistRuntimeAvailability('local-runtime-prototype')).resolves.toEqual({
      kind: 'unavailable',
      mode: 'local-runtime-prototype',
      code: 'unsupported_architecture',
      reason: 'この Android ABI では端末内 AI 入力補助を利用できません。',
    });
  });
});
