import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert, BackHandler, Linking, Platform, type HardwareBackPressEvent } from 'react-native';
import type { PermissionResponse } from 'expo-camera';
import { useCameraCapture } from '../src/hooks/cameraCapture/useCameraCapture';
import { MealService } from '../src/database/services/MealService';
import * as MediaLibrary from 'expo-media-library';
import * as Location from 'expo-location';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import * as ImagePicker from 'expo-image-picker';
import { persistPhotoToStablePath } from '../src/media/photoStorage';

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const ReactModule = require('react');

  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      ReactModule.useEffect(callback, [callback]);
    },
    useNavigation: () => ({
      navigate: mockNavigate,
    }),
  };
});

jest.mock('../src/database/services/MealService', () => ({
  MealService: {
    createMeal: jest.fn(),
    getRecentNearbyHomemadeDefault: jest.fn(),
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

jest.mock('../src/media/photoStorage', () => ({
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

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

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
    (MealService.getRecentNearbyHomemadeDefault as jest.Mock).mockResolvedValue(null);
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

  test('ignores overlapping takePicture calls before React state updates', async () => {
    const { result } = renderHook(() => useCameraCapture(cameraPermission));
    const photoCapture = createDeferred<{ uri: string; width: number; height: number }>();
    const takePictureAsync = jest.fn().mockReturnValue(photoCapture.promise);

    result.current.cameraRef.current = {
      takePictureAsync,
    } as never;

    let firstCapture!: Promise<void>;
    let secondCapture!: Promise<void>;
    act(() => {
      firstCapture = result.current.takePicture();
      secondCapture = result.current.takePicture();
    });

    expect(takePictureAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      photoCapture.resolve({
        uri: 'file:///tmp/photo.jpg',
        width: 100,
        height: 100,
      });
      await Promise.all([firstCapture, secondCapture]);
    });

    expect(result.current.captureReview).toEqual(expect.objectContaining({
      photoUri: 'file:///tmp/photo.jpg',
    }));
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
    expect(result.current.captureReview?.mealName).toBe('親子丼');
    expect(result.current.savingCapture).toBe(false);
    expect(Alert.alert).toHaveBeenCalledWith('保存に失敗しました', '記録の保存に失敗しました。再度お試しください。');
  });

  test('ignores overlapping save calls for the same capture review', async () => {
    const { result } = renderHook(() => useCameraCapture(cameraPermission));
    const localPersistence = createDeferred<{
      stablePhotoUri: string;
      savedToMediaLibrary: boolean;
    }>();
    (persistPhotoToStablePath as jest.Mock).mockReturnValue(localPersistence.promise);

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

    let firstSave!: Promise<void>;
    let secondSave!: Promise<void>;
    act(() => {
      firstSave = result.current.onCaptureReviewSave();
      secondSave = result.current.onCaptureReviewSave();
    });

    await waitFor(() => {
      expect(persistPhotoToStablePath).toHaveBeenCalledTimes(1);
    });
    expect(result.current.savingCapture).toBe(true);

    await act(async () => {
      localPersistence.resolve({
        stablePhotoUri: 'file:///mock-documents/meal-123.jpg',
        savedToMediaLibrary: false,
      });
      await Promise.all([firstSave, secondSave]);
    });

    expect(persistPhotoToStablePath).toHaveBeenCalledTimes(1);
    expect(MealService.createMeal).toHaveBeenCalledTimes(1);
    expect(MediaLibrary.createAssetAsync).toHaveBeenCalledTimes(1);
    expect(result.current.captureReview).toBeNull();
    expect(result.current.savingCapture).toBe(false);
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

  test('applies a nearby homemade default when a recent nearby meal exists', async () => {
    (MealService.getRecentNearbyHomemadeDefault as jest.Mock).mockResolvedValueOnce(true);
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

    await waitFor(() => {
      expect(MealService.getRecentNearbyHomemadeDefault).toHaveBeenCalledWith({
        latitude: 35.6895,
        longitude: 139.6917,
      });
    });

    await waitFor(() => {
      expect(result.current.captureReview?.isHomemade).toBe(true);
    });
  });

  test('keeps the manual homemade choice when the async default arrives later', async () => {
    const nearbyDefault = createDeferred<boolean | null>();
    (MealService.getRecentNearbyHomemadeDefault as jest.Mock).mockReturnValueOnce(nearbyDefault.promise);
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
      result.current.onCaptureReviewChange('isHomemade', true);
    });

    await act(async () => {
      nearbyDefault.resolve(false);
      await Promise.resolve();
    });

    expect(result.current.captureReview?.isHomemade).toBe(true);
  });

  test('ignores a stale nearby homemade lookup after a new review starts', async () => {
    const firstLookup = createDeferred<boolean | null>();
    (MealService.getRecentNearbyHomemadeDefault as jest.Mock)
      .mockReturnValueOnce(firstLookup.promise)
      .mockResolvedValueOnce(null);
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
      await result.current.takePicture();
    });

    await act(async () => {
      firstLookup.resolve(true);
      await Promise.resolve();
    });

    expect(result.current.captureReview?.isHomemade).toBe(false);
  });

  test('keeps the homemade default off when location lookup is denied', async () => {
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });
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

    expect(MealService.getRecentNearbyHomemadeDefault).not.toHaveBeenCalled();
    expect(result.current.captureReview?.isHomemade).toBe(false);
  });

  test('opens photo picker and starts review when a photo is selected', async () => {
    const { result } = renderHook(() => useCameraCapture(cameraPermission));
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{
        uri: 'file:///tmp/library.jpg',
        width: 800,
        height: 600,
        exif: { GPSLatitude: 35.6895 },
        base64: 'sensitive-base64',
      }],
    });

    await act(async () => {
      await result.current.addPhotoFromLibrary();
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith({
      mediaTypes: ['images'],
      allowsMultipleSelection: false,
      exif: false,
      quality: 1,
    });
    expect(result.current.captureReview).toEqual(expect.objectContaining({
      source: 'library',
      photoUri: 'file:///tmp/library.jpg',
      width: 800,
      height: 600,
    }));
    expect(result.current.captureReview).not.toHaveProperty('exif');
    expect(result.current.captureReview).not.toHaveProperty('base64');
    expect(result.current.pickingPhotoFromLibrary).toBe(false);
  });

  test('ignores overlapping photo picker calls before React state updates', async () => {
    const { result } = renderHook(() => useCameraCapture(cameraPermission));
    const photoPicker = createDeferred<{
      canceled: false;
      assets: Array<{ uri: string; width: number; height: number }>;
    }>();
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockReturnValue(photoPicker.promise);

    let firstPick!: Promise<void>;
    let secondPick!: Promise<void>;
    act(() => {
      firstPick = result.current.addPhotoFromLibrary();
      secondPick = result.current.addPhotoFromLibrary();
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      photoPicker.resolve({
        canceled: false,
        assets: [{
          uri: 'file:///tmp/library.jpg',
          width: 800,
          height: 600,
        }],
      });
      await Promise.all([firstPick, secondPick]);
    });

    expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledTimes(1);
    expect(result.current.captureReview).toEqual(expect.objectContaining({
      source: 'library',
      photoUri: 'file:///tmp/library.jpg',
    }));
    expect(result.current.pickingPhotoFromLibrary).toBe(false);
  });

  test('keeps review state empty when the photo picker is cancelled', async () => {
    const { result } = renderHook(() => useCameraCapture(cameraPermission));
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: true,
      assets: [],
    });

    await act(async () => {
      await result.current.addPhotoFromLibrary();
    });

    expect(result.current.captureReview).toBeNull();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  test('keeps review state empty and shows an alert when the photo picker fails', async () => {
    const { result } = renderHook(() => useCameraCapture(cameraPermission));
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockRejectedValue(new Error('picker failed'));

    await act(async () => {
      await result.current.addPhotoFromLibrary();
    });

    expect(result.current.captureReview).toBeNull();
    expect(Alert.alert).toHaveBeenCalledWith(
      'エラー',
      '写真の選択に失敗しました。再度お試しください。'
    );
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
    expect(result.current.savingCapture).toBe(false);

    const alertButtons = (Alert.alert as jest.Mock).mock.calls.at(-1)?.[2] as { text: string; onPress?: () => void }[];
    const settingsButton = alertButtons.find((button) => button.text === '設定を開く');
    await act(async () => {
      settingsButton?.onPress?.();
    });

    expect(Linking.openSettings).toHaveBeenCalled();
  });

  test('keeps the review locked when cancel, close, or Android back happen during save', async () => {
    const backHandlerRef: { current: Parameters<typeof BackHandler.addEventListener>[1] | null } = {
      current: null,
    };
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_eventName, handler) => {
      backHandlerRef.current = handler;
      return {
        remove: jest.fn(),
      } as ReturnType<typeof BackHandler.addEventListener>;
    });
    const localPersistence = createDeferred<{
      stablePhotoUri: string;
      savedToMediaLibrary: boolean;
    }>();
    (persistPhotoToStablePath as jest.Mock).mockReturnValue(localPersistence.promise);
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

    let pendingSave!: Promise<void>;
    act(() => {
      pendingSave = result.current.onCaptureReviewSave();
    });

    await waitFor(() => {
      expect(result.current.savingCapture).toBe(true);
    });

    act(() => {
      result.current.onCaptureReviewCancel();
      result.current.closeCamera();
    });
    const handledBack = backHandlerRef.current?.({} as HardwareBackPressEvent);

    expect(handledBack).toBe(true);
    expect(result.current.captureReview).toEqual(expect.objectContaining({
      photoUri: 'file:///tmp/photo.jpg',
    }));
    expect(mockNavigate).not.toHaveBeenCalled();

    await act(async () => {
      localPersistence.resolve({
        stablePhotoUri: 'file:///mock-documents/meal-123.jpg',
        savedToMediaLibrary: false,
      });
      await pendingSave;
    });

    expect(result.current.captureReview).toBeNull();
    expect(mockNavigate).toHaveBeenCalledWith('Records');
  });

  test('Android back cancels an idle capture review', async () => {
    const backHandlerRef: { current: Parameters<typeof BackHandler.addEventListener>[1] | null } = {
      current: null,
    };
    jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_eventName, handler) => {
      backHandlerRef.current = handler;
      return {
        remove: jest.fn(),
      } as ReturnType<typeof BackHandler.addEventListener>;
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

    let handledBack: boolean | null | undefined;
    act(() => {
      handledBack = backHandlerRef.current?.({} as HardwareBackPressEvent);
    });

    expect(handledBack).toBe(true);
    expect(result.current.captureReview).toBeNull();
  });
});
