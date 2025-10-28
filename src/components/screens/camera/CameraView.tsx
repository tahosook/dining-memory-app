import React from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView as ExpoCameraView } from 'expo-camera';
import { Colors } from '../../../constants/Colors';
import { GlobalStyles } from '../../../constants/Styles';
import { PLATFORM_CONFIGS, CAMERA_CONSTANTS } from '../../../constants/CameraConstants';
import { ErrorBoundary } from '../../../components/common/ErrorBoundary';
import { Platform } from 'react-native';
import { PermissionResponse, CameraView as CameraViewType } from 'expo-camera';

const { width: screenWidth } = Dimensions.get('window');

/**
 * カメラ画面のメインViewコンポーネント
 * Presentational層：UI表示のみ
 */

// プラットフォーム固有設定
const platformConfig = PLATFORM_CONFIGS[Platform.OS as keyof typeof PLATFORM_CONFIGS] || PLATFORM_CONFIGS.default;
const safeAreaEdges = platformConfig.safeAreaEdges as ('top' | 'bottom' | 'left' | 'right')[];
const bottomBarMarginBottom = platformConfig.bottomBarMarginBottom;

// Props定義 - Pick<> + 型合成の原則で最小限に
type CameraLogicState = {
  takingPhoto: boolean;
  facing: 'front' | 'back';
  cameraRef: React.RefObject<CameraViewType | null>;
};

type CameraOperations = {
  onTakePicture: () => Promise<void>;
  onFlipCamera: () => void;
  onClose: () => void;
};

type CameraPermissionState = {
  cameraPermission: PermissionResponse | null;
};

type CameraSuccessState = {
  successMessage: string;
};

export type CameraViewProps = Pick<CameraLogicState, 'takingPhoto' | 'facing' | 'cameraRef'> &
  Pick<CameraOperations, 'onTakePicture' | 'onFlipCamera' | 'onClose'> &
  Pick<CameraPermissionState, 'cameraPermission'> &
  Pick<CameraSuccessState, 'successMessage'>;

// コンポーネント
const PermissionLoadingView: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.permissionText}>カメラ権限を確認中...</Text>
  </View>
);

const PermissionDeniedView: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.permissionText}>
      カメラまたは写真ライブラリへのアクセス権限がありません。
    </Text>
    <Text style={styles.permissionSubText}>
      設定アプリから権限を許可してください。
    </Text>
  </View>
);

const SuccessMessage: React.FC<{ message: string }> = ({ message }) => {
  if (!message) return null;

  return (
    <View style={styles.successContainer}>
      <View style={styles.successContent}>
        <Text style={styles.successText} accessibilityLabel="撮影成功メッセージ">
          {message}
        </Text>
      </View>
    </View>
  );
};

const FocusArea: React.FC = () => (
  <View style={styles.focusArea}>
    <View style={styles.focusSquare} accessibilityLabel="撮影範囲">
      <Text style={styles.instructionText} accessibilityLabel="撮影ガイド">
        撮影範囲に料理を合わせてください
      </Text>
    </View>
  </View>
);

interface BottomControlsProps {
  takingPhoto: boolean;
  onTakePicture: () => Promise<void>;
}

const BottomControls: React.FC<BottomControlsProps> = ({ takingPhoto, onTakePicture }) => (
  <View style={[styles.bottomBar, { marginBottom: bottomBarMarginBottom }]}>
    <View style={styles.buttonGroup}>
      <CaptureButton
        takingPhoto={takingPhoto}
        onPress={onTakePicture}
      />
      <Text style={styles.captureHint} accessibilityLabel="カメラ操作ガイド">
        ボタンをタップして撮影
      </Text>
    </View>
  </View>
);

// 既存のコンポーネントをインポートして利用
import TopBar from './TopBar';
import CaptureButton from './CaptureButton';

const CameraView: React.FC<CameraViewProps> = ({
  takingPhoto,
  facing,
  cameraPermission,
  cameraRef,
  successMessage,
  onClose,
  onTakePicture,
  onFlipCamera,
}) => {
  // 権限チェック（UIロジックのみ）
  // webモードで権限がない場合はモックモードで表示
  const isWebWithoutPermissions = Platform.OS === 'web' && (!cameraPermission || !cameraPermission.granted);

  if (cameraPermission === null && !isWebWithoutPermissions) {
    return <PermissionLoadingView />;
  }

  if (!cameraPermission?.granted && !isWebWithoutPermissions) {
    return <PermissionDeniedView />;
  }

  return (
    <ErrorBoundary>
      <SafeAreaView style={styles.container} edges={safeAreaEdges}>
        {/* Camera View */}
        <ExpoCameraView
          style={styles.camera}
          facing={facing}
          mode="picture"
          ratio="16:9"
          ref={cameraRef}
        />

        {/* Overlay UI */}
        <View style={styles.overlay}>
          {/* Top Bar */}
          <TopBar
            onClosePress={onClose}
            onFlipPress={onFlipCamera}
          />

          {/* Center Area - ガイドまたは成功メッセージを表示 */}
          {successMessage ? (
            <SuccessMessage message={successMessage} />
          ) : (
            <FocusArea />
          )}

          {/* Bottom Controls */}
          <BottomControls
            takingPhoto={takingPhoto}
            onTakePicture={onTakePicture}
          />
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
});

export default CameraView;
