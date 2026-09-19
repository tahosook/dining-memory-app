import ImageResizer from '@bam.tech/react-native-image-resizer';
import { CAMERA_CONSTANTS } from '../../constants/CameraConstants';
import {
  persistPhotoToStablePath,
  persistThumbnailToStablePath,
  type PersistPhotoOptions,
} from '../../media/photoStorage';
import { cleanupTempFile } from '../../media/tempFiles';

export type PersistedCapturePhotoWithResizeInfo = Awaited<ReturnType<typeof persistPhotoToStablePath>> & {
  resizedPhotoUri: string;
  stableThumbnailUri?: string;
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

  let persistedPhoto: Awaited<ReturnType<typeof persistPhotoToStablePath>>;
  try {
    persistedPhoto = await persistPhotoToStablePath(resizedPhoto.uri, options);
  } finally {
    if (resizedPhoto.uri !== photoUri) {
      await cleanupTempFile(resizedPhoto.uri);
    }
  }

  let stableThumbnailUri: string | undefined;
  try {
    const resizedThumbnail = await ImageResizer.createResizedImage(
      photoUri,
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

    try {
      stableThumbnailUri = await persistThumbnailToStablePath(
        resizedThumbnail.uri,
        persistedPhoto.stablePhotoUri
      );
    } finally {
      if (resizedThumbnail.uri !== photoUri) {
        await cleanupTempFile(resizedThumbnail.uri);
      }
    }
  } catch (thumbnailError: unknown) {
    console.warn('Thumbnail generation failed, but original photo is preserved:', thumbnailError);
  }

  return {
    ...persistedPhoto,
    resizedPhotoUri: resizedPhoto.uri,
    stableThumbnailUri,
  };
}
