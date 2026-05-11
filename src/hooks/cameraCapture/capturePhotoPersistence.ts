import ImageResizer from '@bam.tech/react-native-image-resizer';
import { CAMERA_CONSTANTS } from '../../constants/CameraConstants';
import {
  persistPhotoToStablePath,
  type PersistPhotoOptions,
} from '../../media/photoStorage';
import { cleanupTempFile } from '../../media/tempFiles';

export async function persistCapturePhotoLocally(
  photoUri: string,
  options: PersistPhotoOptions
) {
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
    return await persistPhotoToStablePath(resizedPhoto.uri, options);
  } finally {
    if (resizedPhoto.uri !== photoUri) {
      await cleanupTempFile(resizedPhoto.uri);
    }
  }
}
