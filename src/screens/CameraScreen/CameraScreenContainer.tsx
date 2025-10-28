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
  const cameraPermission = useCameraPermission();
  const { takingPhoto, facing, cameraRef, takePicture, flipCamera, showCloseConfirmDialog, successMessage } = useCameraCapture(cameraPermission);

  // Presentational層にデータを渡すのみ
  return (
    <CameraView
      takingPhoto={takingPhoto}
      facing={facing}
      cameraPermission={cameraPermission}
      cameraRef={cameraRef}
      successMessage={successMessage}
      onTakePicture={takePicture}
      onFlipCamera={flipCamera}
      onClose={showCloseConfirmDialog}
    />
  );
};

export default CameraScreenContainer;
