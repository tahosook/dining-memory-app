import * as MediaLibrary from 'expo-media-library';

export async function savePhotoToMediaLibrary(photoUri: string): Promise<boolean> {
  try {
    await MediaLibrary.createAssetAsync(photoUri);
    return true;
  } catch {
    console.warn('Media library save failed.');
    return false;
  }
}
