import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView } from 'expo-camera';
import { Colors } from '../../constants/Colors';
import { GlobalStyles } from '../../constants/Styles';
import { PLATFORM_CONFIGS, ROUTE_NAMES } from '../../constants/CameraConstants';
import { ErrorBoundary } from '../../components/common/ErrorBoundary';
// Note: CameraScreenPresentational must not have side effects or hooks
// All business logic should be in CameraScreenContainer
import { CameraScreenPresentationalProps } from './CameraScreenContainer';

const { width: screenWidth } = Dimensions.get('window');

// Platform-specific configurations using centralized constants
const platformConfig = Platform.OS === 'ios' ? PLATFORM_CONFIGS.ios : PLATFORM_CONFIGS.default as any;
const safeAreaEdges = platformConfig.safeAreaEdges as ('top' | 'bottom' | 'left' | 'right')[];
const topBarMarginTop = platformConfig.topBarMarginTop;
const bottomBarMarginBottom = platformConfig.bottomBarMarginBottom;

// Components
interface TopBarProps {
  onClosePress: () => void;
  onFlipPress: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ onClosePress, onFlipPress }) => (
  <View style={[styles.topBar, { marginTop: topBarMarginTop }]}>
    <TouchableOpacity
      style={styles.closeButton}
      onPress={onClosePress}
      testID="close-button"
      accessibilityLabel="撮影画面を閉じる"
      accessibilityHint="このボタンをタップすると撮影を終了します"
      accessibilityRole="button"
    >
      <Text style={styles.closeButtonText}>✕</Text>
    </TouchableOpacity>

    <TouchableOpacity
      style={styles.flipButton}
      onPress={onFlipPress}
      accessibilityLabel="カメラを反転"
      accessibilityHint="フロントカメラとバックカメラを切り替えます"
      accessibilityRole="button"
    >
      <Text style={styles.buttonText}>🔄</Text>
    </TouchableOpacity>
  </View>
);

const CameraScreenPresentational: React.FC<CameraScreenPresentationalProps> = ({
  takingPhoto,
  facing,
  cameraPermission,
  onClose,
  onTakePicture,
  onFlipCamera,
}) => {
  if (cameraPermission === null) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>カメラ権限を確認中...</Text>
      </View>
    );
  }

  if (!cameraPermission?.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionText}>
          カメラまたは写真ライブラリへのアクセス権限がありません。
        </Text>
        <Text style={styles.permissionSubText}>
          設定アプリから権限を許可してください。
        </Text>
      </View>
    );
  }

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={safeAreaEdges}>
        {/* Camera View */}
        <CameraView
          style={styles.camera}
          facing={facing}
          mode="picture"
          ratio="16:9"
        />

        {/* Overlay UI */}
        <View style={styles.overlay}>
          {/* Top Bar */}
          <TopBar
            onClosePress={onClose}
            onFlipPress={onFlipCamera}
          />

          {/* Center Focus Area */}
          <View style={styles.focusArea}>
            <View style={styles.focusSquare} accessibilityLabel="撮影範囲">
              <Text style={styles.instructionText} accessibilityLabel="撮影ガイド">撮影範囲に料理を合わせてください</Text>
            </View>
          </View>

          {/* Bottom Controls */}
          <View style={[styles.bottomBar, { marginBottom: bottomBarMarginBottom }]}>
            <View style={styles.buttonGroup}>
              <TouchableOpacity
                style={[styles.captureButton, takingPhoto && styles.captureButtonDisabled]}
                onPress={onTakePicture}
                disabled={takingPhoto}
                testID="capture-button"
                accessibilityLabel="写真を撮る"
                accessibilityHint="カメラボタンをタップして料理の写真を撮影します"
                accessibilityRole="button"
                accessibilityState={{ disabled: takingPhoto }}
              >
                <View style={styles.captureButtonInner}>
                  {takingPhoto ? (
                    <Text style={styles.captureButtonText}>撮影中...</Text>
                  ) : (
                    <View style={styles.captureButtonCircle} />
                  )}
                </View>
              </TouchableOpacity>

              <Text style={styles.captureHint} accessibilityLabel="カメラ操作ガイド">
                ボタンをタップして撮影
              </Text>
            </View>
          </View>
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
  permissionText: {
    ...GlobalStyles.body,
    color: Colors.white,
    textAlign: 'center',
    textAlignVertical: 'center',
  },
  permissionSubText: {
    ...GlobalStyles.body,
    color: Colors.gray,
    textAlign: 'center',
    marginBottom: 50,
  },
  camera: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 20,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: 'bold',
  },
  flipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusSquare: {
    width: screenWidth * 0.8,
    height: screenWidth * 0.8,
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
    paddingBottom: 50,
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
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  captureButtonDisabled: {
    opacity: 0.5,
  },
  captureButtonInner: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ff4444',
    borderWidth: 3,
    borderColor: '#fff',
  },
  captureButtonText: {
    color: '#333',
    fontSize: 12,
    fontWeight: 'bold',
  },
  captureHint: {
    ...GlobalStyles.body,
    color: Colors.white,
  },
  buttonText: {
    ...GlobalStyles.body,
    color: Colors.white,
  },
});

export default CameraScreenPresentational;
