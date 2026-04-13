import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../../constants/Colors';
import { CuisineTypeSelector } from './CuisineTypeSelector';

export type MealEditDraft = {
  mealName: string;
  cuisineType: string;
  location: string;
  notes: string;
  isHomemade: boolean;
};

export type MealEditModalProps = {
  visible: boolean;
  draft: MealEditDraft;
  onChange: (draft: MealEditDraft) => void;
  onSave: () => void | Promise<void>;
  onClose: () => void;
  saving?: boolean;
  testIDPrefix?: string;
};

export function MealEditModal({
  visible,
  draft,
  onChange,
  onSave,
  onClose,
  saving = false,
  testIDPrefix = 'meal-edit',
}: MealEditModalProps) {
  const updateDraft = <Key extends keyof MealEditDraft,>(key: Key, value: MealEditDraft[Key]) => {
    onChange({ ...draft, [key]: value });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>記録を編集</Text>
          <TextInput
            style={styles.input}
            value={draft.mealName}
            onChangeText={(value) => updateDraft('mealName', value)}
            placeholder="料理名"
            testID={`${testIDPrefix}-meal-name-input`}
          />
          <TextInput
            style={styles.input}
            value={draft.location}
            onChangeText={(value) => updateDraft('location', value)}
            placeholder="場所"
            testID={`${testIDPrefix}-location-input`}
          />
          <CuisineTypeSelector
            value={draft.cuisineType}
            onChange={(value) => updateDraft('cuisineType', value)}
            testIDPrefix={`${testIDPrefix}-cuisine`}
          />
          <TextInput
            style={[styles.input, styles.notesInput]}
            value={draft.notes}
            onChangeText={(value) => updateDraft('notes', value)}
            placeholder="メモ"
            multiline
            testID={`${testIDPrefix}-notes-input`}
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>自炊として記録</Text>
            <Switch
              value={draft.isHomemade}
              onValueChange={(value) => updateDraft('isHomemade', value)}
              testID={`${testIDPrefix}-homemade-switch`}
            />
          </View>
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
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
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
