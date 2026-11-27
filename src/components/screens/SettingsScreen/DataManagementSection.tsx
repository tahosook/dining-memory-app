import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../../constants/Colors';
import { SettingsSection } from './SettingsSection';
import { settingsStyles } from './settingsStyles';

export function DataManagementSection({
  backupActionState,
  isBackupBusy,
  onExportBackup,
  onImportBackup,
  onDeleteAllData,
}: {
  backupActionState: 'idle' | 'exporting' | 'importing';
  isBackupBusy: boolean;
  onExportBackup: () => void;
  onImportBackup: () => void;
  onDeleteAllData: () => void;
}) {
  return (
    <SettingsSection title="データ管理">
      <TouchableOpacity
        style={[settingsStyles.actionButton, isBackupBusy && settingsStyles.actionButtonDisabled]}
        onPress={onExportBackup}
        disabled={isBackupBusy}
        testID="settings-export-backup-button"
      >
        {backupActionState === 'exporting' ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : (
          <Text style={settingsStyles.actionButtonText}>バックアップをエクスポート</Text>
        )}
      </TouchableOpacity>
      <Text style={settingsStyles.metaText}>
        食事メタデータとオリジナル写真をZIP形式で書き出します。
      </Text>

      <View style={localStyles.dataManagementSpacer} />

      <TouchableOpacity
        style={[
          settingsStyles.secondaryButton,
          isBackupBusy && settingsStyles.actionButtonDisabled,
        ]}
        onPress={onImportBackup}
        disabled={isBackupBusy}
        testID="settings-import-backup-button"
      >
        {backupActionState === 'importing' ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Text style={settingsStyles.secondaryButtonText}>バックアップから復元</Text>
        )}
      </TouchableOpacity>
      <Text style={settingsStyles.metaText}>
        エクスポートしたZIPファイルからデータを復元します（現在のデータは置換されます）。
      </Text>

      <View style={localStyles.dangerZoneDivider} />

      <TouchableOpacity
        style={[localStyles.dangerButton, isBackupBusy && settingsStyles.actionButtonDisabled]}
        onPress={onDeleteAllData}
        disabled={isBackupBusy}
      >
        <Text style={localStyles.dangerButtonText}>すべての食事記録を削除</Text>
      </TouchableOpacity>
    </SettingsSection>
  );
}

const localStyles = StyleSheet.create({
  dataManagementSpacer: {
    height: 12,
  },
  dangerZoneDivider: {
    height: 1,
    backgroundColor: '#d7d7d7',
    marginVertical: 16,
  },
  dangerButton: {
    backgroundColor: Colors.error,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
});
