import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  MEDIAPIPE_MODEL_DISPLAY_NAME,
  type MediaPipeModelDownloadProgress,
  type MediaPipeModelStatus,
} from '../../../ai/mealInputAssist';
import {
  deleteMediaPipeModel,
  getMediaPipeModelStatus,
  installMediaPipeModel,
  redownloadMediaPipeModel,
} from '../../../ai/mealInputAssist/modelInstaller';
import { sanitizeLogObject } from '../../../utils/logSanitizer';
import { Colors } from '../../../constants/Colors';
import { Section } from './Section';

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

export function MediaPipeDevSection() {
  const showMediaPipeDevSection = typeof __DEV__ !== 'undefined' && Boolean(__DEV__);
  const [mediaPipeModelStatus, setMediaPipeModelStatus] = useState<MediaPipeModelStatus | null>(
    null
  );
  const [mediaPipeModelStatusLoading, setMediaPipeModelStatusLoading] = useState(true);
  const [mediaPipeActionState, setMediaPipeActionState] = useState<ModelActionState>('idle');
  const [mediaPipeDownloadProgress, setMediaPipeDownloadProgress] =
    useState<MediaPipeModelDownloadProgress | null>(null);

  const loadMediaPipeModelStatus = useCallback(async () => {
    if (!showMediaPipeDevSection) {
      return;
    }
    setMediaPipeModelStatusLoading(true);
    try {
      const nextStatus = await getMediaPipeModelStatus();
      setMediaPipeModelStatus(nextStatus);
    } catch (error) {
      console.error('Failed to load MediaPipe model status:', sanitizeLogObject(error));
      setMediaPipeModelStatus(null);
    } finally {
      setMediaPipeModelStatusLoading(false);
    }
  }, [showMediaPipeDevSection]);

  useFocusEffect(
    useCallback(() => {
      loadMediaPipeModelStatus().catch(() => undefined);
    }, [loadMediaPipeModelStatus])
  );

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
        Alert.alert('ダウンロード完了', 'MediaPipe モデルを端末に保存しました。');
      } catch (error) {
        console.error('Failed to download MediaPipe model:', sanitizeLogObject(error));
        await loadMediaPipeModelStatus().catch(() => undefined);
        const message =
          error instanceof Error && error.message
            ? error.message
            : 'MediaPipe モデルをダウンロードできませんでした。';
        Alert.alert('ダウンロードに失敗しました', message);
      } finally {
        setMediaPipeDownloadProgress(null);
        setMediaPipeActionState('idle');
      }
    },
    [loadMediaPipeModelStatus]
  );

  const handleMediaPipeDelete = useCallback(() => {
    Alert.alert('MediaPipe モデルの削除', '端末に保存されている MediaPipe モデルを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          setMediaPipeActionState('deleting');
          try {
            await deleteMediaPipeModel();
            await loadMediaPipeModelStatus();
            Alert.alert('削除完了', 'MediaPipe モデルを削除しました。');
          } catch (error) {
            console.error('Failed to delete MediaPipe model:', sanitizeLogObject(error));
            const message =
              error instanceof Error && error.message
                ? error.message
                : 'MediaPipe モデルの削除に失敗しました。';
            Alert.alert('削除に失敗しました', message);
          } finally {
            setMediaPipeActionState('idle');
          }
        },
      },
    ]);
  }, [loadMediaPipeModelStatus]);

  if (!showMediaPipeDevSection) {
    return null;
  }

  return (
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
            <Text style={styles.runtimeStatusBadgeText} testID="mediapipe-model-status-badge">
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
          <Text style={styles.runtimeStatusReason}>{mediaPipeModelStatus.errorMessage}</Text>
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
