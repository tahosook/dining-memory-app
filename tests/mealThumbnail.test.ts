import ImageResizer from '@bam.tech/react-native-image-resizer';
import { getInfoAsync } from 'expo-file-system/legacy';
import {
  ensureMealThumbnail,
  requestMealThumbnail,
  requestMealThumbnails,
  MAX_CONCURRENT_THUMBNAILS,
  __clearThumbnailQueueForTest,
} from '../src/media/mealThumbnail';
import { persistThumbnailToStablePath } from '../src/media/photoStorage';
import { cleanupTempFile } from '../src/media/tempFiles';
import { MealService } from '../src/database/services/MealService';
import { getMealListImageUri } from '../src/utils/mealImage';
import type { Meal } from '../src/types/MealTypes';

jest.mock('@bam.tech/react-native-image-resizer', () => ({
  __esModule: true,
  default: {
    createResizedImage: jest.fn(),
  },
}));

jest.mock('expo-file-system/legacy', () => ({
  getInfoAsync: jest.fn(),
}));

jest.mock('../src/media/photoStorage', () => ({
  persistThumbnailToStablePath: jest.fn(),
  resolveThumbnailDestinationUri: jest.fn(
    (uri: string) => uri.replace(/\.jpg$/, '-thumb.jpg')
  ),
}));

jest.mock('../src/media/tempFiles', () => ({
  cleanupTempFile: jest.fn(),
}));

jest.mock('../src/database/services/MealService', () => ({
  MealService: {
    getMealById: jest.fn(),
    updateMeal: jest.fn(),
    updateMealThumbnail: jest.fn(),
  },
}));

function createMockMeal(overrides: Partial<Meal> = {}): Meal {
  return {
    id: 'meal-1',
    uuid: 'uuid-meal-1',
    meal_name: 'Test Meal',
    photo_path: 'file:///docs/meal-1.jpg',
    photo_thumbnail_path: undefined,
    meal_datetime: new Date().getTime(),
    is_homemade: false,
    is_deleted: false,
    created_at: Date.now(),
    updated_at: Date.now(),
    ...overrides,
  };
}

describe('mealThumbnail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __clearThumbnailQueueForTest();

    (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
    (ImageResizer.createResizedImage as jest.Mock).mockResolvedValue({
      uri: 'file:///tmp/resized-thumb.jpg',
      path: '/tmp/resized-thumb.jpg',
      width: 320,
      height: 240,
    });
    (persistThumbnailToStablePath as jest.Mock).mockResolvedValue(
      'file:///docs/meal-1-thumb.jpg'
    );
    (cleanupTempFile as jest.Mock).mockResolvedValue(undefined);
    (MealService.updateMealThumbnail as jest.Mock).mockResolvedValue(true);
  });

  describe('ensureMealThumbnail', () => {
    test('generates thumbnail, saves to stable path, updates DB, and cleans up temp file', async () => {
      const meal = createMockMeal();
      (MealService.getMealById as jest.Mock).mockResolvedValue(meal);

      const result = await ensureMealThumbnail('meal-1');

      expect(result).toBe('file:///docs/meal-1-thumb.jpg');
      expect(ImageResizer.createResizedImage).toHaveBeenCalledWith(
        'file:///docs/meal-1.jpg',
        320,
        320,
        'JPEG',
        70,
        0,
        undefined,
        true,
        { mode: 'contain', onlyScaleDown: true }
      );
      expect(persistThumbnailToStablePath).toHaveBeenCalledWith(
        'file:///tmp/resized-thumb.jpg',
        'file:///docs/meal-1.jpg'
      );
      expect(cleanupTempFile).toHaveBeenCalledWith('file:///tmp/resized-thumb.jpg');
      expect(MealService.updateMealThumbnail).toHaveBeenCalledWith(
        'meal-1',
        'file:///docs/meal-1-thumb.jpg',
        'file:///docs/meal-1.jpg'
      );
    });

    test('returns existing photo_thumbnail_path if file already exists', async () => {
      const meal = createMockMeal({
        photo_thumbnail_path: 'file:///docs/meal-1-thumb.jpg',
      });
      (MealService.getMealById as jest.Mock).mockResolvedValue(meal);
      (getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });

      const result = await ensureMealThumbnail('meal-1');

      expect(result).toBe('file:///docs/meal-1-thumb.jpg');
      expect(ImageResizer.createResizedImage).not.toHaveBeenCalled();
      expect(MealService.updateMealThumbnail).not.toHaveBeenCalled();
    });

    test('regenerates thumbnail if photo_thumbnail_path is set but file does not exist', async () => {
      const meal = createMockMeal({
        photo_thumbnail_path: 'file:///docs/meal-1-thumb.jpg',
      });
      (MealService.getMealById as jest.Mock).mockResolvedValue(meal);
      // First call is thumbnail path check (does not exist), second is original photo check (exists)
      (getInfoAsync as jest.Mock)
        .mockResolvedValueOnce({ exists: false })
        .mockResolvedValueOnce({ exists: true });

      const result = await ensureMealThumbnail('meal-1');

      expect(result).toBe('file:///docs/meal-1-thumb.jpg');
      expect(ImageResizer.createResizedImage).toHaveBeenCalledTimes(1);
      expect(MealService.updateMealThumbnail).toHaveBeenCalledWith(
        'meal-1',
        'file:///docs/meal-1-thumb.jpg',
        'file:///docs/meal-1.jpg'
      );
    });

    test('skips thumbnail generation if original photo file does not exist', async () => {
      const meal = createMockMeal();
      (MealService.getMealById as jest.Mock).mockResolvedValue(meal);
      (getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      const result = await ensureMealThumbnail('meal-1');

      expect(result).toBeNull();
      expect(ImageResizer.createResizedImage).not.toHaveBeenCalled();
      expect(MealService.updateMealThumbnail).not.toHaveBeenCalled();
    });

    test('preserves meal and returns null if ImageResizer fails', async () => {
      const meal = createMockMeal();
      (MealService.getMealById as jest.Mock).mockResolvedValue(meal);
      (ImageResizer.createResizedImage as jest.Mock).mockRejectedValueOnce(
        new Error('Out of memory')
      );

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());

      const result = await ensureMealThumbnail('meal-1');

      expect(result).toBeNull();
      expect(MealService.updateMealThumbnail).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Meal thumbnail generation failed:',
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('In-flight Guard', () => {
    test('reuses existing in-flight Promise for identical mealId and does not run ImageResizer twice', async () => {
      let resolveResizer!: (value: any) => void;
      const resizerPromise = new Promise((resolve) => {
        resolveResizer = resolve;
      });
      (ImageResizer.createResizedImage as jest.Mock).mockReturnValue(resizerPromise);

      const meal = createMockMeal();
      (MealService.getMealById as jest.Mock).mockResolvedValue(meal);

      const promise1 = ensureMealThumbnail('meal-1');
      const promise2 = ensureMealThumbnail('meal-1');

      // Both should be the exact same promise instance
      expect(promise1).toBe(promise2);

      resolveResizer({
        uri: 'file:///tmp/resized-thumb.jpg',
        path: '/tmp/resized-thumb.jpg',
        width: 320,
        height: 240,
      });

      const [res1, res2] = await Promise.all([promise1, promise2]);
      expect(res1).toBe('file:///docs/meal-1-thumb.jpg');
      expect(res2).toBe('file:///docs/meal-1-thumb.jpg');
      expect(ImageResizer.createResizedImage).toHaveBeenCalledTimes(1);
    });
  });

  describe('Concurrency Limit', () => {
    test(`does not execute more than ${MAX_CONCURRENT_THUMBNAILS} tasks concurrently`, async () => {
      const activeTaskPeak = { current: 0, peak: 0 };
      const deferredList: Array<() => void> = [];

      (ImageResizer.createResizedImage as jest.Mock).mockImplementation(() => {
        activeTaskPeak.current += 1;
        if (activeTaskPeak.current > activeTaskPeak.peak) {
          activeTaskPeak.peak = activeTaskPeak.current;
        }

        return new Promise((resolve) => {
          deferredList.push(() => {
            activeTaskPeak.current -= 1;
            resolve({
              uri: 'file:///tmp/resized-thumb.jpg',
              path: '/tmp/resized-thumb.jpg',
              width: 320,
              height: 240,
            });
          });
        });
      });

      (MealService.getMealById as jest.Mock).mockImplementation(async (id: string) => {
        return createMockMeal({ id, photo_path: `file:///docs/${id}.jpg` });
      });

      // Enqueue 5 meals
      const promises = [
        ensureMealThumbnail('meal-1'),
        ensureMealThumbnail('meal-2'),
        ensureMealThumbnail('meal-3'),
        ensureMealThumbnail('meal-4'),
        ensureMealThumbnail('meal-5'),
      ];

      // Wait a tick for queue pump
      await new Promise((r) => setTimeout(r, 10));

      // Peak active should not exceed MAX_CONCURRENT_THUMBNAILS (2)
      expect(activeTaskPeak.peak).toBeLessThanOrEqual(MAX_CONCURRENT_THUMBNAILS);
      expect(deferredList.length).toBe(MAX_CONCURRENT_THUMBNAILS);

      // Resolve the running ones one by one
      while (deferredList.length > 0) {
        const resolveFn = deferredList.shift();
        resolveFn?.();
        await new Promise((r) => setTimeout(r, 10));
      }

      await Promise.all(promises);
      expect(activeTaskPeak.peak).toBeLessThanOrEqual(MAX_CONCURRENT_THUMBNAILS);
      expect(ImageResizer.createResizedImage).toHaveBeenCalledTimes(5);
    });
  });

  describe('Photo Generation and Race Conditions', () => {
    test('Case A: standard flow generates thumbnail and persists to DB', async () => {
      const meal = createMockMeal({
        photo_path: 'file:///docs/photo-A.jpg',
      });
      (MealService.getMealById as jest.Mock).mockResolvedValue(meal);
      (persistThumbnailToStablePath as jest.Mock).mockResolvedValue(
        'file:///docs/photo-A-thumb.jpg'
      );
      (MealService.updateMealThumbnail as jest.Mock).mockResolvedValue(true);

      const result = await ensureMealThumbnail('meal-1', 'file:///docs/photo-A.jpg');

      expect(result).toBe('file:///docs/photo-A-thumb.jpg');
      expect(MealService.updateMealThumbnail).toHaveBeenCalledWith(
        'meal-1',
        'file:///docs/photo-A-thumb.jpg',
        'file:///docs/photo-A.jpg'
      );
    });

    test('Case B: rotation before thumbnail request generates thumbnail for new photo B', async () => {
      const rotatedMeal = createMockMeal({
        photo_path: 'file:///docs/photo-B.jpg',
        photo_thumbnail_path: undefined,
      });
      (MealService.getMealById as jest.Mock).mockResolvedValue(rotatedMeal);
      (persistThumbnailToStablePath as jest.Mock).mockResolvedValue(
        'file:///docs/photo-B-thumb.jpg'
      );
      (MealService.updateMealThumbnail as jest.Mock).mockResolvedValue(true);

      const result = await ensureMealThumbnail('meal-1', 'file:///docs/photo-B.jpg');

      expect(result).toBe('file:///docs/photo-B-thumb.jpg');
      expect(ImageResizer.createResizedImage).toHaveBeenCalledWith(
        'file:///docs/photo-B.jpg',
        320,
        320,
        'JPEG',
        70,
        0,
        undefined,
        true,
        { mode: 'contain', onlyScaleDown: true }
      );
      expect(MealService.updateMealThumbnail).toHaveBeenCalledWith(
        'meal-1',
        'file:///docs/photo-B-thumb.jpg',
        'file:///docs/photo-B.jpg'
      );
    });

    test('Case C (Critical Race): rotation occurs while thumbnail A is generating; A is discarded as stale and B is independently generated and saved', async () => {
      let currentDbPhoto = 'file:///docs/photo-A.jpg';
      let currentDbThumbnail: string | null = null;
      const isDeleted = 0;

      (MealService.getMealById as jest.Mock).mockImplementation(async (id: string) => {
        return createMockMeal({
          id,
          photo_path: currentDbPhoto,
          photo_thumbnail_path: currentDbThumbnail ?? undefined,
          is_deleted: Boolean(isDeleted),
        });
      });

      (MealService.updateMealThumbnail as jest.Mock).mockImplementation(
        async (_id: string, thumbPath: string, expectedPhoto: string) => {
          if (currentDbPhoto === expectedPhoto && !isDeleted) {
            currentDbThumbnail = thumbPath;
            return true;
          }
          return false;
        }
      );

      let resolveResizerA!: (val: any) => void;
      const resizerPromiseA = new Promise(resolve => {
        resolveResizerA = resolve;
      });

      let resolveResizerB!: (val: any) => void;
      const resizerPromiseB = new Promise(resolve => {
        resolveResizerB = resolve;
      });

      (ImageResizer.createResizedImage as jest.Mock).mockImplementation((sourceUri: string) => {
        if (sourceUri === 'file:///docs/photo-A.jpg') {
          return resizerPromiseA;
        }
        if (sourceUri === 'file:///docs/photo-B.jpg') {
          return resizerPromiseB;
        }
        return Promise.resolve({ uri: 'file:///tmp/resized-default.jpg' });
      });

      (persistThumbnailToStablePath as jest.Mock).mockImplementation(
        async (_tempUri: string, originalUri: string) => {
          return originalUri.replace('.jpg', '-thumb.jpg');
        }
      );

      // 1. Generation A starts for photo A
      const promiseA = ensureMealThumbnail('meal-1', 'file:///docs/photo-A.jpg');

      // 2. While A is in-flight, user rotates photo to B in DB
      currentDbPhoto = 'file:///docs/photo-B.jpg';
      currentDbThumbnail = null;

      // 3. Generation B starts for new photo generation B
      const promiseB = ensureMealThumbnail('meal-1', 'file:///docs/photo-B.jpg');

      // Assert that A and B are treated as separate photo generations
      expect(promiseA).not.toBe(promiseB);

      // 4. A completes (generates photo-A-thumb.jpg, but DB rejects it as stale)
      resolveResizerA({
        uri: 'file:///tmp/resized-A.jpg',
        path: '/tmp/resized-A.jpg',
        width: 320,
        height: 320,
      });

      const resultA = await promiseA;
      // Stale generation returns null
      expect(resultA).toBeNull();
      // Stale thumbnail file is safely cleaned up
      expect(cleanupTempFile).toHaveBeenCalledWith('file:///docs/photo-A-thumb.jpg');
      // Old thumbnail A is NOT saved to the DB for meal-1
      expect(currentDbThumbnail).toBeNull();

      // 5. B completes (generates photo-B-thumb.jpg, DB accepts it)
      resolveResizerB({
        uri: 'file:///tmp/resized-B.jpg',
        path: '/tmp/resized-B.jpg',
        width: 320,
        height: 320,
      });

      const resultB = await promiseB;
      expect(resultB).toBe('file:///docs/photo-B-thumb.jpg');
      // DB state is correctly updated to photo B's thumbnail
      expect(currentDbThumbnail).toBe('file:///docs/photo-B-thumb.jpg');
      // Current thumbnail B is NOT cleaned up
      expect(cleanupTempFile).not.toHaveBeenCalledWith('file:///docs/photo-B-thumb.jpg');
    });

    test('Case D: rotated photo regenerates thumbnail when photo_thumbnail_path is reset to null', async () => {
      const rotatedMeal = createMockMeal({
        id: 'meal-1',
        photo_path: 'file:///docs/photo-rotated.jpg',
        photo_thumbnail_path: undefined,
      });
      (MealService.getMealById as jest.Mock).mockResolvedValue(rotatedMeal);
      (persistThumbnailToStablePath as jest.Mock).mockResolvedValue(
        'file:///docs/photo-rotated-thumb.jpg'
      );
      (MealService.updateMealThumbnail as jest.Mock).mockResolvedValue(true);

      const result = await ensureMealThumbnail('meal-1', 'file:///docs/photo-rotated.jpg');

      expect(result).toBe('file:///docs/photo-rotated-thumb.jpg');
      expect(ImageResizer.createResizedImage).toHaveBeenCalledWith(
        'file:///docs/photo-rotated.jpg',
        320,
        320,
        'JPEG',
        70,
        0,
        undefined,
        true,
        { mode: 'contain', onlyScaleDown: true }
      );
      expect(persistThumbnailToStablePath).toHaveBeenCalledWith(
        'file:///tmp/resized-thumb.jpg',
        'file:///docs/photo-rotated.jpg'
      );
      expect(MealService.updateMealThumbnail).toHaveBeenCalledWith(
        'meal-1',
        'file:///docs/photo-rotated-thumb.jpg',
        'file:///docs/photo-rotated.jpg'
      );
    });

    test('Case F: meal is deleted while thumbnail is generating; thumbnail is not saved to DB and temp file is cleaned up', async () => {
      let isDeleted = 0;
      (MealService.getMealById as jest.Mock).mockImplementation(async () =>
        createMockMeal({
          id: 'meal-1',
          photo_path: 'file:///docs/photo-A.jpg',
          is_deleted: Boolean(isDeleted),
        })
      );
      (MealService.updateMealThumbnail as jest.Mock).mockImplementation(
        async (_id: string, _thumbPath: string, _expectedPhoto: string) => {
          if (!isDeleted) {
            return true;
          }
          return false;
        }
      );

      let resolveThumbnailSave!: (uri: string) => void;
      const thumbnailSavePromise = new Promise<string>(resolve => {
        resolveThumbnailSave = resolve;
      });
      (persistThumbnailToStablePath as jest.Mock).mockReturnValue(thumbnailSavePromise);

      const promise = ensureMealThumbnail('meal-1', 'file:///docs/photo-A.jpg');

      // Meal is deleted before thumbnail completes
      isDeleted = 1;

      resolveThumbnailSave('file:///docs/photo-A-thumb.jpg');

      const result = await promise;
      expect(result).toBeNull();
      // Safe cleanup of generated file
      expect(cleanupTempFile).toHaveBeenCalledWith('file:///docs/photo-A-thumb.jpg');
    });

    test('Case G: duplicate requests for identical photo generation are deduplicated, while different generations are independent', async () => {
      let resolveResizer!: (value: any) => void;
      const resizerPromise = new Promise(resolve => {
        resolveResizer = resolve;
      });
      (ImageResizer.createResizedImage as jest.Mock).mockReturnValue(resizerPromise);

      const mealA = createMockMeal({ photo_path: 'file:///docs/photo-A.jpg' });
      (MealService.getMealById as jest.Mock).mockResolvedValue(mealA);

      // Duplicate requests for the same photo generation
      const req1 = ensureMealThumbnail('meal-1', 'file:///docs/photo-A.jpg');
      const req2 = ensureMealThumbnail('meal-1', 'file:///docs/photo-A.jpg');
      const req3 = ensureMealThumbnail('meal-1', 'file:///docs/photo-A.jpg');

      expect(req1).toBe(req2);
      expect(req2).toBe(req3);

      // Request for a different photo generation on the same meal
      const reqOtherPhoto = ensureMealThumbnail('meal-1', 'file:///docs/photo-B.jpg');
      expect(reqOtherPhoto).not.toBe(req1);

      resolveResizer({
        uri: 'file:///tmp/resized-thumb.jpg',
        path: '/tmp/resized-thumb.jpg',
        width: 320,
        height: 240,
      });

      await Promise.all([req1, req2, req3, reqOtherPhoto]);
    });

    test('cleans up stable thumbnail and returns null when DB update throws an error without destroying meal', async () => {
      const meal = createMockMeal({
        photo_path: 'file:///docs/photo-A.jpg',
      });
      (MealService.getMealById as jest.Mock).mockResolvedValue(meal);
      (persistThumbnailToStablePath as jest.Mock).mockResolvedValue(
        'file:///docs/photo-A-thumb.jpg'
      );
      (MealService.updateMealThumbnail as jest.Mock).mockRejectedValue(
        new Error('Disk I/O error during DB UPDATE')
      );

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());

      const result = await ensureMealThumbnail('meal-1', 'file:///docs/photo-A.jpg');

      // Exception does not leak out, returns null
      expect(result).toBeNull();
      // Created stable thumbnail is safely cleaned up
      expect(cleanupTempFile).toHaveBeenCalledWith('file:///docs/photo-A-thumb.jpg');
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to update meal thumbnail in DB:',
        expect.any(Error)
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('Fallback and Resilience', () => {
    test('getMealListImageUri falls back to original photo when thumbnail is absent or failed', () => {
      const mealWithoutThumb = createMockMeal({ photo_thumbnail_path: undefined });
      expect(getMealListImageUri(mealWithoutThumb)).toBe('file:///docs/meal-1.jpg');

      const mealWithThumb = createMockMeal({
        photo_thumbnail_path: 'file:///docs/meal-1-thumb.jpg',
      });
      expect(getMealListImageUri(mealWithThumb)).toBe('file:///docs/meal-1-thumb.jpg');
    });
  });

  describe('Lazy Fill (requestMealThumbnails)', () => {
    test('detects meals without thumbnail and triggers background generation', async () => {
      const meals = [
        createMockMeal({ id: 'meal-1', photo_thumbnail_path: undefined }),
        createMockMeal({ id: 'meal-2', photo_thumbnail_path: 'file:///docs/meal-2-thumb.jpg' }),
      ];

      (MealService.getMealById as jest.Mock).mockImplementation(async (id: string) => {
        return meals.find((m) => m.id === id) ?? null;
      });

      (getInfoAsync as jest.Mock).mockImplementation(async (uri: string) => {
        // Original photos exist for both, meal-2 has existing thumbnail, meal-1 does not
        if (uri.includes('-thumb.jpg')) {
          return { exists: uri.includes('meal-2') };
        }
        return { exists: true };
      });

      const onGenerated = jest.fn();
      requestMealThumbnails(meals, { onGenerated });

      // Wait for async queue execution
      await new Promise((r) => setTimeout(r, 50));

      expect(ImageResizer.createResizedImage).toHaveBeenCalledWith(
        'file:///docs/meal-1.jpg',
        expect.any(Number),
        expect.any(Number),
        expect.any(String),
        expect.any(Number),
        expect.any(Number),
        undefined,
        true,
        expect.any(Object)
      );
      // meal-2 already has thumbnail with file existing, so it was not regenerated
      expect(ImageResizer.createResizedImage).toHaveBeenCalledTimes(1);
    });

    test('requestMealThumbnail calls onGenerated callback on completion', async () => {
      const meal = createMockMeal({ id: 'meal-callback' });
      (MealService.getMealById as jest.Mock).mockResolvedValue(meal);

      const onGenerated = jest.fn();
      requestMealThumbnail('meal-callback', { onGenerated });

      await new Promise((r) => setTimeout(r, 50));

      expect(onGenerated).toHaveBeenCalledWith(
        'meal-callback',
        'file:///docs/meal-1-thumb.jpg'
      );
    });
  });
});
