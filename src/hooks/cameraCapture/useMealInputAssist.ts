import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS,
  createMealInputAssistPolicy,
  createUnavailableRuntimeAvailability,
  createOverrideRuntimeAvailability,
  loadMealInputAssistRuntimeAvailability,
  normalizeMealInputAssistResult,
  type AppliedMealInputAssistMetadata,
  type MealInputAssistCuisineSuggestion,
  type MealInputAssistHomemadeSuggestion,
  type MealInputAssistPolicy,
  type MealInputAssistProvider,
  type MealInputAssistRuntimeAvailability,
  type MealInputAssistStatus,
  type MealInputAssistSuggestions,
  type MealInputAssistTextSuggestion,
} from '../../ai/mealInputAssist';
import type { CaptureReviewState } from './useCameraCapture';
import { AppSettingsService } from '../../database/services/AppSettingsService';

type CaptureReviewField = keyof Omit<CaptureReviewState, 'photoUri' | 'width' | 'height'>;

interface UseMealInputAssistParams {
  captureReview: CaptureReviewState | null;
  onCaptureReviewChange: (field: CaptureReviewField, value: string | boolean) => void;
  provider?: MealInputAssistProvider;
  policy?: MealInputAssistPolicy;
  loadAiInputAssistEnabled?: () => Promise<boolean>;
  resolveRuntimeAvailability?: () => Promise<MealInputAssistRuntimeAvailability>;
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
  const [appliedMetadata, setAppliedMetadata] = useState<AppliedMealInputAssistMetadata | null>(null);
  const [isAiInputAssistEnabled, setIsAiInputAssistEnabled] = useState<boolean | null>(provider || policy ? true : null);
  const [runtimeAvailability, setRuntimeAvailability] = useState<MealInputAssistRuntimeAvailability | null>(
    provider ? createOverrideRuntimeAvailability(provider) : null
  );
  const requestIdRef = useRef(0);
  const isRunningRef = useRef(false);

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
    setAppliedMetadata(null);
    requestIdRef.current += 1;
    isRunningRef.current = false;
  }, [reviewKey]);

  const loadEnvironment = useCallback(async () => {
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
  }, [loadAiInputAssistEnabledSetting, loadRuntimeAvailability]);

  useEffect(() => {
    loadEnvironment().catch(() => undefined);
  }, [loadEnvironment, reviewKey]);

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
    || suggestions.cuisineTypes.length > 0
    || suggestions.homemade.length > 0;

  const requestSuggestions = useCallback(async () => {
    if (!request || isRunningRef.current) {
      return;
    }

    isRunningRef.current = true;
    const environment = await loadEnvironment();
    const nextPolicy = policy ?? createMealInputAssistPolicy({
      isEnabled: environment.isAiInputAssistEnabled,
      runtimeAvailability: environment.runtimeAvailability,
    });
    const nextAvailability = nextPolicy(request);

    if (nextAvailability.kind === 'disabled') {
      isRunningRef.current = false;
      setStatus('idle');
      setErrorMessage(null);
      return;
    }

    const activeProvider = environment.runtimeAvailability.kind === 'ready'
      ? environment.runtimeAvailability.provider
      : null;
    if (!activeProvider) {
      isRunningRef.current = false;
      setStatus('error');
      setErrorMessage('AI provider を初期化できませんでした。');
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setStatus('running');
    setErrorMessage(null);

    try {
      const rawResult = await activeProvider.suggest(request);
      isRunningRef.current = false;
      if (requestIdRef.current !== requestId) {
        return;
      }

      setSuggestions(normalizeMealInputAssistResult(rawResult));
      setStatus('success');
    } catch (error) {
      isRunningRef.current = false;
      if (requestIdRef.current !== requestId) {
        return;
      }

      console.error('Meal input assist failed:', error);
      setStatus('error');
      setErrorMessage('端末内解析に失敗しました。もう一度お試しください。');
    }
  }, [loadEnvironment, policy, request]);

  const applyMealNameSuggestion = useCallback((suggestion: MealInputAssistTextSuggestion) => {
    onCaptureReviewChange('mealName', suggestion.value);
    setAppliedMetadata((current) => mergeAppliedMetadata(current, 'mealName', suggestion.source, suggestion.confidence));
  }, [onCaptureReviewChange]);

  const applyCuisineSuggestion = useCallback((suggestion: MealInputAssistCuisineSuggestion) => {
    onCaptureReviewChange('cuisineType', suggestion.value);
    setAppliedMetadata((current) => mergeAppliedMetadata(current, 'cuisineType', suggestion.source, suggestion.confidence));
  }, [onCaptureReviewChange]);

  const applyHomemadeSuggestion = useCallback((suggestion: MealInputAssistHomemadeSuggestion) => {
    onCaptureReviewChange('isHomemade', suggestion.value);
    setAppliedMetadata((current) => mergeAppliedMetadata(current, 'isHomemade', suggestion.source, suggestion.confidence));
  }, [onCaptureReviewChange]);

  return {
    status: effectiveStatus,
    suggestions,
    errorMessage,
    disabledReason: availability.kind === 'disabled' ? availability.reason : null,
    hasAnySuggestions,
    requestSuggestions,
    applyMealNameSuggestion,
    applyCuisineSuggestion,
    applyHomemadeSuggestion,
    appliedMetadata,
  };
}
