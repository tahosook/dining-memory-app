import { act, renderHook } from '@testing-library/react-native';
import { useMealInputAssist } from '../src/hooks/cameraCapture/useMealInputAssist';
import type { MealInputAssistProviderResult } from '../src/ai/mealInputAssist';

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
    mealName: '',
    cuisineType: '',
    notes: '',
    locationName: '',
    isHomemade: true,
  } as const;
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
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange,
      provider,
    }));

    let pendingRequest!: Promise<void>;
    act(() => {
      pendingRequest = result.current.requestSuggestions();
    });

    expect(result.current.status).toBe('running');
    expect(provider.suggest).toHaveBeenCalledTimes(1);

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
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange: jest.fn(),
      provider,
    }));

    await act(async () => {
      await result.current.requestSuggestions();
    });

    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toBe('候補を取得できませんでした。もう一度お試しください。');
  });

  test('returns disabled when policy blocks AI input assist', async () => {
    const provider = {
      suggest: jest.fn(),
    };
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange: jest.fn(),
      provider,
      policy: () => ({
        kind: 'disabled',
        reason: '設定で AI 入力補助が無効です。',
      }),
    }));

    expect(result.current.status).toBe('disabled');
    expect(result.current.disabledReason).toBe('設定で AI 入力補助が無効です。');

    await act(async () => {
      await result.current.requestSuggestions();
    });

    expect(provider.suggest).not.toHaveBeenCalled();
  });

  test('prevents duplicate execution while a request is already running', () => {
    const deferred = createDeferred<MealInputAssistProviderResult>();
    const provider = {
      suggest: jest.fn(() => deferred.promise),
    };
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange: jest.fn(),
      provider,
    }));

    act(() => {
      result.current.requestSuggestions();
      result.current.requestSuggestions();
    });

    expect(provider.suggest).toHaveBeenCalledTimes(1);
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
    const { result } = renderHook(() => useMealInputAssist({
      captureReview: createCaptureReview(),
      onCaptureReviewChange,
      provider,
    }));

    expect(result.current.appliedMetadata).toBeNull();

    await act(async () => {
      await result.current.requestSuggestions();
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
