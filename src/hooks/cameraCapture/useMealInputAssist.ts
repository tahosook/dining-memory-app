import { useEffect, useMemo } from 'react';
import { buildMealInputAssistRequest } from '../../ai/mealInputAssist/request';
import { hasAnyMealInputAssistSuggestions } from '../../ai/mealInputAssist/suggestionDiagnostics';
import { toProgressSnapshot } from '../../ai/mealInputAssist/progress';
import type {
  MealInputAssistPolicy,
  MealInputAssistProvider,
  MealInputAssistRuntimeAvailability,
  MealInputAssistStatus,
} from '../../ai/mealInputAssist/types';
import type { CaptureReviewEditableField, CaptureReviewState } from './useCameraCapture';
import {
  useMealInputAssistEnvironment,
  useMealInputAssistProgress,
  useMealInputAssistAvailability,
  useMealInputAssistRequest,
  useMealInputAssistPrewarm,
  useMealInputAssistApplication,
} from './mealInputAssist';

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
  const { isAiInputAssistEnabled, runtimeAvailability, loadEnvironment, getRequestEnvironment } =
    useMealInputAssistEnvironment({
      provider,
      policy,
      loadAiInputAssistEnabled,
      resolveRuntimeAvailability,
      captureReview,
    });

  const request = useMemo(
    () => (captureReview ? buildMealInputAssistRequest(captureReview) : null),
    [captureReview]
  );

  const { availability } = useMealInputAssistAvailability({
    request,
    policy,
    isAiInputAssistEnabled,
    runtimeAvailability,
  });

  const {
    appliedMetadata,
    applyMealNameSuggestion,
    applyNoteDraftSuggestion,
    applyCuisineSuggestion,
    resetApplicationState,
  } = useMealInputAssistApplication({
    captureReview,
    onCaptureReviewChange,
  });

  const {
    progress,
    setProgressState,
    resetProgress,
    requestStartedAtRef,
    progressUpdatedAtRef,
    latestProgressUpdateRef,
    setProgress,
  } = useMealInputAssistProgress();

  const {
    status: rawStatus,
    suggestions,
    errorMessage,
    requestSuggestions,
    resetRequestState,
    isRunningRef,
  } = useMealInputAssistRequest({
    request,
    policy,
    getRequestEnvironment,
    setProgressState,
  });

  // Now we wire up the progress timer inside the main hook, since it needs `rawStatus`.
  useEffect(() => {
    if (rawStatus !== 'running') {
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
  }, [rawStatus, requestStartedAtRef, progressUpdatedAtRef, latestProgressUpdateRef, setProgress]);

  const { prewarmStatus, prewarm, resetPrewarmState } = useMealInputAssistPrewarm({
    loadEnvironment,
    isRunningRef,
  });

  const reviewKey = captureReview?.photoUri ?? null;

  useEffect(() => {
    resetRequestState();
    resetProgress();
    resetApplicationState();
    resetPrewarmState();
  }, [reviewKey, resetRequestState, resetProgress, resetApplicationState, resetPrewarmState]);

  const effectiveStatus: MealInputAssistStatus = !captureReview
    ? 'idle'
    : availability.kind === 'disabled'
      ? 'disabled'
      : rawStatus;

  const hasAnySuggestions = hasAnyMealInputAssistSuggestions(suggestions);

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
