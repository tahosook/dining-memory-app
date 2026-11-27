import React from 'react';
import {
  Image,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Colors } from '../../../constants/Colors';

interface MealShareComposerModalProps {
  visible: boolean;
  photoUri: string | undefined;
  shareText: string;
  onChangeShareText: (text: string) => void;
  onClose: () => void;
  onSubmit: () => void | Promise<void>;
}

export const MealShareComposerModal: React.FC<MealShareComposerModalProps> = ({
  visible,
  photoUri,
  shareText,
  onChangeShareText,
  onClose,
  onSubmit,
}) => (
  <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
    <View style={styles.modalBackdrop}>
      <View style={styles.shareCard}>
        <Text style={styles.shareTitle}>共有する前に確認</Text>
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={styles.sharePreviewImage}
            resizeMode="cover"
            testID="share-preview-image"
          />
        ) : null}
        <TextInput
          style={styles.shareInput}
          value={shareText}
          onChangeText={onChangeShareText}
          placeholder="写真のみ共有されます（テキストを追加可能）"
          multiline
          testID="share-text-input"
        />
        {Platform.OS === 'android' && photoUri ? (
          <Text style={styles.shareNote}>写真を共有します。投稿文は共有先で調整できます。</Text>
        ) : null}
        <View style={styles.shareButtonRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={onClose}
            testID="share-cancel-button"
            accessibilityRole="button"
            accessibilityLabel="閉じる"
          >
            <Text style={styles.secondaryButtonText}>閉じる</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={onSubmit}
            testID="share-submit-button"
            accessibilityRole="button"
            accessibilityLabel="共有を開く"
          >
            <Text style={styles.primaryButtonText}>共有を開く</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  shareCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 14,
  },
  shareTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  sharePreviewImage: {
    width: '100%',
    height: 200,
    borderRadius: 14,
    backgroundColor: '#e9ecef',
  },
  shareInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  shareNote: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.gray,
  },
  shareButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d9d9d9',
  },
  secondaryButtonText: {
    color: Colors.text,
    fontWeight: '600',
  },
});
