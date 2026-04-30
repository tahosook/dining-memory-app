import React from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { CuisineTypeSelector } from './CuisineTypeSelector';
import { MealInputAssistSection } from './MealInputAssistSection';
import type {
  MealInputAssistProgress,
  MealInputAssistStatus,
  MealInputAssistSuggestions,
  MealInputAssistTextSuggestion,
} from '../../ai/mealInputAssist';
import type { CookingLevel } from '../../types/MealTypes';
import { formatCookingLevel } from '../../utils/cookingLevel';

export type MealEditDraft = {
  mealName: string;
  cuisineType: string;
  location: string;
  notes: string;
  isHomemade: boolean;
  cookingLevel: CookingLevel | '';
};

export type MealEditModalProps = {
  visible: boolean;
  draft: MealEditDraft;
  onChange: (draft: MealEditDraft) => void;
  onSave: () => void | Promise<void>;
  onClose: () => void;
  saving?: boolean;
  testIDPrefix?: string;
  imageUri?: string;
  onRotateImage?: () => void | Promise<void>;
  rotatingImage?: boolean;
  aiAssistStatus?: MealInputAssistStatus;
  aiAssistSuggestions?: MealInputAssistSuggestions;
  aiAssistErrorMessage?: string | null;
  aiAssistProgress?: MealInputAssistProgress | null;
  aiAssistDisabledReason?: string | null;
  onRequestAiSuggestions?: () => Promise<void>;
  onApplyNoteDraftSuggestion?: (suggestion: MealInputAssistTextSuggestion) => void;
};

export function MealEditModal({
  visible,
  draft,
  onChange,
  onSave,
  onClose,
  saving = false,
  testIDPrefix = 'meal-edit',
  imageUri,
  onRotateImage,
  rotatingImage = false,
  aiAssistStatus,
  aiAssistSuggestions,
  aiAssistErrorMessage = null,
  aiAssistProgress = null,
  aiAssistDisabledReason = null,
  onRequestAiSuggestions,
  onApplyNoteDraftSuggestion,
}: MealEditModalProps) {
  const updateDraft = <Key extends keyof MealEditDraft>(key: Key, value: MealEditDraft[Key]) => {
    onChange({ ...draft, [key]: value });
  };
  const updateHomemade = (value: boolean) => {
    onChange({
      ...draft,
      isHomemade: value,
      cookingLevel: value ? draft.cookingLevel : '',
    });
  };
  const canShowAiAssist = Boolean(
    imageUri &&
    aiAssistStatus &&
    aiAssistSuggestions &&
    onRequestAiSuggestions &&
    onApplyNoteDraftSuggestion
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>記録を編集</Text>
          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {imageUri ? (
              <View style={styles.imageBlock}>
                <Image
                  source={{ uri: imageUri }}
                  style={styles.previewImage}
                  resizeMode="cover"
                  testID={`${testIDPrefix}-image-preview`}
                />
                {onRotateImage ? (
                  <TouchableOpacity
                    style={[
                      styles.rotateButton,
                      saving || rotatingImage ? styles.rotateButtonDisabled : null,
                    ]}
                    onPress={onRotateImage}
                    disabled={saving || rotatingImage}
                    testID={`${testIDPrefix}-rotate-image-button`}
                  >
                    <Text style={styles.rotateButtonText}>
                      {rotatingImage ? '回転中...' : '右に90°回転'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            ) : null}
            <TextInput
              style={styles.input}
              value={draft.mealName}
              onChangeText={value => updateDraft('mealName', value)}
              placeholder="料理名"
              testID={`${testIDPrefix}-meal-name-input`}
            />
            <TextInput
              style={styles.input}
              value={draft.location}
              onChangeText={value => updateDraft('location', value)}
              placeholder="場所"
              testID={`${testIDPrefix}-location-input`}
            />
            <CuisineTypeSelector
              value={draft.cuisineType}
              onChange={value => updateDraft('cuisineType', value)}
              testIDPrefix={`${testIDPrefix}-cuisine`}
            />
            {canShowAiAssist &&
            aiAssistStatus &&
            aiAssistSuggestions &&
            onRequestAiSuggestions &&
            onApplyNoteDraftSuggestion ? (
              <MealInputAssistSection
                status={aiAssistStatus}
                suggestions={aiAssistSuggestions}
                errorMessage={aiAssistErrorMessage}
                progress={aiAssistProgress}
                disabledReason={aiAssistDisabledReason}
                onRequestSuggestions={onRequestAiSuggestions}
                onApplyNoteDraftSuggestion={onApplyNoteDraftSuggestion}
                variant="light"
                testIDs={{
                  section: `${testIDPrefix}-ai-input-assist-section`,
                  status: `${testIDPrefix}-ai-input-assist-status`,
                  button: `${testIDPrefix}-ai-input-assist-button`,
                  progress: `${testIDPrefix}-ai-input-assist-progress`,
                  noteDraftCard: `${testIDPrefix}-ai-note-draft-card`,
                  noteDraftApplyButton: `${testIDPrefix}-ai-note-draft-apply-button`,
                }}
              />
            ) : null}
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={draft.notes}
              onChangeText={value => updateDraft('notes', value)}
              placeholder="メモ"
              multiline
              testID={`${testIDPrefix}-notes-input`}
            />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>自炊として記録</Text>
              <Switch
                value={draft.isHomemade}
                onValueChange={updateHomemade}
                testID={`${testIDPrefix}-homemade-switch`}
              />
            </View>
            {draft.isHomemade ? (
              <View style={styles.styleBlock}>
                <Text style={styles.fieldLabel}>自炊スタイル</Text>
                <View style={styles.segmentedRow}>
                  {(['quick', 'daily', 'gourmet'] as const).map(level => {
                    const selected = draft.cookingLevel === level;
                    return (
                      <TouchableOpacity
                        key={level}
                        style={[
                          styles.segmentButton,
                          selected ? styles.segmentButtonSelected : null,
                        ]}
                        onPress={() => updateDraft('cookingLevel', level)}
                        testID={`${testIDPrefix}-cooking-level-${level}`}
                      >
                        <Text
                          style={[
                            styles.segmentButtonText,
                            selected ? styles.segmentButtonTextSelected : null,
                          ]}
                        >
                          {formatCookingLevel(level)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ) : null}
          </ScrollView>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              disabled={saving}
              testID={`${testIDPrefix}-close-button`}
            >
              <Text style={styles.cancelText}>閉じる</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.saveButton, saving && styles.saveButtonDisabled]}
              onPress={onSave}
              disabled={saving}
              testID={`${testIDPrefix}-save-button`}
            >
              {saving ? (
                <View style={styles.savingContent}>
                  <ActivityIndicator size="small" color={Colors.white} />
                  <Text style={styles.saveText}>保存中...</Text>
                </View>
              ) : (
                <Text style={styles.saveText}>保存</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 20,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 14,
    padding: 16,
    gap: 12,
    maxHeight: '90%',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  formScroll: {
    flexShrink: 1,
  },
  formContent: {
    gap: 12,
    paddingBottom: 4,
  },
  imageBlock: {
    gap: 8,
  },
  previewImage: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    backgroundColor: '#e9ecef',
  },
  rotateButton: {
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  rotateButtonDisabled: {
    opacity: 0.6,
  },
  rotateButtonText: {
    color: Colors.primary,
    fontWeight: '700',
  },
  input: {
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  notesInput: {
    minHeight: 90,
    textAlignVertical: 'top',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchLabel: {
    fontSize: 15,
    color: Colors.text,
  },
  styleBlock: {
    gap: 8,
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  segmentedRow: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  segmentButtonSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#eaf4ff',
  },
  segmentButtonText: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600',
  },
  segmentButtonTextSelected: {
    color: Colors.primary,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: Colors.lightGray,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.8,
  },
  cancelText: {
    color: Colors.text,
    fontWeight: '600',
  },
  saveText: {
    color: Colors.white,
    fontWeight: '600',
  },
  savingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
});
