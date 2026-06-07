import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { copyAsync, documentDirectory, getInfoAsync } from 'expo-file-system/legacy';
import { buildMealPhotoFileName, type PhotoLocationSnapshot, writePhotoExifToJpeg } from './photoExif';

export const ANDROID_PHOTO_ALBUM_NAME = 'Dining Memory';
export const DEFAULT_PHOTO_SOFTWARE_NAME = process.env.EXPO_PUBLIC_APP_NAME ?? ANDROID_PHOTO_ALBUM_NAME;

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

  while (true) {
    const candidate = `${documentDirectory}${buildMealPhotoFileName(capturedAt, collisionIndex)}`;
    const fileInfo = await getInfoAsync(candidate);

    if (!fileInfo.exists) {
      return candidate;
    }

    collisionIndex += 1;
  }
}

export async function persistPhotoToStablePath(
  photoUri: string,
  options: PersistPhotoOptions
): Promise<PersistPhotoResult> {
  if (!documentDirectory) {
    throw new Error('Document directory is not available');
  }

  const destination = await resolveDestinationUri(options.capturedAt);
  
  try {
    await copyAsync({
      from: photoUri,
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

  if (Platform.OS === 'android') {
    let savedToMediaLibrary = false;

    try {
      const asset = await MediaLibrary.Asset.create(destination);
      const existingAlbum = await MediaLibrary.Album.get(ANDROID_PHOTO_ALBUM_NAME);
      
      if (existingAlbum) {
        await existingAlbum.add(asset);
      } else {
        await MediaLibrary.Album.create(ANDROID_PHOTO_ALBUM_NAME, asset);
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
