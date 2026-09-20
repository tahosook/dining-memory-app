import ImageResizer from '@bam.tech/react-native-image-resizer';
import { getInfoAsync } from 'expo-file-system/legacy';
import { CAMERA_CONSTANTS } from '../constants/CameraConstants';
import { MealService } from '../database/services/MealService';
import type { Meal } from '../types/MealTypes';
import { persistThumbnailToStablePath } from './photoStorage';
import { cleanupTempFile } from './tempFiles';

export const MAX_CONCURRENT_THUMBNAILS = 2;

export interface ThumbnailRequestOptions {
  onGenerated?: (mealId: string, thumbUri: string) => void;
}

type QueueTask = {
  mealId: string;
  run: () => Promise<string | null>;
  resolve: (value: string | null) => void;
};

const inFlightMap = new Map<string, Promise<string | null>>();
const taskQueue: QueueTask[] = [];
let activeTaskCount = 0;

function pumpQueue() {
  while (activeTaskCount < MAX_CONCURRENT_THUMBNAILS && taskQueue.length > 0) {
    const nextTask = taskQueue.shift();
    if (!nextTask) {
      break;
    }

    activeTaskCount += 1;
    nextTask
      .run()
      .then(nextTask.resolve)
      .catch(error => {
        console.warn(`Unexpected failure in thumbnail queue for meal ${nextTask.mealId}:`, error);
        nextTask.resolve(null);
      })
      .finally(() => {
        activeTaskCount -= 1;
        inFlightMap.delete(nextTask.mealId);
        pumpQueue();
      });
  }
}

function enqueueThumbnailTask(
  mealId: string,
  run: () => Promise<string | null>
): Promise<string | null> {
  return new Promise<string | null>(resolve => {
    taskQueue.push({ mealId, run, resolve });
    pumpQueue();
  });
}

async function processMealThumbnail(mealId: string): Promise<string | null> {
  try {
    const meal = await MealService.getMealById(mealId);
    if (!meal || meal.is_deleted || !meal.photo_path) {
      return null;
    }

    // 既にサムネイルが存在し、ファイルが実在する場合はスキップ
    if (meal.photo_thumbnail_path) {
      try {
        const thumbInfo = await getInfoAsync(meal.photo_thumbnail_path);
        if (thumbInfo.exists) {
          return meal.photo_thumbnail_path;
        }
      } catch {
        // ファイル情報取得エラー時は再生成へ進む
      }
    }

    // オリジナル写真の実在確認
    try {
      const originalInfo = await getInfoAsync(meal.photo_path);
      if (!originalInfo.exists) {
        console.warn(
          'Original photo does not exist for meal thumbnail generation:',
          meal.photo_path
        );
        return null;
      }
    } catch {
      console.warn(
        'Failed to verify original photo for meal thumbnail generation:',
        meal.photo_path
      );
      return null;
    }

    const initialPhotoPath = meal.photo_path;

    // サムネイル生成
    const resizedThumbnail = await ImageResizer.createResizedImage(
      initialPhotoPath,
      CAMERA_CONSTANTS.THUMBNAIL_PHOTO_MAX_WIDTH,
      CAMERA_CONSTANTS.THUMBNAIL_PHOTO_MAX_HEIGHT,
      'JPEG',
      CAMERA_CONSTANTS.THUMBNAIL_PHOTO_QUALITY_PERCENT,
      0,
      undefined,
      true,
      {
        mode: 'contain',
        onlyScaleDown: true,
      }
    );

    let stableThumbnailUri: string;
    try {
      stableThumbnailUri = await persistThumbnailToStablePath(
        resizedThumbnail.uri,
        initialPhotoPath
      );
    } finally {
      if (resizedThumbnail.uri !== initialPhotoPath) {
        await cleanupTempFile(resizedThumbnail.uri);
      }
    }

    // Stale Update 防止: photo_path が生成開始時と一致する場合のみ原子的に DB を更新
    let updated = false;
    try {
      updated = await MealService.updateMealThumbnail(mealId, stableThumbnailUri, initialPhotoPath);
    } catch (dbError) {
      console.warn('Failed to update meal thumbnail in DB:', dbError);
      await cleanupTempFile(stableThumbnailUri);
      return null;
    }

    if (!updated) {
      // 写真が差し替えられたか、Mealが削除されたため stale result として破棄
      await cleanupTempFile(stableThumbnailUri);
      return null;
    }

    return stableThumbnailUri;
  } catch (error) {
    console.warn('Meal thumbnail generation failed:', error);
    return null;
  }
}

export function ensureMealThumbnail(mealId: string): Promise<string | null> {
  const inFlight = inFlightMap.get(mealId);
  if (inFlight) {
    return inFlight;
  }

  const promise = enqueueThumbnailTask(mealId, () => processMealThumbnail(mealId));
  inFlightMap.set(mealId, promise);
  return promise;
}

export function requestMealThumbnail(mealId: string, options?: ThumbnailRequestOptions): void {
  void ensureMealThumbnail(mealId)
    .then(thumbUri => {
      if (thumbUri && options?.onGenerated) {
        options.onGenerated(mealId, thumbUri);
      }
    })
    .catch(error => {
      console.warn(`Background thumbnail request failed for meal ${mealId}:`, error);
    });
}

export function requestMealThumbnails(
  meals: Pick<Meal, 'id' | 'photo_path' | 'photo_thumbnail_path'>[],
  options?: ThumbnailRequestOptions
): void {
  (async () => {
    const candidateMealIds = await Promise.all(
      meals.map(async meal => {
        if (!meal.photo_path) {
          return null;
        }

        if (!meal.photo_thumbnail_path) {
          return meal.id;
        }

        try {
          const info = await getInfoAsync(meal.photo_thumbnail_path);
          if (!info.exists) {
            return meal.id;
          }
        } catch {
          return meal.id;
        }

        return null;
      })
    );

    for (const mealId of candidateMealIds) {
      if (mealId) {
        requestMealThumbnail(mealId, options);
      }
    }
  })().catch(error => {
    console.warn('Failed to inspect meals for thumbnail backfill:', error);
  });
}

export function __clearThumbnailQueueForTest(): void {
  taskQueue.length = 0;
  inFlightMap.clear();
  activeTaskCount = 0;
}
