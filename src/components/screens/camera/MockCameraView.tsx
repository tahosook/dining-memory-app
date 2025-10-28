import React from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/Colors';
import { GlobalStyles } from '../../../constants/Styles';
import { PLATFORM_CONFIGS, CAMERA_CONSTANTS } from '../../../constants/CameraConstants';
import { ErrorBoundary } from '../../../components/common/ErrorBoundary';

const { width: screenWidth } = Dimensions.get('window');

/**
 * Mock Camera View Component for Testing Web Mode
 * Expo Webモードでカメラ権限が利用できない場合のテスト専用UI
 */
type MockCameraViewProps = {
  takingPhoto: boolean;
  facing: 'front' | 'back';
  cameraRef: React.RefObject<any>;
  successMessage: string;
  onSuccessMessageOk: () => void;
  onSuccessMessageGoToRecords: () => void;
  onTakePicture: () => Promise<void>;
  onFlipCamera: () => void;
  onClose: () => void;
};

// Mock camera preview (for testing purposes)
const MockCameraPreview: React.FC = () => (
  <View style={styles.mockCamera}>
    <Text style={styles.mockCameraText}>📷 Test Camera Preview</Text>
    <Text style={[styles.mockCameraText, { fontSize: 16 }]}>
      Web mode mock - 写真撮影権限なし
    </Text>
  </View>
);

// Success message component (shared with CameraView)
interface SuccessMessageProps {
  message: string;
  onOk: () => void;
  onGoToRecords: () => void;
}

const SuccessMessage: React.FC<SuccessMessageProps> = ({ message, onOk, onGoToRecords }) => {
  if (!message) return null;

  return (
    <View style={styles.successContainer}>
      <View style={styles.successContent}>
        <Text style={styles.successText}>{message}</Text>
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={[styles.successButton, styles.okButton]} onPress={onOk}>
            <Text style={styles.buttonText}>OK</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.successButton, styles.recordsButton]} onPress={onGoToRecords}>
            <Text style={styles.buttonText}>記録タブで確認</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

// Focus area component (shared with CameraView)
const FocusArea: React.FC = () => (
  <View style={styles.focusArea}>
    <View style={styles.focusSquare}>
      <Text style={styles.instructionText}>
        撮影範囲に料理を合わせてください
      </Text>
    </View>
  </View>
);

// Bottom controls component
interface BottomControlsProps {
  takingPhoto: boolean;
  onTakePicture: () => Promise<void>;
}

const BottomControls: React.FC<BottomControlsProps> = ({ takingPhoto, onTakePicture }) => (
  <View style={[styles.bottomBar, { marginBottom: 0 }]}>
    <View style={styles.buttonGroup}>
      <CaptureButton takingPhoto={takingPhoto} onPress={onTakePicture} />
      <Text style={styles.captureHint}>
        ボタンをタップして撮影
      </Text>
    </View>
  </View>
);

// Mock capture button (tests need this testId)
const CaptureButton: React.FC<{ takingPhoto: boolean; onPress: () => Promise<void> }> = ({ takingPhoto, onPress }) => (
  <View testID="capture-button" style={styles.captureButton} onTouchEnd={onPress}>
    <View style={[styles.captureButtonInner, takingPhoto && styles.takingPhoto]}>
      {takingPhoto ? <Text style={styles.captureText}>撮影中...</Text> : null}
    </View>
  </View>
);

// Existing TopBar import
import TopBar from './TopBar';

const MockCameraView: React.FC<MockCameraViewProps> = ({
  takingPhoto,
  facing,
  cameraRef,
  successMessage,
  onSuccessMessageOk,
  onSuccessMessageGoToRecords,
  onTakePicture,
  onFlipCamera,
  onClose,
}) => {
  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Mock Camera Preview */}
        <MockCameraPreview />

        {/* Overlay UI */}
        <View style={styles.overlay}>
          {/* Top Bar */}
          <TopBar onClosePress={onClose} onFlipPress={onFlipCamera} />

          {/* Center Area - Show guide or success message */}
          {successMessage ? (
            <SuccessMessage
              message={successMessage}
              onOk={onSuccessMessageOk}
              onGoToRecords={onSuccessMessageGoToRecords}
            />
          ) : (
            <FocusArea />
          )}

          {/* Bottom Controls */}
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
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  focusArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusSquare: {
    width: screenWidth * CAMERA_CONSTANTS.FOCUS_AREA_RATIO,
    height: screenWidth * CAMERA_CONSTANTS.FOCUS_AREA_RATIO,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    borderStyle: 'dashed',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  instructionText: {
    ...GlobalStyles.body,
    color: Colors.white,
    textAlign: 'center',
    padding: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 8,
  },
  bottomBar: {
    paddingBottom: CAMERA_CONSTANTS.BOTTOM_BAR_PADDING,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  buttonGroup: {
    alignItems: 'center',
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
  captureHint: {
    ...GlobalStyles.body,
    color: Colors.white,
  },
  successContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  successContent: {
    backgroundColor: 'rgba(0,0,0,0.8)',
    padding: 20,
    borderRadius: 8,
    margin: 20,
  },
  successText: {
    ...GlobalStyles.body,
    color: Colors.white,
    textAlign: 'center',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  successButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  okButton: {
    backgroundColor: Colors.white,
  },
  recordsButton: {
    backgroundColor: Colors.primary,
  },
  buttonText: {
    ...GlobalStyles.body,
    color: Colors.black,
    fontWeight: 'bold',
  },
});

export default MockCameraView;
