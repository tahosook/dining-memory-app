import type { CameraCapturedPicture } from 'expo-camera';
import type { CuisineTypeOption } from '../../constants/MealOptions';

export type CaptureReviewSource = 'camera' | 'library';

export interface CaptureReviewState {
  source: CaptureReviewSource;
  photoUri: string;
  width: number;
  height: number;
  capturedAtMs: number;
  mealName: string;
  cuisineType: CuisineTypeOption | '';
  notes: string;
  locationName: string;
  isHomemade: boolean;
}

export type CaptureReviewEditableField = keyof Omit<
  CaptureReviewState,
  'source' | 'photoUri' | 'width' | 'height' | 'capturedAtMs'
>;

export type ReviewablePhoto = Pick<CameraCapturedPicture, 'uri' | 'width' | 'height'>;

export function createCaptureReviewState(
  photo: ReviewablePhoto,
  source: CaptureReviewSource,
  capturedAtMs = Date.now()
): CaptureReviewState {
  return {
    source,
    photoUri: photo.uri,
    width: photo.width,
    height: photo.height,
    capturedAtMs,
    mealName: '',
    cuisineType: '',
    notes: '',
    locationName: '',
    isHomemade: true,
  };
}
