import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import type { PermissionResponse } from 'expo-camera';
import { useCameraCapture } from '../src/hooks/cameraCapture/useCameraCapture';
import { MealService } from '../src/database/services/MealService';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({
    navigate: jest.fn(),
  }),
}));

jest.mock('../src/database/services/MealService', () => ({
  MealService: {
    createMeal: jest.fn(),
  },
}));

jest.mock('expo-media-library', () => ({
  createAssetAsync: jest.fn(),
}));

jest.mock('expo-file-system/legacy', () => ({
  copyAsync: jest.fn(),
  deleteAsync: jest.fn(),
  documentDirectory: 'file:///mock-documents/',
}));

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

  beforeEach(() => {
    jest.clearAllMocks();
    Platform.OS = 'ios';
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(jest.fn());
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(jest.fn());
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(jest.fn());
    (FileSystem.copyAsync as jest.Mock).mockResolvedValue(undefined);
    (FileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
    (MediaLibrary.createAssetAsync as jest.Mock).mockResolvedValue({ id: 'asset-1' });
    (MealService.createMeal as jest.Mock).mockResolvedValue({ id: 'meal-1' });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  test('does not save when meal name is empty', async () => {
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

    expect(Alert.alert).toHaveBeenCalledWith('入力が必要です', '料理名を入力してください。');
    expect(MealService.createMeal).not.toHaveBeenCalled();
  });

  test('does not create a meal when local persistence fails', async () => {
    (FileSystem.copyAsync as jest.Mock).mockRejectedValue(new Error('copy failed'));
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

  test('creates a meal and shows success only after local persistence succeeds', async () => {
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
          photo_path: expect.stringMatching(/^file:\/\/\/mock-documents\/meal-\d+\.jpg$/),
        })
      );
    });

    expect(FileSystem.copyAsync).toHaveBeenCalled();
    expect(result.current.successMessage).toContain('パスタ を記録しました');
  });
});
