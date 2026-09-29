import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import {
  getMealInputAssistManagedFiles,
  MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME,
  type MealInputAssistModelDownloadProgress,
  type MealInputAssistModelStatus,
} from '../../../ai/mealInputAssist';
import { Colors } from '../../../constants/Colors';
import { DownloadProgressCard } from './DownloadProgressCard';

type ModelActionState = 'idle' | 'downloading' | 'deleting';

function formatModelStatusLabel(status: 'not_installed' | 'ready' | 'error' | 'downloading') {
  switch (status) {
    case 'ready':
      return '利用可能';
    case 'error':
      return 'エラー';
    case 'downloading':
      return 'ダウンロード中';
    case 'not_installed':
      return '未導入';
    default:
      return '不明';
  }
}

function isManagedFileInstalled(status: MealInputAssistModelStatus, key: 'model' | 'projector') {
  return key === 'model' ? status.files.modelExists : status.files.projectorExists;
}

export function ModelStatusCard({
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

const styles = StyleSheet.create({
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
  disabledLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
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
  actionButtonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 15,
  },
});
