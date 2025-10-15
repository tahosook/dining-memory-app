import React from 'react';
import { View, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Colors } from '../../../constants/Colors';
import { GlobalStyles } from '../../../constants/Styles';
import { CAMERA_CONSTANTS } from '../../../constants/CameraConstants';

/**
 * カメラ撮影ボタンコンポーネント
 * Presentational層：UI表示のみ
 */

interface CaptureButtonProps {
  takingPhoto: boolean;
  onPress: () => Promise<void>;
}

const CaptureButton: React.FC<CaptureButtonProps> = ({ takingPhoto, onPress }) => {
  return (
    <TouchableOpacity
      style={[styles.captureButton, takingPhoto && styles.captureButtonDisabled]}
      onPress={onPress}
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
  );
};

const styles = StyleSheet.create({
  captureButton: {
    width: CAMERA_CONSTANTS.CAMERA_BUTTON_SIZE,
    height: CAMERA_CONSTANTS.CAMERA_BUTTON_SIZE,
    borderRadius: CAMERA_CONSTANTS.CAMERA_BUTTON_SIZE / 2,
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
    width: CAMERA_CONSTANTS.CAMERA_BUTTON_SIZE * 0.875,
    height: CAMERA_CONSTANTS.CAMERA_BUTTON_SIZE * 0.875,
    borderRadius: CAMERA_CONSTANTS.CAMERA_BUTTON_SIZE * 0.4375,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButtonCircle: {
    width: CAMERA_CONSTANTS.CAMERA_BUTTON_SIZE * 0.75,
    height: CAMERA_CONSTANTS.CAMERA_BUTTON_SIZE * 0.75,
    borderRadius: CAMERA_CONSTANTS.CAMERA_BUTTON_SIZE * 0.375,
    backgroundColor: '#ff4444',
    borderWidth: 3,
    borderColor: '#fff',
  },
  captureButtonText: {
    color: '#333',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

export default CaptureButton;
