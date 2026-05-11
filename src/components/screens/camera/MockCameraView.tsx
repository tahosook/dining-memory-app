import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/Colors';
import { GlobalStyles } from '../../../constants/Styles';
import { ErrorBoundary } from '../../../components/common/ErrorBoundary';
import TopBar from './TopBar';

type MockCameraViewProps = {
  takingPhoto: boolean;
  _facing: 'front' | 'back';
  _cameraRef: React.RefObject<unknown>;
  onTakePicture: () => Promise<void>;
  onFlipCamera: () => void;
  onClose: () => void;
};

const MockCameraPreview: React.FC = () => (
  <View style={styles.mockCamera}>
    <Text style={styles.mockCameraText}>📷 Test Camera Preview</Text>
    <Text style={styles.mockCameraSubText}>Web mode mock - 写真撮影権限なし</Text>
  </View>
);

const CameraPreviewSpacer: React.FC = () => <View style={styles.cameraPreviewSpacer} />;

const BottomControls: React.FC<{ takingPhoto: boolean; onTakePicture: () => Promise<void> }> = ({ takingPhoto, onTakePicture }) => (
  <View style={styles.bottomBar}>
    <View style={styles.captureActionsRow}>
      <CaptureButton takingPhoto={takingPhoto} onPress={onTakePicture} />
    </View>
  </View>
);

const CaptureButton: React.FC<{ takingPhoto: boolean; onPress: () => Promise<void> }> = ({ takingPhoto, onPress }) => (
  <View testID="capture-button" style={styles.captureButton} onTouchEnd={onPress}>
    <View style={[styles.captureButtonInner, takingPhoto && styles.takingPhoto]}>
      {takingPhoto ? <Text style={styles.captureText}>撮影中...</Text> : null}
    </View>
  </View>
);

const MockCameraView: React.FC<MockCameraViewProps> = ({ takingPhoto, _facing, _cameraRef, onTakePicture, onFlipCamera, onClose }) => {
  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        <MockCameraPreview />

        <View style={styles.overlay}>
          <TopBar onClosePress={onClose} onFlipPress={onFlipCamera} />
          <CameraPreviewSpacer />
          <BottomControls takingPhoto={takingPhoto} onTakePicture={onTakePicture} />
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
  mockCamera: {
    flex: 1,
    backgroundColor: Colors.gray,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mockCameraText: {
    ...GlobalStyles.body,
    color: Colors.white,
    textAlign: 'center',
  },
  mockCameraSubText: {
    ...GlobalStyles.body,
    color: Colors.white,
    textAlign: 'center',
    fontSize: 16,
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
  bottomBar: {
    width: '100%',
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  captureActionsRow: {
    width: '100%',
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  captureButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.white,
    justifyContent: 'center',
    alignItems: 'center',
  },
  takingPhoto: {
    backgroundColor: Colors.error,
  },
  captureText: {
    ...GlobalStyles.body,
    color: Colors.black,
    fontSize: 12,
  },
});

export default MockCameraView;
