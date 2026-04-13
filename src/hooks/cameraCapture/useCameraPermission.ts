import { useCallback, useMemo } from 'react';
import { Alert, Linking } from 'react-native';
import { PermissionResponse, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';

export type CameraPermissionUiState = 'checking' | 'needs_request' | 'denied' | 'granted';

export type CameraPermissionState = {
  permission: PermissionResponse | null;
  uiState: CameraPermissionUiState;
  requestPermissions: () => Promise<void>;
  openAppSettings: () => Promise<void>;
};

/**
 * カメラ権限管理のHook
 * Application層の権限ロジックをカプセル化
 */
export const useCameraPermission = (): CameraPermissionState => {
  const [permission, requestPermission] = useCameraPermissions();

  const requestMediaLibraryPermission = useCallback(async (): Promise<void> => {
    try {
      await MediaLibrary.getPermissionsAsync();
    } catch (mediaError) {
      console.warn('Media library permission check failed (expected on some Expo Go versions):', mediaError);
    }
  }, []);

  const handlePermissionError = useCallback((error: unknown): void => {
    console.error('Permission request error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    if (errorMessage.includes('camera')) {
      Alert.alert('カメラエラー', 'カメラの初期化に失敗しました。Expo Goを再起動するか、開発ビルドを使用してください。');
    } else if (errorMessage.includes('permission')) {
      Alert.alert('権限エラー', 'カメラ権限が拒否されました。アプリの設定から権限を許可してください。');
    } else {
      Alert.alert('エラー', `権限確認中にエラーが発生しました: ${errorMessage}`);
    }
  }, []);

  const requestPermissions = useCallback(async (): Promise<void> => {
    if (permission?.granted) {
      return;
    }

    try {
      console.log('Requesting camera permission...');
      const permissionResult = await requestPermission();

      if (permissionResult.granted) {
        await requestMediaLibraryPermission();
      }
    } catch (error) {
      handlePermissionError(error);
    }
  }, [handlePermissionError, permission, requestMediaLibraryPermission, requestPermission]);

  const openAppSettings = useCallback(async (): Promise<void> => {
    try {
      await Linking.openSettings();
    } catch (error) {
      console.error('Open settings error:', error);
      Alert.alert('設定を開けませんでした', 'アプリの設定画面からカメラ権限を許可してください。');
    }
  }, []);

  const uiState = useMemo<CameraPermissionUiState>(() => {
    if (permission === null) {
      return 'checking';
    }

    if (permission.granted) {
      return 'granted';
    }

    if (permission.status === 'denied' || permission.canAskAgain === false) {
      return 'denied';
    }

    return 'needs_request';
  }, [permission]);

  return {
    permission,
    uiState,
    requestPermissions,
    openAppSettings,
  };
};
