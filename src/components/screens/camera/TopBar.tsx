import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../../../constants/Colors';
import { GlobalStyles } from '../../../constants/Styles';
import { PLATFORM_CONFIGS } from '../../../constants/CameraConstants';
import { Platform } from 'react-native';

/**
 * カメラ画面のトップバーコンポーネント
 * Presentational層：UI表示のみ
 */

interface TopBarProps {
  onClosePress: () => void;
  onFlipPress: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ onClosePress, onFlipPress }) => {
  // Platform-specific configurations using centralized constants
  const platformConfig = PLATFORM_CONFIGS[Platform.OS as keyof typeof PLATFORM_CONFIGS] || PLATFORM_CONFIGS.default;
  const topBarMarginTop = platformConfig.topBarMarginTop;

  return (
    <View style={[styles.topBar, { marginTop: topBarMarginTop }]}>
      <TouchableOpacity
        style={styles.closeButton}
        onPress={onClosePress}
        testID="close-button"
        accessibilityLabel="撮影画面を閉じる"
        accessibilityHint="このボタンをタップすると撮影を終了します"
        accessibilityRole="button"
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
        <Text style={styles.buttonText}>🔄</Text>
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
  },
  flipButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    ...GlobalStyles.body,
    color: Colors.white,
  },
});

export default TopBar;
