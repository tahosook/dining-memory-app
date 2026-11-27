import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView as ExpoCameraView, CameraView as CameraViewType } from 'expo-camera';
import { Colors } from '../../../constants/Colors';
import { PLATFORM_CONFIGS } from '../../../constants/CameraConstants';
import { ErrorBoundary } from '../../../components/common/ErrorBoundary';
import type { MealInputAssistUiProps } from '../../common/MealInputAssistSection';
import type { CameraPermissionState } from '../../../hooks/cameraCapture';
import type {
  CaptureReviewEditableField,
  CaptureReviewState,
} from '../../../hooks/cameraCapture/useCameraCapture';
import { CameraBottomControls } from './CameraBottomControls';
import { CaptureReview } from './CaptureReview';
import {
  PermissionDeniedView,
  PermissionLoadingView,
  PermissionRequestView,
} from './PermissionViews';
import TopBar from './TopBar';

const platformConfig =
  PLATFORM_CONFIGS[Platform.OS as keyof typeof PLATFORM_CONFIGS] || PLATFORM_CONFIGS.default;
const safeAreaEdges = platformConfig.safeAreaEdges as ('top' | 'bottom' | 'left' | 'right')[];

export type CameraViewProps = {
  takingPhoto: boolean;
  pickingPhotoFromLibrary: boolean;
  facing: 'front' | 'back';
  cameraRef: React.RefObject<CameraViewType | null>;
  cameraPermission: CameraPermissionState['permission'];
  permissionUiState: CameraPermissionState['uiState'];
  captureReview: CaptureReviewState | null;
  savingCapture: boolean;
  aiAssist: MealInputAssistUiProps;
  onTakePicture: () => Promise<void>;
  onAddPhotoFromLibrary: () => Promise<void>;
  onFlipCamera: () => void;
  onClose: () => void;
  onRequestPermission: () => Promise<void>;
  onOpenSettings: () => Promise<void>;
  onCaptureReviewChange: (field: CaptureReviewEditableField, value: string | boolean) => void;
  onCaptureReviewCancel: () => void;
  onCaptureReviewSave: () => Promise<void>;
};

const CameraPreviewSpacer: React.FC = () => <View style={styles.cameraPreviewSpacer} />;

const CameraView: React.FC<CameraViewProps> = ({
  takingPhoto,
  pickingPhotoFromLibrary,
  savingCapture,
  facing,
  cameraPermission,
  permissionUiState,
  cameraRef,
  captureReview,
  aiAssist,
  onClose,
  onTakePicture,
  onAddPhotoFromLibrary,
  onFlipCamera,
  onRequestPermission,
  onOpenSettings,
  onCaptureReviewChange,
  onCaptureReviewCancel,
  onCaptureReviewSave,
}) => {
  const isWebWithoutPermissions =
    Platform.OS === 'web' && (!cameraPermission || !cameraPermission.granted);

  if (permissionUiState === 'checking' && !isWebWithoutPermissions) {
    return <PermissionLoadingView />;
  }

  if (permissionUiState === 'needs_request' && !isWebWithoutPermissions) {
    return <PermissionRequestView onRequestPermission={onRequestPermission} />;
  }

  if (permissionUiState === 'denied' && !isWebWithoutPermissions) {
    return <PermissionDeniedView onOpenSettings={onOpenSettings} />;
  }

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={safeAreaEdges}>
        {/* Keep ExpoCameraView mounted behind review UI to avoid Android camera teardown/re-init glitches. */}
        <ExpoCameraView
          style={styles.camera}
          facing={facing}
          mode="picture"
          ratio="16:9"
          ref={cameraRef}
        />
        {captureReview ? <View style={styles.cameraReviewBackdrop} pointerEvents="none" /> : null}

        <View style={styles.overlay}>
          <TopBar onClosePress={onClose} onFlipPress={onFlipCamera} closeDisabled={savingCapture} />

          {captureReview ? (
            <CaptureReview
              captureReview={captureReview}
              savingCapture={savingCapture}
              aiAssist={aiAssist}
              onChange={onCaptureReviewChange}
              onCancel={onCaptureReviewCancel}
              onSave={onCaptureReviewSave}
            />
          ) : (
            <CameraPreviewSpacer />
          )}

          {!captureReview ? (
            <CameraBottomControls
              takingPhoto={takingPhoto}
              pickingPhotoFromLibrary={pickingPhotoFromLibrary}
              onTakePicture={onTakePicture}
              onAddPhotoFromLibrary={onAddPhotoFromLibrary}
            />
          ) : null}
        </View>
      </SafeAreaView>
    </ErrorBoundary>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  camera: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  cameraReviewBackdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: Colors.black,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cameraPreviewSpacer: {
    flex: 1,
  },
});

export default CameraView;
