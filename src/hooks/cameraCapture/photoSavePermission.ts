import { Platform } from 'react-native';
import * as MediaLibrary from 'expo-media-library';

const PHOTO_PERMISSION_SCOPE: MediaLibrary.GranularPermission[] = ['photo'];

export async function ensureAndroidPhotoSavePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    return true;
  }

  const currentPermission = await MediaLibrary.getPermissionsAsync(false, PHOTO_PERMISSION_SCOPE);
  if (currentPermission.granted) {
    return true;
  }

  const nextPermission = currentPermission.canAskAgain === false
    ? currentPermission
    : await MediaLibrary.requestPermissionsAsync(false, PHOTO_PERMISSION_SCOPE);

  return nextPermission.granted;
}
