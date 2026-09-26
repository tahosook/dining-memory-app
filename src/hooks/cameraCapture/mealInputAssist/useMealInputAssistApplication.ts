import { useCallback, useRef, useState } from 'react';
import { mergeAppliedMetadata } from '../../../ai/mealInputAssist/appliedMetadata';
import type {
  AppliedMealInputAssistMetadata,
  MealInputAssistCuisineSuggestion,
  MealInputAssistTextSuggestion,
} from '../../../ai/mealInputAssist/types';
import type { CaptureReviewState, CaptureReviewEditableField } from '../useCameraCapture';

interface UseMealInputAssistApplicationParams {
  captureReview: CaptureReviewState | null;
  onCaptureReviewChange: (field: CaptureReviewEditableField, value: string | boolean) => void;
}

export function useMealInputAssistApplication({
  captureReview,
  onCaptureReviewChange,
}: UseMealInputAssistApplicationParams) {
  const [appliedMetadata, setAppliedMetadata] = useState<AppliedMealInputAssistMetadata | null>(
    null
  );
  const appliedNoteDraftValuesRef = useRef<Set<string>>(new Set());

  const resetApplicationState = useCallback(() => {
    setAppliedMetadata(null);
    appliedNoteDraftValuesRef.current.clear();
  }, []);

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
    appliedMetadata,
    applyMealNameSuggestion,
    applyNoteDraftSuggestion,
    applyCuisineSuggestion,
    resetApplicationState,
  };
}
