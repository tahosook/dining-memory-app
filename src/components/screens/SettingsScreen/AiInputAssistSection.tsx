import React, { useCallback, useMemo, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  getMealInputAssistModelStatus,
  installMealInputAssistModel,
  redownloadMealInputAssistModel,
  deleteAllDownloadedLocalAiModels,
} from '../../../ai/mealInputAssist/modelInstaller';
import {
  type MealInputAssistModelDownloadProgress,
  type MealInputAssistModelStatus,
} from '../../../ai/mealInputAssist';
import {
  getLocalAiRuntimeStatusSnapshot,
  type LocalAiRuntimeStatusSnapshot,
} from '../../../ai/runtime';
import { AppSettingsService } from '../../../database/services/AppSettingsService';
import { sanitizeLogObject } from '../../../utils/logSanitizer';
import { Colors } from '../../../constants/Colors';
import { Section } from './Section';
import { DownloadProgressCard } from './DownloadProgressCard';
import { ModelStatusCard } from './ModelStatusCard';
import { RuntimeStatusCard } from './RuntimeStatusCard';

type ModelActionState = 'idle' | 'downloading' | 'deleting';

function formatAiAssistStateLabel(
  state: 'checking' | 'downloading' | 'ready' | 'error' | 'not_ready'
) {
  switch (state) {
    case 'checking':
      return '確認中';
    case 'downloading':
      return 'ダウンロード中';
    case 'ready':
      return '利用可能';
    case 'error':
      return 'エラー';
    case 'not_ready':
      return '未準備';
    default:
      return '不明';
  }
}

function buildAiAssistDescription(
  state: 'checking' | 'downloading' | 'ready' | 'error' | 'not_ready'
) {
  switch (state) {
    case 'checking':
      return 'AI入力補助の状態を確認しています。';
    case 'downloading':
      return 'AI入力補助に必要なデータをダウンロードしています。通信環境の良い場所でお待ちください。';
    case 'ready':
      return 'AI入力補助に必要なデータが端末に導入され、利用可能な状態です。';
    case 'error':
      return 'AI入力補助の状態に問題があります。';
    case 'not_ready':
      return 'AI入力補助を利用するには、モデルデータ（約20MB）のダウンロードが必要です。一度ダウンロードするとオフラインで動作します。';
    default:
      return '不明な状態です。';
  }
}

export function AiInputAssistSection() {
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
  const [showAiDetails, setShowAiDetails] = useState(false);

  const loadAiInputAssistSetting = useCallback(async () => {
    setAiInputAssistLoading(true);
    try {
      const nextEnabled = await AppSettingsService.getAiInputAssistEnabled();
      setAiInputAssistEnabled(nextEnabled);
    } catch (error) {
      console.error('Failed to load AI input assist setting:', sanitizeLogObject(error));
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
      console.error('Failed to load meal input assist model status:', sanitizeLogObject(error));
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
      console.error('Failed to load local AI runtime status:', sanitizeLogObject(error));
      setLocalAiRuntimeStatus(null);
    } finally {
      setLocalAiRuntimeStatusLoading(false);
    }
  }, []);

  const reloadLocalAiSection = useCallback(async () => {
    await Promise.all([loadMealInputAssistModelStatus(), loadLocalAiRuntimeStatus()]);
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
      console.error('Failed to save AI input assist setting:', sanitizeLogObject(error));
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
        console.error('Failed to download meal input assist model:', sanitizeLogObject(error));
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
      'ダウンロード済みモデルの削除',
      '端末に保存されているAI入力補助のモデルデータをすべて削除しますか？\n（再度利用するには再ダウンロードが必要です）',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            setModelActionState('deleting');
            try {
              await deleteAllDownloadedLocalAiModels();
              await reloadLocalAiSection();
              Alert.alert('削除完了', 'ダウンロード済みのモデルデータを削除しました。');
            } catch (error) {
              console.error('Failed to delete models:', sanitizeLogObject(error));
              const message =
                error instanceof Error && error.message
                  ? error.message
                  : 'モデルデータの削除に失敗しました。';
              Alert.alert('削除に失敗しました', message);
            } finally {
              setModelActionState('idle');
            }
          },
        },
      ]
    );
  }, [reloadLocalAiSection]);

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

  return (
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
  );
}

const styles = StyleSheet.create({
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
  detailBlock: {
    gap: 10,
    marginTop: 2,
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
