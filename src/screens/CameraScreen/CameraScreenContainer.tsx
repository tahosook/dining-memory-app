import React from 'react';
import { InteractionManager } from 'react-native';
import { CameraView } from '../../components/screens/camera';
import { useCameraCapture, useCameraPermission, useMealInputAssist } from '../../hooks/cameraCapture';

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
    facing,
    cameraRef,
    takePicture,
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
    const interaction = InteractionManager.runAfterInteractions(() => {
      timeout = setTimeout(() => {
        if (!cancelled) {
          prewarmMealInputAssist();
        }
      }, 1500);
    });

    return () => {
      cancelled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      interaction.cancel?.();
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

  // Presentational層にデータを渡すのみ
  return (
    <CameraView
      takingPhoto={takingPhoto}
      facing={facing}
      cameraPermission={cameraPermissionState.permission}
      permissionUiState={cameraPermissionState.uiState}
      cameraRef={cameraRef}
      captureReview={captureReview}
      onTakePicture={takePicture}
      onFlipCamera={flipCamera}
      onClose={closeCamera}
      onRequestPermission={cameraPermissionState.requestPermissions}
      onOpenSettings={cameraPermissionState.openAppSettings}
      onCaptureReviewChange={onCaptureReviewChange}
      onCaptureReviewCancel={onCaptureReviewCancel}
      onCaptureReviewSave={handleCaptureReviewSave}
      aiAssistStatus={mealInputAssist.status}
      aiAssistSuggestions={mealInputAssist.suggestions}
      aiAssistErrorMessage={mealInputAssist.errorMessage}
      aiAssistProgress={mealInputAssist.progress}
      aiAssistDisabledReason={mealInputAssist.disabledReason}
      onRequestAiSuggestions={mealInputAssist.requestSuggestions}
      onApplyNoteDraftSuggestion={mealInputAssist.applyNoteDraftSuggestion}
    />
  );
};

export default CameraScreenContainer;
