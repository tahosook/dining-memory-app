import { useState, useRef, useCallback, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as MediaLibrary from 'expo-media-library';
import { deleteAsync } from 'expo-file-system/legacy';
import { CameraView, CameraCapturedPicture, PermissionResponse } from 'expo-camera';
import { CAMERA_CONSTANTS, ROUTE_NAMES } from '../../constants/CameraConstants';
import { CameraCaptureMock } from './useCameraCaptureMock';
import { MealService } from '../../database/services/MealService';

export interface CaptureReviewState {
  photoUri: string;
  width: number;
  height: number;
  mealName: string;
  notes: string;
  locationName: string;
  isHomemade: boolean;
}

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
  const [captureReview, setCaptureReview] = useState<CaptureReviewState | null>(null);

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
    } catch (mediaError: unknown) {
      console.warn('Media library save failed:', mediaError instanceof Error ? mediaError.message : mediaError);
      return false;
    }
  }, []);

  // テンポラリファイルのクリーンアップ
  const cleanupTempFile = useCallback(async (photoUri: string) => {
    try {
      await deleteAsync(photoUri);
      console.log('Temp file cleaned up');
    } catch (cleanupError: unknown) {
      console.warn('Cleanup failed:', cleanupError instanceof Error ? cleanupError.message : cleanupError);
    }
  }, []);

  // レコード画面への遷移
  const navigateToRecords = useCallback(() => {
    // @ts-expect-error Navigation type inference issue
    navigation.navigate(ROUTE_NAMES.RECORDS);
  }, [navigation]);

  // 成功メッセージのクリア（OKボタン操作用）
  const clearSuccessMessage = useCallback(() => {
    setSuccessMessage('');
  }, []);

  const showSaveSuccessMessage = useCallback((mealName: string) => {
    const message = `✅ ${mealName} を記録しました

続けて撮影するか、記録タブで確認できます。`;

    setSuccessMessage(message);
  }, []);

  const beginReview = useCallback((photo: CameraCapturedPicture) => {
    setCaptureReview({
      photoUri: photo.uri,
      width: photo.width,
      height: photo.height,
      mealName: '',
      notes: '',
      locationName: '',
      isHomemade: true,
    });
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
        // Webモードテスト用モック画像作成（正常系コードから分離）
        photo = await CameraCaptureMock.createMockImage();
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

      setSuccessMessage('');
      beginReview(photo);

    } catch (error) {
      console.error('写真撮影エラー:', error);
      Alert.alert('エラー', '写真の撮影に失敗しました。再度お試しください。');
    } finally {
      setTakingPhoto(false);
    }
  }, [cameraRef, takingPhoto, beginReview, cameraPermission]);

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

  const updateCaptureReview = useCallback(
    (field: keyof Omit<CaptureReviewState, 'photoUri' | 'width' | 'height'>, value: string | boolean) => {
      setCaptureReview((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          [field]: value,
        };
      });
    },
    []
  );

  const cancelReview = useCallback(() => {
    setCaptureReview(null);
  }, []);

  const saveCapture = useCallback(async () => {
    if (!captureReview) {
      return;
    }

    if (!captureReview.mealName.trim()) {
      Alert.alert('入力が必要です', '料理名を入力してください。');
      return;
    }

    try {
      await MealService.createMeal({
        meal_name: captureReview.mealName.trim(),
        notes: captureReview.notes.trim() || undefined,
        location_name: captureReview.locationName.trim() || undefined,
        is_homemade: captureReview.isHomemade,
        photo_path: captureReview.photoUri,
        meal_datetime: new Date(),
      });

      const isWebWithoutPermissions = Platform.OS === 'web' && (!cameraPermission || !cameraPermission.granted);
      if (!isWebWithoutPermissions) {
        const saveSuccess = await savePhotoToMediaLibrary(captureReview.photoUri);
        if (!saveSuccess) {
          await cleanupTempFile(captureReview.photoUri);
        }
      }

      setCaptureReview(null);
      showSaveSuccessMessage(captureReview.mealName.trim());
    } catch (error) {
      console.error('記録保存エラー:', error);
      Alert.alert('保存に失敗しました', '記録の保存に失敗しました。再度お試しください。');
    }
  }, [cameraPermission, captureReview, cleanupTempFile, savePhotoToMediaLibrary, showSaveSuccessMessage]);

  return {
    // State
    takingPhoto: isTakingPhoto,
    facing,
    cameraRef,
    successMessage,
    captureReview,

    // Actions
    takePicture,
    flipCamera,
    showCloseConfirmDialog,
    onSuccessMessageOk: clearSuccessMessage,
    onSuccessMessageGoToRecords: navigateToRecords,
    onCaptureReviewChange: updateCaptureReview,
    onCaptureReviewCancel: cancelReview,
    onCaptureReviewSave: saveCapture,
  };
};
