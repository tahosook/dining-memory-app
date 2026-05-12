import ImageResizer from '@bam.tech/react-native-image-resizer';
import { CAMERA_CONSTANTS } from '../../constants/CameraConstants';
import {
  persistPhotoToStablePath,
  type PersistPhotoOptions,
} from '../../media/photoStorage';
import { cleanupTempFile } from '../../media/tempFiles';

type PersistedCapturePhotoWithResizeInfo = Awaited<ReturnType<typeof persistPhotoToStablePath>> & {
  resizedPhotoUri: string;
};

export async function persistCapturePhotoLocally(
  photoUri: string,
  options: PersistPhotoOptions
): Promise<PersistedCapturePhotoWithResizeInfo> {
  const resizedPhoto = await ImageResizer.createResizedImage(
    photoUri,
    CAMERA_CONSTANTS.SAVED_PHOTO_MAX_WIDTH,
    CAMERA_CONSTANTS.SAVED_PHOTO_MAX_HEIGHT,
    'JPEG',
    CAMERA_CONSTANTS.SAVED_PHOTO_QUALITY_PERCENT,
    0,
    undefined,
    true,
    {
      mode: 'contain',
      onlyScaleDown: true,
    }
  );

  try {
    const persistedPhoto = await persistPhotoToStablePath(resizedPhoto.uri, options);
    return {
      ...persistedPhoto,
      resizedPhotoUri: resizedPhoto.uri,
    };
  } finally {
    if (resizedPhoto.uri !== photoUri) {
      await cleanupTempFile(resizedPhoto.uri);
    }
  }
}
