import { Platform } from 'react-native';
import type { RefObject } from 'react';
import type { CameraView, PermissionResponse } from 'expo-camera';
import {
  isWebWithoutCameraPermission,
  takePhotoForReview,
  pickPhotoFromLibraryForReview,
} from '../src/hooks/cameraCapture/photoAcquisition';
import { CameraCaptureMock } from '../src/hooks/cameraCapture/useCameraCaptureMock';
import { CAMERA_CONSTANTS } from '../src/constants/CameraConstants';

const mockLaunchImageLibraryAsync = jest.fn();
jest.mock('expo-image-picker', () => {
  return {
    launchImageLibraryAsync: (...args: unknown[]) => mockLaunchImageLibraryAsync(...args),
  };
});

jest.mock('../src/hooks/cameraCapture/useCameraCaptureMock', () => ({
  CameraCaptureMock: {
    createMockImage: jest.fn(),
  },
}));

describe('photoAcquisition', () => {
  const originalOS = Platform.OS;

  const deniedPermission: PermissionResponse = {
    granted: false,
    status: 'denied' as PermissionResponse['status'],
    canAskAgain: false,
    expires: 'never',
  };

  const grantedPermission: PermissionResponse = {
    granted: true,
    status: 'granted' as PermissionResponse['status'],
    canAskAgain: true,
    expires: 'never',
  };

  afterEach(() => {
    Platform.OS = originalOS;
    jest.clearAllMocks();
  });

  describe('isWebWithoutCameraPermission', () => {
    test('returns true on web when permission is null', () => {
      Platform.OS = 'web';
      expect(isWebWithoutCameraPermission(null)).toBe(true);
    });

    test('returns true on web when permission is not granted', () => {
      Platform.OS = 'web';
      expect(isWebWithoutCameraPermission(deniedPermission)).toBe(true);
    });

    test('returns false on web when permission is granted', () => {
      Platform.OS = 'web';
      expect(isWebWithoutCameraPermission(grantedPermission)).toBe(false);
    });

    test('returns false on non-web platforms', () => {
      Platform.OS = 'ios';
      expect(isWebWithoutCameraPermission(null)).toBe(false);

      Platform.OS = 'android';
      expect(isWebWithoutCameraPermission(deniedPermission)).toBe(false);
    });
  });

  describe('takePhotoForReview', () => {
    test('uses CameraCaptureMock on web without permission', async () => {
      Platform.OS = 'web';
      const mockPhoto = { uri: 'mock-uri', width: 100, height: 100 };
      (CameraCaptureMock.createMockImage as jest.Mock).mockResolvedValue(mockPhoto);

      const result = await takePhotoForReview({ current: null }, null);

      expect(CameraCaptureMock.createMockImage).toHaveBeenCalled();
      expect(result).toEqual(mockPhoto);
    });

    test('calls takePictureAsync on non-web platforms', async () => {
      Platform.OS = 'ios';
      const mockPhoto = { uri: 'taken-photo', width: 200, height: 200 };
      const takePictureAsync = jest.fn().mockResolvedValue(mockPhoto);

      const cameraRef = {
        current: { takePictureAsync } as unknown as CameraView,
      } as RefObject<CameraView | null>;

      const result = await takePhotoForReview(cameraRef, null);

      expect(takePictureAsync).toHaveBeenCalledWith({
        quality: CAMERA_CONSTANTS.PHOTO_QUALITY,
        exif: true,
        skipProcessing: false,
      });
      expect(result).toEqual(mockPhoto);
    });

    test('throws error if takePictureAsync returns falsy', async () => {
      Platform.OS = 'android';
      const takePictureAsync = jest.fn().mockResolvedValue(null);

      const cameraRef = {
        current: { takePictureAsync } as unknown as CameraView,
      } as RefObject<CameraView | null>;

      await expect(takePhotoForReview(cameraRef, grantedPermission)).rejects.toThrow(
        '写真の撮影に失敗しました'
      );
    });

    test('throws error if cameraRef.current is null on non-web platforms', async () => {
      Platform.OS = 'ios';
      const cameraRef = { current: null };

      await expect(takePhotoForReview(cameraRef, null)).rejects.toThrow(
        '写真の撮影に失敗しました'
      );
    });
  });

  describe('pickPhotoFromLibraryForReview', () => {
    test('returns null if canceled', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: true,
        assets: null,
      });

      const result = await pickPhotoFromLibraryForReview();

      expect(mockLaunchImageLibraryAsync).toHaveBeenCalledWith({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        exif: false,
        quality: 1,
      });
      expect(result).toBeNull();
    });

    test('returns null if assets is empty', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [],
      });

      const result = await pickPhotoFromLibraryForReview();
      expect(result).toBeNull();
    });

    test('returns ReviewablePhoto when photo is picked', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'picked-photo-uri',
            width: 800,
            height: 600,
          },
        ],
      });

      const result = await pickPhotoFromLibraryForReview();

      expect(result).toEqual({
        uri: 'picked-photo-uri',
        width: 800,
        height: 600,
      });
    });

    test('returns ReviewablePhoto with default dimensions if width/height are missing', async () => {
      mockLaunchImageLibraryAsync.mockResolvedValue({
        canceled: false,
        assets: [
          {
            uri: 'picked-photo-uri-no-dims',
          },
        ],
      });

      const result = await pickPhotoFromLibraryForReview();

      expect(result).toEqual({
        uri: 'picked-photo-uri-no-dims',
        width: CAMERA_CONSTANTS.SAVED_PHOTO_MAX_WIDTH,
        height: CAMERA_CONSTANTS.SAVED_PHOTO_MAX_HEIGHT,
      });
    });
  });
});
