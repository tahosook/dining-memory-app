import React, { useState } from 'react';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import type {
  MealInputAssistModelDownloadProgress,
  MealInputAssistModelStatus,
  MediaPipeClassifierModelId,
} from '../../../ai/mealInputAssist';
import type { LocalAiRuntimeStatusSnapshot } from '../../../ai/runtime';
import { Colors } from '../../../constants/Colors';
import type { AiAssistState, ModelActionState } from '../../../hooks/settings';
import { AiDownloadProgressCard } from './AiDownloadProgressCard';
import { AiModelStatusCard } from './AiModelStatusCard';
import { MediaPipeModelSelector } from './MediaPipeModelSelector';
import { RuntimeStatusCard } from './RuntimeStatusCard';
import { SettingsSection } from './SettingsSection';
import { buildAiAssistDescription, formatAiAssistStateLabel } from './settingsFormatters';
import { settingsStyles } from './settingsStyles';

export function AiInputAssistSection({
  aiAssistState,
  aiInputAssistEnabled,
  aiAssistSwitchDisabled,
  aiAssistDisabledReason,
  modelDownloadProgress,
  mealInputAssistModelStatus,
  mealInputAssistModelStatusLoading,
  localAiRuntimeStatus,
  localAiRuntimeStatusLoading,
  modelActionState,
  visibleModelStatus,
  showDeleteAllModelsAction,
  runtimeReady,
  modelReady,
  mediaPipeRuntimeReady,
  fallbackMediaPipeReady,
  canSwitchMediaPipeModel,
  selectedMediaPipeModelId,
  onToggleAiInputAssist,
  onSelectMediaPipeModel,
  onModelDownload,
  onDeleteAllModels,
}: {
  aiAssistState: AiAssistState;
  aiInputAssistEnabled: boolean;
  aiAssistSwitchDisabled: boolean;
  aiAssistDisabledReason: string | null;
  modelDownloadProgress: MealInputAssistModelDownloadProgress | null;
  mealInputAssistModelStatus: MealInputAssistModelStatus | null;
  mealInputAssistModelStatusLoading: boolean;
  localAiRuntimeStatus: LocalAiRuntimeStatusSnapshot | null;
  localAiRuntimeStatusLoading: boolean;
  modelActionState: ModelActionState;
  visibleModelStatus: 'not_installed' | 'ready' | 'error' | 'downloading' | null;
  showDeleteAllModelsAction: boolean;
  runtimeReady: boolean;
  modelReady: boolean;
  mediaPipeRuntimeReady: boolean;
  fallbackMediaPipeReady: boolean;
  canSwitchMediaPipeModel: boolean;
  selectedMediaPipeModelId: MediaPipeClassifierModelId;
  onToggleAiInputAssist: (nextValue: boolean) => void;
  onSelectMediaPipeModel: (modelId: MediaPipeClassifierModelId) => void;
  onModelDownload: (mode: 'install' | 'redownload') => void;
  onDeleteAllModels: () => void;
}) {
  const [showAiDetails, setShowAiDetails] = useState(false);

  return (
    <SettingsSection title="AI入力補助">
      <View style={localStyles.aiStatusHeader}>
        <Text style={localStyles.settingTitle}>
          状態: {formatAiAssistStateLabel(aiAssistState)}
        </Text>
        <View
          style={[
            settingsStyles.runtimeStatusBadge,
            aiAssistState === 'ready'
              ? settingsStyles.runtimeStatusBadgeReady
              : aiAssistState === 'downloading' || aiAssistState === 'checking'
                ? settingsStyles.runtimeStatusBadgeLoading
                : settingsStyles.runtimeStatusBadgeUnavailable,
          ]}
        >
          <Text style={settingsStyles.runtimeStatusBadgeText}>
            {formatAiAssistStateLabel(aiAssistState)}
          </Text>
        </View>
      </View>
      <Text style={settingsStyles.bodyText}>{buildAiAssistDescription(aiAssistState)}</Text>

      {aiAssistState === 'downloading' ? (
        <AiDownloadProgressCard progress={modelDownloadProgress} />
      ) : null}

      {aiAssistState === 'ready' ? (
        <>
          <View style={localStyles.settingRow}>
            <View style={localStyles.settingTextBlock}>
              <Text style={localStyles.settingTitle}>AI入力補助を使う</Text>
              <Text style={localStyles.settingDescription}>
                撮影後の確認画面で、端末内だけでメモ下書きを作成します。
              </Text>
            </View>
            <Switch
              value={aiInputAssistEnabled}
              onValueChange={onToggleAiInputAssist}
              disabled={aiAssistSwitchDisabled}
              testID="ai-input-assist-toggle"
            />
          </View>

          {canSwitchMediaPipeModel ? (
            <MediaPipeModelSelector
              selectedModelId={selectedMediaPipeModelId}
              mediaPipeRuntimeReady={mediaPipeRuntimeReady}
              fallbackMediaPipeReady={fallbackMediaPipeReady}
              onSelectModel={onSelectMediaPipeModel}
            />
          ) : null}
        </>
      ) : (
        <Text style={localStyles.settingHint}>{aiAssistDisabledReason}</Text>
      )}

      <View style={settingsStyles.actionRow}>
        {aiAssistState === 'not_ready' && !modelReady ? (
          <TouchableOpacity
            style={[
              settingsStyles.actionButton,
              modelActionState !== 'idle' ? settingsStyles.actionButtonDisabled : null,
            ]}
            onPress={() => onModelDownload('install')}
            disabled={modelActionState !== 'idle'}
            testID="meal-input-assist-model-download-button"
          >
            <Text style={settingsStyles.actionButtonText}>モデルをダウンロード</Text>
          </TouchableOpacity>
        ) : null}
        {(aiAssistState === 'ready' &&
          (modelReady || mealInputAssistModelStatus?.kind === 'error')) ||
        aiAssistState === 'error' ||
        (modelReady && !runtimeReady && aiAssistState !== 'checking') ? (
          <TouchableOpacity
            style={[
              settingsStyles.actionButton,
              modelActionState !== 'idle' ? settingsStyles.actionButtonDisabled : null,
            ]}
            onPress={() => onModelDownload('redownload')}
            disabled={modelActionState !== 'idle'}
            testID="meal-input-assist-model-redownload-button"
          >
            <Text style={settingsStyles.actionButtonText}>再ダウンロード</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {showDeleteAllModelsAction ? (
        <TouchableOpacity
          style={[
            settingsStyles.dangerOutlineButton,
            modelActionState !== 'idle' ? settingsStyles.actionButtonDisabled : null,
          ]}
          onPress={onDeleteAllModels}
          disabled={modelActionState !== 'idle'}
          testID="delete-all-downloaded-ai-models-button"
        >
          <Text style={settingsStyles.dangerOutlineButtonText}>ダウンロード済みモデルを削除</Text>
        </TouchableOpacity>
      ) : null}

      <TouchableOpacity
        style={settingsStyles.secondaryButton}
        onPress={() => setShowAiDetails(current => !current)}
        testID="toggle-ai-details-button"
        accessibilityRole="button"
        accessibilityLabel="AIアシストの詳細情報"
        accessibilityHint="AIアシストモデルの詳細情報の表示を切り替えます"
        accessibilityState={{ expanded: showAiDetails }}
      >
        <Text style={settingsStyles.secondaryButtonText}>
          {showAiDetails ? '詳細情報を隠す' : '詳細情報を表示'}
        </Text>
      </TouchableOpacity>
      {showAiDetails ? (
        <View style={localStyles.detailBlock} testID="ai-details">
          {mealInputAssistModelStatus ? (
            <AiModelStatusCard
              status={mealInputAssistModelStatus}
              visibleStatus={visibleModelStatus}
              actionState={modelActionState}
              downloadProgress={modelDownloadProgress}
              showActions={false}
              onDownload={() => onModelDownload('install')}
              onRedownload={() => onModelDownload('redownload')}
            />
          ) : mealInputAssistModelStatusLoading ? (
            <Text style={settingsStyles.metaText} testID="meal-input-assist-model-status-loading">
              model file status を確認しています...
            </Text>
          ) : (
            <Text style={settingsStyles.metaText} testID="meal-input-assist-model-status-error">
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
            <Text style={settingsStyles.metaText} testID="local-ai-runtime-status-loading">
              runtime status を確認しています...
            </Text>
          ) : (
            <Text style={settingsStyles.metaText} testID="local-ai-runtime-status-error">
              runtime status を確認できませんでした。
            </Text>
          )}
        </View>
      ) : null}
    </SettingsSection>
  );
}

const localStyles = StyleSheet.create({
  aiStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
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
  detailBlock: {
    gap: 10,
    marginTop: 2,
  },
});
