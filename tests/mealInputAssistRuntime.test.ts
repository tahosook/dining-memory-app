jest.mock('llama.rn', () => require('llama.rn/jest/mock'));

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: jest.fn(),
}));

import { waitFor } from '@testing-library/react-native';
import { NativeModules, Platform } from 'react-native';
import { getInfoAsync } from 'expo-file-system/legacy';
import * as llamaRn from 'llama.rn';
import {
  loadMealInputAssistRuntimeAvailability,
  normalizeMealInputAssistResult,
} from '../src/ai/mealInputAssist';
import {
  resetLocalRuntimePrototypeProviderCacheForTests,
  resolveMealInputAssistModelPath,
  resolveMealInputAssistProjectorPath,
} from '../src/ai/mealInputAssist/localRuntimePrototype';

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('meal input assist runtime availability', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    resetLocalRuntimePrototypeProviderCacheForTests();

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
    expect(resolveMealInputAssistModelPath()).toBe(
      'file:///documents/ai-models/meal-input-assist.gguf'
    );
    expect(resolveMealInputAssistProjectorPath()).toBe(
      'file:///documents/ai-models/meal-input-assist.mmproj'
    );
  });

  test('returns a ready local runtime provider when native runtime, model, and projector are available', async () => {
    const availability = await loadMealInputAssistRuntimeAvailability('local-runtime-prototype');

    expect(availability).toEqual(
      expect.objectContaining({
        kind: 'ready',
        mode: 'local-runtime-prototype',
        description: 'Local multimodal meal input assist provider',
      })
    );
  });

  test('reuses one local runtime provider across availability checks for the same model paths', async () => {
    const firstAvailability =
      await loadMealInputAssistRuntimeAvailability('local-runtime-prototype');
    const secondAvailability =
      await loadMealInputAssistRuntimeAvailability('local-runtime-prototype');

    expect(firstAvailability.kind).toBe('ready');
    expect(secondAvailability.kind).toBe('ready');

    if (firstAvailability.kind !== 'ready' || secondAvailability.kind !== 'ready') {
      throw new Error('Expected local runtime availability to be ready.');
    }

    expect(secondAvailability.provider).toBe(firstAvailability.provider);
  });

  test('parses real-runtime suggestion output through the existing normalizer', async () => {
    const fakeContext = {
      clearCache: jest.fn().mockResolvedValue(undefined),
      initMultimodal: jest.fn().mockResolvedValue(true),
      getMultimodalSupport: jest.fn().mockResolvedValue({ vision: true, audio: false }),
      completion: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          noteDraft: {
            value: '料理名: 海鮮丼に見える\nメモ: 魚介がのった丼もの\nタグ: #海鮮 #丼',
            confidence: 0.82,
          },
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
    expect(llamaRn.initLlama).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'file:///documents/ai-models/meal-input-assist.gguf',
        n_ctx: 4096,
        ctx_shift: false,
        n_batch: 128,
        use_mmap: true,
      }),
      expect.any(Function)
    );
    expect(fakeContext.completion).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          {
            role: 'system',
            content:
              'あなたは食事記録アプリの AI 入力補助です。返答は JSON オブジェクトだけにしてください。',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: expect.stringContaining(
                  '写真を見て、notes 欄に追記できる食事メモ下書きだけを JSON で返してください。'
                ),
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
    expect(fakeContext.completion.mock.calls[0]?.[0]?.messages?.[1]?.content?.[0]?.text).toEqual(
      expect.stringContaining('mealName 欄を埋める候補は返さないでください。')
    );
    expect(fakeContext.completion.mock.calls[0]?.[0]?.messages?.[1]?.content?.[0]?.text).toEqual(
      expect.stringContaining(
        'noteDraft を主出力にし、value は notes にそのまま貼れる 3〜5 行程度の日本語にしてください。'
      )
    );
    expect(fakeContext.completion.mock.calls[0]?.[0]?.messages?.[1]?.content?.[0]?.text).toEqual(
      expect.stringContaining(
        '「料理名:」「メモ:」「タグ:」などの見出しを使い、後で見返しやすい形にしてください。'
      )
    );
    expect(fakeContext.completion.mock.calls[0]?.[0]?.response_format).toBeUndefined();
    expect(normalized.source).toBe('local-meal-input-assist');
    expect(normalized.noteDraft?.value).toContain('料理名: 海鮮丼に見える');
    expect(normalized.mealNames).toEqual([]);
    expect(normalized.cuisineTypes).toEqual([]);
  });

  test('reports real runtime progress boundaries through multimodal setup, cache clear, completion submit, token generation, and finalizing', async () => {
    const progressUpdates: Array<{
      stage: string;
      message: string;
      progress: number | null;
      estimatedRemainingMs: number | null;
    }> = [];
    const fakeContext = {
      clearCache: jest.fn().mockResolvedValue(undefined),
      initMultimodal: jest.fn().mockResolvedValue(true),
      getMultimodalSupport: jest.fn().mockResolvedValue({ vision: true, audio: false }),
      completion: jest.fn().mockImplementation(async (_options, onToken) => {
        onToken?.();
        onToken?.();
        return {
          text: JSON.stringify({
            noteDraft: { value: '料理名: 海鮮丼に見える\nメモ: 魚介の丼もの', confidence: 0.82 },
          }),
        };
      }),
    };
    jest.spyOn(llamaRn, 'initLlama').mockImplementation(async (_options, onProgress) => {
      onProgress?.(25);
      onProgress?.(100);
      return fakeContext as never;
    });

    const availability = await loadMealInputAssistRuntimeAvailability('local-runtime-prototype');
    expect(availability.kind).toBe('ready');

    if (availability.kind !== 'ready') {
      throw new Error('Expected local runtime availability to be ready.');
    }

    await availability.provider.suggest(
      {
        photoUri: 'file:///tmp/mock-meal.jpg',
        mealName: '',
        cuisineType: '',
        notes: '',
        locationName: '',
        isHomemade: true,
      },
      {
        onProgress: update => {
          progressUpdates.push(update);
        },
      }
    );

    const stageSequence = progressUpdates
      .map(update => update.stage)
      .filter((stage, index, stages) => index === 0 || stage !== stages[index - 1]);

    expect(stageSequence).toEqual([
      'loading_model',
      'initializing_multimodal',
      'analyzing_photo',
      'generating_response',
      'finalizing',
    ]);

    expect(progressUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          stage: 'initializing_multimodal',
          progress: 0.54,
          estimatedRemainingMs: 55000,
        }),
        expect.objectContaining({
          stage: 'initializing_multimodal',
          progress: 0.6,
          estimatedRemainingMs: 50000,
        }),
        expect.objectContaining({
          stage: 'analyzing_photo',
          message: '写真解析の前処理を始めています。',
          progress: 0.64,
          estimatedRemainingMs: 47000,
        }),
        expect.objectContaining({
          stage: 'analyzing_photo',
          message: '写真解析の前処理が完了しました。',
          progress: 0.7,
          estimatedRemainingMs: 45000,
        }),
        expect.objectContaining({
          stage: 'analyzing_photo',
          message: '写真を解析しています。候補生成を開始しました。',
          progress: 0.74,
          estimatedRemainingMs: 42000,
        }),
        expect.objectContaining({
          stage: 'finalizing',
          progress: 0.98,
          estimatedRemainingMs: 1000,
        }),
      ])
    );

    const firstGenerationUpdate = progressUpdates.find(
      update => update.stage === 'generating_response'
    );
    expect(firstGenerationUpdate).toEqual(
      expect.objectContaining({
        message: '候補を整理しています。',
      })
    );
    expect(firstGenerationUpdate?.progress).toBeGreaterThan(0.8);
    expect(firstGenerationUpdate?.estimatedRemainingMs).toBeLessThanOrEqual(18000);

    const numericProgressValues = progressUpdates
      .map(update => update.progress)
      .filter((progress): progress is number => typeof progress === 'number');

    expect(numericProgressValues.length).toBeGreaterThan(0);
    for (let index = 1; index < numericProgressValues.length; index += 1) {
      expect(numericProgressValues[index]).toBeGreaterThanOrEqual(numericProgressValues[index - 1]);
    }
  });

  test('prewarms model and multimodal context without submitting completion', async () => {
    const progressUpdates: Array<{
      stage: string;
      progress: number | null;
    }> = [];
    const fakeContext = {
      clearCache: jest.fn().mockResolvedValue(undefined),
      initMultimodal: jest.fn().mockResolvedValue(true),
      getMultimodalSupport: jest.fn().mockResolvedValue({ vision: true, audio: false }),
      completion: jest.fn(),
    };
    jest.spyOn(llamaRn, 'initLlama').mockResolvedValue(fakeContext as never);

    const availability = await loadMealInputAssistRuntimeAvailability('local-runtime-prototype');
    expect(availability.kind).toBe('ready');

    if (availability.kind !== 'ready') {
      throw new Error('Expected local runtime availability to be ready.');
    }

    await availability.provider.prewarm?.({
      onProgress: update => {
        progressUpdates.push({
          stage: update.stage,
          progress: update.progress,
        });
      },
    });

    expect(llamaRn.initLlama).toHaveBeenCalledTimes(1);
    expect(fakeContext.initMultimodal).toHaveBeenCalledTimes(1);
    expect(fakeContext.clearCache).toHaveBeenCalledTimes(1);
    expect(fakeContext.completion).not.toHaveBeenCalled();
    expect(progressUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ stage: 'loading_model' }),
        expect.objectContaining({ stage: 'initializing_multimodal' }),
        expect.objectContaining({ stage: 'analyzing_photo', progress: 0.7 }),
      ])
    );
  });

  test('serializes prewarm and suggest on the shared local runtime provider', async () => {
    const prewarmClearCache = createDeferred<void>();
    const fakeContext = {
      clearCache: jest
        .fn()
        .mockImplementationOnce(() => prewarmClearCache.promise)
        .mockResolvedValue(undefined),
      initMultimodal: jest.fn().mockResolvedValue(true),
      getMultimodalSupport: jest.fn().mockResolvedValue({ vision: true, audio: false }),
      completion: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          noteDraft: { value: '料理名: 焼き魚に見える\nメモ: 焼き目のある一皿', confidence: 0.82 },
        }),
      }),
    };
    jest.spyOn(llamaRn, 'initLlama').mockResolvedValue(fakeContext as never);

    const firstAvailability =
      await loadMealInputAssistRuntimeAvailability('local-runtime-prototype');
    const secondAvailability =
      await loadMealInputAssistRuntimeAvailability('local-runtime-prototype');
    expect(firstAvailability.kind).toBe('ready');
    expect(secondAvailability.kind).toBe('ready');

    if (firstAvailability.kind !== 'ready' || secondAvailability.kind !== 'ready') {
      throw new Error('Expected local runtime availability to be ready.');
    }

    const pendingPrewarm = firstAvailability.provider.prewarm?.();
    await waitFor(() => {
      expect(fakeContext.clearCache).toHaveBeenCalledTimes(1);
    });

    const pendingSuggest = secondAvailability.provider.suggest({
      photoUri: 'file:///tmp/mock-meal.jpg',
      mealName: '',
      cuisineType: '',
      notes: '',
      locationName: '',
      isHomemade: true,
    });
    await Promise.resolve();

    expect(secondAvailability.provider).toBe(firstAvailability.provider);
    expect(fakeContext.completion).not.toHaveBeenCalled();

    prewarmClearCache.resolve();
    await pendingPrewarm;
    await pendingSuggest;

    expect(llamaRn.initLlama).toHaveBeenCalledTimes(1);
    expect(fakeContext.clearCache).toHaveBeenCalledTimes(2);
    expect(fakeContext.completion).toHaveBeenCalledTimes(1);
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

    await expect(
      availability.provider.suggest({
        photoUri: 'file:///tmp/mock-meal.jpg',
        mealName: '',
        cuisineType: '',
        notes: '',
        locationName: '',
        isHomemade: false,
      })
    ).rejects.toThrow('Meal input assist response was empty.');
  });

  test('logs candidate counts when the model returns no provider candidates', async () => {
    const consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(jest.fn());
    const fakeContext = {
      clearCache: jest.fn().mockResolvedValue(undefined),
      initMultimodal: jest.fn().mockResolvedValue(true),
      getMultimodalSupport: jest.fn().mockResolvedValue({ vision: true, audio: false }),
      completion: jest.fn().mockResolvedValue({
        text: JSON.stringify({
          noteDraft: null,
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

    await expect(
      availability.provider.suggest({
        photoUri: 'file:///tmp/mock-meal.jpg',
        mealName: '',
        cuisineType: '',
        notes: '',
        locationName: '',
        isHomemade: false,
      })
    ).resolves.toEqual({
      source: 'local-meal-input-assist',
      noteDraft: null,
      mealNames: [],
      cuisineTypes: [],
    });

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      'Meal input assist model response contained no provider candidates.',
      expect.objectContaining({
        candidateCounts: {
          noteDraft: 0,
          mealNames: 0,
          cuisineTypes: 0,
        },
        tokensPredicted: 18,
        tokensEvaluated: 312,
      })
    );

    consoleInfoSpy.mockRestore();
  });

  test('returns model_unavailable when the projector file is missing', async () => {
    (getInfoAsync as jest.Mock).mockImplementation(async (path: string) => ({
      exists: !path.endsWith('meal-input-assist.mmproj'),
    }));

    await expect(
      loadMealInputAssistRuntimeAvailability('local-runtime-prototype')
    ).resolves.toEqual({
      kind: 'unavailable',
      mode: 'local-runtime-prototype',
      code: 'model_unavailable',
      reason:
        'meal input assist projector が見つかりません: file:///documents/ai-models/meal-input-assist.mmproj',
    });
  });

  test('returns runtime_unavailable when the native module is not linked', async () => {
    NativeModules.RNLlama = undefined;

    await expect(
      loadMealInputAssistRuntimeAvailability('local-runtime-prototype')
    ).resolves.toEqual({
      kind: 'unavailable',
      mode: 'local-runtime-prototype',
      code: 'runtime_unavailable',
      reason: 'この build には端末内 AI runtime がまだ組み込まれていません。',
    });
  });

  test('returns runtime_unavailable for mediapipe static-image mode when the Android bridge is missing', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    NativeModules.MediaPipeMealInputAssist = undefined;

    await expect(loadMealInputAssistRuntimeAvailability('mediapipe-static-image')).resolves.toEqual(
      {
        kind: 'unavailable',
        mode: 'mediapipe-static-image',
        code: 'runtime_unavailable',
        reason:
          'この build には MediaPipe static-image classifier bridge がまだ組み込まれていません。',
      }
    );
  });

  test('returns model_unavailable for mediapipe static-image mode when the bundled asset is missing', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    NativeModules.MediaPipeMealInputAssist = {
      getClassifierStatus: jest.fn().mockResolvedValue({
        kind: 'unavailable',
        reason:
          'MediaPipe meal input assist model asset が見つかりません: mediapipe/meal-input-assist.task',
      }),
      classifyStaticImage: jest.fn(),
    };

    await expect(loadMealInputAssistRuntimeAvailability('mediapipe-static-image')).resolves.toEqual(
      {
        kind: 'unavailable',
        mode: 'mediapipe-static-image',
        code: 'model_unavailable',
        reason:
          'MediaPipe meal input assist model asset が見つかりません: mediapipe/meal-input-assist.task',
      }
    );
    expect(NativeModules.MediaPipeMealInputAssist.getClassifierStatus).toHaveBeenCalledTimes(1);
    expect(NativeModules.MediaPipeMealInputAssist.classifyStaticImage).not.toHaveBeenCalled();
  });

  test('normalizes MediaPipe static-image raw results through the existing provider contract without leaking raw metadata', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    NativeModules.MediaPipeMealInputAssist = {
      getClassifierStatus: jest.fn().mockResolvedValue({
        kind: 'ready',
      }),
      classifyStaticImage: jest.fn().mockResolvedValue({
        photoUri: 'file:///tmp/mock-meal.jpg',
        categories: [
          { label: 'sushi', score: 0.87, index: 1, displayName: 'Sushi' },
          { label: 'drink', score: 0.31, index: 2, displayName: 'Drink' },
        ],
        classifierName: 'food-classifier',
        modelVersion: '2026.04',
      }),
    };

    const availability = await loadMealInputAssistRuntimeAvailability('mediapipe-static-image');

    expect(availability).toEqual(
      expect.objectContaining({
        kind: 'ready',
        mode: 'mediapipe-static-image',
        description: 'MediaPipe static-image meal input assist provider',
      })
    );

    if (availability.kind !== 'ready') {
      throw new Error('Expected MediaPipe static-image availability to be ready.');
    }

    const rawResult = await availability.provider.suggest({
      photoUri: 'file:///tmp/mock-meal.jpg',
      mealName: '',
      cuisineType: '',
      notes: '',
      locationName: '',
      isHomemade: false,
    });
    const normalized = normalizeMealInputAssistResult(rawResult);

    expect(NativeModules.MediaPipeMealInputAssist.getClassifierStatus).toHaveBeenCalledTimes(1);
    expect(NativeModules.MediaPipeMealInputAssist.classifyStaticImage).toHaveBeenCalledWith(
      'file:///tmp/mock-meal.jpg'
    );
    expect(rawResult).toEqual({
      source: 'mediapipe-static-image',
      mealNames: [
        { value: '寿司', confidence: 0.87 },
        { value: '飲み物', confidence: 0.31 },
      ],
      cuisineTypes: [{ value: '和食', confidence: 0.87 }],
    });
    expect(rawResult).not.toEqual(
      expect.objectContaining({
        classifierName: expect.anything(),
        modelVersion: expect.anything(),
        categories: expect.anything(),
      })
    );
    expect(normalized.source).toBe('mediapipe-static-image');
    expect(normalized.mealNames.map(candidate => candidate.value)).toEqual(['寿司', '飲み物']);
    expect(normalized.cuisineTypes.map(candidate => candidate.value)).toEqual(['和食']);
  });

  test('returns unsupported_architecture on Android when only unsupported ABIs are exposed', async () => {
    Object.defineProperty(Platform, 'OS', {
      configurable: true,
      value: 'android',
    });
    NativeModules.PlatformConstants = {
      SupportedAbis: ['armeabi-v7a'],
    };

    await expect(
      loadMealInputAssistRuntimeAvailability('local-runtime-prototype')
    ).resolves.toEqual({
      kind: 'unavailable',
      mode: 'local-runtime-prototype',
      code: 'unsupported_architecture',
      reason: 'この Android ABI では端末内 AI 入力補助を利用できません。',
    });
  });
});
