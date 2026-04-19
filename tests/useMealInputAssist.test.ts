import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useMealInputAssist } from '../src/hooks/cameraCapture/useMealInputAssist';
import type { MealInputAssistProviderResult, MealInputAssistRuntimeAvailability } from '../src/ai/mealInputAssist';

jest.mock('../src/database/services/AppSettingsService', () => ({
  AppSettingsService: {
    getAiInputAssistEnabled: jest.fn().mockResolvedValue(false),
    setAiInputAssistEnabled: jest.fn().mockResolvedValue(undefined),
  },
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

function createCaptureReview() {
  return {
    photoUri: 'file:///tmp/meal-photo.jpg',
    width: 800,
    height: 600,
    mealName: '',
    cuisineType: '',
    notes: '',
    locationName: '',
    isHomemade: true,
  } as const;
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

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(jest.fn());
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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
        homemade: [],
      });
      await pendingRequest;
    });

    expect(result.current.status).toBe('success');
    expect(result.current.hasAnySuggestions).toBe(false);
    expect(result.current.suggestions.mealNames).toEqual([]);
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
      provider,
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
      provider,
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

  test('creates save metadata only after a suggestion is adopted', async () => {
    const provider = {
      suggest: jest.fn().mockResolvedValue({
        source: 'mock-local',
        mealNames: [{ value: '海鮮丼', confidence: 0.91 }],
        cuisineTypes: [{ value: '和食', confidence: 0.72 }],
        homemade: [{ value: false, confidence: 0.63 }],
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
      expect(result.current.suggestions.mealNames).toHaveLength(1);
    });

    act(() => {
      result.current.applyMealNameSuggestion(result.current.suggestions.mealNames[0]);
      result.current.applyCuisineSuggestion(result.current.suggestions.cuisineTypes[0]);
    });

    expect(onCaptureReviewChange).toHaveBeenNthCalledWith(1, 'mealName', '海鮮丼');
    expect(onCaptureReviewChange).toHaveBeenNthCalledWith(2, 'cuisineType', '和食');
    expect(result.current.appliedMetadata).toEqual({
      aiSource: 'mock-local',
      aiConfidence: 0.91,
      appliedFields: ['mealName', 'cuisineType'],
    });
  });
});
