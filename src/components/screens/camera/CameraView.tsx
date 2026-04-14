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
import { CameraView as ExpoCameraView, PermissionResponse, CameraView as CameraViewType } from 'expo-camera';
import { Colors } from '../../../constants/Colors';
import { GlobalStyles } from '../../../constants/Styles';
import { PLATFORM_CONFIGS, CAMERA_CONSTANTS } from '../../../constants/CameraConstants';
import { ErrorBoundary } from '../../../components/common/ErrorBoundary';
import { CuisineTypeSelector } from '../../../components/common/CuisineTypeSelector';
import type { CameraPermissionUiState } from '../../../hooks/cameraCapture';
import type { CaptureReviewState } from '../../../hooks/cameraCapture/useCameraCapture';
import TopBar from './TopBar';
import CaptureButton from './CaptureButton';

const { width: screenWidth } = Dimensions.get('window');

const platformConfig = PLATFORM_CONFIGS[Platform.OS as keyof typeof PLATFORM_CONFIGS] || PLATFORM_CONFIGS.default;
const safeAreaEdges = platformConfig.safeAreaEdges as ('top' | 'bottom' | 'left' | 'right')[];
const bottomBarMarginBottom = platformConfig.bottomBarMarginBottom;

const REVIEW_HELP_TEXT = {
  mealName: '料理名やメニュー名を入れておくと、あとで探しやすくなります。',
  cuisineType: '和食・洋食など、あとで振り返りやすい分類を選びます。',
  isHomemade: '自宅で作った料理ならオンのままにしてください。',
  location: '店名・施設名・自宅など、食べた場所を記録できます。',
  notes: '味や量、その日のことなど自由に残せます。',
} as const;

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

type ExpandableField = 'location' | 'notes' | null;

interface ReviewSectionProps {
  label: string;
  helpText: string;
  children: React.ReactNode;
}

interface ExpandableReviewFieldProps {
  field: Exclude<ExpandableField, null>;
  label: string;
  helpText: string;
  placeholder: string;
  value: string;
  expandedField: ExpandableField;
  onPress: (field: Exclude<ExpandableField, null>) => void;
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

const PermissionRequestView: React.FC<{ onRequestPermission: () => Promise<void> }> = ({ onRequestPermission }) => (
  <View style={styles.permissionScreen}>
    <View style={styles.permissionCard}>
      <Text style={styles.permissionTitle}>撮影を始めるにはカメラ権限が必要です</Text>
      <Text style={styles.permissionText}>
        食事の写真は端末内に保存します。保存時には現在地を内部利用して、同じ場所の記録をまとめやすくします。
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
        設定アプリからカメラ権限を許可すると、撮影を再開できます。写真と位置情報は引き続き端末内中心で扱います。
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

const ReviewSection: React.FC<ReviewSectionProps> = ({ label, helpText, children }) => (
  <View style={styles.reviewSection}>
    <Text style={styles.reviewSectionLabel}>{label}</Text>
    <Text style={styles.reviewHelpText}>{helpText}</Text>
    {children}
  </View>
);

const ExpandableReviewField: React.FC<ExpandableReviewFieldProps> = ({
  field,
  label,
  helpText,
  placeholder,
  value,
  expandedField,
  onPress,
  onChange,
  onLayout,
  multiline = false,
  testID,
}) => {
  const isExpanded = expandedField === field;
  const summary = value.trim() || placeholder;

  return (
    <View onLayout={onLayout} style={styles.reviewSection}>
      <Text style={styles.reviewSectionLabel}>{label}</Text>
      <Text style={styles.reviewHelpText}>{helpText}</Text>
      <TouchableOpacity
        style={[styles.expandableField, isExpanded && styles.expandableFieldActive]}
        onPress={() => onPress(field)}
        testID={testID}
      >
        <Text style={[styles.expandableFieldText, !value.trim() && styles.expandableFieldPlaceholder]}>{summary}</Text>
        <Text style={styles.expandableFieldAction}>{isExpanded ? '閉じる' : '入力する'}</Text>
      </TouchableOpacity>
      {isExpanded ? (
        <TextInput
          style={[styles.reviewInput, multiline && styles.reviewNotes]}
          placeholder={placeholder}
          placeholderTextColor={Colors.gray}
          value={value}
          onChangeText={onChange}
          multiline={multiline}
          testID={`${testID}-input`}
        />
      ) : null}
    </View>
  );
};

interface CaptureReviewProps {
  captureReview: CaptureReviewState;
  onChange: (
    field: keyof Omit<CaptureReviewState, 'photoUri' | 'width' | 'height'>,
    value: string | boolean
  ) => void;
  onCancel: () => void;
  onSave: () => Promise<void>;
}

const CaptureReview: React.FC<CaptureReviewProps> = ({ captureReview, onChange, onCancel, onSave }) => {
  const [expandedField, setExpandedField] = React.useState<ExpandableField>(null);
  const [reviewScrollView, setReviewScrollView] = React.useState<ScrollView | null>(null);
  const [sectionOffsets, setSectionOffsets] = React.useState({ location: 0, notes: 0 });

  const openField = React.useCallback(
    (field: Exclude<ExpandableField, null>) => {
      setExpandedField((current) => current === field ? null : field);
      setTimeout(() => {
        reviewScrollView?.scrollTo({
          y: Math.max(sectionOffsets[field] - 24, 0),
          animated: true,
        });
      }, 0);
    },
    [reviewScrollView, sectionOffsets]
  );

  const updateSectionOffset = React.useCallback(
    (field: Exclude<ExpandableField, null>, event: LayoutChangeEvent) => {
      const nextY = event.nativeEvent.layout.y;
      setSectionOffsets((current) => current[field] === nextY ? current : { ...current, [field]: nextY });
    },
    []
  );

  return (
    <View style={styles.reviewContainer}>
      <View style={styles.reviewCard}>
        <ScrollView
          ref={setReviewScrollView}
          style={styles.reviewScroll}
          contentContainerStyle={styles.reviewScrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.reviewTitle}>撮影内容を確認</Text>
          <Image source={{ uri: captureReview.photoUri }} style={styles.reviewImage} resizeMode="cover" />

          <ReviewSection label="料理名" helpText={REVIEW_HELP_TEXT.mealName}>
            <TextInput
              style={styles.reviewInput}
              placeholder="例: 親子丼 / マルゲリータ"
              placeholderTextColor={Colors.gray}
              value={captureReview.mealName}
              onChangeText={(value) => onChange('mealName', value)}
              testID="meal-name-input"
            />
          </ReviewSection>

          <ReviewSection label="料理ジャンル" helpText={REVIEW_HELP_TEXT.cuisineType}>
            <CuisineTypeSelector
              label="料理ジャンル"
              value={captureReview.cuisineType}
              onChange={(value) => onChange('cuisineType', value)}
              testIDPrefix="capture-review-cuisine"
              labelColor={Colors.white}
            />
          </ReviewSection>

          <ReviewSection label="自炊" helpText={REVIEW_HELP_TEXT.isHomemade}>
            <View style={styles.reviewSwitchRow}>
              <Text style={styles.reviewSwitchLabel}>{captureReview.isHomemade ? '自炊として記録する' : '外食・購入品として記録する'}</Text>
              <Switch value={captureReview.isHomemade} onValueChange={(value) => onChange('isHomemade', value)} />
            </View>
          </ReviewSection>

          <ExpandableReviewField
            field="location"
            label="場所"
            helpText={REVIEW_HELP_TEXT.location}
            placeholder="例: 自宅 / 渋谷ヒカリエ / 〇〇食堂"
            value={captureReview.locationName}
            expandedField={expandedField}
            onPress={openField}
            onChange={(value) => onChange('locationName', value)}
            onLayout={(event) => updateSectionOffset('location', event)}
            testID="location-field-toggle"
          />

          <ExpandableReviewField
            field="notes"
            label="メモ"
            helpText={REVIEW_HELP_TEXT.notes}
            placeholder="例: 少し辛め / 友人と夕食 / また食べたい"
            value={captureReview.notes}
            expandedField={expandedField}
            onPress={openField}
            onChange={(value) => onChange('notes', value)}
            onLayout={(event) => updateSectionOffset('notes', event)}
            multiline
            testID="notes-field-toggle"
          />
        </ScrollView>

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
};

interface BottomControlsProps {
  takingPhoto: boolean;
  onTakePicture: () => Promise<void>;
}

const BottomControls: React.FC<BottomControlsProps> = ({ takingPhoto, onTakePicture }) => (
  <View style={[styles.bottomBar, { marginBottom: bottomBarMarginBottom }]}>
    <View style={styles.buttonGroup}>
      <CaptureButton takingPhoto={takingPhoto} onPress={onTakePicture} />
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
        <ExpoCameraView style={styles.camera} facing={facing} mode="picture" ratio="16:9" ref={cameraRef} />

        <View style={styles.overlay}>
          <TopBar onClosePress={onClose} onFlipPress={onFlipCamera} />

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

          {!captureReview ? (
            <BottomControls takingPhoto={takingPhoto} onTakePicture={onTakePicture} />
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
    height: (screenWidth * CAMERA_CONSTANTS.FOCUS_AREA_RATIO) / CAMERA_CONSTANTS.FOCUS_AREA_ASPECT_RATIO,
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
    paddingTop: 72,
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
  reviewImage: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    backgroundColor: Colors.gray,
  },
  reviewSection: {
    gap: 8,
  },
  reviewSectionLabel: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
  reviewHelpText: {
    ...GlobalStyles.body,
    color: '#b5bbc2',
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
  expandableField: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  expandableFieldActive: {
    borderColor: 'rgba(255,255,255,0.32)',
  },
  expandableFieldText: {
    ...GlobalStyles.body,
    color: Colors.white,
  },
  expandableFieldPlaceholder: {
    color: '#b5bbc2',
  },
  expandableFieldAction: {
    fontSize: 13,
    fontWeight: '600',
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
    flex: 1,
    marginRight: 12,
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
