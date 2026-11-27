import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../../constants/Colors';
import { GlobalStyles } from '../../../constants/Styles';

export const PermissionLoadingView: React.FC = () => (
  <View style={styles.container}>
    <Text style={styles.permissionText}>カメラ権限を確認中...</Text>
  </View>
);

export const PermissionRequestView: React.FC<{ onRequestPermission: () => Promise<void> }> = ({
  onRequestPermission,
}) => (
  <View style={styles.permissionScreen}>
    <View style={styles.permissionCard}>
      <Text style={styles.permissionTitle}>撮影を始めるにはカメラ権限が必要です</Text>
      <Text style={styles.permissionText}>
        食事の写真は端末内に保存します。保存時には現在地を内部利用して、同じ場所の記録をまとめやすくします。
      </Text>
      <TouchableOpacity
        style={styles.permissionButton}
        onPress={onRequestPermission}
        testID="request-camera-permission-button"
        accessibilityRole="button"
      >
        <Text style={styles.permissionButtonText}>カメラを許可する</Text>
      </TouchableOpacity>
    </View>
  </View>
);

export const PermissionDeniedView: React.FC<{ onOpenSettings: () => Promise<void> }> = ({
  onOpenSettings,
}) => (
  <View style={styles.permissionScreen}>
    <View style={styles.permissionCard}>
      <Text style={styles.permissionTitle}>カメラ権限がオフになっています</Text>
      <Text style={styles.permissionText}>
        設定アプリからカメラ権限を許可すると、撮影を再開できます。写真と位置情報は引き続き端末内中心で扱います。
      </Text>
      <TouchableOpacity
        style={styles.permissionButton}
        onPress={onOpenSettings}
        testID="open-camera-settings-button"
        accessibilityRole="button"
      >
        <Text style={styles.permissionButtonText}>設定を開く</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.black,
  },
  permissionScreen: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: Colors.black,
  },
  permissionCard: {
    backgroundColor: 'rgba(0,0,0,0.88)',
    borderRadius: 16,
    padding: 20,
    gap: 14,
  },
  permissionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.white,
    textAlign: 'center',
  },
  permissionText: {
    ...GlobalStyles.body,
    color: Colors.white,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  permissionButtonText: {
    color: Colors.white,
    fontSize: 16,
    fontWeight: '700',
  },
});
