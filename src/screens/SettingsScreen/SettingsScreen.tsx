import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getAndroidVersionCode,
  getAppVersion,
  getBuildDate,
  getBuildEnvironment,
  getExpoSdkVersion,
  getGitCommitHash,
  getIosBuildNumber,
} from '../../utils/buildInfo';
import {
  getMealInputAssistManagedFiles,
  MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME,
  MEDIAPIPE_MODEL_DISPLAY_NAME,
  type MealInputAssistModelDownloadProgress,
  type MealInputAssistModelStatus,
  type MediaPipeModelDownloadProgress,
  type MediaPipeModelStatus,
} from '../../ai/mealInputAssist';
import {
  deleteAllDownloadedLocalAiModels,
  deleteMediaPipeModel,
  getMealInputAssistModelStatus,
  getMediaPipeModelStatus,
  installMealInputAssistModel,
  installMediaPipeModel,
  redownloadMealInputAssistModel,
  redownloadMediaPipeModel,
} from '../../ai/mealInputAssist/modelInstaller';
import {
  getLocalAiRuntimeStatusSnapshot,
  type LocalAiRuntimeStatusEntry,
  type LocalAiRuntimeStatusSnapshot,
} from '../../ai/runtime';
import { Colors } from '../../constants/Colors';
import { MealService } from '../../database/services/MealService';
import { AppSettingsService } from '../../database/services/AppSettingsService';
import { BackupService } from '../../database/services/BackupService';

type ModelActionState = 'idle' | 'downloading' | 'deleting';
type BackupActionState = 'idle' | 'exporting' | 'importing';

export default function SettingsScreen() {
  const [aiInputAssistEnabled, setAiInputAssistEnabled] = useState(false);
  const [aiInputAssistLoading, setAiInputAssistLoading] = useState(true);
  const [mealInputAssistModelStatus, setMealInputAssistModelStatus] =
    useState<MealInputAssistModelStatus | null>(null);
  const [mealInputAssistModelStatusLoading, setMealInputAssistModelStatusLoading] = useState(true);
  const [localAiRuntimeStatus, setLocalAiRuntimeStatus] =
    useState<LocalAiRuntimeStatusSnapshot | null>(null);
  const [localAiRuntimeStatusLoading, setLocalAiRuntimeStatusLoading] = useState(true);
  const [modelActionState, setModelActionState] = useState<ModelActionState>('idle');
  const [modelDownloadProgress, setModelDownloadProgress] =
    useState<MealInputAssistModelDownloadProgress | null>(null);
  const [backupActionState, setBackupActionState] = useState<BackupActionState>('idle');
  const [showAiDetails, setShowAiDetails] = useState(false);

  const showMediaPipeDevSection = typeof __DEV__ !== 'undefined' && Boolean(__DEV__);
  const [mediaPipeModelStatus, setMediaPipeModelStatus] = useState<MediaPipeModelStatus | null>(
    null
  );
  const [mediaPipeModelStatusLoading, setMediaPipeModelStatusLoading] = useState(true);
  const [mediaPipeActionState, setMediaPipeActionState] = useState<ModelActionState>('idle');
  const [mediaPipeDownloadProgress, setMediaPipeDownloadProgress] =
    useState<MediaPipeModelDownloadProgress | null>(null);

  const loadAiInputAssistSetting = useCallback(async () => {
    setAiInputAssistLoading(true);

    try {
      const nextEnabled = await AppSettingsService.getAiInputAssistEnabled();
      setAiInputAssistEnabled(nextEnabled);
    } catch (error) {
      console.error('Failed to load AI input assist setting:', error);
      setAiInputAssistEnabled(false);
    } finally {
      setAiInputAssistLoading(false);
    }
  }, []);

  const loadMealInputAssistModelStatus = useCallback(async () => {
    setMealInputAssistModelStatusLoading(true);

    try {
      const nextStatus = await getMealInputAssistModelStatus();
      setMealInputAssistModelStatus(nextStatus);
    } catch (error) {
      console.error('Failed to load meal input assist model status:', error);
      setMealInputAssistModelStatus(null);
    } finally {
      setMealInputAssistModelStatusLoading(false);
    }
  }, []);

  const loadLocalAiRuntimeStatus = useCallback(async () => {
    setLocalAiRuntimeStatusLoading(true);

    try {
      const snapshot = await getLocalAiRuntimeStatusSnapshot();
      setLocalAiRuntimeStatus(snapshot);
    } catch (error) {
      console.error('Failed to load local AI runtime status:', error);
      setLocalAiRuntimeStatus(null);
    } finally {
      setLocalAiRuntimeStatusLoading(false);
    }
  }, []);

  const reloadLocalAiSection = useCallback(async () => {
    await Promise.all([loadMealInputAssistModelStatus(), loadLocalAiRuntimeStatus()]);
  }, [loadLocalAiRuntimeStatus, loadMealInputAssistModelStatus]);

  const loadMediaPipeModelStatus = useCallback(async () => {
    if (!showMediaPipeDevSection) {
      return;
    }
    setMediaPipeModelStatusLoading(true);

    try {
      const nextStatus = await getMediaPipeModelStatus();
      setMediaPipeModelStatus(nextStatus);
    } catch (error) {
      console.error('Failed to load MediaPipe model status:', error);
      setMediaPipeModelStatus(null);
    } finally {
      setMediaPipeModelStatusLoading(false);
    }
  }, [showMediaPipeDevSection]);

  useFocusEffect(
    useCallback(() => {
      loadAiInputAssistSetting().catch(() => undefined);
      reloadLocalAiSection().catch(() => undefined);
      loadMediaPipeModelStatus().catch(() => undefined);
    }, [loadAiInputAssistSetting, reloadLocalAiSection, loadMediaPipeModelStatus])
  );

  const handleAiInputAssistToggle = useCallback(async (nextValue: boolean) => {
    setAiInputAssistEnabled(nextValue);

    try {
      await AppSettingsService.setAiInputAssistEnabled(nextValue);
    } catch (error) {
      console.error('Failed to save AI input assist setting:', error);
      setAiInputAssistEnabled(current => !current);
      Alert.alert(
        '設定を保存できませんでした',
        'AI入力補助の設定を保存できませんでした。もう一度お試しください。'
      );
    }
  }, []);

  const handleModelDownload = useCallback(
    async (mode: 'install' | 'redownload') => {
      setModelActionState('downloading');
      setModelDownloadProgress(null);

      try {
        if (mode === 'redownload') {
          await redownloadMealInputAssistModel({
            onProgress: setModelDownloadProgress,
          });
        } else {
          await installMealInputAssistModel({
            onProgress: setModelDownloadProgress,
          });
        }

        await reloadLocalAiSection();
        Alert.alert('ダウンロード完了', 'AI入力補助に必要なデータを端末に保存しました。');
      } catch (error) {
        console.error('Failed to download meal input assist model:', error);
        await reloadLocalAiSection().catch(() => undefined);
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'AI入力補助に必要なデータをダウンロードできませんでした。';
        Alert.alert('ダウンロードに失敗しました', message);
      } finally {
        setModelDownloadProgress(null);
        setModelActionState('idle');
      }
    },
    [reloadLocalAiSection]
  );

  const handleDeleteAllModels = useCallback(() => {
    Alert.alert(
      'ダウンロード済みモデルを削除',
      '端末に保存したAI入力補助用データを削除します。写真や食事記録は削除されません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            setModelActionState('deleting');

            try {
              await deleteAllDownloadedLocalAiModels();
              await Promise.all([reloadLocalAiSection(), loadMediaPipeModelStatus()]);
              Alert.alert('削除完了', 'ダウンロード済みモデルを削除しました。');
            } catch (error) {
              console.error('Failed to delete downloaded AI models:', error);
              await Promise.all([
                reloadLocalAiSection().catch(() => undefined),
                loadMediaPipeModelStatus().catch(() => undefined),
              ]);
              const message =
                error instanceof Error && error.message
                  ? error.message
                  : 'ダウンロード済みモデルを削除できませんでした。';
              Alert.alert('削除に失敗しました', message);
            } finally {
              setModelActionState('idle');
            }
          },
        },
      ]
    );
  }, [loadMediaPipeModelStatus, reloadLocalAiSection]);

  const handleMediaPipeDownload = useCallback(
    async (mode: 'install' | 'redownload') => {
      setMediaPipeActionState('downloading');
      setMediaPipeDownloadProgress(null);

      try {
        if (mode === 'redownload') {
          await redownloadMediaPipeModel({
            onProgress: setMediaPipeDownloadProgress,
          });
        } else {
          await installMediaPipeModel({
            onProgress: setMediaPipeDownloadProgress,
          });
        }

        await loadMediaPipeModelStatus();
        Alert.alert('ダウンロード完了', `${MEDIAPIPE_MODEL_DISPLAY_NAME} を端末に保存しました。`);
      } catch (error) {
        console.error('Failed to download MediaPipe model:', error);
        await loadMediaPipeModelStatus().catch(() => undefined);
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'MediaPipe モデルのダウンロードに失敗しました。';
        Alert.alert('ダウンロードに失敗しました', message);
      } finally {
        setMediaPipeDownloadProgress(null);
        setMediaPipeActionState('idle');
      }
    },
    [loadMediaPipeModelStatus]
  );

  const handleMediaPipeDelete = useCallback(() => {
    Alert.alert(
      `${MEDIAPIPE_MODEL_DISPLAY_NAME} を削除`,
      '端末に保存した MediaPipe モデルデータを削除します。写真や食事記録は削除されません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            setMediaPipeActionState('deleting');

            try {
              await deleteMediaPipeModel();
              await loadMediaPipeModelStatus();
              Alert.alert('削除完了', `${MEDIAPIPE_MODEL_DISPLAY_NAME} を削除しました。`);
            } catch (error) {
              console.error('Failed to delete MediaPipe model:', error);
              await loadMediaPipeModelStatus().catch(() => undefined);
              const message =
                error instanceof Error && error.message
                  ? error.message
                  : 'MediaPipe モデルを削除できませんでした。';
              Alert.alert('削除に失敗しました', message);
            } finally {
              setMediaPipeActionState('idle');
            }
          },
        },
      ]
    );
  }, [loadMediaPipeModelStatus]);

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
      console.error('Failed to export backup:', error);
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
                console.error('Failed to restore backup:', restoreError);
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
      console.error('Failed to import backup:', error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'バックアップの読み込みに失敗しました。';
      Alert.alert('インポート失敗', message);
      setBackupActionState('idle');
    }
  }, []);

  const visibleModelStatus = useMemo(
    () =>
      modelActionState === 'downloading'
        ? 'downloading'
        : (mealInputAssistModelStatus?.kind ?? null),
    [mealInputAssistModelStatus?.kind, modelActionState]
  );
  const showDeleteAllModelsAction = useMemo(() => {
    if (!mealInputAssistModelStatus) {
      return false;
    }

    return (
      mealInputAssistModelStatus.kind !== 'not_installed' ||
      mealInputAssistModelStatus.files.modelExists ||
      mealInputAssistModelStatus.files.projectorExists
    );
  }, [mealInputAssistModelStatus]);
  const runtimeReady = localAiRuntimeStatus?.mealInputAssist.kind === 'ready';
  const modelReady = mealInputAssistModelStatus?.kind === 'ready';
  const aiAssistState = useMemo(() => {
    if (mealInputAssistModelStatusLoading || localAiRuntimeStatusLoading) {
      return 'checking' as const;
    }
    if (modelActionState === 'downloading') {
      return 'downloading' as const;
    }
    if (mealInputAssistModelStatus?.kind === 'error') {
      return 'error' as const;
    }
    if (modelReady && runtimeReady) {
      return 'ready' as const;
    }
    return 'not_ready' as const;
  }, [
    localAiRuntimeStatusLoading,
    mealInputAssistModelStatus?.kind,
    mealInputAssistModelStatusLoading,
    modelActionState,
    modelReady,
    runtimeReady,
  ]);
  const aiAssistSwitchDisabled =
    aiInputAssistLoading || modelActionState !== 'idle' || !modelReady || !runtimeReady;
  const aiAssistDisabledReason =
    aiAssistState === 'checking'
      ? '状態を確認しています。'
      : !modelReady
        ? 'モデルをダウンロードすると利用できます。'
        : !runtimeReady
          ? 'この端末ではまだ利用できません。'
          : null;
  const isBackupBusy = backupActionState !== 'idle';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="プライバシー">
        <Text style={styles.bodyText}>食事記録と写真は端末内中心で扱います。</Text>
        <Text style={styles.bodyText}>
          自動的な外部送信はしない設計です。Records
          詳細などからユーザーが明示的に共有した場合のみ、外部アプリに渡ります。
        </Text>
        <Text style={styles.bodyText}>
          AI入力補助は写真を外部送信しません。ただし、AI入力補助のモデルデータをダウンロードする時だけ外部通信が発生します。
        </Text>
      </Section>

      <Section title="AI入力補助">
        <View style={styles.aiStatusHeader}>
          <Text style={styles.settingTitle}>状態: {formatAiAssistStateLabel(aiAssistState)}</Text>
          <View
            style={[
              styles.runtimeStatusBadge,
              aiAssistState === 'ready'
                ? styles.runtimeStatusBadgeReady
                : aiAssistState === 'downloading' || aiAssistState === 'checking'
                  ? styles.runtimeStatusBadgeLoading
                  : styles.runtimeStatusBadgeUnavailable,
            ]}
          >
            <Text style={styles.runtimeStatusBadgeText}>
              {formatAiAssistStateLabel(aiAssistState)}
            </Text>
          </View>
        </View>
        <Text style={styles.bodyText}>{buildAiAssistDescription(aiAssistState)}</Text>

        {aiAssistState === 'downloading' ? (
          <DownloadProgressCard progress={modelDownloadProgress} />
        ) : null}

        {aiAssistState === 'ready' ? (
          <View style={styles.settingRow}>
            <View style={styles.settingTextBlock}>
              <Text style={styles.settingTitle}>AI入力補助を使う</Text>
              <Text style={styles.settingDescription}>
                撮影後の確認画面で、端末内だけでメモ下書きを作成します。
              </Text>
            </View>
            <Switch
              value={aiInputAssistEnabled}
              onValueChange={handleAiInputAssistToggle}
              disabled={aiAssistSwitchDisabled}
              testID="ai-input-assist-toggle"
            />
          </View>
        ) : (
          <Text style={styles.settingHint}>{aiAssistDisabledReason}</Text>
        )}

        <View style={styles.actionRow}>
          {aiAssistState === 'not_ready' && !modelReady ? (
            <TouchableOpacity
              style={[
                styles.actionButton,
                modelActionState !== 'idle' ? styles.actionButtonDisabled : null,
              ]}
              onPress={() => handleModelDownload('install')}
              disabled={modelActionState !== 'idle'}
              testID="meal-input-assist-model-download-button"
            >
              <Text style={styles.actionButtonText}>モデルをダウンロード</Text>
            </TouchableOpacity>
          ) : null}
          {aiAssistState === 'ready' ||
          aiAssistState === 'error' ||
          (modelReady && !runtimeReady && aiAssistState !== 'checking') ? (
            <TouchableOpacity
              style={[
                styles.actionButton,
                modelActionState !== 'idle' ? styles.actionButtonDisabled : null,
              ]}
              onPress={() => handleModelDownload('redownload')}
              disabled={modelActionState !== 'idle'}
              testID="meal-input-assist-model-redownload-button"
            >
              <Text style={styles.actionButtonText}>再ダウンロード</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {showDeleteAllModelsAction ? (
          <TouchableOpacity
            style={[
              styles.dangerOutlineButton,
              modelActionState !== 'idle' ? styles.actionButtonDisabled : null,
            ]}
            onPress={handleDeleteAllModels}
            disabled={modelActionState !== 'idle'}
            testID="delete-all-downloaded-ai-models-button"
          >
            <Text style={styles.dangerOutlineButtonText}>ダウンロード済みモデルを削除</Text>
          </TouchableOpacity>
        ) : null}

        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => setShowAiDetails(current => !current)}
          testID="toggle-ai-details-button"
          accessibilityRole="button"
          accessibilityLabel="AIアシストの詳細情報"
          accessibilityHint="AIアシストモデルの詳細情報の表示を切り替えます"
          accessibilityState={{ expanded: showAiDetails }}
        >
          <Text style={styles.secondaryButtonText}>
            {showAiDetails ? '詳細情報を隠す' : '詳細情報を表示'}
          </Text>
        </TouchableOpacity>
        {showAiDetails ? (
          <View style={styles.detailBlock} testID="ai-details">
            {mealInputAssistModelStatus ? (
              <ModelStatusCard
                status={mealInputAssistModelStatus}
                visibleStatus={visibleModelStatus}
                actionState={modelActionState}
                downloadProgress={modelDownloadProgress}
                showActions={false}
                onDownload={() => handleModelDownload('install')}
                onRedownload={() => handleModelDownload('redownload')}
              />
            ) : mealInputAssistModelStatusLoading ? (
              <Text style={styles.metaText} testID="meal-input-assist-model-status-loading">
                model file status を確認しています...
              </Text>
            ) : (
              <Text style={styles.metaText} testID="meal-input-assist-model-status-error">
                model file status を確認できませんでした。
              </Text>
            )}
            {localAiRuntimeStatus ? (
              <RuntimeStatusCard
                title="Local AI Runtime Status"
                entry={localAiRuntimeStatus.mealInputAssist}
                testID="meal-input-assist-runtime-status"
              />
            ) : localAiRuntimeStatusLoading ? (
              <Text style={styles.metaText} testID="local-ai-runtime-status-loading">
                runtime status を確認しています...
              </Text>
            ) : (
              <Text style={styles.metaText} testID="local-ai-runtime-status-error">
                runtime status を確認できませんでした。
              </Text>
            )}
          </View>
        ) : null}
      </Section>

      {showMediaPipeDevSection ? (
        <Section title="MediaPipe (Experimental / DEV)">
          <Text style={styles.bodyText}>{MEDIAPIPE_MODEL_DISPLAY_NAME}</Text>
          <Text style={styles.metaText}>
            端末内画像分類用の MediaPipe モデルです。開発環境（__DEV__）でのみ表示されます。
          </Text>

          <View style={styles.runtimeStatusCard} testID="mediapipe-model-status-card">
            <View style={styles.runtimeStatusHeader}>
              <Text style={styles.disabledLabel}>モデル状態</Text>
              <View
                style={[
                  styles.runtimeStatusBadge,
                  mediaPipeModelStatus?.kind === 'ready'
                    ? styles.runtimeStatusBadgeReady
                    : styles.runtimeStatusBadgeUnavailable,
                ]}
              >
                <Text
                  style={[
                    styles.runtimeStatusBadgeText,
                    mediaPipeModelStatus?.kind === 'ready'
                      ? styles.runtimeStatusBadgeTextReady
                      : styles.runtimeStatusBadgeTextUnavailable,
                  ]}
                  testID="mediapipe-model-status-badge"
                >
                  {mediaPipeModelStatusLoading
                    ? '確認中'
                    : formatModelStatusLabel(mediaPipeModelStatus?.kind ?? 'not_installed')}
                </Text>
              </View>
            </View>

            {mediaPipeModelStatus?.version ? (
              <Text style={styles.runtimeStatusMode}>Version: {mediaPipeModelStatus.version}</Text>
            ) : null}
            {mediaPipeModelStatus?.errorMessage ? (
              <Text style={styles.runtimeStatusError}>{mediaPipeModelStatus.errorMessage}</Text>
            ) : null}
          </View>

          {mediaPipeDownloadProgress ? (
            <View style={styles.downloadProgressCard} testID="mediapipe-download-progress">
              <Text style={styles.downloadProgressTitle}>
                {mediaPipeDownloadProgress.phase === 'verifying'
                  ? 'SHA256 ハッシュを検証しています...'
                  : mediaPipeDownloadProgress.phase === 'installing'
                    ? 'モデルファイルを配置しています...'
                    : mediaPipeDownloadProgress.progress !== null
                      ? `ダウンロード中: ${Math.round(mediaPipeDownloadProgress.progress * 100)}%`
                      : 'ダウンロードを準備しています...'}
              </Text>
              {typeof mediaPipeDownloadProgress.progress === 'number' ? (
                <View style={styles.progressTrack}>
                  <View
                    style={[
                      styles.progressFill,
                      { width: `${Math.round(mediaPipeDownloadProgress.progress * 100)}%` },
                    ]}
                  />
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.actionRow}>
            {mediaPipeModelStatus?.kind !== 'ready' ? (
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  mediaPipeActionState !== 'idle' ? styles.actionButtonDisabled : null,
                ]}
                onPress={() => handleMediaPipeDownload('install')}
                disabled={mediaPipeActionState !== 'idle'}
                testID="mediapipe-model-download-button"
              >
                {mediaPipeActionState === 'downloading' ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.actionButtonText}>モデルをダウンロード</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[
                  styles.actionButton,
                  mediaPipeActionState !== 'idle' ? styles.actionButtonDisabled : null,
                ]}
                onPress={() => handleMediaPipeDownload('redownload')}
                disabled={mediaPipeActionState !== 'idle'}
                testID="mediapipe-model-redownload-button"
              >
                {mediaPipeActionState === 'downloading' ? (
                  <ActivityIndicator size="small" color={Colors.white} />
                ) : (
                  <Text style={styles.actionButtonText}>再ダウンロード</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {mediaPipeModelStatus?.modelExists ? (
            <TouchableOpacity
              style={[
                styles.dangerOutlineButton,
                mediaPipeActionState !== 'idle' ? styles.actionButtonDisabled : null,
              ]}
              onPress={handleMediaPipeDelete}
              disabled={mediaPipeActionState !== 'idle'}
              testID="mediapipe-model-delete-button"
            >
              {mediaPipeActionState === 'deleting' ? (
                <ActivityIndicator size="small" color={Colors.error} />
              ) : (
                <Text style={styles.dangerOutlineButtonText}>MediaPipe モデルを削除</Text>
              )}
            </TouchableOpacity>
          ) : null}
        </Section>
      ) : null}

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

      <Section title="アプリ情報">
        <Text style={styles.bodyText}>Dining Memory</Text>
        <BuildInfoRow label="Version" value={getAppVersion()} />
        <BuildInfoRow label="Build" value={getAndroidVersionCode() ?? getIosBuildNumber()} />
        <BuildInfoRow label="Environment" value={getBuildEnvironment()} />
        <BuildInfoRow label="Commit" value={getGitCommitHash()} />
        <BuildInfoRow label="Built" value={getBuildDate()} />
        <BuildInfoRow label="Expo SDK" value={getExpoSdkVersion()} />
        <Text style={styles.metaText}>端末内保存を基本にした食事記録アプリ</Text>
      </Section>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function BuildInfoRow({ label, value }: { label: string; value: string | number | null }) {
  if (value === null || value === undefined) {
    return null;
  }
  return (
    <View style={styles.buildInfoRow}>
      <Text style={styles.buildInfoLabel}>{label}</Text>
      <Text style={styles.buildInfoValue}>{String(value)}</Text>
    </View>
  );
}

function formatModelStatusLabel(status: 'not_installed' | 'ready' | 'error' | 'downloading') {
  switch (status) {
    case 'ready':
      return '利用可能';
    case 'error':
      return 'エラー';
    case 'downloading':
      return 'ダウンロード中';
    default:
      return '未導入';
  }
}

function formatAiAssistStateLabel(
  status: 'checking' | 'downloading' | 'ready' | 'error' | 'not_ready'
) {
  switch (status) {
    case 'checking':
      return '確認中';
    case 'downloading':
      return 'ダウンロード中';
    case 'ready':
      return '利用可能';
    case 'error':
      return 'エラー';
    default:
      return '未準備';
  }
}

function buildAiAssistDescription(
  status: 'checking' | 'downloading' | 'ready' | 'error' | 'not_ready'
) {
  switch (status) {
    case 'checking':
      return 'AI入力補助を利用できるか確認しています。';
    case 'downloading':
      return 'AI入力補助に必要なデータを端末へ保存しています。';
    case 'ready':
      return '写真を外部送信せず、端末内で食事メモの下書きを作成できます。';
    case 'error':
      return 'AI入力補助の準備に問題があります。再ダウンロードを試してください。';
    default:
      return 'モデルをダウンロードすると、撮影後に食事メモの下書きを作成できます。';
  }
}

function formatProgressPercentage(value: number | null | undefined) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null;
  }

  return `${Math.round(value * 100)}%`;
}

function formatBytes(bytes: number | null | undefined) {
  if (typeof bytes !== 'number' || Number.isNaN(bytes) || bytes < 0) {
    return null;
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function isManagedFileInstalled(status: MealInputAssistModelStatus, key: 'model' | 'projector') {
  return key === 'model' ? status.files.modelExists : status.files.projectorExists;
}

function DownloadProgressCard({
  progress,
}: {
  progress: MealInputAssistModelDownloadProgress | null;
}) {
  const progressPercentage = formatProgressPercentage(progress?.overallProgress ?? null);
  const currentFileProgressPercentage = formatProgressPercentage(
    progress?.currentFileProgress ?? null
  );
  const currentBytesWritten = formatBytes(progress?.currentFileBytesWritten ?? null);
  const currentBytesExpected = formatBytes(progress?.currentFileBytesExpected ?? null);

  return (
    <View style={styles.downloadProgressCard} testID="meal-input-assist-model-download-progress">
      <Text style={styles.downloadProgressTitle}>
        {progressPercentage
          ? `進捗の目安: ${progressPercentage}`
          : 'ダウンロードを準備しています...'}
      </Text>
      {progress ? (
        <>
          <View style={styles.progressTrack}>
            <View
              style={[
                styles.progressFill,
                { width: `${Math.round(progress.overallProgress * 100)}%` },
              ]}
            />
          </View>
          <Text style={styles.runtimeStatusMode}>
            完了ファイル: {progress.completedFiles} / {progress.totalFiles}
          </Text>
          {progress.currentFileSourceFileName ? (
            <Text style={styles.runtimeStatusMode}>現在: {progress.currentFileSourceFileName}</Text>
          ) : null}
          {currentFileProgressPercentage ? (
            <Text style={styles.runtimeStatusMode}>
              現在の file 進捗: {currentFileProgressPercentage}
            </Text>
          ) : null}
          {currentBytesWritten ? (
            <Text style={styles.runtimeStatusMode}>
              受信量: {currentBytesWritten}
              {currentBytesExpected ? ` / ${currentBytesExpected}` : ''}
            </Text>
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function ModelStatusCard({
  status,
  visibleStatus,
  actionState,
  downloadProgress,
  showActions = true,
  onDownload,
  onRedownload,
}: {
  status: MealInputAssistModelStatus;
  visibleStatus: 'not_installed' | 'ready' | 'error' | 'downloading' | null;
  actionState: ModelActionState;
  downloadProgress: MealInputAssistModelDownloadProgress | null;
  showActions?: boolean;
  onDownload: () => void;
  onRedownload: () => void;
}) {
  const isBusy = actionState !== 'idle';
  const managedFiles = getMealInputAssistManagedFiles();

  return (
    <View style={styles.runtimeStatusCard} testID="meal-input-assist-model-status">
      <View style={styles.runtimeStatusHeader}>
        <Text style={styles.disabledLabel}>
          {MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} (meal input assist)
        </Text>
        <View
          style={[
            styles.runtimeStatusBadge,
            visibleStatus === 'ready'
              ? styles.runtimeStatusBadgeReady
              : visibleStatus === 'downloading'
                ? styles.runtimeStatusBadgeLoading
                : styles.runtimeStatusBadgeUnavailable,
          ]}
        >
          <Text style={styles.runtimeStatusBadgeText}>
            {formatModelStatusLabel(visibleStatus ?? status.kind)}
          </Text>
        </View>
      </View>

      <Text style={styles.runtimeStatusReason}>
        {visibleStatus === 'downloading'
          ? `${downloadProgress?.currentFileSourceFileName ?? `${MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} model / projector`} を端末へダウンロードしています。`
          : status.kind === 'ready'
            ? `${MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} の model / projector が端末に導入されています。`
            : status.kind === 'error'
              ? (status.errorMessage ??
                `${MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} model の状態に問題があります。`)
              : `${MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} の model / projector はまだ端末に導入されていません。`}
      </Text>

      {visibleStatus === 'downloading' ? (
        <DownloadProgressCard progress={downloadProgress} />
      ) : null}
      {status.version ? (
        <Text style={styles.runtimeStatusMode}>Version: {status.version}</Text>
      ) : null}
      {status.downloadedAt ? (
        <Text style={styles.runtimeStatusMode}>
          Downloaded: {new Date(status.downloadedAt).toLocaleString('ja-JP')}
        </Text>
      ) : null}

      <Text style={styles.runtimeStatusPathsLabel}>Download files</Text>
      {managedFiles.map(file => (
        <View key={file.key} style={styles.modelFileCard}>
          <Text style={styles.modelFileLabel}>{file.label}</Text>
          <Text style={styles.modelFileName}>{file.sourceFileName}</Text>
          <Text style={styles.runtimeStatusMode}>端末保存名: {file.fileName}</Text>
          {file.localPath ? (
            <Text style={styles.runtimeStatusPath}>保存先: {file.localPath}</Text>
          ) : null}
          <Text style={styles.runtimeStatusMode}>
            状態: {isManagedFileInstalled(status, file.key) ? '保存済み' : '未保存'}
          </Text>
        </View>
      ))}

      {showActions ? (
        <View style={styles.actionRow}>
          {status.kind === 'not_installed' ? (
            <TouchableOpacity
              style={[styles.actionButton, isBusy ? styles.actionButtonDisabled : null]}
              onPress={onDownload}
              disabled={isBusy}
              testID="meal-input-assist-model-download-button"
            >
              <Text style={styles.actionButtonText}>ダウンロード</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.actionButton, isBusy ? styles.actionButtonDisabled : null]}
              onPress={onRedownload}
              disabled={isBusy}
              testID="meal-input-assist-model-redownload-button"
            >
              <Text style={styles.actionButtonText}>再ダウンロード</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </View>
  );
}

function RuntimeStatusCard({
  title,
  entry,
  testID,
}: {
  title: string;
  entry: LocalAiRuntimeStatusEntry;
  testID: string;
}) {
  return (
    <View style={styles.runtimeStatusCard} testID={testID}>
      <View style={styles.runtimeStatusHeader}>
        <Text style={styles.disabledLabel}>{title}</Text>
        <View
          style={[
            styles.runtimeStatusBadge,
            entry.kind === 'ready'
              ? styles.runtimeStatusBadgeReady
              : styles.runtimeStatusBadgeUnavailable,
          ]}
        >
          <Text style={styles.runtimeStatusBadgeText}>
            {entry.kind === 'ready' ? 'Ready' : 'Unavailable'}
          </Text>
        </View>
      </View>
      <Text style={styles.runtimeStatusReason}>{entry.reason}</Text>
      <Text style={styles.runtimeStatusMode}>Mode: {entry.mode}</Text>
      <Text style={styles.runtimeStatusPathsLabel}>Expected paths</Text>
      {entry.expectedPaths.map(path => (
        <Text key={path} style={styles.runtimeStatusPath}>
          {path}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  card: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  bodyText: {
    fontSize: 15,
    lineHeight: 22,
    color: Colors.text,
  },
  metaText: {
    fontSize: 14,
    color: Colors.gray,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  settingTextBlock: {
    flex: 1,
    gap: 6,
  },
  settingTitle: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600',
  },
  settingDescription: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.text,
  },
  settingHint: {
    fontSize: 13,
    lineHeight: 19,
    color: Colors.gray,
  },
  aiStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  disabledLabel: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600',
  },
  runtimeStatusCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d7d7d7',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  runtimeStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  runtimeStatusBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  runtimeStatusBadgeReady: {
    backgroundColor: '#dff4e4',
  },
  runtimeStatusBadgeLoading: {
    backgroundColor: '#e5effd',
  },
  runtimeStatusBadgeUnavailable: {
    backgroundColor: '#fde5e5',
  },
  runtimeStatusBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: Colors.text,
  },
  runtimeStatusReason: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.text,
  },
  runtimeStatusMode: {
    fontSize: 13,
    color: Colors.gray,
  },
  runtimeStatusPathsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    marginTop: 2,
  },
  runtimeStatusPath: {
    fontSize: 12,
    lineHeight: 18,
    color: Colors.gray,
  },
  downloadProgressCard: {
    backgroundColor: '#f5f8ff',
    borderRadius: 10,
    padding: 12,
    gap: 6,
  },
  downloadProgressTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: '#dbe5f5',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  modelFileCard: {
    gap: 4,
    paddingTop: 8,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e1e1e1',
  },
  modelFileLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  modelFileName: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.text,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryActionButton: {
    flex: 1,
    backgroundColor: '#f3f3f3',
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
  secondaryActionButtonText: {
    color: Colors.text,
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
  detailBlock: {
    gap: 10,
    marginTop: 2,
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
  dangerOutlineButton: {
    borderWidth: 1,
    borderColor: Colors.error,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dangerOutlineButtonText: {
    color: Colors.error,
    fontWeight: '700',
    fontSize: 15,
  },
  buildInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  buildInfoLabel: {
    fontSize: 14,
    color: Colors.gray,
  },
  buildInfoValue: {
    fontSize: 14,
    color: Colors.text,
    fontWeight: '500',
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
