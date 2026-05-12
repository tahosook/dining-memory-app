import { useState, useRef, useCallback } from 'react';
import { Alert } from 'react-native';
import { useNavigation, type NavigationProp } from '@react-navigation/native';
import { CameraView, PermissionResponse } from 'expo-camera';
import { ROUTE_NAMES } from '../../constants/CameraConstants';
import { openAppSettings } from '../../utils/openAppSettings';
import type { RootTabParamList } from '../../navigation/types';
import type { AppliedMealInputAssistMetadata } from '../../ai/mealInputAssist/types';
import {
  createCaptureReviewState,
  type CaptureReviewEditableField,
  type CaptureReviewSource,
  type CaptureReviewState,
  type ReviewablePhoto,
} from './captureReviewState';
import {
  isWebWithoutCameraPermission,
  pickPhotoFromLibraryForReview,
  takePhotoForReview,
} from './photoAcquisition';
import { ensureAndroidPhotoSavePermission } from './photoSavePermission';
import { getCurrentLocationSnapshot } from './locationSnapshot';
import { cleanupTempFile } from '../../media/tempFiles';
import { persistCapturePhotoLocally } from './capturePhotoPersistence';
import { savePhotoToMediaLibrary } from './mediaLibrarySave';
import { saveCaptureReviewWorkflow } from './captureSaveWorkflow';

export type { CaptureReviewEditableField, CaptureReviewState } from './captureReviewState';

interface SaveCaptureOptions {
  aiMetadata?: AppliedMealInputAssistMetadata | null;
}

function shouldLogCaptureDiagnostics() {
  return process.env.NODE_ENV === 'development';
}

/**
 * カメラキャプチャ機能のHook
 * Application層のビジネスロジックをカプセル化
 */
export const useCameraCapture = (cameraPermission: PermissionResponse | null) => {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const cameraRef = useRef<CameraView>(null);
  const takingPhotoRef = useRef(false);
  const savingCaptureRef = useRef(false);
  const captureAttemptIdRef = useRef(0);
  const saveAttemptIdRef = useRef(0);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [savingCapture, setSavingCapture] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');
  const [captureReview, setCaptureReview] = useState<CaptureReviewState | null>(null);

  // 撮影中の状態管理
  const isTakingPhoto = takingPhoto;

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
    const hasPermission = await ensureAndroidPhotoSavePermission();
    if (hasPermission) {
      return true;
    }

    promptForPhotoSavePermission();
    return false;
  }, [promptForPhotoSavePermission]);

  // レコード画面への遷移
  const navigateToRecords = useCallback(() => {
    navigation.navigate(ROUTE_NAMES.RECORDS);
  }, [navigation]);

  const beginReview = useCallback((photo: ReviewablePhoto, source: CaptureReviewSource) => {
    setCaptureReview(createCaptureReviewState(photo, source));
  }, []);

  // 写真撮影のメイン関数
  const takePicture = useCallback(async (): Promise<void> => {
    // webモードで権限がない場合はカメラrefチェックをスキップ
    const isWebWithoutPermissions = isWebWithoutCameraPermission(cameraPermission);

    if (takingPhotoRef.current) return;
    if (!isWebWithoutPermissions && !cameraRef.current) return;

    takingPhotoRef.current = true;
    const captureAttemptId = captureAttemptIdRef.current + 1;
    captureAttemptIdRef.current = captureAttemptId;

    try {
      setTakingPhoto(true);
      if (shouldLogCaptureDiagnostics()) {
        console.info('Camera capture attempt started.', { captureAttemptId });
      }
      const photo = await takePhotoForReview(cameraRef, cameraPermission);
      if (shouldLogCaptureDiagnostics()) {
        console.info('Camera capture attempt completed.', {
          captureAttemptId,
          photoUri: photo.uri,
        });
      }
      beginReview(photo, 'camera');

    } catch {
      if (shouldLogCaptureDiagnostics()) {
        console.info('Camera capture attempt failed.', { captureAttemptId });
      }
      console.error('Photo capture failed.');
      Alert.alert('エラー', '写真の撮影に失敗しました。再度お試しください。');
    } finally {
      takingPhotoRef.current = false;
      setTakingPhoto(false);
    }
  }, [beginReview, cameraPermission]);

  const addPhotoFromLibrary = useCallback(async (): Promise<void> => {
    try {
      const picked = await pickPhotoFromLibraryForReview();
      if (!picked) {
        return;
      }

      beginReview(picked, 'library');
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
    const review = captureReview;
    if (!review || savingCaptureRef.current) {
      return;
    }

    savingCaptureRef.current = true;
    const saveAttemptId = saveAttemptIdRef.current + 1;
    saveAttemptIdRef.current = saveAttemptId;

    try {
      setSavingCapture(true);
      if (shouldLogCaptureDiagnostics()) {
        console.info('Capture review save attempt started.', {
          saveAttemptId,
          sourcePhotoUri: review.photoUri,
        });
      }
      const result = await saveCaptureReviewWorkflow({
        captureReview: review,
        cameraPermission,
        aiMetadata: options?.aiMetadata,
        ensurePhotoSavePermission,
        getLocationSnapshot: getCurrentLocationSnapshot,
        persistPhotoLocally: persistCapturePhotoLocally,
        savePhotoToMediaLibrary,
        cleanupTempFile,
      });

      if (result.kind === 'skipped') {
        if (shouldLogCaptureDiagnostics()) {
          console.info('Capture review save attempt skipped.', {
            saveAttemptId,
            sourcePhotoUri: review.photoUri,
            reason: result.reason,
          });
        }
        return;
      }

      if (shouldLogCaptureDiagnostics()) {
        console.info('Capture review save attempt completed.', {
          saveAttemptId,
          sourcePhotoUri: review.photoUri,
          resizedPhotoUri: result.resizedPhotoUri,
          stablePhotoUri: result.stablePhotoUri,
          savedToMediaLibrary: result.savedToMediaLibrary,
          mealId: result.mealId,
        });
      }
      setCaptureReview(null);
      navigateToRecords();
    } catch {
      if (shouldLogCaptureDiagnostics()) {
        console.info('Capture review save attempt failed.', {
          saveAttemptId,
          sourcePhotoUri: review.photoUri,
        });
      }
      console.error('Meal save failed.');
      Alert.alert('保存に失敗しました', '記録の保存に失敗しました。再度お試しください。');
    } finally {
      savingCaptureRef.current = false;
      setSavingCapture(false);
    }
  }, [
    cameraPermission,
    captureReview,
    ensurePhotoSavePermission,
    navigateToRecords,
  ]);

  return {
    // State
    takingPhoto: isTakingPhoto,
    savingCapture,
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
