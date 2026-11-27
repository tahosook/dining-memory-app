import React from 'react';
import { buildMealInputAssistUiProps } from '../../components/common/MealInputAssistSection';
import { CameraView } from '../../components/screens/camera';
import {
  useCameraCapture,
  useCameraPermission,
  useMealInputAssist,
} from '../../hooks/cameraCapture';

/**
 * カメラ画面コンテナコンポーネント
 * 4層クリーンアーキテクチャのPresentational層との接続役
 *
 * 役割：
 * - Application層 (Hooks) を使用してビジネスロジックを取得
 * - Presentational層 (UIコンポーネント) にデータを渡す
 * - コンテナ自身は何も管理しない（ロジック0原則）
 */
const CameraScreenContainer: React.FC = () => {
  // Application層のHooksから全てのロジックを取得
  const cameraPermissionState = useCameraPermission();
  const {
    takingPhoto,
    pickingPhotoFromLibrary,
    savingCapture,
    facing,
    cameraRef,
    takePicture,
    addPhotoFromLibrary,
    flipCamera,
    closeCamera,
    captureReview,
    onCaptureReviewChange,
    onCaptureReviewCancel,
    onCaptureReviewSave,
  } = useCameraCapture(cameraPermissionState.permission);
  const mealInputAssist = useMealInputAssist({
    captureReview,
    onCaptureReviewChange,
  });
  const prewarmMealInputAssist = mealInputAssist.prewarm;

  React.useEffect(() => {
    if (!cameraPermissionState.permission?.granted || captureReview || takingPhoto) {
      return undefined;
    }

    let cancelled = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let idleHandle: number | null = null;

    const schedulePrewarm = () => {
      timeout = setTimeout(() => {
        if (!cancelled) {
          prewarmMealInputAssist();
        }
      }, 1500);
    };

    if (typeof requestIdleCallback === 'function') {
      idleHandle = requestIdleCallback(schedulePrewarm);
    } else {
      schedulePrewarm();
    }

    return () => {
      cancelled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      if (idleHandle !== null && typeof cancelIdleCallback === 'function') {
        cancelIdleCallback(idleHandle);
      }
    };
  }, [
    cameraPermissionState.permission?.granted,
    captureReview,
    prewarmMealInputAssist,
    takingPhoto,
  ]);

  const handleCaptureReviewSave = React.useCallback(
    () => onCaptureReviewSave({ aiMetadata: mealInputAssist.appliedMetadata }),
    [mealInputAssist.appliedMetadata, onCaptureReviewSave]
  );

  const aiAssist = React.useMemo(
    () =>
      buildMealInputAssistUiProps({
        status: mealInputAssist.status,
        suggestions: mealInputAssist.suggestions,
        errorMessage: mealInputAssist.errorMessage,
        progress: mealInputAssist.progress,
        disabledReason: mealInputAssist.disabledReason,
        requestSuggestions: mealInputAssist.requestSuggestions,
        applyNoteDraftSuggestion: mealInputAssist.applyNoteDraftSuggestion,
        applyMealNameSuggestion: mealInputAssist.applyMealNameSuggestion,
        applyCuisineSuggestion: mealInputAssist.applyCuisineSuggestion,
      }),
    [
      mealInputAssist.status,
      mealInputAssist.suggestions,
      mealInputAssist.errorMessage,
      mealInputAssist.progress,
      mealInputAssist.disabledReason,
      mealInputAssist.requestSuggestions,
      mealInputAssist.applyNoteDraftSuggestion,
      mealInputAssist.applyMealNameSuggestion,
      mealInputAssist.applyCuisineSuggestion,
    ]
  );

  // Presentational層にデータを渡すのみ
  return (
    <CameraView
      takingPhoto={takingPhoto}
      pickingPhotoFromLibrary={pickingPhotoFromLibrary}
      savingCapture={savingCapture}
      facing={facing}
      cameraPermission={cameraPermissionState.permission}
      permissionUiState={cameraPermissionState.uiState}
      cameraRef={cameraRef}
      captureReview={captureReview}
      aiAssist={aiAssist}
      onTakePicture={takePicture}
      onAddPhotoFromLibrary={addPhotoFromLibrary}
      onFlipCamera={flipCamera}
      onClose={closeCamera}
      onRequestPermission={cameraPermissionState.requestPermissions}
      onOpenSettings={cameraPermissionState.openAppSettings}
      onCaptureReviewChange={onCaptureReviewChange}
      onCaptureReviewCancel={onCaptureReviewCancel}
      onCaptureReviewSave={handleCaptureReviewSave}
    />
  );
};

export default CameraScreenContainer;
