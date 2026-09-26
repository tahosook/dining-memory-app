import type { PermissionResponse } from 'expo-camera';
import { MealService } from '../../database/services/MealService';
import type { AppliedMealInputAssistMetadata } from '../../ai/mealInputAssist/types';
import type { PersistPhotoOptions } from '../../media/photoStorage';
import type { CaptureReviewState } from './captureReviewState';
import { isWebWithoutCameraPermission } from './photoAcquisition';
import type { LocationSnapshot } from './locationSnapshot';
import { requestMealThumbnail } from '../../media/mealThumbnail';

interface PersistedCapturePhoto {
  stablePhotoUri: string;
  stableThumbnailUri?: string;
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
  triggerThumbnailGeneration?: (mealId: string) => void;
}

export type SaveCaptureWorkflowResult =
  | {
      kind: 'saved';
      resizedPhotoUri: string | null;
      stablePhotoUri: string;
      stableThumbnailUri?: string;
      savedToMediaLibrary: boolean;
      mealId: string;
    }
  | { kind: 'skipped'; reason: 'photo_permission_denied' | 'duplicate_in_flight' };

const inFlightCaptureReviewSaves = new Set<string>();

function createCaptureReviewSaveKey(captureReview: CaptureReviewState) {
  return `${captureReview.photoUri}::${captureReview.capturedAtMs}`;
}

async function verifyPermissions(
  isWebWithoutPermissions: boolean,
  ensurePhotoSavePermission: () => Promise<boolean>
): Promise<boolean> {
  if (isWebWithoutPermissions) return true;
  return await ensurePhotoSavePermission();
}

async function persistPhoto(
  isWebWithoutPermissions: boolean,
  captureReview: CaptureReviewState,
  locationSnapshot: LocationSnapshot,
  persistPhotoLocally: (
    photoUri: string,
    options: PersistPhotoOptions
  ) => Promise<PersistedCapturePhoto>
): Promise<PersistedCapturePhoto> {
  if (isWebWithoutPermissions) {
    return {
      stablePhotoUri: captureReview.photoUri,
      stableThumbnailUri: undefined,
      resizedPhotoUri: undefined,
      savedToMediaLibrary: false,
    };
  }

  return await persistPhotoLocally(captureReview.photoUri, {
    capturedAt: new Date(captureReview.capturedAtMs),
    location: locationSnapshot,
    softwareName: process.env.EXPO_PUBLIC_APP_NAME ?? 'Dining Memory',
  });
}

async function saveMealToDatabase(
  captureReview: CaptureReviewState,
  locationSnapshot: LocationSnapshot,
  stablePhotoUri: string,
  stableThumbnailUri: string | undefined,
  aiMetadata?: AppliedMealInputAssistMetadata | null
) {
  return await MealService.createMeal({
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
    photo_thumbnail_path: stableThumbnailUri,
    meal_datetime: new Date(),
  });
}

async function handlePostSaveTasks(
  isWebWithoutPermissions: boolean,
  mealId: string,
  stablePhotoUri: string,
  originalPhotoUri: string,
  alreadySavedToMediaLibrary: boolean,
  savePhotoToMediaLibrary: (photoUri: string) => Promise<boolean>,
  cleanupTempFile: (photoUri: string) => Promise<void>,
  triggerThumbnailGeneration?: (mealId: string) => void
): Promise<boolean> {
  if (isWebWithoutPermissions) return false;

  const triggerThumbnail = triggerThumbnailGeneration ?? requestMealThumbnail;
  triggerThumbnail(mealId);

  let savedToMediaLibrary = alreadySavedToMediaLibrary;
  if (!alreadySavedToMediaLibrary) {
    const saveSuccess = await savePhotoToMediaLibrary(stablePhotoUri);
    savedToMediaLibrary = saveSuccess;
    if (!saveSuccess) {
      console.warn('Media library save skipped, but local record is preserved.');
    }
  }

  if (stablePhotoUri !== originalPhotoUri) {
    await cleanupTempFile(originalPhotoUri);
  }

  return savedToMediaLibrary;
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
  triggerThumbnailGeneration,
}: SaveCaptureWorkflowParams): Promise<SaveCaptureWorkflowResult> {
  let stablePhotoUri: string | null = null;
  let stableThumbnailUri: string | undefined;
  const isWebWithoutPermissions = isWebWithoutCameraPermission(cameraPermission);
  const saveKey = createCaptureReviewSaveKey(captureReview);

  if (inFlightCaptureReviewSaves.has(saveKey)) {
    return { kind: 'skipped', reason: 'duplicate_in_flight' };
  }

  inFlightCaptureReviewSaves.add(saveKey);

  try {
    const hasPermission = await verifyPermissions(
      isWebWithoutPermissions,
      ensurePhotoSavePermission
    );
    if (!hasPermission) {
      return { kind: 'skipped', reason: 'photo_permission_denied' };
    }

    const locationSnapshot = await getLocationSnapshot();
    const persistedPhoto = await persistPhoto(
      isWebWithoutPermissions,
      captureReview,
      locationSnapshot,
      persistPhotoLocally
    );

    stablePhotoUri = persistedPhoto.stablePhotoUri;
    stableThumbnailUri = persistedPhoto.stableThumbnailUri;

    const meal = await saveMealToDatabase(
      captureReview,
      locationSnapshot,
      stablePhotoUri,
      stableThumbnailUri,
      aiMetadata
    );

    const savedToMediaLibrary = await handlePostSaveTasks(
      isWebWithoutPermissions,
      meal.id,
      stablePhotoUri,
      captureReview.photoUri,
      persistedPhoto.savedToMediaLibrary,
      savePhotoToMediaLibrary,
      cleanupTempFile,
      triggerThumbnailGeneration
    );

    return {
      kind: 'saved',
      resizedPhotoUri: persistedPhoto.resizedPhotoUri ?? null,
      stablePhotoUri,
      stableThumbnailUri,
      savedToMediaLibrary,
      mealId: meal.id,
    };
  } catch (error) {
    if (stablePhotoUri && stablePhotoUri !== captureReview.photoUri) {
      await cleanupTempFile(stablePhotoUri);
    }
    if (stableThumbnailUri && stableThumbnailUri !== captureReview.photoUri) {
      await cleanupTempFile(stableThumbnailUri);
    }
    throw error;
  } finally {
    inFlightCaptureReviewSaves.delete(saveKey);
  }
}
