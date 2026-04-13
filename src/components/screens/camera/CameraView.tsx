import React from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, Image, TextInput, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView as ExpoCameraView } from 'expo-camera';
import { Colors } from '../../../constants/Colors';
import { GlobalStyles } from '../../../constants/Styles';
import { PLATFORM_CONFIGS, CAMERA_CONSTANTS } from '../../../constants/CameraConstants';
import { ErrorBoundary } from '../../../components/common/ErrorBoundary';
import { CuisineTypeSelector } from '../../../components/common/CuisineTypeSelector';
import { Platform } from 'react-native';
import { PermissionResponse, CameraView as CameraViewType } from 'expo-camera';
import type { CameraPermissionUiState } from '../../../hooks/cameraCapture';
import type { CaptureReviewState } from '../../../hooks/cameraCapture/useCameraCapture';

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
  onRequestPermission: () => Promise<void>;
  onOpenSettings: () => Promise<void>;
};

type CameraPermissionState = {
  cameraPermission: PermissionResponse | null;
  permissionUiState: CameraPermissionUiState;
};

type CameraSuccessState = {
  successMessage: string;
  captureReview: CaptureReviewState | null;
};

type CameraSuccessOperations = {
  onSuccessMessageOk: () => void;
  onSuccessMessageGoToRecords: () => void;
  onCaptureReviewChange: (
    field: keyof Omit<CaptureReviewState, 'photoUri' | 'width' | 'height'>,
    value: string | boolean
  ) => void;
  onCaptureReviewCancel: () => void;
  onCaptureReviewSave: () => Promise<void>;
};

export type CameraViewProps = Pick<CameraLogicState, 'takingPhoto' | 'facing' | 'cameraRef'> &
  Pick<CameraOperations, 'onTakePicture' | 'onFlipCamera' | 'onClose' | 'onRequestPermission' | 'onOpenSettings'> &
  Pick<CameraPermissionState, 'cameraPermission' | 'permissionUiState'> &
  Pick<CameraSuccessState, 'successMessage' | 'captureReview'> &
  Pick<
    CameraSuccessOperations,
    'onSuccessMessageOk' | 'onSuccessMessageGoToRecords' | 'onCaptureReviewChange' | 'onCaptureReviewCancel' | 'onCaptureReviewSave'
  >;

// コンポーネント
const PermissionLoadingView: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.permissionText}>カメラ権限を確認中...</Text>
  </View>
);

const PermissionRequestView: React.FC<{ onRequestPermission: () => Promise<void> }> = ({ onRequestPermission }) => (
  <View style={styles.permissionScreen}>
    <View style={styles.permissionCard}>
      <Text style={styles.permissionTitle}>撮影を始めるにはカメラ権限が必要です</Text>
      <Text style={styles.permissionText}>
        食事の写真は端末内に保存します。位置情報は今は不要で、許可するとすぐ撮影を始められます。
      </Text>
      <TouchableOpacity style={styles.permissionButton} onPress={onRequestPermission} testID="request-camera-permission-button">
        <Text style={styles.permissionButtonText}>カメラを許可する</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const PermissionDeniedView: React.FC<{ onOpenSettings: () => Promise<void> }> = ({ onOpenSettings }) => (
  <View style={styles.permissionScreen}>
    <View style={styles.permissionCard}>
      <Text style={styles.permissionTitle}>カメラ権限がオフになっています</Text>
      <Text style={styles.permissionText}>
        設定アプリからカメラ権限を許可すると、撮影を再開できます。写真は引き続き端末内保存です。
      </Text>
      <TouchableOpacity style={styles.permissionButton} onPress={onOpenSettings} testID="open-camera-settings-button">
        <Text style={styles.permissionButtonText}>設定を開く</Text>
      </TouchableOpacity>
    </View>
  </View>
);

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
        <Text style={styles.successText} accessibilityLabel="撮影成功メッセージ">
          {message}
        </Text>
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

const FocusArea: React.FC = () => (
  <View style={styles.focusArea}>
    <View style={styles.focusSquare} accessibilityLabel="撮影範囲">
      <Text style={styles.instructionText} accessibilityLabel="撮影ガイド">
        撮影範囲に料理を合わせてください
      </Text>
    </View>
  </View>
);

interface CaptureReviewProps {
  captureReview: CaptureReviewState;
  onChange: (
    field: keyof Omit<CaptureReviewState, 'photoUri' | 'width' | 'height'>,
    value: string | boolean
  ) => void;
  onCancel: () => void;
  onSave: () => Promise<void>;
}

const CaptureReview: React.FC<CaptureReviewProps> = ({ captureReview, onChange, onCancel, onSave }) => (
  <View style={styles.reviewContainer}>
    <View style={styles.reviewCard}>
      <Text style={styles.reviewTitle}>撮影内容を確認</Text>
      <Image source={{ uri: captureReview.photoUri }} style={styles.reviewImage} resizeMode="cover" />
      <TextInput
        style={styles.reviewInput}
        placeholder="料理名"
        value={captureReview.mealName}
        onChangeText={(value) => onChange('mealName', value)}
        testID="meal-name-input"
      />
      <TextInput
        style={styles.reviewInput}
        placeholder="場所"
        value={captureReview.locationName}
        onChangeText={(value) => onChange('locationName', value)}
      />
      <CuisineTypeSelector
        label="料理ジャンル"
        value={captureReview.cuisineType}
        onChange={(value) => onChange('cuisineType', value)}
        testIDPrefix="capture-review-cuisine"
        labelColor={Colors.white}
      />
      <TextInput
        style={[styles.reviewInput, styles.reviewNotes]}
        placeholder="メモ"
        value={captureReview.notes}
        onChangeText={(value) => onChange('notes', value)}
        multiline
      />
      <View style={styles.reviewSwitchRow}>
        <Text style={styles.reviewSwitchLabel}>自炊として記録</Text>
        <Switch value={captureReview.isHomemade} onValueChange={(value) => onChange('isHomemade', value)} />
      </View>
      <View style={styles.reviewButtonRow}>
        <TouchableOpacity style={[styles.reviewButton, styles.reviewCancelButton]} onPress={onCancel}>
          <Text style={styles.reviewCancelText}>キャンセル</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.reviewButton, styles.reviewSaveButton]} onPress={onSave} testID="save-meal-button">
          <Text style={styles.reviewSaveText}>保存</Text>
        </TouchableOpacity>
      </View>
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
  permissionUiState,
  cameraRef,
  successMessage,
  captureReview,
  onClose,
  onTakePicture,
  onFlipCamera,
  onRequestPermission,
  onOpenSettings,
  onSuccessMessageOk,
  onSuccessMessageGoToRecords,
  onCaptureReviewChange,
  onCaptureReviewCancel,
  onCaptureReviewSave,
}) => {
  // 権限チェック（UIロジックのみ）
  // webモードで権限がない場合はモックモードで表示
  const isWebWithoutPermissions = Platform.OS === 'web' && (!cameraPermission || !cameraPermission.granted);

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
          {captureReview ? (
            <CaptureReview
              captureReview={captureReview}
              onChange={onCaptureReviewChange}
              onCancel={onCaptureReviewCancel}
              onSave={onCaptureReviewSave}
            />
          ) : successMessage ? (
            <SuccessMessage message={successMessage} onOk={onSuccessMessageOk} onGoToRecords={onSuccessMessageGoToRecords} />
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
  permissionScreen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: Colors.black,
  },
  permissionCard: {
    backgroundColor: 'rgba(0,0,0,0.88)',
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.white,
    textAlign: 'center',
  },
  permissionText: {
    ...GlobalStyles.body,
    color: Colors.white,
    textAlign: 'center',
  },
  permissionSubText: {
    ...GlobalStyles.body,
    color: Colors.gray,
    textAlign: 'center',
    marginBottom: 50,
  },
  permissionButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  permissionButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
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
  reviewContainer: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  reviewCard: {
    backgroundColor: 'rgba(0,0,0,0.88)',
    borderRadius: 16,
    padding: 16,
    gap: 12,
  },
  reviewTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  reviewImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: Colors.gray,
  },
  reviewInput: {
    backgroundColor: Colors.white,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  reviewNotes: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  reviewSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewSwitchLabel: {
    color: Colors.white,
    fontSize: 16,
  },
  reviewButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  reviewButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  reviewCancelButton: {
    backgroundColor: Colors.white,
  },
  reviewSaveButton: {
    backgroundColor: Colors.primary,
  },
  reviewCancelText: {
    color: Colors.black,
    fontWeight: '600',
  },
  reviewSaveText: {
    color: Colors.white,
    fontWeight: '600',
  },
});

export default CameraView;
