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
    (MealService.updateMeal as jest.Mock).mockResolvedValue(true);
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
      expect(MealService.updateMeal).toHaveBeenCalledWith('meal-1', {
        photo_thumbnail_path: 'file:///docs/meal-1-thumb.jpg',
      });
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
      expect(MealService.updateMeal).not.toHaveBeenCalled();
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
      expect(MealService.updateMeal).toHaveBeenCalledWith('meal-1', {
        photo_thumbnail_path: 'file:///docs/meal-1-thumb.jpg',
      });
    });

    test('skips thumbnail generation if original photo file does not exist', async () => {
      const meal = createMockMeal();
      (MealService.getMealById as jest.Mock).mockResolvedValue(meal);
      (getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

      const result = await ensureMealThumbnail('meal-1');

      expect(result).toBeNull();
      expect(ImageResizer.createResizedImage).not.toHaveBeenCalled();
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
      expect(MealService.updateMeal).not.toHaveBeenCalled();
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

  describe('Stale Update Prevention', () => {
    test('discards generated thumbnail and cleans up file if photo_path was changed during generation', async () => {
      const initialMeal = createMockMeal({
        photo_path: 'file:///docs/meal-initial.jpg',
      });
      const changedMeal = createMockMeal({
        photo_path: 'file:///docs/meal-replaced.jpg',
      });

      (MealService.getMealById as jest.Mock)
        .mockResolvedValueOnce(initialMeal) // First call: before generation
        .mockResolvedValueOnce(changedMeal); // Second call: before DB update check

      (persistThumbnailToStablePath as jest.Mock).mockResolvedValue(
        'file:///docs/meal-initial-thumb.jpg'
      );

      const result = await ensureMealThumbnail('meal-1');

      // Result should be null (stale discarded)
      expect(result).toBeNull();
      // DB should NOT be updated with stale thumbnail
      expect(MealService.updateMeal).not.toHaveBeenCalled();
      // Generated stable thumbnail must be cleaned up
      expect(cleanupTempFile).toHaveBeenCalledWith('file:///docs/meal-initial-thumb.jpg');
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
