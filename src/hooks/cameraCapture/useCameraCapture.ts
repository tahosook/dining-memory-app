import { useState, useRef, useCallback, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as MediaLibrary from 'expo-media-library';
import { writeAsStringAsync, deleteAsync, EncodingType, documentDirectory } from 'expo-file-system/legacy';
import { CameraView, CameraCapturedPicture, PermissionResponse } from 'expo-camera';
import { CAMERA_CONSTANTS, ROUTE_NAMES } from '../../constants/CameraConstants';

/**
 * カメラキャプチャ機能のHook
 * Application層のビジネスロジックをカプセル化
 */
export const useCameraCapture = (cameraPermission: PermissionResponse | null) => {
  const navigation = useNavigation();
  const cameraRef = useRef<CameraView>(null);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [successMessage, setSuccessMessage] = useState<string>('');

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
      await deleteAsync(photoUri);
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
    const message = `✅ 写真を写真ライブラリに保存しました！

📸 写真詳細:
• ${photo.width}x${photo.height}
• 保存時刻: ${new Date().toLocaleString()}

・記録タブで確認`;

    setSuccessMessage(message);

    // 5秒後にメッセージをクリアしてガイドに戻る
    setTimeout(() => {
      setSuccessMessage('');
    }, 5000);

    if (Platform.OS === 'web') {
      // WebモードではUIにメッセージ表示 (console.logも残す)
      console.log('写真撮影完了', { message });
    } else {
      // NativeモードではAlertを表示
      Alert.alert('写真撮影完了', message, [
        { text: 'OK', style: 'default' },
        {
          text: '記録タブで確認',
          style: 'default',
          onPress: navigateToRecords
        }
      ]);
    }
  }, [navigateToRecords]);

  // モック画像作成関数 (webモードのテスト用)
  const createMockImage = useCallback(async (): Promise<CameraCapturedPicture> => {
    if (Platform.OS !== 'web') {
      throw new Error('Mock image only for web platform');
    }

    // Canvasを作成して日時を描画
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas context not available');
    }

    // 白い背景
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 日時テキスト
    ctx.fillStyle = 'black';
    ctx.font = '30px Arial';
    ctx.textAlign = 'center';
    const now = new Date().toLocaleString('ja-JP');
    ctx.fillText(now, canvas.width / 2, canvas.height / 2);

    // Data URLを取得 (webモードではファイル保存せずに直接使用)
    const dataUrl = canvas.toDataURL('image/jpeg');

    return {
      uri: dataUrl,
      width: canvas.width,
      height: canvas.height,
      format: 'jpg',
    };
  }, []);

  // 写真撮影のメイン関数
  const takePicture = useCallback(async (): Promise<void> => {
    // webモードで権限がない場合はカメラrefチェックをスキップ
    const isWebWithoutPermissions = Platform.OS === 'web' && (!cameraPermission || !cameraPermission.granted);

    if (!isWebWithoutPermissions && (!cameraRef.current || takingPhoto)) return;
    if (isWebWithoutPermissions && takingPhoto) return;

    try {
      setTakingPhoto(true);

      let photo: CameraCapturedPicture;

      if (isWebWithoutPermissions) {
        // モック画像作成
        photo = await createMockImage();
      } else {
        // 通常のカメラ撮影
        photo = await cameraRef.current!.takePictureAsync({
          quality: CAMERA_CONSTANTS.PHOTO_QUALITY,
          skipProcessing: false,
        });
      }

      if (!photo) throw new Error('写真の撮影に失敗しました');

      console.log('Photo captured successfully:', photo.uri);
      console.log('Photo details:', { width: photo.width, height: photo.height });

      // webモードのモック画像の場合はMediaLibrary保存をスキップ (webではサポートされない)
      if (!isWebWithoutPermissions) {
        // MediaLibraryに保存
        const saveSuccess = await savePhotoToMediaLibrary(photo.uri);
        if (!saveSuccess) {
          await cleanupTempFile(photo.uri);
          throw new Error('写真の保存に失敗しました');
        }
      }

      showPhotoSuccessAlert(photo);

    } catch (error) {
      console.error('写真撮影エラー:', error);
      Alert.alert('エラー', '写真の撮影に失敗しました。再度お試しください。');
    } finally {
      setTakingPhoto(false);
    }
  }, [cameraRef, takingPhoto, savePhotoToMediaLibrary, cleanupTempFile, showPhotoSuccessAlert, cameraPermission, createMockImage]);

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
    successMessage,

    // Actions
    takePicture,
    flipCamera,
    showCloseConfirmDialog,
  };
};
