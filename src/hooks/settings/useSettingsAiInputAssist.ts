import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import {
  DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID,
  MEDIAPIPE_CLASSIFIER_MODELS,
  getMediaPipeStaticImageAvailability,
  invalidateMealInputAssistEnvironment,
  MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME,
  type MealInputAssistModelDownloadProgress,
  type MealInputAssistModelStatus,
  type MealInputAssistRuntimeAvailability,
  type MediaPipeClassifierModelId,
} from '../../ai/mealInputAssist';
import {
  cleanupOrphanedDualMediaPipeModel,
  cleanupRetiredMediaPipeModels,
  deleteAllDownloadedLocalAiModels,
  getMealInputAssistModelStatus,
  getMediaPipeModelStatusForModel,
  installMealInputAssistModel,
  redownloadMealInputAssistModel,
} from '../../ai/mealInputAssist/modelInstaller';
import {
  getLocalAiRuntimeStatusSnapshot,
  type LocalAiRuntimeStatusSnapshot,
} from '../../ai/runtime';
import { AppSettingsService } from '../../database/services/AppSettingsService';
import { sanitizeLogObject } from '../../utils/logSanitizer';

export type ModelActionState = 'idle' | 'downloading' | 'deleting';
export type AiAssistState = 'checking' | 'downloading' | 'ready' | 'error' | 'not_ready';

/**
 * Manages AI input assist enabled toggle, GGUF/MediaPipe model statuses, model selection,
 * downloads, and deletion workflows for SettingsScreen.
 */
export function useSettingsAiInputAssist() {
  const [aiInputAssistEnabled, setAiInputAssistEnabled] = useState(false);
  const [aiInputAssistLoading, setAiInputAssistLoading] = useState(true);
  const [mealInputAssistModelStatus, setMealInputAssistModelStatus] =
    useState<MealInputAssistModelStatus | null>(null);
  const [mealInputAssistModelStatusLoading, setMealInputAssistModelStatusLoading] = useState(true);
  const [localAiRuntimeStatus, setLocalAiRuntimeStatus] =
    useState<LocalAiRuntimeStatusSnapshot | null>(null);
  const [mediaPipeRuntimeAvailability, setMediaPipeRuntimeAvailability] =
    useState<MealInputAssistRuntimeAvailability | null>(null);
  const [fallbackMediaPipeAvailability, setFallbackMediaPipeAvailability] =
    useState<MealInputAssistRuntimeAvailability | null>(null);
  const [localAiRuntimeStatusLoading, setLocalAiRuntimeStatusLoading] = useState(true);
  const [modelActionState, setModelActionState] = useState<ModelActionState>('idle');
  const [modelDownloadProgress, setModelDownloadProgress] =
    useState<MealInputAssistModelDownloadProgress | null>(null);
  const [selectedMediaPipeModelId, setSelectedMediaPipeModelId] =
    useState<MediaPipeClassifierModelId>(DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID);

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
      const migrated = await AppSettingsService.migrateLegacyMediaPipeModelSettings().catch(
        () => false
      );
      if (migrated) {
        invalidateMealInputAssistEnvironment();
      }
      await cleanupRetiredMediaPipeModels().catch(() => {});

      let currentModelId =
        (await AppSettingsService.getMediaPipeClassifierModelId?.().catch(() => null)) ??
        DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID;

      if (!MEDIAPIPE_CLASSIFIER_MODELS[currentModelId]?.available) {
        currentModelId = DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID;
        await AppSettingsService.setMediaPipeClassifierModelId?.(
          DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID
        ).catch(() => {});
        invalidateMealInputAssistEnvironment();
      }

      setSelectedMediaPipeModelId(currentModelId);

      const [snapshot, nextMediaPipeAvailability] = await Promise.all([
        getLocalAiRuntimeStatusSnapshot(),
        getMediaPipeStaticImageAvailability(currentModelId).catch(() => null),
      ]);
      setLocalAiRuntimeStatus(snapshot);
      setMediaPipeRuntimeAvailability(nextMediaPipeAvailability);

      if (MEDIAPIPE_CLASSIFIER_MODELS[currentModelId]?.isDual) {
        const dualModelStatus = await getMediaPipeModelStatusForModel(currentModelId).catch(
          () => null
        );
        if (dualModelStatus?.isOrphanedPartialFiles) {
          await cleanupOrphanedDualMediaPipeModel(currentModelId).catch(() => {});
        }
      }

      if (
        nextMediaPipeAvailability?.kind !== 'ready' &&
        currentModelId !== DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID
      ) {
        const fallbackAvailability = await getMediaPipeStaticImageAvailability(
          DEFAULT_MEDIAPIPE_CLASSIFIER_MODEL_ID
        ).catch(() => null);
        setFallbackMediaPipeAvailability(fallbackAvailability);
      } else {
        setFallbackMediaPipeAvailability(null);
      }
    } catch (error) {
      console.error('Failed to load local AI runtime status:', sanitizeLogObject(error));
      setLocalAiRuntimeStatus(null);
      setMediaPipeRuntimeAvailability(null);
      setFallbackMediaPipeAvailability(null);
    } finally {
      setLocalAiRuntimeStatusLoading(false);
    }
  }, []);

  const handleSelectMediaPipeModel = useCallback(
    async (nextModelId: MediaPipeClassifierModelId) => {
      if (!MEDIAPIPE_CLASSIFIER_MODELS[nextModelId]?.available) {
        return;
      }

      if (
        nextModelId === selectedMediaPipeModelId &&
        mediaPipeRuntimeAvailability?.kind === 'ready'
      ) {
        return;
      }

      const previousModelId = selectedMediaPipeModelId;
      const previousAvailability = mediaPipeRuntimeAvailability;
      const previousFallbackAvailability = fallbackMediaPipeAvailability;

      const nextMediaPipeAvailability = await getMediaPipeStaticImageAvailability(
        nextModelId
      ).catch(() => null);

      if (nextMediaPipeAvailability?.kind !== 'ready') {
        Alert.alert(
          'モデルを切り替えられませんでした',
          nextMediaPipeAvailability?.reason ?? '選択した分類モデルは現在利用できません。'
        );
        return;
      }

      setSelectedMediaPipeModelId(nextModelId);
      setMediaPipeRuntimeAvailability(nextMediaPipeAvailability);
      setFallbackMediaPipeAvailability(null);

      try {
        await AppSettingsService.setMediaPipeClassifierModelId?.(nextModelId);
        invalidateMealInputAssistEnvironment();
      } catch (error) {
        console.error(
          'Failed to save MediaPipe classifier model setting:',
          sanitizeLogObject(error)
        );
        setSelectedMediaPipeModelId(previousModelId);
        setMediaPipeRuntimeAvailability(previousAvailability);
        setFallbackMediaPipeAvailability(previousFallbackAvailability);
        Alert.alert(
          '設定を保存できませんでした',
          '分類モデルの設定を保存できませんでした。もう一度お試しください。'
        );
      }
    },
    [fallbackMediaPipeAvailability, mediaPipeRuntimeAvailability, selectedMediaPipeModelId]
  );

  const reloadLocalAiSection = useCallback(async () => {
    await Promise.all([loadMealInputAssistModelStatus(), loadLocalAiRuntimeStatus()]);
  }, [loadLocalAiRuntimeStatus, loadMealInputAssistModelStatus]);

  const handleAiInputAssistToggle = useCallback(async (nextValue: boolean) => {
    setAiInputAssistEnabled(nextValue);

    try {
      await AppSettingsService.setAiInputAssistEnabled(nextValue);
      invalidateMealInputAssistEnvironment();
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

  const handleDeleteAllModels = useCallback(
    (onAfterDelete?: () => Promise<void>) => {
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
                await Promise.all([
                  reloadLocalAiSection(),
                  onAfterDelete ? onAfterDelete() : Promise.resolve(),
                ]);
                Alert.alert('削除完了', 'ダウンロード済みモデルを削除しました。');
              } catch (error) {
                console.error('Failed to delete downloaded AI models:', sanitizeLogObject(error));
                await Promise.all([
                  reloadLocalAiSection().catch(() => undefined),
                  onAfterDelete ? onAfterDelete().catch(() => undefined) : Promise.resolve(),
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
    },
    [reloadLocalAiSection]
  );

  const visibleModelStatus = useMemo(
    () =>
      modelActionState === 'downloading'
        ? ('downloading' as const)
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
  const mediaPipeRuntimeReady = mediaPipeRuntimeAvailability?.kind === 'ready';
  const fallbackMediaPipeReady = fallbackMediaPipeAvailability?.kind === 'ready';
  const canSwitchMediaPipeModel = mediaPipeRuntimeReady || fallbackMediaPipeReady;
  const isAiAssistReady =
    (modelReady && runtimeReady) || mediaPipeRuntimeReady || fallbackMediaPipeReady;

  const aiAssistState: AiAssistState = useMemo(() => {
    if (mealInputAssistModelStatusLoading || localAiRuntimeStatusLoading) {
      return 'checking';
    }
    if (modelActionState === 'downloading') {
      return 'downloading';
    }
    if (isAiAssistReady) {
      return 'ready';
    }
    if (mealInputAssistModelStatus?.kind === 'error') {
      return 'error';
    }
    return 'not_ready';
  }, [
    isAiAssistReady,
    localAiRuntimeStatusLoading,
    mealInputAssistModelStatus?.kind,
    mealInputAssistModelStatusLoading,
    modelActionState,
  ]);

  const aiAssistSwitchDisabled =
    aiInputAssistLoading || modelActionState !== 'idle' || !isAiAssistReady;
  const aiAssistDisabledReason =
    aiAssistState === 'checking'
      ? '状態を確認しています。'
      : !modelReady
        ? 'モデルをダウンロードすると利用できます。'
        : !runtimeReady
          ? 'この端末ではまだ利用できません。'
          : null;

  return {
    aiInputAssistEnabled,
    aiAssistSwitchDisabled,
    aiAssistState,
    aiAssistDisabledReason,
    mealInputAssistModelStatus,
    mealInputAssistModelStatusLoading,
    localAiRuntimeStatus,
    localAiRuntimeStatusLoading,
    modelActionState,
    modelDownloadProgress,
    visibleModelStatus,
    showDeleteAllModelsAction,
    runtimeReady,
    modelReady,
    mediaPipeRuntimeReady,
    fallbackMediaPipeReady,
    canSwitchMediaPipeModel,
    selectedMediaPipeModelId,
    loadAiInputAssistSetting,
    loadLocalAiRuntimeStatus,
    reloadLocalAiSection,
    handleSelectMediaPipeModel,
    handleAiInputAssistToggle,
    handleModelDownload,
    handleDeleteAllModels,
    displayModelName: MEAL_INPUT_ASSIST_MODEL_DISPLAY_NAME,
  };
}
