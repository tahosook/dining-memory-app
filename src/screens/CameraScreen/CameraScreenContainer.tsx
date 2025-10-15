import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigation } from '@react-navigation/native';
import { Alert } from 'react-native';
import { CameraView, useCameraPermissions, CameraCapturedPicture } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { CAMERA_CONSTANTS } from '../../constants/CameraConstants';
import CameraScreenPresentational from './CameraScreenPresentational';

// Type definitions using Pick<> for minimal prop exposure
type CameraLogicState = {
  takingPhoto: boolean;
  facing: 'front' | 'back';
  cameraPermission: ReturnType<typeof useCameraPermissions>[0];
};

type PhotoOperations = {
  onTakePicture: () => Promise<void>;
  onFlipCamera: () => void;
};

type TypedNavigationProps = {
  onClose: () => void;
};

export type CameraScreenPresentationalProps = Pick<TypedNavigationProps, 'onClose'> &
  Pick<CameraLogicState, 'takingPhoto' | 'facing' | 'cameraPermission'> &
  Pick<PhotoOperations, 'onTakePicture' | 'onFlipCamera'>;

// Custom hooks
const useCameraPermission = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [hasRequested, setHasRequested] = useState(false);

  useEffect(() => {
    const requestPermissions = async () => {
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
    };

    const requestMediaLibraryPermission = async () => {
      try {
        await MediaLibrary.getPermissionsAsync();
      } catch (mediaError) {
        console.warn('Media library permission check failed (expected on some Expo Go versions):', mediaError);
      }
    };

    const handlePermissionError = (error: unknown) => {
      console.error('Permission request error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      if (errorMessage.includes('camera')) {
        Alert.alert('カメラエラー', 'カメラの初期化に失敗しました。Expo Goを再起動するか、開発ビルドを使用してください。');
      } else if (errorMessage.includes('permission')) {
        Alert.alert('権限エラー', 'カメラ権限が拒否されました。アプリの設定から権限を許可してください。');
      } else {
        Alert.alert('エラー', `権限確認中にエラーが発生しました: ${errorMessage}`);
      }
    };

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
  }, [permission, requestPermission, hasRequested]);

  return permission;
};

const CameraScreenContainer: React.FC = () => {
  const navigation = useNavigation();
  const cameraPermission = useCameraPermission();
  const cameraRef = useRef<CameraView>(null);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');

  // Cleanup on unmount
  useEffect(() => {
    const cameraCurrent = cameraRef.current;
    return () => {
      if (cameraCurrent) {
        console.log('Pausing camera on unmount');
      }
    };
  }, []);

  // Photo utilities
  const savePhotoToMediaLibrary = useCallback(async (photoUri: string) => {
    try {
      console.log('Saving photo to MediaLibrary...');
      await MediaLibrary.createAssetAsync(photoUri);
      console.log('✅ Successfully saved photo to user\'s photo gallery!');
      return true;
    } catch (mediaError: any) {
      console.warn('Media library save failed:', mediaError.message);
      return false;
    }
  }, []);

  const cleanupTempFile = useCallback(async (photoUri: string) => {
    try {
      await FileSystem.deleteAsync(photoUri);
      console.log('Temp file cleaned up');
    } catch (cleanupError: any) {
      console.warn('Cleanup failed:', cleanupError.message);
    }
  }, []);

  const navigateToRecords = useCallback(() => {
    // @ts-expect-error Navigation type inference issue
    navigation.navigate('Records');
  }, [navigation]);

  const showPhotoSuccessAlert = useCallback((photo: { width: number; height: number; uri: string }) => {
    Alert.alert(
      '写真撮影完了',
      `✅ 写真を写真ライブラリに保存しました！

📸 写真詳細:
• ${photo.width}x${photo.height}
• 保存時刻: ${new Date().toLocaleString()}`,
      [
        { text: 'OK', style: 'default' },
        {
          text: '記録タブで確認',
          style: 'default',
          onPress: navigateToRecords
        }
      ]
    );
  }, [navigateToRecords]);

  // UI Alert functions
  const showCloseConfirmDialog = useCallback(() => {
    Alert.alert('確認', '撮影を終了して記録タブに移動しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '撮影を終了しました',      onPress: navigateToRecords }
    ]);
  }, [navigateToRecords]);

  // Take photo
  const takePicture = useCallback(async () => {
    if (!cameraRef.current || takingPhoto) return;

    try {
      setTakingPhoto(true);

      const photo = await cameraRef.current.takePictureAsync({
        quality: CAMERA_CONSTANTS.PHOTO_QUALITY,
        skipProcessing: false,
      });

      if (!photo) throw new Error('写真の撮影に失敗しました');

      console.log('Photo captured successfully:', photo.uri);
      console.log('Photo details:', { width: photo.width, height: photo.height });

      // Save to media library - primary functionality for Expo Go
      const saveSuccess = await savePhotoToMediaLibrary(photo.uri);
      if (!saveSuccess) {
        await cleanupTempFile(photo.uri);
        throw new Error('写真の保存に失敗しました');
      }

      showPhotoSuccessAlert(photo);

    } catch (error) {
      console.error('写真撮影エラー:', error);
      Alert.alert('エラー', '写真の撮影に失敗しました。再度お試しください。');
    } finally {
      setTakingPhoto(false);
    }
  }, [cameraRef, takingPhoto, savePhotoToMediaLibrary, cleanupTempFile, showPhotoSuccessAlert]);

  // Toggle camera facing
  const toggleCameraFacing = useCallback(() => {
    setFacing(current => current === 'back' ? 'front' : 'back');
  }, []);

  return (
    <CameraScreenPresentational
      takingPhoto={takingPhoto}
      facing={facing}
      cameraPermission={cameraPermission}
      onClose={showCloseConfirmDialog}
      onTakePicture={takePicture}
      onFlipCamera={toggleCameraFacing}
    />
  );
};

export default CameraScreenContainer;
