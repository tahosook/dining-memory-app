import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { PermissionResponse, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import { CAMERA_CONSTANTS } from '../../constants/CameraConstants';

/**
 * カメラ権限管理のHook
 * Application層の権限ロジックをカプセル化
 */
export const useCameraPermission = (): PermissionResponse | null => {
  const [permission, requestPermission] = useCameraPermissions();
  const [hasRequested, setHasRequested] = useState(false);

  const requestPermissions = useCallback(async (): Promise<void> => {
    if (hasRequested || permission?.status === 'granted' || permission?.status === 'denied') {
      return;
    }

    try {
      console.log('Requesting camera permission...');
      const permissionResult = await requestPermission();

      if (!permissionResult.granted) {
        Alert.alert(
          'カメラ権限が必要です',
          '写真撮影するためにカメラへのアクセス権限を許可してください。',
          [
            { text: '設定を開く', style: 'default' },
            { text: 'キャンセル', style: 'cancel' }
          ]
        );
        return;
      }

      // Request media library permission
      await requestMediaLibraryPermission();

    } catch (error) {
      handlePermissionError(error);
    } finally {
      setHasRequested(true);
    }
  }, [permission, requestPermission, hasRequested]);

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

  useEffect(() => {
    if (!hasRequested && permission?.status !== 'granted' && permission?.status !== 'denied') {
      const timeoutId = setTimeout(() => {
        console.log('Permission request timed out, trying again...');
        requestPermissions();
      }, CAMERA_CONSTANTS.PERMISSION_TIMEOUT_MS);

      requestPermissions().finally(() => {
        clearTimeout(timeoutId);
        console.log('Permission request completed');
      });
    }
  }, [permission, requestPermission, hasRequested, requestPermissions]);

  return permission;
};
