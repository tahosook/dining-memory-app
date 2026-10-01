import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../constants/Colors';

export type MealEditImagePreviewProps = {
  imageUri?: string;
  onRotateImage?: () => void | Promise<void>;
  saving?: boolean;
  rotatingImage?: boolean;
  testIDPrefix?: string;
};

export function MealEditImagePreview({
  imageUri,
  onRotateImage,
  saving = false,
  rotatingImage = false,
  testIDPrefix = 'meal-edit',
}: MealEditImagePreviewProps) {
  if (!imageUri) {
    return null;
  }

  return (
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
          accessibilityRole="button"
          accessibilityLabel={rotatingImage ? '画像を回転中' : '画像を右に90度回転'}
          accessibilityState={{ disabled: saving || rotatingImage }}
          testID={`${testIDPrefix}-rotate-image-button`}
        >
          <Text style={styles.rotateButtonText}>{rotatingImage ? '回転中...' : '右に90°回転'}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
});
