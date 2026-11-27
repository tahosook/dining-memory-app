import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  MEDIAPIPE_CLASSIFIER_MODEL_LIST,
  type MediaPipeClassifierModelId,
} from '../../../ai/mealInputAssist';
import { Colors } from '../../../constants/Colors';

export function MediaPipeModelSelector({
  selectedModelId,
  mediaPipeRuntimeReady,
  fallbackMediaPipeReady,
  onSelectModel,
}: {
  selectedModelId: MediaPipeClassifierModelId;
  mediaPipeRuntimeReady: boolean;
  fallbackMediaPipeReady: boolean;
  onSelectModel: (modelId: MediaPipeClassifierModelId) => void;
}) {
  return (
    <View style={localStyles.modelSelectionBlock} testID="mediapipe-model-selection-section">
      <Text style={localStyles.modelSelectionTitle}>分類モデル</Text>
      <Text style={localStyles.modelSelectionSubtitle}>
        写真から提案する候補の分類体系を選択できます。
      </Text>
      {!mediaPipeRuntimeReady && fallbackMediaPipeReady ? (
        <Text
          style={localStyles.modelSelectionWarningText}
          testID="mediapipe-model-recovery-notice"
        >
          現在選択されているモデルは利用できません。標準モデル（調理法・9クラス）を選択すると復旧できます。
        </Text>
      ) : null}
      {MEDIAPIPE_CLASSIFIER_MODEL_LIST.map(model => {
        const isSelected = selectedModelId === model.id;
        const isAvailable = model.available !== false;
        return (
          <TouchableOpacity
            key={model.id}
            style={[
              localStyles.modelOptionCard,
              isSelected ? localStyles.modelOptionCardSelected : null,
              !isAvailable ? localStyles.modelOptionCardDisabled : null,
            ]}
            onPress={isAvailable ? () => onSelectModel(model.id) : undefined}
            testID={`mediapipe-model-option-${model.id}`}
            accessibilityRole="radio"
            accessibilityState={
              isAvailable ? { selected: isSelected } : { selected: isSelected, disabled: true }
            }
          >
            <View style={localStyles.modelOptionHeader}>
              <View style={localStyles.modelOptionTitleRow}>
                <Text
                  style={[
                    localStyles.modelOptionLabel,
                    isSelected ? localStyles.modelOptionLabelSelected : null,
                    !isAvailable ? localStyles.modelOptionLabelDisabled : null,
                  ]}
                >
                  {model.label}
                </Text>
                {!isAvailable ? (
                  <View style={localStyles.modelUnavailableBadge}>
                    <Text style={localStyles.modelUnavailableBadgeText}>準備中</Text>
                  </View>
                ) : null}
              </View>
              <View
                style={[
                  localStyles.radioIndicator,
                  isSelected ? localStyles.radioIndicatorSelected : null,
                  !isAvailable ? localStyles.radioIndicatorDisabled : null,
                ]}
              >
                {isSelected ? <View style={localStyles.radioIndicatorInner} /> : null}
              </View>
            </View>
            <Text
              style={[
                localStyles.modelOptionDescription,
                !isAvailable ? localStyles.modelOptionDescriptionDisabled : null,
              ]}
            >
              {model.description}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const localStyles = StyleSheet.create({
  modelSelectionBlock: {
    marginTop: 14,
    gap: 8,
  },
  modelSelectionTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  modelSelectionSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.gray,
  },
  modelSelectionWarningText: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.error,
    backgroundColor: '#fde5e5',
    padding: 10,
    borderRadius: 8,
  },
  modelOptionCard: {
    borderWidth: 1,
    borderColor: '#d7d7d7',
    borderRadius: 10,
    padding: 12,
    backgroundColor: Colors.white,
    gap: 4,
  },
  modelOptionCardSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#f5f8ff',
  },
  modelOptionCardDisabled: {
    opacity: 0.55,
    backgroundColor: '#fafafa',
    borderColor: '#e5e5e5',
  },
  modelOptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  modelOptionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modelOptionLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
  },
  modelOptionLabelSelected: {
    color: Colors.primary,
  },
  modelOptionLabelDisabled: {
    color: Colors.gray,
  },
  modelUnavailableBadge: {
    backgroundColor: '#e8e8e8',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  modelUnavailableBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#666666',
  },
  modelOptionDescription: {
    fontSize: 12,
    lineHeight: 17,
    color: Colors.gray,
  },
  modelOptionDescriptionDisabled: {
    color: '#a0a0a0',
  },
  radioIndicator: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#b0b0b0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioIndicatorSelected: {
    borderColor: Colors.primary,
  },
  radioIndicatorDisabled: {
    borderColor: '#d0d0d0',
    backgroundColor: '#f0f0f0',
  },
  radioIndicatorInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.primary,
  },
});
