import { useCallback, useState } from 'react';
import { Alert } from 'react-native';
import {
  deleteMediaPipeModel,
  getMediaPipeModelStatus,
  installMediaPipeModel,
  MEDIAPIPE_MODEL_DISPLAY_NAME,
  redownloadMediaPipeModel,
  type MediaPipeModelDownloadProgress,
  type MediaPipeModelStatus,
} from '../../ai/mealInputAssist';
import { sanitizeLogObject } from '../../utils/logSanitizer';
import type { ModelActionState } from './useSettingsAiInputAssist';

interface UseSettingsMediaPipeDevParams {
  onRuntimeStatusRefresh: () => Promise<void>;
}

/**
 * Manages the DEV-only MediaPipe model diagnostic, download, redownload, and deletion workflow.
 */
export function useSettingsMediaPipeDev({ onRuntimeStatusRefresh }: UseSettingsMediaPipeDevParams) {
  // Evaluated at render/hook execution time so tests toggling global.__DEV__ work as expected.
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

        await Promise.all([loadMediaPipeModelStatus(), onRuntimeStatusRefresh()]);
        Alert.alert('ダウンロード完了', `${MEDIAPIPE_MODEL_DISPLAY_NAME} を端末に保存しました。`);
      } catch (error) {
        console.error('Failed to download MediaPipe model:', sanitizeLogObject(error));
        await Promise.all([
          loadMediaPipeModelStatus().catch(() => undefined),
          onRuntimeStatusRefresh().catch(() => undefined),
        ]);
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
    [loadMediaPipeModelStatus, onRuntimeStatusRefresh]
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
              await Promise.all([loadMediaPipeModelStatus(), onRuntimeStatusRefresh()]);
              Alert.alert('削除完了', `${MEDIAPIPE_MODEL_DISPLAY_NAME} を削除しました。`);
            } catch (error) {
              console.error('Failed to delete MediaPipe model:', sanitizeLogObject(error));
              await Promise.all([
                loadMediaPipeModelStatus().catch(() => undefined),
                onRuntimeStatusRefresh().catch(() => undefined),
              ]);
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
  }, [loadMediaPipeModelStatus, onRuntimeStatusRefresh]);

  return {
    showMediaPipeDevSection,
    mediaPipeModelStatus,
    mediaPipeModelStatusLoading,
    mediaPipeActionState,
    mediaPipeDownloadProgress,
    loadMediaPipeModelStatus,
    handleMediaPipeDownload,
    handleMediaPipeDelete,
  };
}
