import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert, Linking, Platform } from 'react-native';
import type { PermissionResponse } from 'expo-camera';
import { useCameraCapture } from '../src/hooks/cameraCapture/useCameraCapture';
import { MealService } from '../src/database/services/MealService';
import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import * as ImagePicker from 'expo-image-picker';
import { persistPhotoToStablePath } from '../src/hooks/cameraCapture/photoStorage';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: mockNavigate,
  }),
}));

jest.mock('../src/database/services/MealService', () => ({
  MealService: {
    createMeal: jest.fn(),
  },
}));

jest.mock('expo-media-library', () => ({
  createAssetAsync: jest.fn(),
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: {
    Balanced: 'balanced',
  },
}));

jest.mock('../src/hooks/cameraCapture/photoStorage', () => ({
  persistPhotoToStablePath: jest.fn(),
}));

jest.mock('@bam.tech/react-native-image-resizer', () => ({
  __esModule: true,
  default: {
    createResizedImage: jest.fn(),
  },
}));
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}), { virtual: true });

describe('useCameraCapture', () => {
  const cameraPermission = {
    granted: true,
    status: 'granted',
    canAskAgain: true,
    expires: 'never',
  } as unknown as PermissionResponse;
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;
  let openSettingsSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNavigate.mockClear();
    Platform.OS = 'ios';
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    openSettingsSpy = jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(jest.fn());
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(jest.fn());
    (MediaLibrary.createAssetAsync as jest.Mock).mockResolvedValue({ id: 'asset-1' });
    (MediaLibrary.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: 'granted',
      accessPrivileges: 'all',
    });
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: 'granted',
      accessPrivileges: 'all',
    });
    (MealService.createMeal as jest.Mock).mockResolvedValue({ id: 'meal-1' });
    (persistPhotoToStablePath as jest.Mock).mockResolvedValue({
      stablePhotoUri: 'file:///mock-documents/meal-123.jpg',
      savedToMediaLibrary: false,
    });
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (Location.getLastKnownPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: 35.6895, longitude: 139.6917 },
    });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: { latitude: 35.6895, longitude: 139.6917 },
    });
    (ImageResizer.createResizedImage as jest.Mock).mockResolvedValue({
      path: '/tmp/resized-photo.jpg',
      uri: 'file:///tmp/resized-photo.jpg',
      size: 123456,
      name: 'resized-photo.jpg',
      width: 1600,
      height: 1200,
    });
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: [] });
  });

  afterEach(() => {
    openSettingsSpy.mockRestore();
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  test('creates a meal with an auto-generated name when meal name is empty', async () => {
    const { result } = renderHook(() => useCameraCapture(cameraPermission));

    result.current.cameraRef.current = {
      takePictureAsync: jest.fn().mockResolvedValue({
        uri: 'file:///tmp/photo.jpg',
        width: 100,
        height: 100,
      }),
    } as never;

    await act(async () => {
      await result.current.takePicture();
    });

    await act(async () => {
      await result.current.onCaptureReviewSave();
    });

    expect(Alert.alert).not.toHaveBeenCalled();
    expect(MealService.createMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        meal_name: '',
      })
    );
    expect(mockNavigate).toHaveBeenCalledWith('Records');
  });

  test('does not create a meal when local persistence fails', async () => {
    (persistPhotoToStablePath as jest.Mock).mockRejectedValue(new Error('copy failed'));
    const { result } = renderHook(() => useCameraCapture(cameraPermission));

    result.current.cameraRef.current = {
      takePictureAsync: jest.fn().mockResolvedValue({
        uri: 'file:///tmp/photo.jpg',
        width: 100,
        height: 100,
      }),
    } as never;

    await act(async () => {
      await result.current.takePicture();
    });

    act(() => {
      result.current.onCaptureReviewChange('mealName', '親子丼');
    });

    await act(async () => {
      await result.current.onCaptureReviewSave();
    });

    expect(MealService.createMeal).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith('保存に失敗しました', '記録の保存に失敗しました。再度お試しください。');
  });

  test('creates a meal and navigates to records only after local persistence succeeds', async () => {
    const { result } = renderHook(() => useCameraCapture(cameraPermission));
    const takePictureAsync = jest.fn().mockResolvedValue({
      uri: 'file:///tmp/photo.jpg',
      width: 100,
      height: 100,
    });

    result.current.cameraRef.current = {
      takePictureAsync,
    } as never;

    await act(async () => {
      await result.current.takePicture();
    });

    const capturedAtMs = result.current.captureReview?.capturedAtMs;

    act(() => {
      result.current.onCaptureReviewChange('mealName', 'パスタ');
      result.current.onCaptureReviewChange('cuisineType', '洋食');
    });

    await act(async () => {
      await result.current.onCaptureReviewSave();
    });

    await waitFor(() => {
      expect(MealService.createMeal).toHaveBeenCalledWith(
        expect.objectContaining({
          meal_name: 'パスタ',
          cuisine_type: '洋食',
          ai_confidence: undefined,
          ai_source: undefined,
          latitude: 35.6895,
          longitude: 139.6917,
          photo_path: 'file:///mock-documents/meal-123.jpg',
        })
      );
    });

    expect(takePictureAsync).toHaveBeenCalledWith({
      quality: 0.8,
      exif: true,
      skipProcessing: false,
    });
    expect(capturedAtMs).toEqual(expect.any(Number));
    expect(persistPhotoToStablePath).toHaveBeenCalledWith(
      'file:///tmp/resized-photo.jpg',
      expect.objectContaining({
        capturedAt: new Date(capturedAtMs!),
        location: {
          latitude: 35.6895,
          longitude: 139.6917,
        },
        softwareName: 'Dining Memory',
      })
    );
    expect(ImageResizer.createResizedImage).toHaveBeenCalledWith(
      'file:///tmp/photo.jpg',
      1600,
      1200,
      'JPEG',
      75,
      0,
      undefined,
      true,
      {
        mode: 'contain',
        onlyScaleDown: true,
      }
    );
    expect(result.current.captureReview).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('Records');
  });

  test('opens photo picker and starts review when a photo is selected', async () => {
    const { result } = renderHook(() => useCameraCapture(cameraPermission));
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/library.jpg', width: 800, height: 600 }],
    });

    await act(async () => {
      await result.current.addPhotoFromLibrary();
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalled();
    expect(result.current.captureReview?.photoUri).toBe('file:///tmp/library.jpg');
    expect(result.current.captureReview?.source).toBe('library');
  });

  test('passes AI metadata to meal creation only when a suggestion was adopted', async () => {
    const { result } = renderHook(() => useCameraCapture(cameraPermission));

    result.current.cameraRef.current = {
      takePictureAsync: jest.fn().mockResolvedValue({
        uri: 'file:///tmp/photo.jpg',
        width: 100,
        height: 100,
      }),
    } as never;

    await act(async () => {
      await result.current.takePicture();
    });

    act(() => {
      result.current.onCaptureReviewChange('mealName', '海鮮丼');
    });

    await act(async () => {
      await result.current.onCaptureReviewSave({
        aiMetadata: {
          aiSource: 'mock-local',
          aiConfidence: 0.93,
          appliedFields: ['mealName'],
        },
      });
    });

    expect(MealService.createMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        meal_name: '海鮮丼',
        ai_source: 'mock-local',
        ai_confidence: 0.93,
      })
    );
  });

  test('passes only thin AI metadata for MediaPipe static-image suggestions', async () => {
    const { result } = renderHook(() => useCameraCapture(cameraPermission));

    result.current.cameraRef.current = {
      takePictureAsync: jest.fn().mockResolvedValue({
        uri: 'file:///tmp/photo.jpg',
        width: 100,
        height: 100,
      }),
    } as never;

    await act(async () => {
      await result.current.takePicture();
    });

    act(() => {
      result.current.onCaptureReviewChange('mealName', '寿司');
    });

    await act(async () => {
      await result.current.onCaptureReviewSave({
        aiMetadata: {
          aiSource: 'mediapipe-static-image',
          aiConfidence: 0.87,
          appliedFields: ['mealName'],
        },
      });
    });

    expect(MealService.createMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        meal_name: '寿司',
        ai_source: 'mediapipe-static-image',
        ai_confidence: 0.87,
      })
    );
  });

  test('requests Android photo save permission before saving', async () => {
    Platform.OS = 'android';
    (MediaLibrary.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: 'undetermined',
      accessPrivileges: 'none',
    });
    (MediaLibrary.requestPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: 'granted',
      accessPrivileges: 'all',
    });
    const { result } = renderHook(() => useCameraCapture(cameraPermission));

    result.current.cameraRef.current = {
      takePictureAsync: jest.fn().mockResolvedValue({
        uri: 'file:///tmp/photo.jpg',
        width: 100,
        height: 100,
      }),
    } as never;

    await act(async () => {
      await result.current.takePicture();
    });

    act(() => {
      result.current.onCaptureReviewChange('mealName', 'チャーハン');
    });

    await act(async () => {
      await result.current.onCaptureReviewSave();
    });

    expect(MediaLibrary.getPermissionsAsync).toHaveBeenCalledWith(false, ['photo']);
    expect(MediaLibrary.requestPermissionsAsync).toHaveBeenCalledWith(false, ['photo']);
    expect(persistPhotoToStablePath).toHaveBeenCalled();
    expect(MealService.createMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        meal_name: 'チャーハン',
      })
    );
  });

  test('continues saving when location permission is denied', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
    const { result } = renderHook(() => useCameraCapture(cameraPermission));
    const takePictureAsync = jest.fn().mockResolvedValue({
      uri: 'file:///tmp/photo.jpg',
      width: 100,
      height: 100,
    });

    result.current.cameraRef.current = {
      takePictureAsync,
    } as never;

    await act(async () => {
      await result.current.takePicture();
    });

    const capturedAtMs = result.current.captureReview?.capturedAtMs;

    act(() => {
      result.current.onCaptureReviewChange('mealName', '海鮮丼');
    });

    await act(async () => {
      await result.current.onCaptureReviewSave();
    });

    expect(MealService.createMeal).toHaveBeenCalledWith(
      expect.objectContaining({
        meal_name: '海鮮丼',
        latitude: undefined,
        longitude: undefined,
      })
    );
    expect(persistPhotoToStablePath).toHaveBeenCalledWith(
      'file:///tmp/resized-photo.jpg',
      expect.objectContaining({
        capturedAt: new Date(capturedAtMs!),
        location: {},
        softwareName: 'Dining Memory',
      })
    );
  });

  test('shows settings guidance and keeps review open when Android photo permission is denied', async () => {
    Platform.OS = 'android';
    (MediaLibrary.getPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      canAskAgain: false,
      status: 'denied',
      accessPrivileges: 'none',
    });
    const { result } = renderHook(() => useCameraCapture(cameraPermission));

    result.current.cameraRef.current = {
      takePictureAsync: jest.fn().mockResolvedValue({
        uri: 'file:///tmp/photo.jpg',
        width: 100,
        height: 100,
      }),
    } as never;

    await act(async () => {
      await result.current.takePicture();
    });

    act(() => {
      result.current.onCaptureReviewChange('mealName', '海老天丼');
    });

    await act(async () => {
      await result.current.onCaptureReviewSave();
    });

    expect(MealService.createMeal).not.toHaveBeenCalled();
    expect(persistPhotoToStablePath).not.toHaveBeenCalled();
    expect(result.current.captureReview?.mealName).toBe('海老天丼');
    expect(Alert.alert).toHaveBeenCalledWith(
      '写真の保存権限が必要です',
      'Dining Memory アルバムへ写真を保存するには、アプリ設定で写真の保存権限を許可してください。',
      expect.any(Array)
    );

    const alertButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    const settingsButton = alertButtons.find((button) => button.text === '設定を開く');
    await act(async () => {
      settingsButton?.onPress?.();
    });

    expect(Linking.openSettings).toHaveBeenCalled();
  });
});
