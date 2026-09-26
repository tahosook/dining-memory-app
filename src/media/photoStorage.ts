import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { copyAsync, documentDirectory, getInfoAsync } from 'expo-file-system/legacy';
import * as Crypto from 'expo-crypto';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import { CAMERA_CONSTANTS } from '../constants/CameraConstants';
import { cleanupTempFile } from './tempFiles';
import { sanitizeLogObject } from '../utils/logSanitizer';
import {
  buildMealPhotoFileName,
  formatPhotoTimestampForFilename,
  type PhotoLocationSnapshot,
  writePhotoExifToJpeg,
} from './photoExif';

export const ANDROID_PHOTO_ALBUM_NAME = 'Dining Memory';
export const DEFAULT_PHOTO_SOFTWARE_NAME =
  process.env.EXPO_PUBLIC_APP_NAME ?? ANDROID_PHOTO_ALBUM_NAME;
export const MAX_PHOTO_COLLISION_ATTEMPTS = 100;

export type PersistPhotoResult = {
  stablePhotoUri: string;
  savedToMediaLibrary: boolean;
};

export interface PersistPhotoOptions {
  capturedAt: Date;
  location?: PhotoLocationSnapshot;
  softwareName?: string;
}

async function resolveDestinationUri(capturedAt: Date) {
  if (!documentDirectory) {
    throw new Error('Document directory is not available');
  }

  let collisionIndex = 0;

  while (collisionIndex < MAX_PHOTO_COLLISION_ATTEMPTS) {
    const candidate = `${documentDirectory}${buildMealPhotoFileName(capturedAt, collisionIndex)}`;
    const fileInfo = await getInfoAsync(candidate);

    if (!fileInfo.exists) {
      return candidate;
    }

    collisionIndex += 1;
  }

  const timestamp = formatPhotoTimestampForFilename(capturedAt);
  const fallbackSuffix = `${Date.now()}-${Crypto.randomUUID().slice(0, 8)}`;
  return `${documentDirectory}meal-${timestamp}-fallback-${fallbackSuffix}.jpg`;
}

export async function persistPhotoToStablePath(
  photoUri: string,
  options: PersistPhotoOptions
): Promise<PersistPhotoResult> {
  if (!documentDirectory) {
    throw new Error('Document directory is not available');
  }

  const destination = await resolveDestinationUri(options.capturedAt);

  let sourceToCopy = photoUri;
  let resizedTempUri: string | null = null;

  try {
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
    resizedTempUri = resizedPhoto.uri;
    sourceToCopy = resizedPhoto.uri;
  } catch (resizeError: unknown) {
    console.warn('Photo native resize failed, falling back to original image:', resizeError);
    sourceToCopy = photoUri;
  }

  try {
    try {
      await copyAsync({
        from: sourceToCopy,
        to: destination,
      });
    } catch (copyError: unknown) {
      const errorMessage = copyError instanceof Error ? copyError.message : String(copyError);
      throw new Error(`Failed to copy photo to stable path: ${errorMessage}`);
    }

    // Verify the file was actually copied
    const destinationInfo = await getInfoAsync(destination);
    if (!destinationInfo.exists) {
      throw new Error(`Photo copy completed but file not found at ${destination}`);
    }

    try {
      await writePhotoExifToJpeg(destination, {
        capturedAt: options.capturedAt,
        location: options.location,
        softwareName: options.softwareName?.trim() || DEFAULT_PHOTO_SOFTWARE_NAME,
      });
    } catch (photoExifError: unknown) {
      console.warn('Photo EXIF update skipped, but local photo copy is preserved:', photoExifError);
    }
  } finally {
    if (resizedTempUri && resizedTempUri !== photoUri) {
      await cleanupTempFile(resizedTempUri);
    }
  }

  if (Platform.OS === 'android') {
    let savedToMediaLibrary = false;

    try {
      const existingAlbum = await MediaLibrary.Album.get(ANDROID_PHOTO_ALBUM_NAME);

      if (existingAlbum) {
        const asset = await MediaLibrary.Asset.create(destination, existingAlbum);
        console.info('Android photo saved directly to existing Dining Memory album:', sanitizeLogObject({
          destination,
          albumId: existingAlbum.id,
          assetId: asset.id,
        }));
      } else {
        const newAlbum = await MediaLibrary.Album.create(ANDROID_PHOTO_ALBUM_NAME, [destination]);
        console.info('Android Dining Memory album created with photo:', sanitizeLogObject({
          destination,
          albumId: newAlbum.id,
        }));
      }
      savedToMediaLibrary = true;
    } catch (albumError: unknown) {
      console.warn('Android album save failed, but local photo copy is preserved:', albumError);
    }

    return {
      stablePhotoUri: destination,
      savedToMediaLibrary,
    };
  }

  return {
    stablePhotoUri: destination,
    savedToMediaLibrary: false,
  };
}

export function resolveThumbnailDestinationUri(stablePhotoUri: string): string {
  const match = stablePhotoUri.match(/^(.*)\.(jpe?g)$/i);
  if (match) {
    return `${match[1]}-thumb.jpg`;
  }
  return `${stablePhotoUri}-thumb.jpg`;
}

export async function persistThumbnailToStablePath(
  tempThumbnailUri: string,
  stablePhotoUri: string
): Promise<string> {
  if (!documentDirectory) {
    throw new Error('Document directory is not available');
  }

  const destination = resolveThumbnailDestinationUri(stablePhotoUri);

  try {
    await copyAsync({
      from: tempThumbnailUri,
      to: destination,
    });
  } catch (copyError: unknown) {
    const errorMessage = copyError instanceof Error ? copyError.message : String(copyError);
    throw new Error(`Failed to copy thumbnail to stable path: ${errorMessage}`);
  }

  const destinationInfo = await getInfoAsync(destination);
  if (!destinationInfo.exists) {
    throw new Error(`Thumbnail copy completed but file not found at ${destination}`);
  }

  return destination;
}
