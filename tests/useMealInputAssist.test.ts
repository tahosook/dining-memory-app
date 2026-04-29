import { act, renderHook, waitFor } from '@testing-library/react-native';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import { deleteAsync } from 'expo-file-system/legacy';
import { useMealInputAssist } from '../src/hooks/cameraCapture/useMealInputAssist';
import type { MealInputAssistProviderResult, MealInputAssistRuntimeAvailability } from '../src/ai/mealInputAssist';
import type { CaptureReviewState } from '../src/hooks/cameraCapture/useCameraCapture';

jest.mock('../src/database/services/AppSettingsService', () => ({
  AppSettingsService: {
    getAiInputAssistEnabled: jest.fn().mockResolvedValue(false),
    setAiInputAssistEnabled: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('@bam.tech/react-native-image-resizer', () => ({
  __esModule: true,
  default: {
    createResizedImage: jest.fn(),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: jest.fn(),
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function createCaptureReview(overrides: Partial<CaptureReviewState> = {}): CaptureReviewState {
  return {
    ...createCaptureReviewBase(),
    ...overrides,
  };
}

function createCaptureReviewBase(): CaptureReviewState {
  return {
    photoUri: 'file:///tmp/meal-photo.jpg',
    width: 800,
    height: 600,
    capturedAtMs: new Date(2026, 3, 22, 21, 35, 7).getTime(),
    mealName: '',
    cuisineType: '',
    notes: '',
    locationName: '',
    isHomemade: true,
  };
}

function createReadyRuntimeAvailability(provider: { suggest: jest.Mock }): MealInputAssistRuntimeAvailability {
  return {
    kind: 'ready',
    mode: 'override',
    description: 'Test provider',
    provider,
  };
}

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('useMealInputAssist', () => {
  let consoleErrorSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleInfoSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(jest.fn());
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    consoleInfoSpy = jest.spyOn(console, 'info').mockImplementation(jest.fn());
    (ImageResizer.createResizedImage as jest.Mock).mockResolvedValue({
      path: '/tmp/meal-photo-ai.jpg',
      uri: 'file:///tmp/meal-photo-ai.jpg',
      width: 576,
      height: 1024,
      name: 'meal-photo-ai.jpg',
      size: 12345,
    });
    (deleteAsync as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
  });

  test('moves from idle to running to success and keeps zero-result success valid', async () => {
    const deferred = createDeferred<MealInputAssistProviderResult>();
    const provider = {
      suggest: jest.fn(() => deferred.promise),
    };
    const onCaptureReviewChange = jest.fn();
    const loadAiInputAssistEnabled = async () => true;
    const resolveRuntimeAvailability = async () => createReadyRuntimeAvailability(provider);
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange,
      provider,
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
    }));

    await flushEffects();

    let pendingRequest!: Promise<void>;
    act(() => {
      pendingRequest = result.current.requestSuggestions();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('running');
      expect(provider.suggest).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      deferred.resolve({
        source: 'mock-local',
        mealNames: [],
        cuisineTypes: [],
      });
      await pendingRequest;
    });

    expect(result.current.status).toBe('success');
    expect(result.current.hasAnySuggestions).toBe(false);
    expect(result.current.suggestions.mealNames).toEqual([]);
    expect(ImageResizer.createResizedImage).toHaveBeenCalledWith(
      'file:///tmp/meal-photo.jpg',
      1024,
      1024,
      'JPEG',
      70,
      0,
      undefined,
      true,
      {
        mode: 'contain',
        onlyScaleDown: true,
      }
    );
    expect(provider.suggest).toHaveBeenCalledWith(expect.objectContaining({
      photoUri: 'file:///tmp/meal-photo-ai.jpg',
    }), expect.any(Object));
    expect(deleteAsync).toHaveBeenCalledWith('file:///tmp/meal-photo-ai.jpg', { idempotent: true });
  });

  test('moves to error when the provider rejects and preserves the retry path', async () => {
    const provider = {
      suggest: jest.fn().mockRejectedValue(new Error('provider failed')),
    };
    const loadAiInputAssistEnabled = async () => true;
    const resolveRuntimeAvailability = async () => createReadyRuntimeAvailability(provider);
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange: jest.fn(),
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
    }));

    await flushEffects();

    act(() => {
      result.current.requestSuggestions();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('error');
      expect(result.current.errorMessage).toBe('端末内解析に失敗しました。もう一度お試しください。');
    });
    expect(deleteAsync).toHaveBeenCalledWith('file:///tmp/meal-photo-ai.jpg', { idempotent: true });
  });

  test('logs when provider candidates are all filtered out during normalization', async () => {
    const provider = {
      suggest: jest.fn().mockResolvedValue({
        source: 'mock-local',
        mealNames: [{ value: ' ', confidence: 0.52 }],
        cuisineTypes: [{ value: 'イタリアン', confidence: 0.88 }],
      }),
    };
    const loadAiInputAssistEnabled = async () => true;
    const resolveRuntimeAvailability = async () => createReadyRuntimeAvailability(provider);
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange: jest.fn(),
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
    }));

    await flushEffects();

    await act(async () => {
      await result.current.requestSuggestions();
    });

    expect(result.current.status).toBe('success');
    expect(result.current.hasAnySuggestions).toBe(false);
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      'Meal input assist normalized all provider candidates away.',
      expect.objectContaining({
        rawCandidateCounts: {
          noteDraft: 0,
          mealNames: 1,
          cuisineTypes: 1,
        },
        normalizedCandidateCounts: {
          noteDraft: 0,
          mealNames: 0,
          cuisineTypes: 0,
        },
      })
    );
  });

  test('logs a contract violation when the provider omits a note draft', async () => {
    const provider = {
      suggest: jest.fn().mockResolvedValue({
        source: 'mock-local',
        mealNames: [],
        cuisineTypes: [{ value: '中華', confidence: 0.84 }],
      }),
    };
    const loadAiInputAssistEnabled = async () => true;
    const resolveRuntimeAvailability = async () => createReadyRuntimeAvailability(provider);
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange: jest.fn(),
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
    }));

    await flushEffects();

    await act(async () => {
      await result.current.requestSuggestions();
    });

    expect(result.current.status).toBe('success');
    expect(result.current.suggestions.mealNames).toEqual([]);
    expect(result.current.suggestions.cuisineTypes).toHaveLength(1);
    expect(consoleInfoSpy).toHaveBeenCalledWith(
      'Meal input assist provider returned no note draft.',
      expect.objectContaining({
        providerSource: 'mock-local',
        rawCandidateCounts: {
          noteDraft: 0,
          mealNames: 0,
          cuisineTypes: 1,
        },
      })
    );
  });

  test('returns disabled when settings keep AI input assist off', async () => {
    const provider = {
      suggest: jest.fn().mockResolvedValue({
        source: 'mock-local',
        mealNames: [{ value: '親子丼', confidence: 0.7 }],
      }),
    };
    const loadAiInputAssistEnabled = async () => false;
    const resolveRuntimeAvailability = async () => createReadyRuntimeAvailability(provider);
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange: jest.fn(),
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
    }));

    await flushEffects();

    await waitFor(() => {
      expect(result.current.status).toBe('disabled');
      expect(result.current.disabledReason).toBe('設定画面でAI入力補助をオンにすると利用できます。');
    });

    await act(async () => {
      await result.current.requestSuggestions();
    });

    expect(provider.suggest).not.toHaveBeenCalled();
  });

  test('returns disabled when runtime availability reports unsupported', async () => {
    const provider = {
      suggest: jest.fn(),
    };
    const loadAiInputAssistEnabled = async () => true;
    const resolveRuntimeAvailability = async () => ({
      kind: 'unavailable' as const,
      mode: 'local-runtime-prototype' as const,
      code: 'runtime_unavailable' as const,
      reason: 'この build には端末内 AI runtime がまだ組み込まれていません。',
    });
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange: jest.fn(),
      provider,
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
    }));

    await flushEffects();

    await waitFor(() => {
      expect(result.current.status).toBe('disabled');
      expect(result.current.disabledReason).toBe('この build には端末内 AI runtime がまだ組み込まれていません。');
    });

    await act(async () => {
      await result.current.requestSuggestions();
    });

    expect(provider.suggest).not.toHaveBeenCalled();
  });

  test('returns disabled when the model is not installed yet', async () => {
    const provider = {
      suggest: jest.fn(),
    };
    const loadAiInputAssistEnabled = async () => true;
    const resolveRuntimeAvailability = async () => ({
      kind: 'unavailable' as const,
      mode: 'local-runtime-prototype' as const,
      code: 'model_unavailable' as const,
      reason: 'meal input assist model が見つかりません: file:///documents/ai-models/meal-input-assist.gguf',
    });
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange: jest.fn(),
      provider,
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
    }));

    await flushEffects();

    await waitFor(() => {
      expect(result.current.status).toBe('disabled');
      expect(result.current.disabledReason).toContain('meal input assist model が見つかりません');
    });
  });

  test('prevents duplicate execution while a request is already running', async () => {
    const deferred = createDeferred<MealInputAssistProviderResult>();
    const provider = {
      suggest: jest.fn(() => deferred.promise),
    };
    const loadAiInputAssistEnabled = async () => true;
    const resolveRuntimeAvailability = async () => createReadyRuntimeAvailability(provider);
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange: jest.fn(),
      provider,
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
    }));

    await flushEffects();

    act(() => {
      result.current.requestSuggestions();
      result.current.requestSuggestions();
    });

    await waitFor(() => {
      expect(provider.suggest).toHaveBeenCalledTimes(1);
    });
  });

  test('reuses the mounted runtime environment across sequential requests in the same review', async () => {
    const provider = {
      suggest: jest.fn().mockResolvedValue({
        source: 'mock-local',
        mealNames: [{ value: '海鮮丼', confidence: 0.9 }],
        cuisineTypes: [],
      }),
    };
    const loadAiInputAssistEnabled = async () => true;
    const resolveRuntimeAvailability = jest.fn(async () => createReadyRuntimeAvailability(provider));
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange: jest.fn(),
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
    }));

    await flushEffects();

    await act(async () => {
      await result.current.requestSuggestions();
    });

    expect(result.current.status).toBe('success');

    await act(async () => {
      await result.current.requestSuggestions();
    });

    expect(result.current.status).toBe('success');
    expect(provider.suggest).toHaveBeenCalledTimes(2);
    expect(resolveRuntimeAvailability).toHaveBeenCalledTimes(1);
  });

  test('shares the in-flight environment load between preload and the first manual request', async () => {
    const environmentDeferred = createDeferred<MealInputAssistRuntimeAvailability>();
    const provider = {
      suggest: jest.fn().mockResolvedValue({
        source: 'mock-local',
        mealNames: [{ value: '海鮮丼', confidence: 0.9 }],
        cuisineTypes: [],
      }),
    };
    const loadAiInputAssistEnabled = async () => true;
    const resolveRuntimeAvailability = jest.fn(() => environmentDeferred.promise);
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange: jest.fn(),
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
    }));

    let pendingRequest!: Promise<void>;
    act(() => {
      pendingRequest = result.current.requestSuggestions();
    });

    await waitFor(() => {
      expect(resolveRuntimeAvailability).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      environmentDeferred.resolve(createReadyRuntimeAvailability(provider));
      await pendingRequest;
    });

    expect(provider.suggest).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('success');
    expect(resolveRuntimeAvailability).toHaveBeenCalledTimes(1);
  });

  test('exposes analysis progress while the provider is running and clears it after success', async () => {
    const deferred = createDeferred<MealInputAssistProviderResult>();
    const provider = {
      suggest: jest.fn((_request, options?: {
        onProgress?: (progress: {
          stage: 'loading_model';
          message: string;
          progress: number;
          estimatedRemainingMs: number;
        }) => void;
      }) => {
        options?.onProgress?.({
          stage: 'loading_model',
          message: 'AI model を読み込んでいます。初回は時間がかかることがあります。',
          progress: 0.4,
          estimatedRemainingMs: 25000,
        });
        return deferred.promise;
      }),
    };
    const loadAiInputAssistEnabled = async () => true;
    const resolveRuntimeAvailability = async () => createReadyRuntimeAvailability(provider);
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange: jest.fn(),
      provider,
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
    }));

    await flushEffects();

    let pendingRequest!: Promise<void>;
    act(() => {
      pendingRequest = result.current.requestSuggestions();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('running');
      expect(result.current.progress).toMatchObject({
        stage: 'loading_model',
        message: 'AI model を読み込んでいます。初回は時間がかかることがあります。',
      });
    });

    await act(async () => {
      deferred.resolve({
        source: 'mock-local',
        mealNames: [{ value: '海鮮丼', confidence: 0.9 }],
        cuisineTypes: [],
      });
      await pendingRequest;
    });

    expect(result.current.status).toBe('success');
    expect(result.current.progress).toBeNull();
  });

  test('creates save metadata only after a suggestion is adopted', async () => {
    const provider = {
      suggest: jest.fn().mockResolvedValue({
        source: 'mock-local',
        noteDraft: {
          value: '料理名: 海鮮丼に見える\nメモ: 魚介がのった丼もの',
          confidence: 0.91,
        },
      }),
    };
    const onCaptureReviewChange = jest.fn();
    const loadAiInputAssistEnabled = async () => true;
    const resolveRuntimeAvailability = async () => createReadyRuntimeAvailability(provider);
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange,
      provider,
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
    }));

    await flushEffects();

    expect(result.current.appliedMetadata).toBeNull();

    act(() => {
      result.current.requestSuggestions();
    });

    await waitFor(() => {
      expect(result.current.status).toBe('success');
      expect(result.current.suggestions.noteDraft?.value).toContain('料理名: 海鮮丼に見える');
    });

    act(() => {
      result.current.applyNoteDraftSuggestion(result.current.suggestions.noteDraft!);
    });

    expect(onCaptureReviewChange).toHaveBeenNthCalledWith(
      1,
      'notes',
      '料理名: 海鮮丼に見える\nメモ: 魚介がのった丼もの'
    );
    expect(result.current.appliedMetadata).toEqual({
      aiSource: 'mock-local',
      aiConfidence: 0.91,
      appliedFields: ['notes'],
    });
  });

  test('appends a note draft with a blank line and avoids duplicate appends', async () => {
    const provider = {
      suggest: jest.fn().mockResolvedValue({
        source: 'mock-local',
        noteDraft: {
          value: '料理名: 焼き魚に見える\nメモ: 定食の主菜らしい一皿',
          confidence: 0.8,
        },
      }),
    };
    const onCaptureReviewChange = jest.fn();
    const loadAiInputAssistEnabled = async () => true;
    const resolveRuntimeAvailability = async () => createReadyRuntimeAvailability(provider);
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview({
        notes: '先に書いたメモ',
      }),
      onCaptureReviewChange,
      provider,
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
    }));

    await flushEffects();

    await act(async () => {
      await result.current.requestSuggestions();
    });

    act(() => {
      result.current.applyNoteDraftSuggestion(result.current.suggestions.noteDraft!);
      result.current.applyNoteDraftSuggestion(result.current.suggestions.noteDraft!);
    });

    expect(onCaptureReviewChange).toHaveBeenCalledTimes(1);
    expect(onCaptureReviewChange).toHaveBeenCalledWith(
      'notes',
      '先に書いたメモ\n\n料理名: 焼き魚に見える\nメモ: 定食の主菜らしい一皿'
    );
  });

  test('keeps applied metadata thin when MediaPipe static-image suggestions are adopted', async () => {
    const provider = {
      suggest: jest.fn().mockResolvedValue({
        source: 'mediapipe-static-image',
        mealNames: [{ value: '寿司', confidence: 0.87 }],
        cuisineTypes: [{ value: '和食', confidence: 0.79 }],
      }),
    };
    const onCaptureReviewChange = jest.fn();
    const loadAiInputAssistEnabled = async () => true;
    const resolveRuntimeAvailability = async () => createReadyRuntimeAvailability(provider);
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange,
      provider,
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
    }));

    await flushEffects();

    await act(async () => {
      await result.current.requestSuggestions();
    });

    act(() => {
      result.current.applyMealNameSuggestion(result.current.suggestions.mealNames[0]);
      result.current.applyCuisineSuggestion(result.current.suggestions.cuisineTypes[0]);
    });

    expect(onCaptureReviewChange).toHaveBeenNthCalledWith(1, 'mealName', '寿司');
    expect(onCaptureReviewChange).toHaveBeenNthCalledWith(2, 'cuisineType', '和食');
    expect(result.current.appliedMetadata).toEqual({
      aiSource: 'mediapipe-static-image',
      aiConfidence: 0.87,
      appliedFields: ['mealName', 'cuisineType'],
    });
  });
});
