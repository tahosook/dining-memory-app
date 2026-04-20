import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getMealInputAssistManagedFiles,
  MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME,
  type MealInputAssistModelDownloadProgress,
  type MealInputAssistModelStatus,
} from '../../ai/mealInputAssist';
import {
  deleteAllDownloadedLocalAiModels,
  getMealInputAssistModelStatus,
  installMealInputAssistModel,
  redownloadMealInputAssistModel,
} from '../../ai/mealInputAssist/modelInstaller';
import { getLocalAiRuntimeStatusSnapshot, type LocalAiRuntimeStatusEntry, type LocalAiRuntimeStatusSnapshot } from '../../ai/runtime';
import { Colors } from '../../constants/Colors';
import { MealService } from '../../database/services/MealService';
import { AppSettingsService } from '../../database/services/AppSettingsService';

type ModelActionState = 'idle' | 'downloading' | 'deleting';

export default function SettingsScreen() {
  const [aiInputAssistEnabled, setAiInputAssistEnabled] = useState(false);
  const [aiInputAssistLoading, setAiInputAssistLoading] = useState(true);
  const [mealInputAssistModelStatus, setMealInputAssistModelStatus] = useState<MealInputAssistModelStatus | null>(null);
  const [mealInputAssistModelStatusLoading, setMealInputAssistModelStatusLoading] = useState(true);
  const [localAiRuntimeStatus, setLocalAiRuntimeStatus] = useState<LocalAiRuntimeStatusSnapshot | null>(null);
  const [localAiRuntimeStatusLoading, setLocalAiRuntimeStatusLoading] = useState(true);
  const [modelActionState, setModelActionState] = useState<ModelActionState>('idle');
  const [modelDownloadProgress, setModelDownloadProgress] = useState<MealInputAssistModelDownloadProgress | null>(null);

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
    await Promise.all([
      loadMealInputAssistModelStatus(),
      loadLocalAiRuntimeStatus(),
    ]);
  }, [loadLocalAiRuntimeStatus, loadMealInputAssistModelStatus]);

  useFocusEffect(
    useCallback(() => {
      loadAiInputAssistSetting().catch(() => undefined);
      reloadLocalAiSection().catch(() => undefined);
    }, [loadAiInputAssistSetting, reloadLocalAiSection])
  );

  const handleAiInputAssistToggle = useCallback(async (nextValue: boolean) => {
    setAiInputAssistEnabled(nextValue);

    try {
      await AppSettingsService.setAiInputAssistEnabled(nextValue);
    } catch (error) {
      console.error('Failed to save AI input assist setting:', error);
      setAiInputAssistEnabled((current) => !current);
      Alert.alert('設定を保存できませんでした', 'AI入力補助の設定を保存できませんでした。もう一度お試しください。');
    }
  }, []);

  const handleModelDownload = useCallback(async (mode: 'install' | 'redownload') => {
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
      Alert.alert('ダウンロード完了', `${MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} model / projector を端末に保存しました。`);
    } catch (error) {
      console.error('Failed to download meal input assist model:', error);
      await reloadLocalAiSection().catch(() => undefined);
      const message = error instanceof Error && error.message
        ? error.message
        : `${MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} model をダウンロードできませんでした。`;
      Alert.alert('ダウンロードに失敗しました', message);
    } finally {
      setModelDownloadProgress(null);
      setModelActionState('idle');
    }
  }, [reloadLocalAiSection]);

  const handleDeleteAllModels = useCallback(() => {
    Alert.alert('ダウンロード済み AI model を全て削除', 'documentDirectory/ai-models/ 配下の保存済み model を端末から削除します。現在は meal input assist 用の model / projector が対象です。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          setModelActionState('deleting');

          try {
            await deleteAllDownloadedLocalAiModels();
            await reloadLocalAiSection();
            Alert.alert('削除完了', 'ダウンロード済み AI model を削除しました。');
          } catch (error) {
            console.error('Failed to delete downloaded AI models:', error);
            await reloadLocalAiSection().catch(() => undefined);
            const message = error instanceof Error && error.message
              ? error.message
              : 'ダウンロード済み AI model を削除できませんでした。';
            Alert.alert('削除に失敗しました', message);
          } finally {
            setModelActionState('idle');
          }
        },
      },
    ]);
  }, [reloadLocalAiSection]);

  const handleDeleteAllData = useCallback(() => {
    Alert.alert('ローカルデータ削除', '端末内の食事記録をすべて削除します。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          await MealService.clearAllMeals();
          Alert.alert('削除完了', 'ローカルデータを削除しました。');
        },
      },
    ]);
  }, []);

  const visibleModelStatus = useMemo(
    () => modelActionState === 'downloading' ? 'downloading' : mealInputAssistModelStatus?.kind ?? null,
    [mealInputAssistModelStatus?.kind, modelActionState]
  );
  const showDeleteAllModelsAction = useMemo(() => {
    if (!mealInputAssistModelStatus) {
      return false;
    }

    return mealInputAssistModelStatus.kind !== 'not_installed'
      || mealInputAssistModelStatus.files.modelExists
      || mealInputAssistModelStatus.files.projectorExists;
  }, [mealInputAssistModelStatus]);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="プライバシー">
        <Text style={styles.bodyText}>このアプリは、記録データを端末内に保存する前提で動作します。</Text>
        <Text style={styles.bodyText}>自動的な外部送信は行わず、Records 詳細からユーザーが明示的に開く共有シートだけを例外として扱います。</Text>
        <Text style={styles.bodyText}>AI 入力補助は設定でオンにした場合だけ扱い、現在の実装では外部送信を行いません。</Text>
        <Text style={styles.bodyText}>Android の写真は `Pictures / Dining Memory` の専用アルバムに保存し、将来バックアップ対象として扱いやすい前提を維持します。</Text>
      </Section>

      <Section title="AI入力補助">
        <View style={styles.settingRow}>
          <View style={styles.settingTextBlock}>
            <Text style={styles.settingTitle}>端末内 AI 入力補助を有効にする</Text>
            <Text style={styles.settingDescription}>
              review 画面で写真を端末内だけで解析し、料理名やジャンル候補を提案します。利用前に Settings から model を端末へ明示ダウンロードしてください。
            </Text>
            <Text style={styles.settingHint}>
              model の導入状態と runtime の blocker は下の status で確認できます。
            </Text>
          </View>
          <Switch
            value={aiInputAssistEnabled}
            onValueChange={handleAiInputAssistToggle}
            disabled={aiInputAssistLoading}
            testID="ai-input-assist-toggle"
          />
        </View>
      </Section>

      <Section title="AI model ダウンロード">
        {mealInputAssistModelStatus ? (
          <ModelStatusCard
            status={mealInputAssistModelStatus}
            visibleStatus={visibleModelStatus}
            actionState={modelActionState}
            downloadProgress={modelDownloadProgress}
            onDownload={() => handleModelDownload('install')}
            onRedownload={() => handleModelDownload('redownload')}
          />
        ) : mealInputAssistModelStatusLoading ? (
          <Text style={styles.metaText} testID="meal-input-assist-model-status-loading">
            meal input assist model の状態を確認しています...
          </Text>
        ) : (
          <Text style={styles.metaText} testID="meal-input-assist-model-status-error">
            meal input assist model の状態を確認できませんでした。もう一度画面を開き直してください。
          </Text>
        )}
        {showDeleteAllModelsAction ? (
          <TouchableOpacity
            style={[styles.dangerOutlineButton, modelActionState !== 'idle' ? styles.actionButtonDisabled : null]}
            onPress={handleDeleteAllModels}
            disabled={modelActionState !== 'idle'}
            testID="delete-all-downloaded-ai-models-button"
          >
            <Text style={styles.dangerOutlineButtonText}>ダウンロード済み AI model を全て削除</Text>
          </TouchableOpacity>
        ) : null}
      </Section>

      <Section title="Local AI Runtime Status">
        <Text style={styles.bodyText}>
          Settings から model / projector をダウンロード済みで、native runtime と対応 ABI がそろっている場合だけ local runtime が ready になります。
        </Text>
        {localAiRuntimeStatus ? (
          <RuntimeStatusCard
            title="AI入力補助"
            entry={localAiRuntimeStatus.mealInputAssist}
            testID="meal-input-assist-runtime-status"
          />
        ) : localAiRuntimeStatusLoading ? (
          <Text style={styles.metaText} testID="local-ai-runtime-status-loading">local AI runtime status を確認しています...</Text>
        ) : (
          <Text style={styles.metaText} testID="local-ai-runtime-status-error">
            local AI runtime status を確認できませんでした。もう一度画面を開き直してください。
          </Text>
        )}
      </Section>

      <Section title="現在の機能範囲">
        <DisabledItem label="クラウドバックアップ" description="準備中" />
        <DisabledItem label="データエクスポート" description="準備中" />
        <DisabledItem label="復元機能" description="準備中" />
      </Section>

      <Section title="ローカルデータ">
        <TouchableOpacity style={styles.dangerButton} onPress={handleDeleteAllData}>
          <Text style={styles.dangerButtonText}>ローカルデータを削除</Text>
        </TouchableOpacity>
      </Section>

      <Section title="アプリ情報">
        <Text style={styles.bodyText}>Dining Memory</Text>
        <Text style={styles.metaText}>Version 1.0.0</Text>
        <Text style={styles.metaText}>Offline-first MVP implementation</Text>
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

function DisabledItem({ label, description }: { label: string; description: string }) {
  return (
    <View style={styles.disabledItem}>
      <Text style={styles.disabledLabel}>{label}</Text>
      <Text style={styles.disabledDescription}>{description}</Text>
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
  const currentFileProgressPercentage = formatProgressPercentage(progress?.currentFileProgress ?? null);
  const currentBytesWritten = formatBytes(progress?.currentFileBytesWritten ?? null);
  const currentBytesExpected = formatBytes(progress?.currentFileBytesExpected ?? null);

  return (
    <View style={styles.downloadProgressCard} testID="meal-input-assist-model-download-progress">
      <Text style={styles.downloadProgressTitle}>
        {progressPercentage ? `進捗の目安: ${progressPercentage}` : 'ダウンロードを準備しています...'}
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
            <Text style={styles.runtimeStatusMode}>
              現在: {progress.currentFileSourceFileName}
            </Text>
          ) : null}
          {currentFileProgressPercentage ? (
            <Text style={styles.runtimeStatusMode}>
              現在の file 進捗: {currentFileProgressPercentage}
            </Text>
          ) : null}
          {currentBytesWritten ? (
            <Text style={styles.runtimeStatusMode}>
              受信量: {currentBytesWritten}{currentBytesExpected ? ` / ${currentBytesExpected}` : ''}
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
  onDownload,
  onRedownload,
}: {
  status: MealInputAssistModelStatus;
  visibleStatus: 'not_installed' | 'ready' | 'error' | 'downloading' | null;
  actionState: ModelActionState;
  downloadProgress: MealInputAssistModelDownloadProgress | null;
  onDownload: () => void;
  onRedownload: () => void;
}) {
  const isBusy = actionState !== 'idle';
  const managedFiles = getMealInputAssistManagedFiles();

  return (
    <View style={styles.runtimeStatusCard} testID="meal-input-assist-model-status">
      <View style={styles.runtimeStatusHeader}>
        <Text style={styles.disabledLabel}>{MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} (meal input assist)</Text>
        <View style={[
          styles.runtimeStatusBadge,
          visibleStatus === 'ready'
            ? styles.runtimeStatusBadgeReady
            : visibleStatus === 'downloading'
              ? styles.runtimeStatusBadgeLoading
              : styles.runtimeStatusBadgeUnavailable,
        ]}
        >
          <Text style={styles.runtimeStatusBadgeText}>{formatModelStatusLabel(visibleStatus ?? status.kind)}</Text>
        </View>
      </View>

      <Text style={styles.runtimeStatusReason}>
        {visibleStatus === 'downloading'
          ? `${downloadProgress?.currentFileSourceFileName ?? `${MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} model / projector`} を端末へダウンロードしています。`
          : status.kind === 'ready'
            ? `${MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} の model / projector が端末に導入されています。`
            : status.kind === 'error'
              ? status.errorMessage ?? `${MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} model の状態に問題があります。`
              : `${MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} の model / projector はまだ端末に導入されていません。`}
      </Text>

      {visibleStatus === 'downloading' ? <DownloadProgressCard progress={downloadProgress} /> : null}
      {status.version ? <Text style={styles.runtimeStatusMode}>Version: {status.version}</Text> : null}
      {status.downloadedAt ? (
        <Text style={styles.runtimeStatusMode}>Downloaded: {new Date(status.downloadedAt).toLocaleString('ja-JP')}</Text>
      ) : null}

      <Text style={styles.runtimeStatusPathsLabel}>Download files</Text>
      {managedFiles.map((file) => (
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
        <View style={[
          styles.runtimeStatusBadge,
          entry.kind === 'ready' ? styles.runtimeStatusBadgeReady : styles.runtimeStatusBadgeUnavailable,
        ]}
        >
          <Text style={styles.runtimeStatusBadgeText}>{entry.kind === 'ready' ? 'Ready' : 'Unavailable'}</Text>
        </View>
      </View>
      <Text style={styles.runtimeStatusReason}>{entry.reason}</Text>
      <Text style={styles.runtimeStatusMode}>Mode: {entry.mode}</Text>
      <Text style={styles.runtimeStatusPathsLabel}>Expected paths</Text>
      {entry.expectedPaths.map((path) => (
        <Text key={path} style={styles.runtimeStatusPath}>{path}</Text>
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
  disabledItem: {
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e1e1e1',
  },
  disabledLabel: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600',
  },
  disabledDescription: {
    fontSize: 13,
    color: Colors.gray,
    marginTop: 4,
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
});
