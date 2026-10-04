import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { BackupService } from '../../../database/services/BackupService';
import { MealService } from '../../../database/services/MealService';
import { sanitizeLogObject } from '../../../utils/logSanitizer';
import { Colors } from '../../../constants/Colors';
import { Section } from './Section';

type BackupActionState = 'idle' | 'exporting' | 'importing';

export function DataManagementSection() {
  const [backupActionState, setBackupActionState] = useState<BackupActionState>('idle');

  const handleDeleteAllData = useCallback(() => {
    Alert.alert(
      'すべての食事記録を削除',
      '端末内の食事記録をすべて削除します。この操作は元に戻せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            await MealService.clearAllMeals({ cleanupPhotos: true });
            Alert.alert('削除完了', '食事記録を削除しました。');
          },
        },
      ]
    );
  }, []);

  const handleExportBackup = useCallback(async () => {
    setBackupActionState('exporting');
    try {
      const result = await BackupService.exportBackup();
      Alert.alert(
        'エクスポート完了',
        `食事記録 ${result.mealCount}件、写真 ${result.photoCount}枚をバックアップファイルとして書き出しました。`
      );
    } catch (error) {
      console.error('Failed to export backup:', sanitizeLogObject(error));
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'バックアップのエクスポートに失敗しました。';
      Alert.alert('エクスポート失敗', message);
    } finally {
      setBackupActionState('idle');
    }
  }, []);

  const handleImportBackup = useCallback(async () => {
    setBackupActionState('importing');
    try {
      const validation = await BackupService.pickAndValidateBackup();
      if (validation.canceled) {
        setBackupActionState('idle');
        return;
      }

      if (!validation.valid || !validation.manifest) {
        Alert.alert('インポート失敗', validation.error ?? '無効なバックアップファイルです。');
        setBackupActionState('idle');
        return;
      }

      const { manifest } = validation;
      const formattedDate = new Date(manifest.exportedAt).toLocaleString('ja-JP');

      Alert.alert(
        'バックアップから復元',
        `エクスポート日時: ${formattedDate}\n食事記録: ${manifest.mealCount}件\n写真: ${manifest.photoCount}枚\n\n現在の端末内の食事記録をすべて上書きして復元します。この操作は元に戻せません。`,
        [
          {
            text: 'キャンセル',
            style: 'cancel',
            onPress: async () => {
              await BackupService.cleanupStaging(validation.stagingDirectory);
              setBackupActionState('idle');
            },
          },
          {
            text: '復元する',
            style: 'destructive',
            onPress: async () => {
              try {
                const restoreResult = await BackupService.restoreVerifiedBackup(validation);
                Alert.alert(
                  '復元完了',
                  `食事記録 ${restoreResult.restoredMealCount}件、写真 ${restoreResult.restoredPhotoCount}枚を復元しました。`
                );
              } catch (restoreError) {
                console.error('Failed to restore backup:', sanitizeLogObject(restoreError));
                const message =
                  restoreError instanceof Error && restoreError.message
                    ? restoreError.message
                    : 'バックアップの復元に失敗しました。';
                Alert.alert('復元失敗', message);
              } finally {
                setBackupActionState('idle');
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('Failed to import backup:', sanitizeLogObject(error));
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'バックアップのインポートに失敗しました。';
      Alert.alert('インポート失敗', message);
      setBackupActionState('idle');
    }
  }, []);

  const isBackupBusy = backupActionState !== 'idle';

  return (
    <Section title="データ管理">
      <TouchableOpacity
        style={[styles.actionButton, isBackupBusy && styles.actionButtonDisabled]}
        onPress={handleExportBackup}
        disabled={isBackupBusy}
        testID="settings-export-backup-button"
      >
        {backupActionState === 'exporting' ? (
          <ActivityIndicator size="small" color={Colors.white} />
        ) : (
          <Text style={styles.actionButtonText}>バックアップをエクスポート</Text>
        )}
      </TouchableOpacity>
      <Text style={styles.metaText}>食事メタデータとオリジナル写真をZIP形式で書き出します。</Text>

      <View style={styles.dataManagementSpacer} />

      <TouchableOpacity
        style={[styles.secondaryButton, isBackupBusy && styles.actionButtonDisabled]}
        onPress={handleImportBackup}
        disabled={isBackupBusy}
        testID="settings-import-backup-button"
      >
        {backupActionState === 'importing' ? (
          <ActivityIndicator size="small" color={Colors.primary} />
        ) : (
          <Text style={styles.secondaryButtonText}>バックアップから復元</Text>
        )}
      </TouchableOpacity>
      <Text style={styles.metaText}>
        エクスポートしたZIPファイルからデータを復元します（現在のデータは置換されます）。
      </Text>

      <View style={styles.dangerZoneDivider} />

      <TouchableOpacity
        style={[styles.dangerButton, isBackupBusy && styles.actionButtonDisabled]}
        onPress={handleDeleteAllData}
        disabled={isBackupBusy}
      >
        <Text style={styles.dangerButtonText}>すべての食事記録を削除</Text>
      </TouchableOpacity>
    </Section>
  );
}

const styles = StyleSheet.create({
  metaText: {
    fontSize: 14,
    color: Colors.gray,
  },
  actionButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#d7d7d7',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 14,
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
  dataManagementSpacer: {
    height: 12,
  },
  dangerZoneDivider: {
    height: 1,
    backgroundColor: '#d7d7d7',
    marginVertical: 16,
  },
});
