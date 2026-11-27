import React from 'react';
import {
  ActivityIndicator,
  Image,
  type LayoutChangeEvent,
  ScrollView,
  type ScrollViewInstance,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../../../constants/Colors';
import { GlobalStyles } from '../../../constants/Styles';
import { CuisineTypeSelector } from '../../../components/common/CuisineTypeSelector';
import {
  MealInputAssistSection,
  type MealInputAssistUiProps,
} from '../../common/MealInputAssistSection';
import type {
  CaptureReviewEditableField,
  CaptureReviewState,
} from '../../../hooks/cameraCapture/useCameraCapture';

interface RevealableReviewFieldProps {
  placeholder: string;
  triggerLabel: string;
  accessibilityLabel: string;
  value: string;
  visible: boolean;
  onPress: () => void;
  onChange: (value: string) => void;
  onLayout: (event: LayoutChangeEvent) => void;
  multiline?: boolean;
  testID: string;
}

const RevealableReviewField: React.FC<RevealableReviewFieldProps> = ({
  placeholder,
  triggerLabel,
  accessibilityLabel,
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
        accessibilityLabel={accessibilityLabel}
      />
    ) : (
      <TouchableOpacity
        style={styles.reviewCompactButton}
        onPress={onPress}
        testID={`${testID}-trigger`}
        accessibilityRole="button"
      >
        <Text style={styles.reviewCompactButtonText}>{triggerLabel}</Text>
      </TouchableOpacity>
    )}
  </View>
);

export interface CaptureReviewProps {
  captureReview: CaptureReviewState;
  savingCapture: boolean;
  aiAssist: MealInputAssistUiProps;
  onChange: (field: CaptureReviewEditableField, value: string | boolean) => void;
  onCancel: () => void;
  onSave: () => Promise<void>;
}

export const CaptureReview: React.FC<CaptureReviewProps> = ({
  captureReview,
  savingCapture,
  aiAssist,
  onChange,
  onCancel,
  onSave,
}) => {
  const [showLocationInput, setShowLocationInput] = React.useState(
    Boolean(captureReview.locationName.trim())
  );
  const [showNotesInput, setShowNotesInput] = React.useState(Boolean(captureReview.notes.trim()));
  const reviewScrollViewRef = React.useRef<ScrollViewInstance | null>(null);
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

          <MealInputAssistSection {...aiAssist} variant="dark" />

          <TextInput
            style={styles.reviewInput}
            placeholder="料理名（入力しない場合は自動で名前が付きます）"
            placeholderTextColor={Colors.gray}
            value={captureReview.mealName}
            onChangeText={value => onChange('mealName', value)}
            testID="meal-name-input"
            accessibilityLabel="料理名"
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
              accessibilityRole="switch"
              accessibilityLabel="自炊"
              accessibilityState={{ checked: captureReview.isHomemade }}
              testID="homemade-switch"
            />
          </View>

          <RevealableReviewField
            placeholder="場所"
            triggerLabel="場所を追加"
            accessibilityLabel="場所"
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
            accessibilityLabel="メモ"
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
            style={[
              styles.reviewButton,
              styles.reviewCancelButton,
              savingCapture && styles.reviewButtonDisabled,
            ]}
            onPress={onCancel}
            disabled={savingCapture}
            testID="cancel-capture-review-button"
            accessibilityRole="button"
            accessibilityState={{ disabled: savingCapture }}
          >
            <Text style={styles.reviewCancelText}>キャンセル</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.reviewButton,
              styles.reviewSaveButton,
              savingCapture && styles.reviewSaveButtonDisabled,
            ]}
            onPress={onSave}
            disabled={savingCapture}
            testID="save-meal-button"
            accessibilityRole="button"
            accessibilityLabel={savingCapture ? '保存中' : '保存'}
            accessibilityState={{ disabled: savingCapture, busy: savingCapture }}
          >
            {savingCapture ? (
              <View style={styles.reviewSavingContent}>
                <ActivityIndicator size="small" color={Colors.white} />
                <Text style={styles.reviewSaveText}>保存中...</Text>
              </View>
            ) : (
              <Text style={styles.reviewSaveText}>保存</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
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
  reviewButtonDisabled: {
    opacity: 0.55,
  },
  reviewSaveButton: {
    backgroundColor: Colors.primary,
  },
  reviewSaveButtonDisabled: {
    opacity: 0.55,
  },
  reviewSavingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
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
