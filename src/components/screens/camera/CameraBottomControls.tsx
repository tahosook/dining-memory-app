import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../../constants/Colors';
import { CAMERA_CONSTANTS, PLATFORM_CONFIGS } from '../../../constants/CameraConstants';
import CaptureButton from './CaptureButton';

const platformConfig =
  PLATFORM_CONFIGS[Platform.OS as keyof typeof PLATFORM_CONFIGS] || PLATFORM_CONFIGS.default;
const bottomBarMarginBottom = platformConfig.bottomBarMarginBottom;

export interface CameraBottomControlsProps {
  takingPhoto: boolean;
  pickingPhotoFromLibrary: boolean;
  onTakePicture: () => Promise<void>;
  onAddPhotoFromLibrary: () => Promise<void>;
}

export const CameraBottomControls: React.FC<CameraBottomControlsProps> = ({
  takingPhoto,
  pickingPhotoFromLibrary,
  onTakePicture,
  onAddPhotoFromLibrary,
}) => (
  <View style={[styles.bottomBar, { marginBottom: bottomBarMarginBottom }]}>
    <View style={styles.captureActionsRow}>
      <CaptureButton takingPhoto={takingPhoto} onPress={onTakePicture} />
      <TouchableOpacity
        style={[
          styles.secondaryActionButton,
          pickingPhotoFromLibrary && styles.secondaryActionButtonDisabled,
        ]}
        onPress={onAddPhotoFromLibrary}
        disabled={pickingPhotoFromLibrary}
        testID="add-photo-from-library-button"
        accessibilityRole="button"
        accessibilityLabel={pickingPhotoFromLibrary ? '写真を選択中' : '写真から追加'}
        accessibilityState={{ disabled: pickingPhotoFromLibrary }}
      >
        <Text style={styles.secondaryActionButtonText}>
          {pickingPhotoFromLibrary ? '選択中...' : '写真から追加'}
        </Text>
      </TouchableOpacity>
    </View>
  </View>
);

const styles = StyleSheet.create({
  bottomBar: {
    width: '100%',
    paddingBottom: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  captureActionsRow: {
    width: '100%',
    minHeight: CAMERA_CONSTANTS.CAMERA_BUTTON_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryActionButton: {
    position: 'absolute',
    right: 0,
    top: 20,
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  secondaryActionButtonDisabled: {
    opacity: 0.55,
  },
  secondaryActionButtonText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
});
