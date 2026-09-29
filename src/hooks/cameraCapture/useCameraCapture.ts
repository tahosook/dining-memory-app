import { sanitizeLogObject } from '../../utils/logSanitizer';
import { useState, useRef, useCallback } from 'react';
import { Alert, BackHandler } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { CameraView, PermissionResponse } from 'expo-camera';
import { ROUTE_NAMES } from '../../constants/CameraConstants';
import type { RootTabParamList } from '../../navigation/types';
import type { AppliedMealInputAssistMetadata } from '../../ai/mealInputAssist/types';

import {
  isWebWithoutCameraPermission,
  pickPhotoFromLibraryForReview,
  takePhotoForReview,
} from './photoAcquisition';
import { getCurrentLocationSnapshot } from './locationSnapshot';
import { cleanupTempFile } from '../../media/tempFiles';
import { persistCapturePhotoLocally } from './capturePhotoPersistence';
import { savePhotoToMediaLibrary } from './mediaLibrarySave';
import { saveCaptureReviewWorkflow } from './captureSaveWorkflow';
import { useCaptureReview } from './useCaptureReview';
import { usePhotoSavePermission } from './usePhotoSavePermission';

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
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();
  const cameraRef = useRef<CameraView>(null);
  const takingPhotoRef = useRef(false);
  const pickingPhotoFromLibraryRef = useRef(false);
  const savingCaptureRef = useRef(false);
  const captureAttemptIdRef = useRef(0);
  const saveAttemptIdRef = useRef(0);
  const [takingPhoto, setTakingPhoto] = useState(false);
  const [pickingPhotoFromLibrary, setPickingPhotoFromLibrary] = useState(false);
  const [savingCapture, setSavingCapture] = useState(false);
  const [facing, setFacing] = useState<'front' | 'back'>('back');

  const { ensurePhotoSavePermission } = usePhotoSavePermission();
  const { captureReview, captureReviewRef, beginReview, updateCaptureReview, clearReview } = useCaptureReview();

  // 撮影中の状態管理
  const isTakingPhoto = takingPhoto;

  // レコード画面への遷移
  const navigateToRecords = useCallback(() => {
    navigation.navigate(ROUTE_NAMES.RECORDS);
  }, [navigation]);

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
        console.info(
          'Camera capture attempt completed.',
          sanitizeLogObject({
            captureAttemptId,
            photoUri: photo.uri,
          })
        );
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
    if (pickingPhotoFromLibraryRef.current) {
      return;
    }

    pickingPhotoFromLibraryRef.current = true;

    try {
      setPickingPhotoFromLibrary(true);
      const picked = await pickPhotoFromLibraryForReview();
      if (!picked) {
        return;
      }

      beginReview(picked, 'library');
    } catch {
      Alert.alert('エラー', '写真の選択に失敗しました。再度お試しください。');
    } finally {
      pickingPhotoFromLibraryRef.current = false;
      setPickingPhotoFromLibrary(false);
    }
  }, [beginReview]);

  // カメラ反転
  const flipCamera = useCallback(() => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }, []);

  const closeCamera = useCallback(() => {
    if (savingCaptureRef.current) {
      return;
    }

    navigateToRecords();
  }, [navigateToRecords]);

  const cancelReview = useCallback(() => {
    if (savingCaptureRef.current) {
      return;
    }

    clearReview();
  }, [clearReview]);

  useFocusEffect(
    useCallback(() => {
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (!captureReviewRef.current) {
          return false;
        }

        if (savingCaptureRef.current) {
          return true;
        }

        clearReview();
        return true;
      });

      return () => {
        subscription.remove();
      };
    }, [clearReview, captureReviewRef])
  );

  const saveCapture = useCallback(
    async (options?: SaveCaptureOptions) => {
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
          console.info(
            'Capture review save attempt started.',
            sanitizeLogObject({
              saveAttemptId,
              sourcePhotoUri: review.photoUri,
            })
          );
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
            console.info(
              'Capture review save attempt skipped.',
              sanitizeLogObject({
                saveAttemptId,
                sourcePhotoUri: review.photoUri,
                reason: result.reason,
              })
            );
          }
          return;
        }

        if (shouldLogCaptureDiagnostics()) {
          console.info(
            'Capture review save attempt completed.',
            sanitizeLogObject({
              saveAttemptId,
              sourcePhotoUri: review.photoUri,
              resizedPhotoUri: result.resizedPhotoUri,
              stablePhotoUri: result.stablePhotoUri,
              stableThumbnailUri: result.stableThumbnailUri,
              savedToMediaLibrary: result.savedToMediaLibrary,
              mealId: result.mealId,
            })
          );
        }
        clearReview();
        navigateToRecords();
      } catch {
        if (shouldLogCaptureDiagnostics()) {
          console.info(
            'Capture review save attempt failed.',
            sanitizeLogObject({
              saveAttemptId,
              sourcePhotoUri: review.photoUri,
            })
          );
        }
        console.error('Meal save failed.');
        Alert.alert('保存に失敗しました', '記録の保存に失敗しました。再度お試しください。');
      } finally {
        savingCaptureRef.current = false;
        setSavingCapture(false);
      }
    },
    [cameraPermission, captureReview, ensurePhotoSavePermission, navigateToRecords, clearReview]
  );

  return {
    // State
    takingPhoto: isTakingPhoto,
    pickingPhotoFromLibrary,
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
