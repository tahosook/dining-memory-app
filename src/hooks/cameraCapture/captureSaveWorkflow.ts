import type { PermissionResponse } from 'expo-camera';
import { MealService } from '../../database/services/MealService';
import type { AppliedMealInputAssistMetadata } from '../../ai/mealInputAssist/types';
import type { PersistPhotoOptions } from '../../media/photoStorage';
import type { CaptureReviewState } from './captureReviewState';
import { isWebWithoutCameraPermission } from './photoAcquisition';
import type { LocationSnapshot } from './locationSnapshot';

interface PersistedCapturePhoto {
  stablePhotoUri: string;
  savedToMediaLibrary: boolean;
  resizedPhotoUri?: string;
}

interface SaveCaptureWorkflowParams {
  captureReview: CaptureReviewState;
  cameraPermission: PermissionResponse | null;
  aiMetadata?: AppliedMealInputAssistMetadata | null;
  ensurePhotoSavePermission: () => Promise<boolean>;
  getLocationSnapshot: () => Promise<LocationSnapshot>;
  persistPhotoLocally: (
    photoUri: string,
    options: PersistPhotoOptions
  ) => Promise<PersistedCapturePhoto>;
  savePhotoToMediaLibrary: (photoUri: string) => Promise<boolean>;
  cleanupTempFile: (photoUri: string) => Promise<void>;
}

export type SaveCaptureWorkflowResult =
  | {
    kind: 'saved';
    resizedPhotoUri: string | null;
    stablePhotoUri: string;
    savedToMediaLibrary: boolean;
    mealId: string;
  }
  | { kind: 'skipped'; reason: 'photo_permission_denied' | 'duplicate_in_flight' };

const inFlightCaptureReviewSaves = new Set<string>();

function createCaptureReviewSaveKey(captureReview: CaptureReviewState) {
  return `${captureReview.photoUri}::${captureReview.capturedAtMs}`;
}

export async function saveCaptureReviewWorkflow({
  captureReview,
  cameraPermission,
  aiMetadata,
  ensurePhotoSavePermission,
  getLocationSnapshot,
  persistPhotoLocally,
  savePhotoToMediaLibrary,
  cleanupTempFile,
}: SaveCaptureWorkflowParams): Promise<SaveCaptureWorkflowResult> {
  let stablePhotoUri: string | null = null;
  const isWebWithoutPermissions = isWebWithoutCameraPermission(cameraPermission);
  const saveKey = createCaptureReviewSaveKey(captureReview);

  if (inFlightCaptureReviewSaves.has(saveKey)) {
    return { kind: 'skipped', reason: 'duplicate_in_flight' };
  }

  inFlightCaptureReviewSaves.add(saveKey);

  try {
    if (!isWebWithoutPermissions) {
      const hasPhotoSavePermission = await ensurePhotoSavePermission();
      if (!hasPhotoSavePermission) {
        return { kind: 'skipped', reason: 'photo_permission_denied' };
      }
    }

    const locationSnapshot = await getLocationSnapshot();
    const persistedPhoto = isWebWithoutPermissions
      ? {
        stablePhotoUri: captureReview.photoUri,
        resizedPhotoUri: null,
        savedToMediaLibrary: false,
      }
      : await persistPhotoLocally(captureReview.photoUri, {
        capturedAt: new Date(captureReview.capturedAtMs),
        location: locationSnapshot,
        softwareName: process.env.EXPO_PUBLIC_APP_NAME ?? 'Dining Memory',
      });
    stablePhotoUri = persistedPhoto.stablePhotoUri;
    let savedToMediaLibrary = persistedPhoto.savedToMediaLibrary;

    const meal = await MealService.createMeal({
      meal_name: captureReview.mealName.trim(),
      cuisine_type: captureReview.cuisineType || undefined,
      ai_confidence: aiMetadata?.aiConfidence,
      ai_source: aiMetadata?.aiSource,
      notes: captureReview.notes.trim() || undefined,
      location_name: captureReview.locationName.trim() || undefined,
      latitude: locationSnapshot.latitude,
      longitude: locationSnapshot.longitude,
      is_homemade: captureReview.isHomemade,
      photo_path: stablePhotoUri,
      meal_datetime: new Date(),
    });

    if (!isWebWithoutPermissions && !persistedPhoto.savedToMediaLibrary) {
      const saveSuccess = await savePhotoToMediaLibrary(stablePhotoUri);
      savedToMediaLibrary = saveSuccess;
      if (!saveSuccess) {
        console.warn('Media library save skipped, but local record is preserved.');
      }
    }

    if (!isWebWithoutPermissions && stablePhotoUri !== captureReview.photoUri) {
      await cleanupTempFile(captureReview.photoUri);
    }

    return {
      kind: 'saved',
      resizedPhotoUri: persistedPhoto.resizedPhotoUri ?? null,
      stablePhotoUri,
      savedToMediaLibrary,
      mealId: meal.id,
    };
  } catch (error) {
    if (stablePhotoUri && stablePhotoUri !== captureReview.photoUri) {
      await cleanupTempFile(stablePhotoUri);
    }
    throw error;
  } finally {
    inFlightCaptureReviewSaves.delete(saveKey);
  }
}
