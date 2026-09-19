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
      stableThumbnailUri: null,
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

  test('passes photo_path and photo_thumbnail_path to MealService.createMeal', async () => {
    const captureReview = createCaptureReview();
    const cleanupTempFile = jest.fn().mockResolvedValue(undefined);
    const persistPhotoLocally = jest.fn().mockResolvedValue({
      stablePhotoUri: 'file:///docs/meal-1.jpg',
      stableThumbnailUri: 'file:///docs/meal-1-thumb.jpg',
      resizedPhotoUri: 'file:///tmp/resized-1.jpg',
      savedToMediaLibrary: true,
    });

    const result = await saveCaptureReviewWorkflow({
      captureReview,
      cameraPermission,
      ensurePhotoSavePermission: jest.fn().mockResolvedValue(true),
      getLocationSnapshot: jest.fn().mockResolvedValue({ latitude: 35.0, longitude: 139.0 }),
      persistPhotoLocally,
      savePhotoToMediaLibrary: jest.fn().mockResolvedValue(true),
      cleanupTempFile,
    });

    expect(MealService.createMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        photo_path: 'file:///docs/meal-1.jpg',
        photo_thumbnail_path: 'file:///docs/meal-1-thumb.jpg',
      })
    );
    expect(result).toEqual({
      kind: 'saved',
      resizedPhotoUri: 'file:///tmp/resized-1.jpg',
      stablePhotoUri: 'file:///docs/meal-1.jpg',
      stableThumbnailUri: 'file:///docs/meal-1-thumb.jpg',
      savedToMediaLibrary: true,
      mealId: 'meal-1',
    });
    expect(cleanupTempFile).toHaveBeenCalledWith('file:///tmp/photo.jpg');
  });

  test('proceeds with photo_thumbnail_path undefined when thumbnail was not generated', async () => {
    const captureReview = createCaptureReview();
    const persistPhotoLocally = jest.fn().mockResolvedValue({
      stablePhotoUri: 'file:///docs/meal-1.jpg',
      stableThumbnailUri: undefined,
      savedToMediaLibrary: true,
    });

    const result = await saveCaptureReviewWorkflow({
      captureReview,
      cameraPermission,
      ensurePhotoSavePermission: jest.fn().mockResolvedValue(true),
      getLocationSnapshot: jest.fn().mockResolvedValue({}),
      persistPhotoLocally,
      savePhotoToMediaLibrary: jest.fn().mockResolvedValue(true),
      cleanupTempFile: jest.fn().mockResolvedValue(undefined),
    });

    expect(MealService.createMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        photo_path: 'file:///docs/meal-1.jpg',
        photo_thumbnail_path: undefined,
      })
    );
    expect(result).toEqual(
      expect.objectContaining({
        kind: 'saved',
        stablePhotoUri: 'file:///docs/meal-1.jpg',
        stableThumbnailUri: null,
      })
    );
  });

  test('cleans up both stablePhotoUri and stableThumbnailUri when createMeal fails', async () => {
    const captureReview = createCaptureReview();
    const cleanupTempFile = jest.fn().mockResolvedValue(undefined);
    (MealService.createMeal as jest.Mock).mockRejectedValueOnce(new Error('Database write error'));

    const persistPhotoLocally = jest.fn().mockResolvedValue({
      stablePhotoUri: 'file:///docs/meal-1.jpg',
      stableThumbnailUri: 'file:///docs/meal-1-thumb.jpg',
      savedToMediaLibrary: true,
    });

    await expect(
      saveCaptureReviewWorkflow({
        captureReview,
        cameraPermission,
        ensurePhotoSavePermission: jest.fn().mockResolvedValue(true),
        getLocationSnapshot: jest.fn().mockResolvedValue({}),
        persistPhotoLocally,
        savePhotoToMediaLibrary: jest.fn().mockResolvedValue(true),
        cleanupTempFile,
      })
    ).rejects.toThrow('Database write error');

    expect(cleanupTempFile).toHaveBeenCalledWith('file:///docs/meal-1.jpg');
    expect(cleanupTempFile).toHaveBeenCalledWith('file:///docs/meal-1-thumb.jpg');
  });
});
