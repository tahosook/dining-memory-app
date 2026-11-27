import React from 'react';
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native';
import {
  MEDIAPIPE_MODEL_DISPLAY_NAME,
  type MediaPipeModelDownloadProgress,
  type MediaPipeModelStatus,
} from '../../../ai/mealInputAssist';
import { Colors } from '../../../constants/Colors';
import type { ModelActionState } from '../../../hooks/settings';
import { SettingsSection } from './SettingsSection';
import { formatModelStatusLabel } from './settingsFormatters';
import { settingsStyles } from './settingsStyles';

export function MediaPipeDevSection({
  mediaPipeModelStatus,
  mediaPipeModelStatusLoading,
  mediaPipeActionState,
  mediaPipeDownloadProgress,
  onDownload,
  onDelete,
}: {
  mediaPipeModelStatus: MediaPipeModelStatus | null;
  mediaPipeModelStatusLoading: boolean;
  mediaPipeActionState: ModelActionState;
  mediaPipeDownloadProgress: MediaPipeModelDownloadProgress | null;
  onDownload: (mode: 'install' | 'redownload') => void;
  onDelete: () => void;
}) {
  return (
    <SettingsSection title="MediaPipe (Experimental / DEV)">
      <Text style={settingsStyles.bodyText}>{MEDIAPIPE_MODEL_DISPLAY_NAME}</Text>
      <Text style={settingsStyles.metaText}>
        端末内画像分類用の MediaPipe モデルです。開発環境（__DEV__）でのみ表示されます。
      </Text>

      <View style={settingsStyles.runtimeStatusCard} testID="mediapipe-model-status-card">
        <View style={settingsStyles.runtimeStatusHeader}>
          <Text style={settingsStyles.disabledLabel}>モデル状態</Text>
          <View
            style={[
              settingsStyles.runtimeStatusBadge,
              mediaPipeModelStatus?.kind === 'ready'
                ? settingsStyles.runtimeStatusBadgeReady
                : settingsStyles.runtimeStatusBadgeUnavailable,
            ]}
          >
            <Text
              style={settingsStyles.runtimeStatusBadgeText}
              testID="mediapipe-model-status-badge"
            >
              {mediaPipeModelStatusLoading
                ? '確認中'
                : formatModelStatusLabel(mediaPipeModelStatus?.kind ?? 'not_installed')}
            </Text>
          </View>
        </View>

        {mediaPipeModelStatus?.version ? (
          <Text style={settingsStyles.runtimeStatusMode}>
            Version: {mediaPipeModelStatus.version}
          </Text>
        ) : null}
        {mediaPipeModelStatus?.errorMessage ? (
          <Text style={settingsStyles.runtimeStatusReason}>
            {mediaPipeModelStatus.errorMessage}
          </Text>
        ) : null}
      </View>

      {mediaPipeDownloadProgress ? (
        <View style={settingsStyles.downloadProgressCard} testID="mediapipe-download-progress">
          <Text style={settingsStyles.downloadProgressTitle}>
            {mediaPipeDownloadProgress.phase === 'verifying'
              ? 'SHA256 ハッシュを検証しています...'
              : mediaPipeDownloadProgress.phase === 'installing'
                ? 'モデルファイルを配置しています...'
                : mediaPipeDownloadProgress.progress !== null
                  ? `ダウンロード中: ${Math.round(mediaPipeDownloadProgress.progress * 100)}%`
                  : 'ダウンロードを準備しています...'}
          </Text>
          {typeof mediaPipeDownloadProgress.progress === 'number' ? (
            <View style={settingsStyles.progressTrack}>
              <View
                style={[
                  settingsStyles.progressFill,
                  { width: `${Math.round(mediaPipeDownloadProgress.progress * 100)}%` },
                ]}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={settingsStyles.actionRow}>
        {mediaPipeModelStatus?.kind !== 'ready' ? (
          <TouchableOpacity
            style={[
              settingsStyles.actionButton,
              mediaPipeActionState !== 'idle' ? settingsStyles.actionButtonDisabled : null,
            ]}
            onPress={() => onDownload('install')}
            disabled={mediaPipeActionState !== 'idle'}
            testID="mediapipe-model-download-button"
          >
            {mediaPipeActionState === 'downloading' ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={settingsStyles.actionButtonText}>モデルをダウンロード</Text>
            )}
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[
              settingsStyles.actionButton,
              mediaPipeActionState !== 'idle' ? settingsStyles.actionButtonDisabled : null,
            ]}
            onPress={() => onDownload('redownload')}
            disabled={mediaPipeActionState !== 'idle'}
            testID="mediapipe-model-redownload-button"
          >
            {mediaPipeActionState === 'downloading' ? (
              <ActivityIndicator size="small" color={Colors.white} />
            ) : (
              <Text style={settingsStyles.actionButtonText}>再ダウンロード</Text>
            )}
          </TouchableOpacity>
        )}
      </View>

      {mediaPipeModelStatus?.modelExists ? (
        <TouchableOpacity
          style={[
            settingsStyles.dangerOutlineButton,
            mediaPipeActionState !== 'idle' ? settingsStyles.actionButtonDisabled : null,
          ]}
          onPress={onDelete}
          disabled={mediaPipeActionState !== 'idle'}
          testID="mediapipe-model-delete-button"
        >
          {mediaPipeActionState === 'deleting' ? (
            <ActivityIndicator size="small" color={Colors.error} />
          ) : (
            <Text style={settingsStyles.dangerOutlineButtonText}>MediaPipe モデルを削除</Text>
          )}
        </TouchableOpacity>
      ) : null}
    </SettingsSection>
  );
}
