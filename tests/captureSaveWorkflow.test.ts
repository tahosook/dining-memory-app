import type { PermissionResponse } from 'expo-camera';
import { saveCaptureReviewWorkflow } from '../src/hooks/cameraCapture/captureSaveWorkflow';
import type { CaptureReviewState } from '../src/hooks/cameraCapture/captureReviewState';
import { MealService } from '../src/database/services/MealService';

jest.mock('../src/database/services/MealService', () => ({
  MealService: {
    createMeal: jest.fn(),
  },
}));

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function createCaptureReview(overrides: Partial<CaptureReviewState> = {}): CaptureReviewState {
  return {
    source: 'camera',
    photoUri: 'file:///tmp/photo.jpg',
    width: 1200,
    height: 900,
    capturedAtMs: new Date(2026, 3, 22, 21, 35, 7).getTime(),
    mealName: '焼き魚定食',
    cuisineType: '和食',
    notes: '',
    locationName: '',
    isHomemade: true,
    ...overrides,
  };
}

describe('saveCaptureReviewWorkflow', () => {
  const cameraPermission = {
    granted: true,
    status: 'granted',
    canAskAgain: true,
    expires: 'never',
  } as unknown as PermissionResponse;

  beforeEach(() => {
    jest.clearAllMocks();
    (MealService.createMeal as jest.Mock).mockResolvedValue({ id: 'meal-1' });
  });

  test('skips duplicate in-flight saves for the same capture review', async () => {
    const captureReview = createCaptureReview();
    const localPersistence = createDeferred<{
      stablePhotoUri: string;
      savedToMediaLibrary: boolean;
    }>();
    const persistPhotoLocally = jest.fn().mockReturnValue(localPersistence.promise);
    const params = {
      captureReview,
      cameraPermission,
      ensurePhotoSavePermission: jest.fn().mockResolvedValue(true),
      getLocationSnapshot: jest.fn().mockResolvedValue({}),
      persistPhotoLocally,
      savePhotoToMediaLibrary: jest.fn().mockResolvedValue(true),
      cleanupTempFile: jest.fn().mockResolvedValue(undefined),
    };

    const firstSave = saveCaptureReviewWorkflow(params);
    const secondSave = saveCaptureReviewWorkflow(params);

    await expect(secondSave).resolves.toEqual({
      kind: 'skipped',
      reason: 'duplicate_in_flight',
    });
    expect(persistPhotoLocally).toHaveBeenCalledTimes(1);
    expect(MealService.createMeal).not.toHaveBeenCalled();

    localPersistence.resolve({
      stablePhotoUri: 'file:///tmp/photo.jpg',
      savedToMediaLibrary: true,
    });

    await expect(firstSave).resolves.toEqual({
      kind: 'saved',
      resizedPhotoUri: null,
      stablePhotoUri: 'file:///tmp/photo.jpg',
      savedToMediaLibrary: true,
      mealId: 'meal-1',
    });
    expect(MealService.createMeal).toHaveBeenCalledTimes(1);

    persistPhotoLocally.mockResolvedValue({
      stablePhotoUri: 'file:///tmp/photo.jpg',
      savedToMediaLibrary: true,
    });
    await expect(saveCaptureReviewWorkflow(params)).resolves.toEqual(
      expect.objectContaining({ kind: 'saved' })
    );
    expect(persistPhotoLocally).toHaveBeenCalledTimes(2);
  });
});
