import { useCallback, useRef, useState } from 'react';
import { toProgressSnapshot } from '../../../ai/mealInputAssist/progress';
import type {
  MealInputAssistProgress,
  MealInputAssistProgressUpdate,
} from '../../../ai/mealInputAssist/types';

export function useMealInputAssistProgress() {
  const [progress, setProgress] = useState<MealInputAssistProgress | null>(null);

  const requestStartedAtRef = useRef<number | null>(null);
  const progressUpdatedAtRef = useRef<number | null>(null);
  const latestProgressUpdateRef = useRef<MealInputAssistProgressUpdate | null>(null);

  const resetProgress = useCallback(() => {
    requestStartedAtRef.current = null;
    progressUpdatedAtRef.current = null;
    latestProgressUpdateRef.current = null;
    setProgress(null);
  }, []);

  const setProgressState = useCallback(
    (update: MealInputAssistProgressUpdate | null) => {
      if (!update) {
        resetProgress();
        return;
      }

      const now = Date.now();
      const startedAt = requestStartedAtRef.current ?? now;
      requestStartedAtRef.current = startedAt;
      progressUpdatedAtRef.current = now;
      latestProgressUpdateRef.current = update;
      setProgress(toProgressSnapshot(update, startedAt, now));
    },
    [resetProgress]
  );

  return {
    progress,
    setProgressState,
    resetProgress,
    requestStartedAtRef,
    progressUpdatedAtRef,
    latestProgressUpdateRef,
    setProgress,
  };
}
