import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CuisineTypeOption } from '../../constants/MealOptions';
import {
  EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS,
  defaultMealInputAssistPolicy,
  defaultMealInputAssistProvider,
  normalizeMealInputAssistResult,
  type AppliedMealInputAssistMetadata,
  type MealInputAssistCuisineSuggestion,
  type MealInputAssistHomemadeSuggestion,
  type MealInputAssistPolicy,
  type MealInputAssistProvider,
  type MealInputAssistRequest,
  type MealInputAssistStatus,
  type MealInputAssistSuggestions,
  type MealInputAssistTextSuggestion,
} from '../../ai/mealInputAssist';

type CaptureReviewSnapshot = {
  photoUri: string;
  mealName: string;
  cuisineType: CuisineTypeOption | '';
  notes: string;
  locationName: string;
  isHomemade: boolean;
};

type CaptureReviewField = keyof Omit<CaptureReviewSnapshot, 'photoUri'>;

interface UseMealInputAssistParams {
  captureReview: CaptureReviewSnapshot | null;
  onCaptureReviewChange: (field: CaptureReviewField, value: string | boolean) => void;
  provider?: MealInputAssistProvider;
  policy?: MealInputAssistPolicy;
}

function buildMealInputAssistRequest(captureReview: CaptureReviewSnapshot): MealInputAssistRequest {
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
  provider = defaultMealInputAssistProvider,
  policy = defaultMealInputAssistPolicy,
}: UseMealInputAssistParams) {
  const [status, setStatus] = useState<Exclude<MealInputAssistStatus, 'disabled'>>('idle');
  const [suggestions, setSuggestions] = useState<MealInputAssistSuggestions>(EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [appliedMetadata, setAppliedMetadata] = useState<AppliedMealInputAssistMetadata | null>(null);
  const requestIdRef = useRef(0);
  const isRunningRef = useRef(false);

  const reviewKey = captureReview?.photoUri ?? null;

  useEffect(() => {
    setStatus('idle');
    setSuggestions(EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS);
    setErrorMessage(null);
    setAppliedMetadata(null);
    requestIdRef.current += 1;
    isRunningRef.current = false;
  }, [reviewKey]);

  const request = useMemo(
    () => (captureReview ? buildMealInputAssistRequest(captureReview) : null),
    [captureReview]
  );

  const availability = useMemo(
    () => (request ? policy(request) : { kind: 'enabled' as const }),
    [policy, request]
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
    if (!request || availability.kind === 'disabled' || isRunningRef.current) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    isRunningRef.current = true;
    setStatus('running');
    setErrorMessage(null);

    try {
      const rawResult = await provider.suggest(request);
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
      setErrorMessage('候補を取得できませんでした。もう一度お試しください。');
    }
  }, [availability.kind, provider, request]);

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
