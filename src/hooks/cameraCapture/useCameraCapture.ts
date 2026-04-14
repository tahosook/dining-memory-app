import { useState, useRef, useCallback, useEffect } from 'react';
import { Alert, Platform } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import * as MediaLibrary from 'expo-media-library';
import { deleteAsync } from 'expo-file-system/legacy';
import { CameraView, CameraCapturedPicture, PermissionResponse } from 'expo-camera';
import * as Location from 'expo-location';
import ImageResizer from 'react-native-image-resizer';
import { CAMERA_CONSTANTS, ROUTE_NAMES } from '../../constants/CameraConstants';
import { CameraCaptureMock } from './useCameraCaptureMock';
import { MealService } from '../../database/services/MealService';
import type { CuisineTypeOption } from '../../constants/MealOptions';
import { persistPhotoToStablePath } from './photoStorage';
import { openAppSettings } from '../../utils/openAppSettings';

export interface CaptureReviewState {
  photoUri: string;
  width: number;
  height: number;
  mealName: string;
  cuisineType: CuisineTypeOption | '';
  notes: string;
  locationName: string;
  isHomemade: boolean;
}

const PHOTO_PERMISSION_SCOPE: MediaLibrary.GranularPermission[] = ['photo'];

/**
 * カメラキャプチャ機能のHook
 * Application層のビジネスロジックをカプセル化
 */
export const useCameraCapture = (cameraPermission: PermissionResponse | null) => {
  const navigation = useNavigation();
  const cameraRef = useRef<CameraView>(null);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
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

  const persistPhotoLocally = useCallback(async (photoUri: string) => {
    const resizedPhoto = await ImageResizer.createResizedImage(
      photoUri,
      CAMERA_CONSTANTS.SAVED_PHOTO_MAX_WIDTH,
      CAMERA_CONSTANTS.SAVED_PHOTO_MAX_HEIGHT,
      'JPEG',
      CAMERA_CONSTANTS.SAVED_PHOTO_QUALITY_PERCENT,
      0,
      undefined,
      true,
      {
        mode: 'contain',
        onlyScaleDown: true,
      }
    );

    try {
      return await persistPhotoToStablePath(resizedPhoto.uri);
    } finally {
      if (resizedPhoto.uri !== photoUri) {
        await cleanupTempFile(resizedPhoto.uri);
      }
    }
  }, [cleanupTempFile]);

  const openPhotoSettings = useCallback(async () => {
    await openAppSettings({
      errorLogLabel: 'Open photo settings error',
      alertMessage: 'アプリの設定画面から写真の保存権限を許可してください。',
    });
  }, []);

  const promptForPhotoSavePermission = useCallback(() => {
    Alert.alert(
      '写真の保存権限が必要です',
      'Dining Memory アルバムへ写真を保存するには、アプリ設定で写真の保存権限を許可してください。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '設定を開く',
          onPress: () => {
            void openPhotoSettings();
          },
        },
      ]
    );
  }, [openPhotoSettings]);

  const ensurePhotoSavePermission = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      return true;
    }

    const currentPermission = await MediaLibrary.getPermissionsAsync(false, PHOTO_PERMISSION_SCOPE);
    if (currentPermission.granted) {
      return true;
    }

    const nextPermission = currentPermission.canAskAgain === false
      ? currentPermission
      : await MediaLibrary.requestPermissionsAsync(false, PHOTO_PERMISSION_SCOPE);

    if (nextPermission.granted) {
      return true;
    }

    promptForPhotoSavePermission();
    return false;
  }, [promptForPhotoSavePermission]);

  const getCurrentCoordinates = useCallback(async (): Promise<{ latitude?: number; longitude?: number }> => {
    if (Platform.OS === 'web') {
      return {};
    }

    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        return {};
      }

      const lastKnownPosition = await Location.getLastKnownPositionAsync({
        maxAge: 1000 * 60 * 5,
        requiredAccuracy: 200,
      });

      const currentPosition = lastKnownPosition
        ?? await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });

      return {
        latitude: currentPosition.coords.latitude,
        longitude: currentPosition.coords.longitude,
      };
    } catch (locationError: unknown) {
      console.warn('Location lookup skipped:', locationError instanceof Error ? locationError.message : locationError);
      return {};
    }
  }, []);

  // レコード画面への遷移
  const navigateToRecords = useCallback(() => {
    // @ts-expect-error Navigation type inference issue
    navigation.navigate(ROUTE_NAMES.RECORDS);
  }, [navigation]);

  const beginReview = useCallback((photo: CameraCapturedPicture) => {
    setCaptureReview({
      photoUri: photo.uri,
      width: photo.width,
      height: photo.height,
      mealName: '',
      cuisineType: '',
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

    let stablePhotoUri: string | null = null;

    try {
      const isWebWithoutPermissions = Platform.OS === 'web' && (!cameraPermission || !cameraPermission.granted);
      if (!isWebWithoutPermissions) {
        const hasPhotoSavePermission = await ensurePhotoSavePermission();
        if (!hasPhotoSavePermission) {
          return;
        }
      }

      const locationSnapshot = await getCurrentCoordinates();
      const persistedPhoto = isWebWithoutPermissions
        ? { stablePhotoUri: captureReview.photoUri, savedToMediaLibrary: false }
        : await persistPhotoLocally(captureReview.photoUri);
      stablePhotoUri = persistedPhoto.stablePhotoUri;

      await MealService.createMeal({
        meal_name: captureReview.mealName.trim(),
        cuisine_type: captureReview.cuisineType || undefined,
        notes: captureReview.notes.trim() || undefined,
        location_name: captureReview.locationName.trim() || undefined,
        latitude: locationSnapshot.latitude,
        longitude: locationSnapshot.longitude,
        is_homemade: captureReview.isHomemade,
        photo_path: stablePhotoUri,
        meal_datetime: new Date(),
      });

      if (!isWebWithoutPermissions && !persistedPhoto.savedToMediaLibrary) {
        const saveSuccess = await savePhotoToMediaLibrary(stablePhotoUri);
        if (!saveSuccess) {
          console.warn('Media library save skipped, but local record is preserved.');
        }
      }

      if (!isWebWithoutPermissions && stablePhotoUri !== captureReview.photoUri) {
        await cleanupTempFile(captureReview.photoUri);
      }

      setCaptureReview(null);
      navigateToRecords();
    } catch (error) {
      if (stablePhotoUri && stablePhotoUri !== captureReview.photoUri) {
        await cleanupTempFile(stablePhotoUri);
      }
      console.error('記録保存エラー:', error);
      Alert.alert('保存に失敗しました', '記録の保存に失敗しました。再度お試しください。');
    }
  }, [
    cameraPermission,
    captureReview,
    cleanupTempFile,
    ensurePhotoSavePermission,
    getCurrentCoordinates,
    navigateToRecords,
    persistPhotoLocally,
    savePhotoToMediaLibrary,
  ]);

  return {
    // State
    takingPhoto: isTakingPhoto,
    facing,
    cameraRef,
    captureReview,

    // Actions
    takePicture,
    flipCamera,
    showCloseConfirmDialog,
    onCaptureReviewChange: updateCaptureReview,
    onCaptureReviewCancel: cancelReview,
    onCaptureReviewSave: saveCapture,
  };
};
