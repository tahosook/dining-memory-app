import { useState, useRef, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import * as MediaLibrary from 'expo-media-library';
import { deleteAsync } from 'expo-file-system/legacy';
import { CameraView, CameraCapturedPicture, PermissionResponse } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import { CAMERA_CONSTANTS, ROUTE_NAMES } from '../../constants/CameraConstants';
import { CameraCaptureMock } from './useCameraCaptureMock';
import { MealService } from '../../database/services/MealService';
import type { CuisineTypeOption } from '../../constants/MealOptions';
import { persistPhotoToStablePath, type PersistPhotoOptions } from './photoStorage';
import { openAppSettings } from '../../utils/openAppSettings';
import type { RootTabParamList } from '../../navigation/types';
import type { AppliedMealInputAssistMetadata } from '../../ai/mealInputAssist';

export interface CaptureReviewState {
  source: 'camera' | 'library';
  photoUri: string;
  width: number;
  height: number;
  capturedAtMs: number;
  mealName: string;
  cuisineType: CuisineTypeOption | '';
  notes: string;
  locationName: string;
  isHomemade: boolean;
}

export type CaptureReviewEditableField = keyof Omit<CaptureReviewState, 'source' | 'photoUri' | 'width' | 'height' | 'capturedAtMs'>;

interface SaveCaptureOptions {
  aiMetadata?: AppliedMealInputAssistMetadata | null;
}

const PHOTO_PERMISSION_SCOPE: MediaLibrary.GranularPermission[] = ['photo'];

/**
 * カメラキャプチャ機能のHook
 * Application層のビジネスロジックをカプセル化
 */
export const useCameraCapture = (cameraPermission: PermissionResponse | null) => {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const cameraRef = useRef<CameraView>(null);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [captureReview, setCaptureReview] = useState<CaptureReviewState | null>(null);

  // 撮影中の状態管理
  const isTakingPhoto = takingPhoto;

  // メディアライブラリへの保存
  const savePhotoToMediaLibrary = useCallback(async (photoUri: string): Promise<boolean> => {
    try {
      await MediaLibrary.createAssetAsync(photoUri);
      return true;
    } catch {
      console.warn('Media library save failed.');
      return false;
    }
  }, []);

  // テンポラリファイルのクリーンアップ
  const cleanupTempFile = useCallback(async (photoUri: string) => {
    try {
      await deleteAsync(photoUri);
    } catch {
      console.warn('Temporary photo cleanup failed.');
    }
  }, []);

  const persistPhotoLocally = useCallback(async (photoUri: string, options: PersistPhotoOptions) => {
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
      return await persistPhotoToStablePath(resizedPhoto.uri, options);
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
          onPress: async () => {
            await openPhotoSettings();
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
    } catch {
      console.warn('Location lookup skipped.');
      return {};
    }
  }, []);

  // レコード画面への遷移
  const navigateToRecords = useCallback(() => {
    navigation.navigate(ROUTE_NAMES.RECORDS);
  }, [navigation]);

  const beginReview = useCallback((photo: Pick<CameraCapturedPicture, 'uri' | 'width' | 'height'>, source: 'camera' | 'library') => {
    setCaptureReview({
      source,
      photoUri: photo.uri,
      width: photo.width,
      height: photo.height,
      capturedAtMs: Date.now(),
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
          exif: true,
          skipProcessing: false,
        });
      }

      if (!photo) throw new Error('写真の撮影に失敗しました');

      beginReview(photo, 'camera');

    } catch {
      console.error('Photo capture failed.');
      Alert.alert('エラー', '写真の撮影に失敗しました。再度お試しください。');
    } finally {
      setTakingPhoto(false);
    }
  }, [cameraRef, takingPhoto, beginReview, cameraPermission]);

  const addPhotoFromLibrary = useCallback(async (): Promise<void> => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: false,
        exif: true,
        quality: 1,
      });

      if (result.canceled || result.assets.length === 0) {
        return;
      }

      const picked = result.assets[0];
      beginReview({
        uri: picked.uri,
        width: picked.width ?? CAMERA_CONSTANTS.SAVED_PHOTO_MAX_WIDTH,
        height: picked.height ?? CAMERA_CONSTANTS.SAVED_PHOTO_MAX_HEIGHT,
      }, 'library');
    } catch {
      Alert.alert('エラー', '写真の選択に失敗しました。再度お試しください。');
    }
  }, [beginReview]);

  // カメラ反転
  const flipCamera = useCallback(() => {
    setFacing(current => current === 'back' ? 'front' : 'back');
  }, []);

  const closeCamera = useCallback(() => {
    navigateToRecords();
  }, [navigateToRecords]);

  const updateCaptureReview = useCallback(
    (field: CaptureReviewEditableField, value: string | boolean) => {
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

  const saveCapture = useCallback(async (options?: SaveCaptureOptions) => {
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
        : await persistPhotoLocally(captureReview.photoUri, {
          capturedAt: new Date(captureReview.capturedAtMs),
          location: locationSnapshot,
          softwareName: process.env.EXPO_PUBLIC_APP_NAME ?? 'Dining Memory',
        });
      stablePhotoUri = persistedPhoto.stablePhotoUri;

      await MealService.createMeal({
        meal_name: captureReview.mealName.trim(),
        cuisine_type: captureReview.cuisineType || undefined,
        ai_confidence: options?.aiMetadata?.aiConfidence,
        ai_source: options?.aiMetadata?.aiSource,
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
    } catch {
      if (stablePhotoUri && stablePhotoUri !== captureReview.photoUri) {
        await cleanupTempFile(stablePhotoUri);
      }
      console.error('Meal save failed.');
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
    addPhotoFromLibrary,
    flipCamera,
    closeCamera,
    onCaptureReviewChange: updateCaptureReview,
    onCaptureReviewCancel: cancelReview,
    onCaptureReviewSave: saveCapture,
  };
};
