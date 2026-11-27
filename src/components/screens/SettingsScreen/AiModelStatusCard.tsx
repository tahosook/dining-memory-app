import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  getMealInputAssistManagedFiles,
  MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME,
  type MealInputAssistModelDownloadProgress,
  type MealInputAssistModelStatus,
} from '../../../ai/mealInputAssist';
import { Colors } from '../../../constants/Colors';
import type { ModelActionState } from '../../../hooks/settings';
import { AiDownloadProgressCard } from './AiDownloadProgressCard';
import { formatModelStatusLabel, isManagedFileInstalled } from './settingsFormatters';
import { settingsStyles } from './settingsStyles';

export function AiModelStatusCard({
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
    <View style={settingsStyles.runtimeStatusCard} testID="meal-input-assist-model-status">
      <View style={settingsStyles.runtimeStatusHeader}>
        <Text style={settingsStyles.disabledLabel}>
          {MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME} (meal input assist)
        </Text>
        <View
          style={[
            settingsStyles.runtimeStatusBadge,
            visibleStatus === 'ready'
              ? settingsStyles.runtimeStatusBadgeReady
              : visibleStatus === 'downloading'
                ? settingsStyles.runtimeStatusBadgeLoading
                : settingsStyles.runtimeStatusBadgeUnavailable,
          ]}
        >
          <Text style={settingsStyles.runtimeStatusBadgeText}>
            {formatModelStatusLabel(visibleStatus ?? status.kind)}
          </Text>
        </View>
      </View>

      <Text style={settingsStyles.runtimeStatusReason}>
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
        <AiDownloadProgressCard progress={downloadProgress} />
      ) : null}
      {status.version ? (
        <Text style={settingsStyles.runtimeStatusMode}>Version: {status.version}</Text>
      ) : null}
      {status.downloadedAt ? (
        <Text style={settingsStyles.runtimeStatusMode}>
          Downloaded: {new Date(status.downloadedAt).toLocaleString('ja-JP')}
        </Text>
      ) : null}

      <Text style={localStyles.runtimeStatusPathsLabel}>Download files</Text>
      {managedFiles.map(file => (
        <View key={file.key} style={localStyles.modelFileCard}>
          <Text style={localStyles.modelFileLabel}>{file.label}</Text>
          <Text style={localStyles.modelFileName}>{file.sourceFileName}</Text>
          <Text style={settingsStyles.runtimeStatusMode}>端末保存名: {file.fileName}</Text>
          {file.localPath ? (
            <Text style={localStyles.runtimeStatusPath}>保存先: {file.localPath}</Text>
          ) : null}
          <Text style={settingsStyles.runtimeStatusMode}>
            状態: {isManagedFileInstalled(status, file.key) ? '保存済み' : '未保存'}
          </Text>
        </View>
      ))}

      {showActions ? (
        <View style={settingsStyles.actionRow}>
          {status.kind === 'not_installed' ? (
            <TouchableOpacity
              style={[
                settingsStyles.actionButton,
                isBusy ? settingsStyles.actionButtonDisabled : null,
              ]}
              onPress={onDownload}
              disabled={isBusy}
              testID="meal-input-assist-model-download-button"
            >
              <Text style={settingsStyles.actionButtonText}>ダウンロード</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[
                settingsStyles.actionButton,
                isBusy ? settingsStyles.actionButtonDisabled : null,
              ]}
              onPress={onRedownload}
              disabled={isBusy}
              testID="meal-input-assist-model-redownload-button"
            >
              <Text style={settingsStyles.actionButtonText}>再ダウンロード</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}
    </View>
  );
}

const localStyles = StyleSheet.create({
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
});
