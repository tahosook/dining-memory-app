import ImageResizer from '@bam.tech/react-native-image-resizer';
import {
  copyAsync,
  deleteAsync,
  documentDirectory,
} from 'expo-file-system/legacy';
import { CAMERA_CONSTANTS } from '../constants/CameraConstants';

function createRotatedMealPhotoDestinationUri() {
  if (!documentDirectory) {
    throw new Error('Document directory is not available');
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const suffix = Math.random().toString(16).slice(2, 10);
  return `${documentDirectory}meal-photo-rotated-${timestamp}-${suffix}.jpg`;
}

function isDeletableAppDocumentFile(uri: string | null | undefined) {
  if (!uri || !documentDirectory) {
    return false;
  }

  return uri.startsWith('file://') && uri.startsWith(documentDirectory);
}

export async function rotateMealPhotoClockwise(sourceUri: string): Promise<string> {
  const resizedPhoto = await ImageResizer.createResizedImage(
    sourceUri,
    CAMERA_CONSTANTS.SAVED_PHOTO_MAX_WIDTH,
    CAMERA_CONSTANTS.SAVED_PHOTO_MAX_HEIGHT,
    'JPEG',
    CAMERA_CONSTANTS.SAVED_PHOTO_QUALITY_PERCENT,
    90,
    undefined,
    true,
    {
      mode: 'contain',
      onlyScaleDown: true,
    }
  );
  const destinationUri = createRotatedMealPhotoDestinationUri();

  try {
    await copyAsync({
      from: resizedPhoto.uri,
      to: destinationUri,
    });

    return destinationUri;
  } finally {
    if (resizedPhoto.uri !== sourceUri && resizedPhoto.uri !== destinationUri) {
      await deleteAsync(resizedPhoto.uri, { idempotent: true }).catch(() => undefined);
    }
  }
}

export async function deleteMealPhotoFileIfSafe(uri: string | null | undefined, replacementUri?: string | null): Promise<void> {
  const targetUri = uri;

  if (typeof targetUri !== 'string' || !isDeletableAppDocumentFile(targetUri) || targetUri === replacementUri) {
    return;
  }

  await deleteAsync(targetUri, { idempotent: true });
}
