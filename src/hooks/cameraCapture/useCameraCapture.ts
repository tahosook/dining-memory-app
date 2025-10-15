import { useState, useRef, useCallback, useEffect } from 'react';
import { Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as MediaLibrary from 'expo-media-library';
import * as FileSystem from 'expo-file-system';
import { CameraView, CameraCapturedPicture } from 'expo-camera';
import { CAMERA_CONSTANTS, ROUTE_NAMES } from '../../constants/CameraConstants';

/**
 * カメラキャプチャ機能のHook
 * Application層のビジネスロジックをカプセル化
 */
export const useCameraCapture = () => {
  const navigation = useNavigation();
  const cameraRef = useRef<CameraView>(null);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');

  // 撮影中の状態管理
  const isTakingPhoto = takingPhoto;

  // Cleanup on unmount
  useEffect(() => {
    const cameraCurrent = cameraRef.current;
    return () => {
      if (cameraCurrent) {
        console.log('Camera cleanup on hook unmount');
      }
    };
  }, []);

  // メディアライブラリへの保存
  const savePhotoToMediaLibrary = useCallback(async (photoUri: string): Promise<boolean> => {
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

  // テンポラリファイルのクリーンアップ
  const cleanupTempFile = useCallback(async (photoUri: string) => {
    try {
      await FileSystem.deleteAsync(photoUri);
      console.log('Temp file cleaned up');
    } catch (cleanupError: any) {
      console.warn('Cleanup failed:', cleanupError.message);
    }
  }, []);

  // レコード画面への遷移
  const navigateToRecords = useCallback(() => {
    // @ts-expect-error Navigation type inference issue
    navigation.navigate(ROUTE_NAMES.RECORDS);
  }, [navigation]);

  // 成功時のアラート表示
  const showPhotoSuccessAlert = useCallback((photo: CameraCapturedPicture) => {
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

  // 写真撮影のメイン関数
  const takePicture = useCallback(async (): Promise<void> => {
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

      // MediaLibraryに保存
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

  // カメラ反転
  const flipCamera = useCallback(() => {
    setFacing(current => current === 'back' ? 'front' : 'back');
  }, []);

  // 閉じる時の確認ダイアログ
  const showCloseConfirmDialog = useCallback(() => {
    Alert.alert('確認', '撮影を終了して記録タブに移動しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '撮影を終了しました', onPress: navigateToRecords }
    ]);
  }, [navigateToRecords]);

  return {
    // State
    takingPhoto: isTakingPhoto,
    facing,
    cameraRef,

    // Actions
    takePicture,
    flipCamera,
    showCloseConfirmDialog,
  };
};
