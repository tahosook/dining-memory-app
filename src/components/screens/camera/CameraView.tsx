import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Image,
  TextInput,
  Switch,
  ScrollView,
  Platform,
  type LayoutChangeEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  CameraView as ExpoCameraView,
  PermissionResponse,
  CameraView as CameraViewType,
} from 'expo-camera';
import { Colors } from '../../../constants/Colors';
import { GlobalStyles } from '../../../constants/Styles';
import { PLATFORM_CONFIGS, CAMERA_CONSTANTS } from '../../../constants/CameraConstants';
import { ErrorBoundary } from '../../../components/common/ErrorBoundary';
import { CuisineTypeSelector } from '../../../components/common/CuisineTypeSelector';
import { MealInputAssistSection } from '../../common/MealInputAssistSection';
import type { CameraPermissionUiState } from '../../../hooks/cameraCapture';
import type {
  CaptureReviewEditableField,
  CaptureReviewState,
} from '../../../hooks/cameraCapture/useCameraCapture';
import type {
  MealInputAssistProgress,
  MealInputAssistStatus,
  MealInputAssistSuggestions,
  MealInputAssistTextSuggestion,
} from '../../../ai/mealInputAssist';
import TopBar from './TopBar';
import CaptureButton from './CaptureButton';

const { width: screenWidth } = Dimensions.get('window');

const platformConfig =
  PLATFORM_CONFIGS[Platform.OS as keyof typeof PLATFORM_CONFIGS] || PLATFORM_CONFIGS.default;
const safeAreaEdges = platformConfig.safeAreaEdges as ('top' | 'bottom' | 'left' | 'right')[];
const bottomBarMarginBottom = platformConfig.bottomBarMarginBottom;

type CameraLogicState = {
  takingPhoto: boolean;
  facing: 'front' | 'back';
  cameraRef: React.RefObject<CameraViewType | null>;
};

type CameraOperations = {
  onTakePicture: () => Promise<void>;
  onAddPhotoFromLibrary: () => Promise<void>;
  onFlipCamera: () => void;
  onClose: () => void;
  onRequestPermission: () => Promise<void>;
  onOpenSettings: () => Promise<void>;
};

type CameraPermissionState = {
  cameraPermission: PermissionResponse | null;
  permissionUiState: CameraPermissionUiState;
};

type CameraReviewState = {
  captureReview: CaptureReviewState | null;
};

type CameraReviewOperations = {
  onCaptureReviewChange: (field: CaptureReviewEditableField, value: string | boolean) => void;
  onCaptureReviewCancel: () => void;
  onCaptureReviewSave: () => Promise<void>;
};

type CameraAiAssistState = {
  aiAssistStatus: MealInputAssistStatus;
  aiAssistSuggestions: MealInputAssistSuggestions;
  aiAssistErrorMessage: string | null;
  aiAssistProgress: MealInputAssistProgress | null;
  aiAssistDisabledReason: string | null;
};

type CameraAiAssistOperations = {
  onRequestAiSuggestions: () => Promise<void>;
  onApplyNoteDraftSuggestion: (suggestion: MealInputAssistTextSuggestion) => void;
};

export type CameraViewProps = Pick<CameraLogicState, 'takingPhoto' | 'facing' | 'cameraRef'> &
  Pick<
    CameraOperations,
    'onTakePicture' | 'onAddPhotoFromLibrary' | 'onFlipCamera' | 'onClose' | 'onRequestPermission' | 'onOpenSettings'
  > &
  Pick<CameraPermissionState, 'cameraPermission' | 'permissionUiState'> &
  Pick<CameraReviewState, 'captureReview'> &
  Pick<
    CameraReviewOperations,
    'onCaptureReviewChange' | 'onCaptureReviewCancel' | 'onCaptureReviewSave'
  > &
  Pick<
    CameraAiAssistState,
    | 'aiAssistStatus'
    | 'aiAssistSuggestions'
    | 'aiAssistErrorMessage'
    | 'aiAssistProgress'
    | 'aiAssistDisabledReason'
  > &
  Pick<CameraAiAssistOperations, 'onRequestAiSuggestions' | 'onApplyNoteDraftSuggestion'>;

interface RevealableReviewFieldProps {
  placeholder: string;
  triggerLabel: string;
  value: string;
  visible: boolean;
  onPress: () => void;
  onChange: (value: string) => void;
  onLayout: (event: LayoutChangeEvent) => void;
  multiline?: boolean;
  testID: string;
}

const PermissionLoadingView: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.permissionText}>カメラ権限を確認中...</Text>
  </View>
);

const PermissionRequestView: React.FC<{ onRequestPermission: () => Promise<void> }> = ({
  onRequestPermission,
}) => (
  <View style={styles.permissionScreen}>
    <View style={styles.permissionCard}>
      <Text style={styles.permissionTitle}>撮影を始めるにはカメラ権限が必要です</Text>
      <Text style={styles.permissionText}>
        食事の写真は端末内に保存します。保存時には現在地を内部利用して、同じ場所の記録をまとめやすくします。
      </Text>
      <TouchableOpacity
        style={styles.permissionButton}
        onPress={onRequestPermission}
        testID="request-camera-permission-button"
      >
        <Text style={styles.permissionButtonText}>カメラを許可する</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const PermissionDeniedView: React.FC<{ onOpenSettings: () => Promise<void> }> = ({
  onOpenSettings,
}) => (
  <View style={styles.permissionScreen}>
    <View style={styles.permissionCard}>
      <Text style={styles.permissionTitle}>カメラ権限がオフになっています</Text>
      <Text style={styles.permissionText}>
        設定アプリからカメラ権限を許可すると、撮影を再開できます。写真と位置情報は引き続き端末内中心で扱います。
      </Text>
      <TouchableOpacity
        style={styles.permissionButton}
        onPress={onOpenSettings}
        testID="open-camera-settings-button"
      >
        <Text style={styles.permissionButtonText}>設定を開く</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const FocusArea: React.FC = () => (
  <View style={styles.focusArea}>
    <View style={styles.focusSquare} accessibilityLabel="撮影範囲">
      <Text style={styles.instructionText} accessibilityLabel="撮影ガイド">
        撮影範囲に料理を合わせてください
      </Text>
    </View>
  </View>
);

const RevealableReviewField: React.FC<RevealableReviewFieldProps> = ({
  placeholder,
  triggerLabel,
  value,
  visible,
  onPress,
  onChange,
  onLayout,
  multiline = false,
  testID,
}) => (
  <View onLayout={onLayout}>
    {visible ? (
      <TextInput
        style={[styles.reviewInput, multiline && styles.reviewNotes]}
        placeholder={placeholder}
        placeholderTextColor={Colors.gray}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        testID={testID}
      />
    ) : (
      <TouchableOpacity
        style={styles.reviewCompactButton}
        onPress={onPress}
        testID={`${testID}-trigger`}
      >
        <Text style={styles.reviewCompactButtonText}>{triggerLabel}</Text>
      </TouchableOpacity>
    )}
  </View>
);

interface CaptureReviewProps {
  captureReview: CaptureReviewState;
  onChange: (field: CaptureReviewEditableField, value: string | boolean) => void;
  onCancel: () => void;
  onSave: () => Promise<void>;
  aiAssistStatus: MealInputAssistStatus;
  aiAssistSuggestions: MealInputAssistSuggestions;
  aiAssistErrorMessage: string | null;
  aiAssistProgress: MealInputAssistProgress | null;
  aiAssistDisabledReason: string | null;
  onRequestAiSuggestions: () => Promise<void>;
  onApplyNoteDraftSuggestion: (suggestion: MealInputAssistTextSuggestion) => void;
}

const CaptureReview: React.FC<CaptureReviewProps> = ({
  captureReview,
  onChange,
  onCancel,
  onSave,
  aiAssistStatus,
  aiAssistSuggestions,
  aiAssistErrorMessage,
  aiAssistProgress,
  aiAssistDisabledReason,
  onRequestAiSuggestions,
  onApplyNoteDraftSuggestion,
}) => {
  const [showLocationInput, setShowLocationInput] = React.useState(
    Boolean(captureReview.locationName.trim())
  );
  const [showNotesInput, setShowNotesInput] = React.useState(Boolean(captureReview.notes.trim()));
  const reviewScrollViewRef = React.useRef<ScrollView | null>(null);
  const [sectionOffsets, setSectionOffsets] = React.useState({ location: 0, notes: 0 });

  React.useEffect(() => {
    if (captureReview.locationName.trim()) {
      setShowLocationInput(true);
    }

    if (captureReview.notes.trim()) {
      setShowNotesInput(true);
    }
  }, [captureReview.locationName, captureReview.notes]);

  const revealField = React.useCallback(
    (field: 'location' | 'notes') => {
      if (field === 'location') {
        setShowLocationInput(true);
      } else {
        setShowNotesInput(true);
      }

      setTimeout(() => {
        reviewScrollViewRef.current?.scrollTo({
          y: Math.max(sectionOffsets[field] - 24, 0),
          animated: true,
        });
      }, 0);
    },
    [sectionOffsets]
  );

  const updateSectionOffset = React.useCallback(
    (field: 'location' | 'notes', event: LayoutChangeEvent) => {
      const nextY = event.nativeEvent.layout.y;
      setSectionOffsets(current =>
        current[field] === nextY ? current : { ...current, [field]: nextY }
      );
    },
    []
  );

  return (
    <View style={styles.reviewContainer} testID="capture-review-container">
      <View style={styles.reviewCard}>
        <ScrollView
          ref={reviewScrollViewRef}
          style={styles.reviewScroll}
          contentContainerStyle={styles.reviewScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.reviewTitle}>撮影内容を確認</Text>
          {captureReview.source === 'library' ? (
            <Text style={styles.reviewSubtext}>選択した写真から記録を作成します</Text>
          ) : null}
          <Image
            source={{ uri: captureReview.photoUri }}
            style={styles.reviewImage}
            resizeMode="cover"
          />

          <MealInputAssistSection
            status={aiAssistStatus}
            suggestions={aiAssistSuggestions}
            errorMessage={aiAssistErrorMessage}
            progress={aiAssistProgress}
            disabledReason={aiAssistDisabledReason}
            onRequestSuggestions={onRequestAiSuggestions}
            onApplyNoteDraftSuggestion={onApplyNoteDraftSuggestion}
            variant="dark"
          />

          <TextInput
            style={styles.reviewInput}
            placeholder="料理名（入力しない場合は自動で名前が付きます）"
            placeholderTextColor={Colors.gray}
            value={captureReview.mealName}
            onChangeText={value => onChange('mealName', value)}
            testID="meal-name-input"
          />

          <CuisineTypeSelector
            value={captureReview.cuisineType}
            onChange={value => onChange('cuisineType', value)}
            testIDPrefix="capture-review-cuisine"
            labelColor={Colors.white}
            showLabel={false}
          />

          <View style={styles.reviewSwitchRow}>
            <Text style={styles.reviewSwitchLabel}>自炊</Text>
            <Switch
              value={captureReview.isHomemade}
              onValueChange={value => onChange('isHomemade', value)}
            />
          </View>

          <RevealableReviewField
            placeholder="場所"
            triggerLabel="場所を追加"
            value={captureReview.locationName}
            visible={showLocationInput}
            onPress={() => revealField('location')}
            onChange={value => onChange('locationName', value)}
            onLayout={event => updateSectionOffset('location', event)}
            testID="location-input"
          />

          <RevealableReviewField
            placeholder="メモ"
            triggerLabel="メモを追加"
            value={captureReview.notes}
            visible={showNotesInput}
            onPress={() => revealField('notes')}
            onChange={value => onChange('notes', value)}
            onLayout={event => updateSectionOffset('notes', event)}
            multiline
            testID="notes-input"
          />
        </ScrollView>

        <View style={styles.reviewButtonRow}>
          <TouchableOpacity
            style={[styles.reviewButton, styles.reviewCancelButton]}
            onPress={onCancel}
          >
            <Text style={styles.reviewCancelText}>キャンセル</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.reviewButton, styles.reviewSaveButton]}
            onPress={onSave}
            testID="save-meal-button"
          >
            <Text style={styles.reviewSaveText}>保存</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

interface BottomControlsProps {
  takingPhoto: boolean;
  onTakePicture: () => Promise<void>;
  onAddPhotoFromLibrary: () => Promise<void>;
}

const BottomControls: React.FC<BottomControlsProps> = ({ takingPhoto, onTakePicture, onAddPhotoFromLibrary }) => (
  <View style={[styles.bottomBar, { marginBottom: bottomBarMarginBottom }]}>
    <View style={styles.buttonGroup}>
      <CaptureButton takingPhoto={takingPhoto} onPress={onTakePicture} />
      <TouchableOpacity style={styles.secondaryActionButton} onPress={onAddPhotoFromLibrary} testID="add-photo-from-library-button">
        <Text style={styles.secondaryActionButtonText}>写真から追加</Text>
      </TouchableOpacity>
      <Text style={styles.captureHint} accessibilityLabel="カメラ操作ガイド">
        ボタンをタップして撮影
      </Text>
    </View>
  </View>
);

const CameraView: React.FC<CameraViewProps> = ({
  takingPhoto,
  facing,
  cameraPermission,
  permissionUiState,
  cameraRef,
  captureReview,
  onClose,
  onTakePicture,
  onAddPhotoFromLibrary,
  onFlipCamera,
  onRequestPermission,
  onOpenSettings,
  onCaptureReviewChange,
  onCaptureReviewCancel,
  onCaptureReviewSave,
  aiAssistStatus,
  aiAssistSuggestions,
  aiAssistErrorMessage,
  aiAssistProgress,
  aiAssistDisabledReason,
  onRequestAiSuggestions,
  onApplyNoteDraftSuggestion,
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
        <ExpoCameraView
          style={styles.camera}
          facing={facing}
          mode="picture"
          ratio="16:9"
          ref={cameraRef}
        />
        {captureReview ? <View style={styles.cameraReviewBackdrop} pointerEvents="none" /> : null}

        <View style={styles.overlay}>
          <TopBar onClosePress={onClose} onFlipPress={onFlipCamera} />

          {captureReview ? (
            <CaptureReview
              captureReview={captureReview}
              onChange={onCaptureReviewChange}
              onCancel={onCaptureReviewCancel}
              onSave={onCaptureReviewSave}
              aiAssistStatus={aiAssistStatus}
              aiAssistSuggestions={aiAssistSuggestions}
              aiAssistErrorMessage={aiAssistErrorMessage}
              aiAssistProgress={aiAssistProgress}
              aiAssistDisabledReason={aiAssistDisabledReason}
              onRequestAiSuggestions={onRequestAiSuggestions}
              onApplyNoteDraftSuggestion={onApplyNoteDraftSuggestion}
            />
          ) : (
            <FocusArea />
          )}

          {!captureReview ? (
            <BottomControls takingPhoto={takingPhoto} onTakePicture={onTakePicture} onAddPhotoFromLibrary={onAddPhotoFromLibrary} />
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
  focusArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  focusSquare: {
    width: screenWidth * CAMERA_CONSTANTS.FOCUS_AREA_RATIO,
    height:
      (screenWidth * CAMERA_CONSTANTS.FOCUS_AREA_RATIO) / CAMERA_CONSTANTS.FOCUS_AREA_ASPECT_RATIO,
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
    gap: 12,
  },
  secondaryActionButton: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  secondaryActionButtonText: {
    color: Colors.white,
    fontSize: 14,
    fontWeight: '600',
  },
  captureHint: {
    ...GlobalStyles.body,
    color: Colors.white,
  },
  reviewContainer: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  reviewCard: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    borderRadius: 16,
    padding: 16,
  },
  reviewScroll: {
    flex: 1,
  },
  reviewScrollContent: {
    gap: 14,
    paddingBottom: 16,
  },
  reviewTitle: {
    color: Colors.white,
    fontSize: 18,
    fontWeight: '700',
  },
  reviewSubtext: {
    color: '#d7dce1',
    fontSize: 13,
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
    color: Colors.text,
  },
  reviewNotes: {
    minHeight: 84,
    textAlignVertical: 'top',
  },
  reviewCompactButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  reviewCompactButtonText: {
    ...GlobalStyles.body,
    color: '#d7dce1',
  },
  reviewSwitchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  reviewSwitchLabel: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: '600',
  },
  reviewButtonRow: {
    flexDirection: 'row',
    gap: 12,
    paddingTop: 12,
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
