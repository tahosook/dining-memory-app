import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen() {
  const [autoBackup, setAutoBackup] = React.useState(true);
  const [notifications, setNotifications] = React.useState(false);
  const [locationAccess, setLocationAccess] = React.useState(true);

  const handleBackupNow = () => {
    Alert.alert('バックアップ', 'バックアップを開始します');
  };

  const handleDataExport = () => {
    Alert.alert('データエクスポート', 'エクスポート形式を選択してください');
  };

  const handleDataDelete = () => {
    Alert.alert(
      'データ削除',
      'この操作は取り消せません。本当に削除しますか？',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive' }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.content}>
        {/* データ管理セクション */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 データ管理</Text>
          
          <View style={styles.settingCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>💾 バックアップ</Text>
            </View>
            
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>自動バックアップ</Text>
              <Switch
                value={autoBackup}
                onValueChange={setAutoBackup}
                trackColor={{ false: '#e0e0e0', true: '#2196F3' }}
              />
            </View>
            
            <Text style={styles.settingDescription}>📱 iCloud Drive</Text>
            
            <View style={styles.backupInfo}>
              <Text style={styles.backupInfoText}>最終バックアップ:</Text>
              <Text style={styles.backupInfoValue}>2025/9/11 22:30</Text>
              <Text style={styles.backupInfoText}>データサイズ: 12.3MB</Text>
              <Text style={styles.backupInfoDetail}>(写真: 8.1MB, DB: 4.2MB)</Text>
            </View>
            
            <View style={styles.cardButtons}>
              <TouchableOpacity style={styles.primaryButton} onPress={handleBackupNow}>
                <Text style={styles.primaryButtonText}>今すぐバックアップ</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>復元する</Text>
              </TouchableOpacity>
            </View>
          </View>

          <TouchableOpacity style={styles.settingItem} onPress={handleDataExport}>
            <View style={styles.settingLeft}>
              <Ionicons name="download-outline" size={24} color="#2196F3" />
              <Text style={styles.settingText}>📤 データエクスポート</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem} onPress={handleDataDelete}>
            <View style={styles.settingLeft}>
              <Ionicons name="trash-outline" size={24} color="#f44336" />
              <Text style={[styles.settingText, { color: '#f44336' }]}>🗑️ データ削除</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>
        </View>

        {/* アプリ設定セクション */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📱 アプリ設定</Text>

          <View style={styles.settingCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>🔔 通知設定</Text>
            </View>
            
            <View style={styles.settingRow}>
              <View>
                <Text style={styles.settingLabel}>記録リマインダー</Text>
                <Text style={styles.settingSubLabel}>時刻: 19:00 / 繰り返し: 平日のみ</Text>
              </View>
              <Switch
                value={notifications}
                onValueChange={setNotifications}
                trackColor={{ false: '#e0e0e0', true: '#2196F3' }}
              />
            </View>
          </View>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="camera-outline" size={24} color="#2196F3" />
              <View>
                <Text style={styles.settingText}>📸 カメラ設定</Text>
                <Text style={styles.settingSubText}>写真品質: 高画質 / GPS情報: ON</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="color-palette-outline" size={24} color="#2196F3" />
              <View>
                <Text style={styles.settingText}>🎨 表示設定</Text>
                <Text style={styles.settingSubText}>テーマ: システム設定に従う</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>
        </View>

        {/* プライバシーセクション */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔒 プライバシー</Text>

          <View style={styles.settingCard}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>📍 位置情報設定</Text>
            </View>
            
            <View style={styles.settingRow}>
              <View>
                <Text style={styles.settingLabel}>位置情報の使用</Text>
                <Text style={styles.settingSubLabel}>撮影時に自動取得</Text>
              </View>
              <Switch
                value={locationAccess}
                onValueChange={setLocationAccess}
                trackColor={{ false: '#e0e0e0', true: '#2196F3' }}
              />
            </View>
            
            <View style={styles.privacyInfo}>
              <Text style={styles.privacyText}>💡 すべて端末内保存</Text>
              <Text style={styles.privacySubText}>外部送信はありません</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="analytics-outline" size={24} color="#2196F3" />
              <View>
                <Text style={styles.settingText}>📊 使用状況データ</Text>
                <Text style={styles.settingSubText}>データ収集: OFF</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>
        </View>

        {/* サポート・情報セクション */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>❓ サポート・情報</Text>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="help-circle-outline" size={24} color="#2196F3" />
              <Text style={styles.settingText}>📖 使い方ガイド</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="chatbubble-outline" size={24} color="#2196F3" />
              <Text style={styles.settingText}>💬 よくある質問</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="mail-outline" size={24} color="#2196F3" />
              <Text style={styles.settingText}>📧 お問い合わせ</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <Ionicons name="bug-outline" size={24} color="#2196F3" />
              <Text style={styles.settingText}>🐛 不具合を報告</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color="#ccc" />
          </TouchableOpacity>
        </View>

        {/* アプリ情報セクション */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ℹ️ アプリ情報</Text>

          <View style={styles.appInfoCard}>
            <Text style={styles.appInfoTitle}>Dining Memory</Text>
            <Text style={styles.appInfoDetail}>バージョン: 1.0.0</Text>
            <Text style={styles.appInfoDetail}>ビルド: 2025.09.11</Text>
            <Text style={styles.appInfoDetail}>ライセンス: MIT</Text>
            
            <View style={styles.techStack}>
              <Text style={styles.techStackTitle}>使用ライブラリ:</Text>
              <Text style={styles.techStackItem}>• React Native</Text>
              <Text style={styles.techStackItem}>• TensorFlow Lite</Text>
              <Text style={styles.techStackItem}>• SQLite</Text>
            </View>

            <View style={styles.appInfoButtons}>
              <TouchableOpacity style={styles.infoButton}>
                <Text style={styles.infoButtonText}>ライセンス詳細</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.infoButton}>
                <Text style={styles.infoButtonText}>アップデート確認</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 底部余白 */}
        <View style={{ height: 32 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
  },
  section: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  settingCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardHeader: {
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  settingSubLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  backupInfo: {
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  backupInfoText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  backupInfoValue: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  backupInfoDetail: {
    fontSize: 12,
    color: '#888',
  },
  cardButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#666',
    fontSize: 14,
  },
  settingItem: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 2,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    fontSize: 16,
    marginLeft: 12,
    flex: 1,
  },
  settingSubText: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
  privacyInfo: {
    backgroundColor: '#e8f5e8',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  privacyText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2e7d32',
  },
  privacySubText: {
    fontSize: 12,
    color: '#388e3c',
    marginTop: 2,
  },
  appInfoCard: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    marginBottom: 8,
    borderRadius: 12,
    padding: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  appInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  appInfoDetail: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  techStack: {
    marginTop: 12,
    marginBottom: 16,
  },
  techStackTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  techStackItem: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  appInfoButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  infoButton: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  infoButtonText: {
    color: '#666',
    fontSize: 14,
  },
});