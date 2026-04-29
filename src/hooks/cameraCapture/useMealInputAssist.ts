import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ImageResizer from '@bam.tech/react-native-image-resizer';
import { deleteAsync } from 'expo-file-system/legacy';
import {
  EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS,
  createMealInputAssistPolicy,
  createUnavailableRuntimeAvailability,
  createOverrideRuntimeAvailability,
  loadMealInputAssistRuntimeAvailability,
  normalizeMealInputAssistResult,
  type AppliedMealInputAssistMetadata,
  type MealInputAssistCuisineSuggestion,
  type MealInputAssistPolicy,
  type MealInputAssistProgress,
  type MealInputAssistPrewarmStatus,
  type MealInputAssistProgressUpdate,
  type MealInputAssistProvider,
  type MealInputAssistProviderResult,
  type MealInputAssistRuntimeAvailability,
  type MealInputAssistStatus,
  type MealInputAssistSuggestions,
  type MealInputAssistTextSuggestion,
} from '../../ai/mealInputAssist';
import { CAMERA_CONSTANTS } from '../../constants/CameraConstants';
import type { CaptureReviewEditableField, CaptureReviewState } from './useCameraCapture';
import { AppSettingsService } from '../../database/services/AppSettingsService';

type CaptureReviewField = CaptureReviewEditableField;

interface UseMealInputAssistParams {
  captureReview: CaptureReviewState | null;
  onCaptureReviewChange: (field: CaptureReviewField, value: string | boolean) => void;
  provider?: MealInputAssistProvider;
  policy?: MealInputAssistPolicy;
  loadAiInputAssistEnabled?: () => Promise<boolean>;
  resolveRuntimeAvailability?: () => Promise<MealInputAssistRuntimeAvailability>;
}

interface PreparedMealInputAssistRequest {
  request: ReturnType<typeof buildMealInputAssistRequest>;
  cleanup: () => Promise<void>;
}

interface MealInputAssistEnvironment {
  isAiInputAssistEnabled: boolean;
  runtimeAvailability: MealInputAssistRuntimeAvailability;
}

interface MealInputAssistEnvironmentLoaderDependencies {
  loadAiInputAssistEnabledSetting: () => Promise<boolean>;
  loadRuntimeAvailability: () => Promise<MealInputAssistRuntimeAvailability>;
}

function buildMealInputAssistRequest(captureReview: CaptureReviewState) {
  return {
    photoUri: captureReview.photoUri,
    mealName: captureReview.mealName,
    cuisineType: captureReview.cuisineType,
    notes: captureReview.notes,
    locationName: captureReview.locationName,
    isHomemade: captureReview.isHomemade,
  };
}

function hasAnyMealInputAssistSuggestions(suggestions: MealInputAssistSuggestions) {
  return Boolean(suggestions.noteDraft)
    || suggestions.mealNames.length > 0
    || suggestions.cuisineTypes.length > 0;
}

function countProviderResultCandidates(result: MealInputAssistProviderResult) {
  return {
    noteDraft: result.noteDraft ? 1 : 0,
    mealNames: result.mealNames?.length ?? 0,
    cuisineTypes: result.cuisineTypes?.length ?? 0,
  };
}

function countNormalizedSuggestions(suggestions: MealInputAssistSuggestions) {
  return {
    noteDraft: suggestions.noteDraft ? 1 : 0,
    mealNames: suggestions.mealNames.length,
    cuisineTypes: suggestions.cuisineTypes.length,
  };
}

function mergeAppliedMetadata(
  current: AppliedMealInputAssistMetadata | null,
  field: AppliedMealInputAssistMetadata['appliedFields'][number],
  source: string,
  confidence?: number
): AppliedMealInputAssistMetadata {
  const appliedFields = current?.appliedFields.includes(field)
    ? current.appliedFields
    : [...(current?.appliedFields ?? []), field];

  const nextConfidence = typeof confidence === 'number'
    ? typeof current?.aiConfidence === 'number'
      ? Math.max(current.aiConfidence, confidence)
      : confidence
    : current?.aiConfidence;

  return {
    aiSource: source,
    aiConfidence: nextConfidence,
    appliedFields,
  };
}

function toProgressSnapshot(
  update: MealInputAssistProgressUpdate,
  startedAt: number,
  updatedAt: number
): MealInputAssistProgress {
  const now = Date.now();
  const elapsedMs = Math.max(now - startedAt, 0);
  const estimatedRemainingMs = update.estimatedRemainingMs === null
    ? null
    : Math.max(update.estimatedRemainingMs - (now - updatedAt), 0);

  return {
    ...update,
    elapsedMs,
    estimatedRemainingMs,
  };
}

export function useMealInputAssist({
  captureReview,
  onCaptureReviewChange,
  provider,
  policy,
  loadAiInputAssistEnabled,
  resolveRuntimeAvailability,
}: UseMealInputAssistParams) {
  const [status, setStatus] = useState<Exclude<MealInputAssistStatus, 'disabled'>>('idle');
  const [suggestions, setSuggestions] = useState<MealInputAssistSuggestions>(EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<MealInputAssistProgress | null>(null);
  const [prewarmStatus, setPrewarmStatus] = useState<MealInputAssistPrewarmStatus>('idle');
  const [appliedMetadata, setAppliedMetadata] = useState<AppliedMealInputAssistMetadata | null>(null);
  const [isAiInputAssistEnabled, setIsAiInputAssistEnabled] = useState<boolean | null>(provider || policy ? true : null);
  const [runtimeAvailability, setRuntimeAvailability] = useState<MealInputAssistRuntimeAvailability | null>(
    provider ? createOverrideRuntimeAvailability(provider) : null
  );
  const requestIdRef = useRef(0);
  const isRunningRef = useRef(false);
  const requestStartedAtRef = useRef<number | null>(null);
  const progressUpdatedAtRef = useRef<number | null>(null);
  const latestProgressUpdateRef = useRef<MealInputAssistProgressUpdate | null>(null);
  const isPrewarmingRef = useRef(false);
  const environmentPromiseRef = useRef<Promise<MealInputAssistEnvironment> | null>(null);
  const environmentLoaderDependenciesRef = useRef<MealInputAssistEnvironmentLoaderDependencies | null>(null);
  const appliedNoteDraftValuesRef = useRef<Set<string>>(new Set());

  const reviewKey = captureReview?.photoUri ?? null;

  const loadAiInputAssistEnabledSetting = useMemo(
    () => loadAiInputAssistEnabled ?? (provider || policy
      ? async () => true
      : () => AppSettingsService.getAiInputAssistEnabled()),
    [loadAiInputAssistEnabled, policy, provider]
  );

  const loadRuntimeAvailability = useMemo(
    () => resolveRuntimeAvailability ?? (provider
      ? async () => createOverrideRuntimeAvailability(provider)
      : () => loadMealInputAssistRuntimeAvailability('local-runtime-prototype')),
    [provider, resolveRuntimeAvailability]
  );

  useEffect(() => {
    setStatus('idle');
    setSuggestions(EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS);
    setErrorMessage(null);
    setProgress(null);
    setAppliedMetadata(null);
    requestIdRef.current += 1;
    isRunningRef.current = false;
    requestStartedAtRef.current = null;
    progressUpdatedAtRef.current = null;
    latestProgressUpdateRef.current = null;
    isPrewarmingRef.current = false;
    setPrewarmStatus('idle');
    appliedNoteDraftValuesRef.current.clear();
  }, [reviewKey]);

  const setProgressState = useCallback((update: MealInputAssistProgressUpdate | null) => {
    if (!update) {
      requestStartedAtRef.current = null;
      progressUpdatedAtRef.current = null;
      latestProgressUpdateRef.current = null;
      setProgress(null);
      return;
    }

    const now = Date.now();
    const startedAt = requestStartedAtRef.current ?? now;
    requestStartedAtRef.current = startedAt;
    progressUpdatedAtRef.current = now;
    latestProgressUpdateRef.current = update;
    setProgress(toProgressSnapshot(update, startedAt, now));
  }, []);

  useEffect(() => {
    if (status !== 'running') {
      return undefined;
    }

    const timer = setInterval(() => {
      const startedAt = requestStartedAtRef.current;
      const updatedAt = progressUpdatedAtRef.current;
      const latestUpdate = latestProgressUpdateRef.current;

      if (!startedAt || !updatedAt || !latestUpdate) {
        return;
      }

      setProgress(toProgressSnapshot(latestUpdate, startedAt, updatedAt));
    }, 500);

    return () => clearInterval(timer);
  }, [status]);

  const loadEnvironment = useCallback(async () => {
    const shouldReloadEnvironment = !environmentPromiseRef.current
      || environmentLoaderDependenciesRef.current?.loadAiInputAssistEnabledSetting !== loadAiInputAssistEnabledSetting
      || environmentLoaderDependenciesRef.current?.loadRuntimeAvailability !== loadRuntimeAvailability;

    if (shouldReloadEnvironment) {
      environmentLoaderDependenciesRef.current = {
        loadAiInputAssistEnabledSetting,
        loadRuntimeAvailability,
      };
      environmentPromiseRef.current = (async () => {
        try {
          const [nextAiInputAssistEnabled, nextRuntimeAvailability] = await Promise.all([
            loadAiInputAssistEnabledSetting(),
            loadRuntimeAvailability(),
          ]);

          setIsAiInputAssistEnabled(nextAiInputAssistEnabled);
          setRuntimeAvailability(nextRuntimeAvailability);

          return {
            isAiInputAssistEnabled: nextAiInputAssistEnabled,
            runtimeAvailability: nextRuntimeAvailability,
          };
        } catch (error) {
          console.error('Failed to load AI input assist environment:', error);

          const fallbackRuntimeAvailability = createUnavailableRuntimeAvailability(
            'runtime_unavailable',
            'この build には端末内 AI runtime がまだ組み込まれていません。'
          );

          setIsAiInputAssistEnabled(false);
          setRuntimeAvailability(fallbackRuntimeAvailability);

          return {
            isAiInputAssistEnabled: false,
            runtimeAvailability: fallbackRuntimeAvailability,
          };
        }
      })();
    }

    return environmentPromiseRef.current!;
  }, [loadAiInputAssistEnabledSetting, loadRuntimeAvailability]);

  const getRequestEnvironment = useCallback(async () => {
    const hasMatchingEnvironmentDependencies = !environmentLoaderDependenciesRef.current
      || (
        environmentLoaderDependenciesRef.current.loadAiInputAssistEnabledSetting === loadAiInputAssistEnabledSetting
        && environmentLoaderDependenciesRef.current.loadRuntimeAvailability === loadRuntimeAvailability
      );
    const hasCurrentEnvironment = isAiInputAssistEnabled !== null
      && runtimeAvailability !== null
      && hasMatchingEnvironmentDependencies;

    if (hasCurrentEnvironment) {
      return {
        isAiInputAssistEnabled,
        runtimeAvailability,
      };
    }

    return loadEnvironment();
  }, [
    isAiInputAssistEnabled,
    loadAiInputAssistEnabledSetting,
    loadEnvironment,
    loadRuntimeAvailability,
    runtimeAvailability,
  ]);

  useEffect(() => {
    loadEnvironment().catch(() => undefined);
  }, [loadEnvironment]);

  const cleanupPreparedPhoto = useCallback(async (preparedPhotoUri: string, originalPhotoUri: string) => {
    if (preparedPhotoUri === originalPhotoUri) {
      return;
    }

    try {
      await deleteAsync(preparedPhotoUri, { idempotent: true });
    } catch (error) {
      console.warn('Failed to clean up AI analysis photo:', error);
    }
  }, []);

  const prepareRequestForSuggestion = useCallback(async (
    currentRequest: ReturnType<typeof buildMealInputAssistRequest>
  ): Promise<PreparedMealInputAssistRequest> => {
    const resizedPhoto = await ImageResizer.createResizedImage(
      currentRequest.photoUri,
      CAMERA_CONSTANTS.AI_INPUT_ASSIST_PHOTO_MAX_WIDTH,
      CAMERA_CONSTANTS.AI_INPUT_ASSIST_PHOTO_MAX_HEIGHT,
      'JPEG',
      CAMERA_CONSTANTS.AI_INPUT_ASSIST_PHOTO_QUALITY_PERCENT,
      0,
      undefined,
      true,
      {
        mode: 'contain',
        onlyScaleDown: true,
      }
    );

    return {
      request: {
        ...currentRequest,
        photoUri: resizedPhoto.uri,
      },
      cleanup: async () => cleanupPreparedPhoto(resizedPhoto.uri, currentRequest.photoUri),
    };
  }, [cleanupPreparedPhoto]);

  const request = useMemo(
    () => (captureReview ? buildMealInputAssistRequest(captureReview) : null),
    [captureReview]
  );

  const effectivePolicy = useMemo(
    () => policy ?? createMealInputAssistPolicy({
      isEnabled: isAiInputAssistEnabled,
      runtimeAvailability,
    }),
    [isAiInputAssistEnabled, policy, runtimeAvailability]
  );

  const availability = useMemo(
    () => (request ? effectivePolicy(request) : { kind: 'enabled' as const }),
    [effectivePolicy, request]
  );

  const effectiveStatus: MealInputAssistStatus = !captureReview
    ? 'idle'
    : availability.kind === 'disabled'
      ? 'disabled'
      : status;

  const hasAnySuggestions = suggestions.mealNames.length > 0
    || Boolean(suggestions.noteDraft)
    || suggestions.cuisineTypes.length > 0;

  const requestSuggestions = useCallback(async () => {
    if (!request || isRunningRef.current) {
      return;
    }

    isRunningRef.current = true;
    requestStartedAtRef.current = Date.now();
    setProgressState({
      stage: 'preparing',
      message: 'AI 入力補助の準備をしています。',
      progress: 0.02,
      estimatedRemainingMs: 60000,
    });
    const environment = await getRequestEnvironment();
    const nextPolicy = policy ?? createMealInputAssistPolicy({
      isEnabled: environment.isAiInputAssistEnabled,
      runtimeAvailability: environment.runtimeAvailability,
    });
    const nextAvailability = nextPolicy(request);

    if (nextAvailability.kind === 'disabled') {
      isRunningRef.current = false;
      setStatus('idle');
      setErrorMessage(null);
      setProgressState(null);
      return;
    }

    const activeProvider = environment.runtimeAvailability.kind === 'ready'
      ? environment.runtimeAvailability.provider
      : null;
    if (!activeProvider) {
      isRunningRef.current = false;
      setStatus('error');
      setProgressState(null);
      setErrorMessage('AI provider を初期化できませんでした。');
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus('running');
    setErrorMessage(null);
    setProgressState({
      stage: 'preparing',
      message: 'AI 解析用に写真を縮小しています。',
      progress: 0.06,
      estimatedRemainingMs: 30000,
    });

    let cleanupPreparedRequest = async () => {};

    try {
      const preparedRequest = await prepareRequestForSuggestion(request);
      cleanupPreparedRequest = preparedRequest.cleanup;

      setProgressState({
        stage: 'loading_model',
        message: 'AI model の状態を確認しています。',
        progress: 0.08,
        estimatedRemainingMs: 45000,
      });

      const rawResult = await activeProvider.suggest(preparedRequest.request, {
        onProgress: setProgressState,
      });
      isRunningRef.current = false;
      if (requestIdRef.current !== requestId) {
        return;
      }

      const normalizedSuggestions = normalizeMealInputAssistResult(rawResult);
      const rawCandidateCounts = countProviderResultCandidates(rawResult);
      if (rawCandidateCounts.noteDraft === 0) {
        console.info('Meal input assist provider returned no note draft.', {
          providerSource: rawResult.source,
          rawCandidateCounts,
        });
      }

      if (!hasAnyMealInputAssistSuggestions(normalizedSuggestions)) {
        const rawCandidateTotal = rawCandidateCounts.noteDraft
          + rawCandidateCounts.mealNames
          + rawCandidateCounts.cuisineTypes;

        if (rawCandidateTotal > 0) {
          console.info('Meal input assist normalized all provider candidates away.', {
            rawCandidateCounts,
            normalizedCandidateCounts: countNormalizedSuggestions(normalizedSuggestions),
          });
        }
      }

      setProgressState(null);
      setSuggestions(normalizedSuggestions);
      setStatus('success');
    } catch (error) {
      isRunningRef.current = false;
      if (requestIdRef.current !== requestId) {
        return;
      }

      console.warn('Meal input assist failed:', error);
      setProgressState(null);
      setStatus('error');
      setErrorMessage('端末内解析に失敗しました。もう一度お試しください。');
    } finally {
      await cleanupPreparedRequest();
    }
  }, [getRequestEnvironment, policy, prepareRequestForSuggestion, request, setProgressState]);

  const prewarm = useCallback(async () => {
    if (isRunningRef.current || isPrewarmingRef.current) {
      return;
    }

    isPrewarmingRef.current = true;
    setPrewarmStatus('running');

    try {
      const environment = await loadEnvironment();
      if (!environment.isAiInputAssistEnabled || environment.runtimeAvailability.kind !== 'ready') {
        setPrewarmStatus('idle');
        return;
      }

      await environment.runtimeAvailability.provider.prewarm?.();
      setPrewarmStatus('success');
    } catch {
      console.warn('Meal input assist prewarm failed.');
      setPrewarmStatus('error');
    } finally {
      isPrewarmingRef.current = false;
    }
  }, [loadEnvironment]);

  const applyMealNameSuggestion = useCallback((suggestion: MealInputAssistTextSuggestion) => {
    onCaptureReviewChange('mealName', suggestion.value);
    setAppliedMetadata((current) => mergeAppliedMetadata(current, 'mealName', suggestion.source, suggestion.confidence));
  }, [onCaptureReviewChange]);

  const applyNoteDraftSuggestion = useCallback((suggestion: MealInputAssistTextSuggestion) => {
    if (!captureReview) {
      return;
    }

    const noteDraft = suggestion.value.trim();
    if (!noteDraft) {
      return;
    }

    const currentNotes = captureReview.notes.trim();
    if (!currentNotes.includes(noteDraft) && !appliedNoteDraftValuesRef.current.has(noteDraft)) {
      const nextNotes = currentNotes ? `${currentNotes}\n\n${noteDraft}` : noteDraft;
      onCaptureReviewChange('notes', nextNotes);
    }
    appliedNoteDraftValuesRef.current.add(noteDraft);
    setAppliedMetadata((current) => mergeAppliedMetadata(current, 'notes', suggestion.source, suggestion.confidence));
  }, [captureReview, onCaptureReviewChange]);

  const applyCuisineSuggestion = useCallback((suggestion: MealInputAssistCuisineSuggestion) => {
    onCaptureReviewChange('cuisineType', suggestion.value);
    setAppliedMetadata((current) => mergeAppliedMetadata(current, 'cuisineType', suggestion.source, suggestion.confidence));
  }, [onCaptureReviewChange]);

  return {
    status: effectiveStatus,
    suggestions,
    errorMessage,
    progress,
    prewarmStatus,
    disabledReason: availability.kind === 'disabled' ? availability.reason : null,
    hasAnySuggestions,
    prewarm,
    requestSuggestions,
    applyMealNameSuggestion,
    applyNoteDraftSuggestion,
    applyCuisineSuggestion,
    appliedMetadata,
  };
}
