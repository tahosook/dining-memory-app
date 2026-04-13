import { renderHook, act } from '@testing-library/react-native';
import { Alert, Linking } from 'react-native';
import { useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { useCameraPermission } from '../src/hooks/cameraCapture/useCameraPermission';

jest.mock('expo-camera', () => ({
  useCameraPermissions: jest.fn(),
}));

jest.mock('expo-media-library', () => ({
  getPermissionsAsync: jest.fn(),
}));

const undeterminedPermission = {
  granted: false,
  status: 'undetermined',
  canAskAgain: true,
  expires: 'never',
};

const grantedPermission = {
  granted: true,
  status: 'granted',
  canAskAgain: true,
  expires: 'never',
};

const deniedPermission = {
  granted: false,
  status: 'denied',
  canAskAgain: false,
  expires: 'never',
};

describe('useCameraPermission', () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(jest.fn());
    jest.spyOn(Linking, 'openSettings').mockResolvedValue();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(jest.fn());
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(jest.fn());
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  test('does not request permission on mount', () => {
    const requestPermission = jest.fn();
    (useCameraPermissions as jest.Mock).mockReturnValue([undeterminedPermission, requestPermission]);

    const { result } = renderHook(() => useCameraPermission());

    expect(result.current.uiState).toBe('needs_request');
    expect(requestPermission).not.toHaveBeenCalled();
  });

  test('requests permission only when requestPermissions is called', async () => {
    const requestPermission = jest.fn().mockResolvedValue(grantedPermission);
    (useCameraPermissions as jest.Mock).mockReturnValue([undeterminedPermission, requestPermission]);
    (MediaLibrary.getPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });

    const { result } = renderHook(() => useCameraPermission());

    await act(async () => {
      await result.current.requestPermissions();
    });

    expect(requestPermission).toHaveBeenCalledTimes(1);
    expect(MediaLibrary.getPermissionsAsync).toHaveBeenCalledTimes(1);
  });

  test('returns denied uiState when permission is denied', () => {
    const requestPermission = jest.fn();
    (useCameraPermissions as jest.Mock).mockReturnValue([deniedPermission, requestPermission]);

    const { result } = renderHook(() => useCameraPermission());

    expect(result.current.uiState).toBe('denied');
  });

  test('shows fallback alert when opening settings fails', async () => {
    const requestPermission = jest.fn();
    (useCameraPermissions as jest.Mock).mockReturnValue([deniedPermission, requestPermission]);
    jest.spyOn(Linking, 'openSettings').mockRejectedValue(new Error('failed'));

    const { result } = renderHook(() => useCameraPermission());

    await act(async () => {
      await result.current.openAppSettings();
    });

    expect(Alert.alert).toHaveBeenCalledWith('設定を開けませんでした', 'アプリの設定画面からカメラ権限を許可してください。');
  });
});
