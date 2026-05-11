import ImageResizer from '@bam.tech/react-native-image-resizer';
import { deleteAsync } from 'expo-file-system/legacy';
import { CAMERA_CONSTANTS } from '../../constants/CameraConstants';
import type { MealInputAssistRequest } from './types';

export interface PreparedMealInputAssistRequest {
  request: MealInputAssistRequest;
  cleanup: () => Promise<void>;
}

export async function cleanupPreparedMealInputAssistPhoto(
  preparedPhotoUri: string,
  originalPhotoUri: string
) {
  if (preparedPhotoUri === originalPhotoUri) {
    return;
  }

  try {
    await deleteAsync(preparedPhotoUri, { idempotent: true });
  } catch (error) {
    console.warn('Failed to clean up AI analysis photo:', error);
  }
}

export async function prepareMealInputAssistRequest(
  currentRequest: MealInputAssistRequest
): Promise<PreparedMealInputAssistRequest> {
  const resizedPhoto = await ImageResizer.createResizedImage(
    currentRequest.photoUri,
    CAMERA_CONSTANTS.AI_INPUT_ASSIST_PHOTO_MAX_WIDTH,
    CAMERA_CONSTANTS.AI_INPUT_ASSIST_PHOTO_MAX_HEIGHT,
    'JPEG',
    CAMERA_CONSTANTS.AI_INPUT_ASSIST_PHOTO_QUALITY_PERCENT,
    0,
    undefined,
    true,
    {
      mode: 'contain',
      onlyScaleDown: true,
    }
  );

  return {
    request: {
      ...currentRequest,
      photoUri: resizedPhoto.uri,
    },
    cleanup: async () =>
      cleanupPreparedMealInputAssistPhoto(resizedPhoto.uri, currentRequest.photoUri),
  };
}
