import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createMealInputAssistPolicy } from '../../ai/mealInputAssist/policy';
import {
  createOverrideRuntimeAvailability,
} from '../../ai/mealInputAssist/runtimeAvailability';
import { normalizeMealInputAssistResult } from '../../ai/mealInputAssist/normalizer';
import { mergeAppliedMetadata } from '../../ai/mealInputAssist/appliedMetadata';
import {
  createMealInputAssistEnvironmentLoadFailure,
  loadDefaultMealInputAssistRuntimeAvailability,
  loadMealInputAssistEnvironment,
  type MealInputAssistEnvironment,
  type MealInputAssistEnvironmentLoaderDependencies,
} from '../../ai/mealInputAssist/environment';
import { toProgressSnapshot } from '../../ai/mealInputAssist/progress';
import { prepareMealInputAssistRequest } from '../../ai/mealInputAssist/preparedPhoto';
import { buildMealInputAssistRequest } from '../../ai/mealInputAssist/request';
import {
  countNormalizedSuggestions,
  countProviderResultCandidates,
  hasAnyMealInputAssistSuggestions,
} from '../../ai/mealInputAssist/suggestionDiagnostics';
import {
  EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS,
  type AppliedMealInputAssistMetadata,
  type MealInputAssistAvailability,
  type MealInputAssistCuisineSuggestion,
  type MealInputAssistPolicy,
  type MealInputAssistProgress,
  type MealInputAssistPrewarmStatus,
  type MealInputAssistProgressUpdate,
  type MealInputAssistProvider,
  type MealInputAssistRuntimeAvailability,
  type MealInputAssistStatus,
  type MealInputAssistSuggestions,
  type MealInputAssistTextSuggestion,
} from '../../ai/mealInputAssist/types';
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

export function useMealInputAssist({
  captureReview,
  onCaptureReviewChange,
  provider,
  policy,
  loadAiInputAssistEnabled,
  resolveRuntimeAvailability,
}: UseMealInputAssistParams) {
  const [status, setStatus] = useState<Exclude<MealInputAssistStatus, 'disabled'>>('idle');
  const [suggestions, setSuggestions] = useState<MealInputAssistSuggestions>(
    EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [progress, setProgress] = useState<MealInputAssistProgress | null>(null);
  const [prewarmStatus, setPrewarmStatus] = useState<MealInputAssistPrewarmStatus>('idle');
  const [appliedMetadata, setAppliedMetadata] = useState<AppliedMealInputAssistMetadata | null>(
    null
  );
  const [isAiInputAssistEnabled, setIsAiInputAssistEnabled] = useState<boolean | null>(
    provider || policy ? true : null
  );
  const [runtimeAvailability, setRuntimeAvailability] =
    useState<MealInputAssistRuntimeAvailability | null>(
      provider ? createOverrideRuntimeAvailability(provider) : null
    );
  const requestIdRef = useRef(0);
  const isRunningRef = useRef(false);
  const requestStartedAtRef = useRef<number | null>(null);
  const progressUpdatedAtRef = useRef<number | null>(null);
  const latestProgressUpdateRef = useRef<MealInputAssistProgressUpdate | null>(null);
  const isPrewarmingRef = useRef(false);
  const environmentPromiseRef = useRef<Promise<MealInputAssistEnvironment> | null>(null);
  const environmentLoaderDependenciesRef =
    useRef<MealInputAssistEnvironmentLoaderDependencies | null>(null);
  const appliedNoteDraftValuesRef = useRef<Set<string>>(new Set());

  const reviewKey = captureReview?.photoUri ?? null;

  const loadAiInputAssistEnabledSetting = useMemo(
    () =>
      loadAiInputAssistEnabled ??
      (provider || policy ? async () => true : () => AppSettingsService.getAiInputAssistEnabled()),
    [loadAiInputAssistEnabled, policy, provider]
  );

  const loadRuntimeAvailability = useMemo(
    () =>
      resolveRuntimeAvailability ??
      (provider
        ? async () => createOverrideRuntimeAvailability(provider)
        : loadDefaultMealInputAssistRuntimeAvailability),
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
    const shouldReloadEnvironment =
      !environmentPromiseRef.current ||
      environmentLoaderDependenciesRef.current?.loadAiInputAssistEnabledSetting !==
        loadAiInputAssistEnabledSetting ||
      environmentLoaderDependenciesRef.current?.loadRuntimeAvailability !== loadRuntimeAvailability;

    if (shouldReloadEnvironment) {
      environmentLoaderDependenciesRef.current = {
        loadAiInputAssistEnabledSetting,
        loadRuntimeAvailability,
      };
      environmentPromiseRef.current = (async () => {
        try {
          const environment = await loadMealInputAssistEnvironment({
            loadAiInputAssistEnabledSetting,
            loadRuntimeAvailability,
          });

          setIsAiInputAssistEnabled(environment.isAiInputAssistEnabled);
          setRuntimeAvailability(environment.runtimeAvailability);

          return environment;
        } catch (error) {
          console.error('Failed to load AI input assist environment:', error);

          const fallbackEnvironment = createMealInputAssistEnvironmentLoadFailure();

          setIsAiInputAssistEnabled(fallbackEnvironment.isAiInputAssistEnabled);
          setRuntimeAvailability(fallbackEnvironment.runtimeAvailability);

          return fallbackEnvironment;
        }
      })();
    }

    return environmentPromiseRef.current!;
  }, [loadAiInputAssistEnabledSetting, loadRuntimeAvailability]);

  const getRequestEnvironment = useCallback(async () => {
    const hasMatchingEnvironmentDependencies =
      !environmentLoaderDependenciesRef.current ||
      (environmentLoaderDependenciesRef.current.loadAiInputAssistEnabledSetting ===
        loadAiInputAssistEnabledSetting &&
        environmentLoaderDependenciesRef.current.loadRuntimeAvailability ===
          loadRuntimeAvailability);
    if (isAiInputAssistEnabled === false && hasMatchingEnvironmentDependencies) {
      return {
        isAiInputAssistEnabled,
        runtimeAvailability: null,
      };
    }

    const hasCurrentEnvironment =
      isAiInputAssistEnabled !== null &&
      runtimeAvailability !== null &&
      hasMatchingEnvironmentDependencies;

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
    if (!captureReview && !provider && !policy) {
      return;
    }

    if (provider || policy || loadAiInputAssistEnabled || resolveRuntimeAvailability) {
      loadEnvironment().catch(() => undefined);
      return;
    }

    let cancelled = false;

    loadAiInputAssistEnabledSetting()
      .then((nextAiInputAssistEnabled) => {
        if (!cancelled) {
          setIsAiInputAssistEnabled(nextAiInputAssistEnabled);
        }
      })
      .catch((error) => {
        console.error('Failed to load AI input assist setting:', error);
        if (!cancelled) {
          setIsAiInputAssistEnabled(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    captureReview,
    loadAiInputAssistEnabled,
    loadAiInputAssistEnabledSetting,
    loadEnvironment,
    policy,
    provider,
    resolveRuntimeAvailability,
  ]);

  const request = useMemo(
    () => (captureReview ? buildMealInputAssistRequest(captureReview) : null),
    [captureReview]
  );

  const availability = useMemo<MealInputAssistAvailability>(() => {
    if (!request) {
      return { kind: 'enabled' };
    }

    if (policy) {
      return policy(request);
    }

    if (!request.photoUri.trim()) {
      return {
        kind: 'disabled',
        reason: '写真を確認できないため、AI候補を提案できません。',
      };
    }

    if (isAiInputAssistEnabled === null) {
      return {
        kind: 'disabled',
        reason: 'AI入力補助の準備を確認中です。',
      };
    }

    if (!isAiInputAssistEnabled) {
      return {
        kind: 'disabled',
        reason: '設定画面でAI入力補助をオンにすると利用できます。',
      };
    }

    if (runtimeAvailability === null) {
      return { kind: 'enabled' };
    }

    return createMealInputAssistPolicy({
      isEnabled: isAiInputAssistEnabled,
      runtimeAvailability,
    })(request);
  }, [isAiInputAssistEnabled, policy, request, runtimeAvailability]);

  const effectiveStatus: MealInputAssistStatus = !captureReview
    ? 'idle'
    : availability.kind === 'disabled'
      ? 'disabled'
      : status;

  const hasAnySuggestions = hasAnyMealInputAssistSuggestions(suggestions);

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
    const nextPolicy =
      policy ??
      createMealInputAssistPolicy({
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

    const activeProvider =
      environment.runtimeAvailability?.kind === 'ready'
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
      const preparedRequest = await prepareMealInputAssistRequest(request);
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
        const rawCandidateTotal =
          rawCandidateCounts.noteDraft +
          rawCandidateCounts.mealNames +
          rawCandidateCounts.cuisineTypes;

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
  }, [getRequestEnvironment, policy, request, setProgressState]);

  const prewarm = useCallback(async () => {
    if (isRunningRef.current || isPrewarmingRef.current) {
      return;
    }

    isPrewarmingRef.current = true;
    setPrewarmStatus('running');

    try {
      const environment = await loadEnvironment();
      if (!environment.isAiInputAssistEnabled || environment.runtimeAvailability?.kind !== 'ready') {
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

  const applyMealNameSuggestion = useCallback(
    (suggestion: MealInputAssistTextSuggestion) => {
      onCaptureReviewChange('mealName', suggestion.value);
      setAppliedMetadata(current =>
        mergeAppliedMetadata(current, 'mealName', suggestion.source, suggestion.confidence)
      );
    },
    [onCaptureReviewChange]
  );

  const applyNoteDraftSuggestion = useCallback(
    (suggestion: MealInputAssistTextSuggestion) => {
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
      setAppliedMetadata(current =>
        mergeAppliedMetadata(current, 'notes', suggestion.source, suggestion.confidence)
      );
    },
    [captureReview, onCaptureReviewChange]
  );

  const applyCuisineSuggestion = useCallback(
    (suggestion: MealInputAssistCuisineSuggestion) => {
      onCaptureReviewChange('cuisineType', suggestion.value);
      setAppliedMetadata(current =>
        mergeAppliedMetadata(current, 'cuisineType', suggestion.source, suggestion.confidence)
      );
    },
    [onCaptureReviewChange]
  );

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
