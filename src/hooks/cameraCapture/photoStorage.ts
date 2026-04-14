import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';
import { copyAsync, documentDirectory } from 'expo-file-system/legacy';

export const ANDROID_PHOTO_ALBUM_NAME = 'Dining Memory';

type PersistResult = {
  stablePhotoUri: string;
  savedToMediaLibrary: boolean;
};

export async function persistPhotoToStablePath(photoUri: string): Promise<PersistResult> {
  if (!documentDirectory) {
    throw new Error('Document directory is not available');
  }

  const destination = `${documentDirectory}meal-${Date.now()}.jpg`;
  await copyAsync({
    from: photoUri,
    to: destination,
  });

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
