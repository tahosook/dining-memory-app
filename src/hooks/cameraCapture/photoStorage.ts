import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { copyAsync, documentDirectory, getInfoAsync } from 'expo-file-system/legacy';
import { buildMealPhotoFileName, type PhotoLocationSnapshot, writePhotoExifToJpeg } from './photoExif';

export const ANDROID_PHOTO_ALBUM_NAME = 'Dining Memory';
export const DEFAULT_PHOTO_SOFTWARE_NAME = process.env.EXPO_PUBLIC_APP_NAME ?? ANDROID_PHOTO_ALBUM_NAME;

type PersistResult = {
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

  while (true) {
    const candidate = `${documentDirectory}${buildMealPhotoFileName(capturedAt, collisionIndex)}`;
    const fileInfo = await getInfoAsync(candidate);

    if (!fileInfo.exists) {
      return candidate;
    }

    collisionIndex += 1;
  }
}

export async function persistPhotoToStablePath(photoUri: string, options: PersistPhotoOptions): Promise<PersistResult> {
  if (!documentDirectory) {
    throw new Error('Document directory is not available');
  }

  const destination = await resolveDestinationUri(options.capturedAt);
  await copyAsync({
    from: photoUri,
    to: destination,
  });

  try {
    await writePhotoExifToJpeg(destination, {
      capturedAt: options.capturedAt,
      location: options.location,
      softwareName: options.softwareName?.trim() || DEFAULT_PHOTO_SOFTWARE_NAME,
    });
  } catch (photoExifError: unknown) {
    console.warn('Photo EXIF update skipped, but local photo copy is preserved:', photoExifError);
  }

  if (Platform.OS === 'android') {
    try {
      const album = await MediaLibrary.getAlbumAsync(ANDROID_PHOTO_ALBUM_NAME);

      if (album) {
        await MediaLibrary.createAssetAsync(destination, album);
      } else {
        await MediaLibrary.createAlbumAsync(ANDROID_PHOTO_ALBUM_NAME, undefined, undefined, destination);
      }
    } catch (albumError: unknown) {
      console.warn('Android album save failed, but local photo copy is preserved:', albumError);
    }

    return {
      stablePhotoUri: destination,
      savedToMediaLibrary: true,
    };
  }

  return {
    stablePhotoUri: destination,
    savedToMediaLibrary: false,
  };
}
