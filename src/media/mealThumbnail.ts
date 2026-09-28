import ImageResizer from '@bam.tech/react-native-image-resizer';
import { getInfoAsync } from 'expo-file-system/legacy';
import { CAMERA_CONSTANTS } from '../constants/CameraConstants';
import { MealService } from '../database/services/MealService';
import type { Meal } from '../types/MealTypes';
import { persistThumbnailToStablePath } from './photoStorage';
import { cleanupTempFile } from './tempFiles';

export const MAX_CONCURRENT_THUMBNAILS = 2;

export interface ThumbnailRequestOptions {
  photoPath?: string;
  onGenerated?: (mealId: string, thumbUri: string) => void;
}

export function getPhotoGenerationKey(mealId: string, photoPath: string): string {
  return `${mealId}:${photoPath}`;
}

type QueueTask = {
  generationKey: string;
  mealId: string;
  photoPath: string;
  run: () => Promise<string | null>;
  resolve: (value: string | null) => void;
};

const inFlightGenerationMap = new Map<string, Promise<string | null>>();
const inFlightMealMap = new Map<string, Promise<string | null>>();
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
        console.warn(
          `Unexpected failure in thumbnail queue for generation ${nextTask.generationKey}:`,
          error
        );
        nextTask.resolve(null);
      })
      .finally(() => {
        activeTaskCount -= 1;
        inFlightGenerationMap.delete(nextTask.generationKey);
        pumpQueue();
      });
  }
}

function enqueueThumbnailTask(
  generationKey: string,
  mealId: string,
  photoPath: string,
  run: () => Promise<string | null>
): Promise<string | null> {
  return new Promise<string | null>(resolve => {
    taskQueue.push({ generationKey, mealId, photoPath, run, resolve });
    pumpQueue();
  });
}

async function processMealThumbnail(
  mealId: string,
  targetPhotoPath: string
): Promise<string | null> {
  try {
    const meal = await MealService.getMealById(mealId);
    if (!meal || meal.is_deleted || !meal.photo_path) {
      return null;
    }

    // 写真世代チェック: DBの現在の photo_path と対象世代が一致しない場合は処理不要 (stale)
    if (meal.photo_path !== targetPhotoPath) {
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
      const originalInfo = await getInfoAsync(targetPhotoPath);
      if (!originalInfo.exists) {
        console.warn(
          'Original photo does not exist for meal thumbnail generation:',
          targetPhotoPath
        );
        return null;
      }
    } catch {
      console.warn(
        'Failed to verify original photo for meal thumbnail generation:',
        targetPhotoPath
      );
      return null;
    }

    // サムネイル生成
    const resizedThumbnail = await ImageResizer.createResizedImage(
      targetPhotoPath,
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
        targetPhotoPath
      );
    } finally {
      if (resizedThumbnail.uri !== targetPhotoPath) {
        await cleanupTempFile(resizedThumbnail.uri);
      }
    }

    // Stale Update 防止: photo_path が対象世代と一致する場合のみ原子的に DB を更新
    let updated = false;
    try {
      updated = await MealService.updateMealThumbnail(mealId, stableThumbnailUri, targetPhotoPath);
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

/**
 * 食事サムネイルの生成タスクをキューイングする。
 *
 * @param mealId 食事ID
 * @param targetPhotoPath 写真世代のパス。指定時は `mealId:targetPhotoPath` で即座に世代キューへ登録する。
 *                        省略時は DB から最新の photo_path を取得して該当世代へ委譲する（互換用）。
 */
export function ensureMealThumbnail(
  mealId: string,
  targetPhotoPath?: string
): Promise<string | null> {
  if (targetPhotoPath) {
    const generationKey = getPhotoGenerationKey(mealId, targetPhotoPath);
    const inFlight = inFlightGenerationMap.get(generationKey);
    if (inFlight) {
      return inFlight;
    }

    const promise = enqueueThumbnailTask(generationKey, mealId, targetPhotoPath, () =>
      processMealThumbnail(mealId, targetPhotoPath)
    );
    inFlightGenerationMap.set(generationKey, promise);
    return promise;
  }

  // targetPhotoPath が明示されていない場合は mealId 単位で非同期解決
  const inFlightMeal = inFlightMealMap.get(mealId);
  if (inFlightMeal) {
    return inFlightMeal;
  }

  const promise = (async () => {
    try {
      const meal = await MealService.getMealById(mealId);
      if (!meal || meal.is_deleted || !meal.photo_path) {
        return null;
      }
      return await ensureMealThumbnail(mealId, meal.photo_path);
    } finally {
      inFlightMealMap.delete(mealId);
    }
  })();

  inFlightMealMap.set(mealId, promise);
  return promise;
}

export function requestMealThumbnail(mealId: string, options?: ThumbnailRequestOptions): void;
export function requestMealThumbnail(
  mealId: string,
  photoPath: string,
  options?: ThumbnailRequestOptions
): void;
export function requestMealThumbnail(
  mealId: string,
  photoPathOrOptions?: string | ThumbnailRequestOptions,
  maybeOptions?: ThumbnailRequestOptions
): void {
  const photoPath =
    typeof photoPathOrOptions === 'string' ? photoPathOrOptions : photoPathOrOptions?.photoPath;
  const options = typeof photoPathOrOptions === 'object' ? photoPathOrOptions : maybeOptions;

  void ensureMealThumbnail(mealId, photoPath)
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
    const candidateMeals = await Promise.all(
      meals.map(async meal => {
        if (!meal.photo_path) {
          return null;
        }

        if (!meal.photo_thumbnail_path) {
          return meal;
        }

        try {
          const info = await getInfoAsync(meal.photo_thumbnail_path);
          if (!info.exists) {
            return meal;
          }
        } catch {
          return meal;
        }

        return null;
      })
    );

    for (const meal of candidateMeals) {
      if (meal) {
        requestMealThumbnail(meal.id, meal.photo_path, options);
      }
    }
  })().catch(error => {
    console.warn('Failed to inspect meals for thumbnail backfill:', error);
  });
}

export function getInFlightThumbnailPhotoPaths(): Set<string> {
  const inFlightPaths = new Set<string>();

  for (const task of taskQueue) {
    if (task.photoPath) {
      inFlightPaths.add(task.photoPath);
    }
  }

  for (const key of inFlightGenerationMap.keys()) {
    const colonIndex = key.indexOf(':');
    if (colonIndex !== -1) {
      const path = key.slice(colonIndex + 1);
      if (path) {
        inFlightPaths.add(path);
      }
    }
  }

  return inFlightPaths;
}

export function __clearThumbnailQueueForTest(): void {
  taskQueue.length = 0;
  inFlightGenerationMap.clear();
  inFlightMealMap.clear();
  activeTaskCount = 0;
}
