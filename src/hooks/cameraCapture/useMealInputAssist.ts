import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createMealInputAssistPolicy } from '../../ai/mealInputAssist/policy';
import { normalizeMealInputAssistResult } from '../../ai/mealInputAssist/normalizer';
import { prepareMealInputAssistRequest } from '../../ai/mealInputAssist/preparedPhoto';
import { buildMealInputAssistRequest } from '../../ai/mealInputAssist/request';
import {
  countNormalizedSuggestions,
  countProviderResultCandidates,
  hasAnyMealInputAssistSuggestions,
} from '../../ai/mealInputAssist/suggestionDiagnostics';
import {
  EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS,
  type MealInputAssistAvailability,
  type MealInputAssistPolicy,
  type MealInputAssistPrewarmStatus,
  type MealInputAssistProvider,
  type MealInputAssistRuntimeAvailability,
  type MealInputAssistStatus,
  type MealInputAssistSuggestions,
} from '../../ai/mealInputAssist/types';
import type { CaptureReviewEditableField, CaptureReviewState } from './useCameraCapture';
import { useMealInputAssistEnvironment } from './mealInputAssist/useMealInputAssistEnvironment';
import { useMealInputAssistProgress } from './mealInputAssist/useMealInputAssistProgress';
import { useMealInputAssistApply } from './mealInputAssist/useMealInputAssistApply';

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
  const [prewarmStatus, setPrewarmStatus] = useState<MealInputAssistPrewarmStatus>('idle');

  const requestIdRef = useRef(0);
  const isRunningRef = useRef(false);
  const isPrewarmingRef = useRef(false);

  const { isAiInputAssistEnabled, runtimeAvailability, loadEnvironment, getRequestEnvironment } =
    useMealInputAssistEnvironment({
      captureReview,
      provider,
      policy,
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
    });

  const { progress, setProgressState, resetProgressState, requestStartedAtRef } =
    useMealInputAssistProgress(status);

  const {
    appliedMetadata,
    applyMealNameSuggestion,
    applyNoteDraftSuggestion,
    applyCuisineSuggestion,
    resetAppliedMetadata,
  } = useMealInputAssistApply(captureReview, onCaptureReviewChange);

  const reviewKey = captureReview?.photoUri ?? null;

  useEffect(() => {
    setStatus('idle');
    setSuggestions(EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS);
    setErrorMessage(null);
    resetProgressState();
    resetAppliedMetadata();
    requestIdRef.current += 1;
    isRunningRef.current = false;
    isPrewarmingRef.current = false;
    setPrewarmStatus('idle');
  }, [reviewKey, resetProgressState, resetAppliedMetadata]);

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
  }, [getRequestEnvironment, policy, request, setProgressState, requestStartedAtRef]);

  const prewarm = useCallback(async () => {
    if (isRunningRef.current || isPrewarmingRef.current) {
      return;
    }

    isPrewarmingRef.current = true;
    setPrewarmStatus('running');

    try {
      const environment = await loadEnvironment();
      if (
        !environment.isAiInputAssistEnabled ||
        environment.runtimeAvailability?.kind !== 'ready'
      ) {
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
