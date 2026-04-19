import React from 'react';
import { CameraView } from '../../components/screens/camera';
import { useCameraCapture, useCameraPermission } from '../../hooks/cameraCapture';

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
      onCaptureReviewSave={onCaptureReviewSave}
    />
  );
};

export default CameraScreenContainer;
