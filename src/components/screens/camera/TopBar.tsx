import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '../../../constants/Colors';

/**
 * カメラ画面のトップバーコンポーネント
 * Presentational層：UI表示のみ
 */

interface TopBarProps {
  onClosePress: () => void;
  onFlipPress: () => void;
  closeDisabled?: boolean;
}

const TopBar: React.FC<TopBarProps> = ({ onClosePress, onFlipPress, closeDisabled = false }) => {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.topBar, { paddingTop: insets.top + 10 }]}>
      <TouchableOpacity
        style={[styles.closeButton, closeDisabled && styles.disabledButton]}
        onPress={onClosePress}
        disabled={closeDisabled}
        testID="close-button"
        accessibilityLabel="撮影画面を閉じる"
        accessibilityHint="このボタンをタップすると撮影を終了します"
        accessibilityRole="button"
        accessibilityState={{ disabled: closeDisabled }}
      >
        <Text style={styles.closeButtonText}>✕</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.flipButton}
        onPress={onFlipPress}
        accessibilityLabel="カメラを反転"
        accessibilityHint="フロントカメラとバックカメラを切り替えます"
        accessibilityRole="button"
      >
        <Ionicons name="camera-reverse-outline" size={22} color={Colors.white} />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: Colors.white,
    fontSize: 20,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  flipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledButton: {
    opacity: 0.5,
  },
});

export default TopBar;
