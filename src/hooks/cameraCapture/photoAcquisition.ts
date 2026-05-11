import { Platform } from 'react-native';
import type { RefObject } from 'react';
import type { CameraCapturedPicture, CameraView, PermissionResponse } from 'expo-camera';
import { CAMERA_CONSTANTS } from '../../constants/CameraConstants';
import { CameraCaptureMock } from './useCameraCaptureMock';
import type { ReviewablePhoto } from './captureReviewState';

type ExpoImagePickerModule = typeof import('expo-image-picker');

function loadImagePicker(): ExpoImagePickerModule {
  return require('expo-image-picker') as ExpoImagePickerModule;
}

export function isWebWithoutCameraPermission(cameraPermission: PermissionResponse | null) {
  return Platform.OS === 'web' && (!cameraPermission || !cameraPermission.granted);
}

export async function takePhotoForReview(
  cameraRef: RefObject<CameraView | null>,
  cameraPermission: PermissionResponse | null
): Promise<CameraCapturedPicture> {
  if (isWebWithoutCameraPermission(cameraPermission)) {
    return CameraCaptureMock.createMockImage();
  }

  const photo = await cameraRef.current?.takePictureAsync({
    quality: CAMERA_CONSTANTS.PHOTO_QUALITY,
    exif: true,
    skipProcessing: false,
  });

  if (!photo) {
    throw new Error('写真の撮影に失敗しました');
  }

  return photo;
}

export async function pickPhotoFromLibraryForReview(): Promise<ReviewablePhoto | null> {
  const ImagePicker = loadImagePicker();
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: false,
    exif: false,
    quality: 1,
  });

  if (result.canceled || result.assets.length === 0) {
    return null;
  }

  const picked = result.assets[0];
  return {
    uri: picked.uri,
    width: picked.width ?? CAMERA_CONSTANTS.SAVED_PHOTO_MAX_WIDTH,
    height: picked.height ?? CAMERA_CONSTANTS.SAVED_PHOTO_MAX_HEIGHT,
  };
}
