import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import { BackupService } from '../../database/services/BackupService';
import { MealService } from '../../database/services/MealService';
import { sanitizeLogObject } from '../../utils/logSanitizer';

type BackupActionState = 'idle' | 'exporting' | 'importing';

/**
 * Manages backup export/import and all-meal-records deletion workflows for SettingsScreen.
 */
export function useSettingsDataManagement() {
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
            try {
              await MealService.clearAllMeals({ cleanupPhotos: true });
              Alert.alert('削除完了', '食事記録を削除しました。');
            } catch (error) {
              console.error('Failed to delete all meals:', sanitizeLogObject(error));
              Alert.alert(
                '削除に失敗しました',
                '食事記録の削除に失敗しました。もう一度お試しください。'
              );
            }
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
      if (!validation.valid) {
        if (!validation.canceled) {
          Alert.alert('インポート失敗', validation.error ?? '無効なバックアップファイルです。');
        }
        setBackupActionState('idle');
        return;
      }

      const { manifest } = validation;
      const formattedDate = new Date(manifest.exportedAt).toLocaleString('ja-JP');

      // Staging directory is deliberately retained while the user reviews the confirmation dialog.
      // Canceled dialog cleans it up via cleanupStaging; confirmed restore cleans it up in finally.
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
          : 'バックアップの読み込みに失敗しました。';
      Alert.alert('インポート失敗', message);
      setBackupActionState('idle');
    }
  }, []);

  return {
    backupActionState,
    isBackupBusy: backupActionState !== 'idle',
    handleExportBackup,
    handleImportBackup,
    handleDeleteAllData,
  };
}
