import { useCallback, useEffect, useRef, useState } from 'react';
import { toProgressSnapshot } from '../../../ai/mealInputAssist/progress';
import type {
  MealInputAssistProgress,
  MealInputAssistProgressUpdate,
  MealInputAssistStatus,
} from '../../../ai/mealInputAssist/types';

export function useMealInputAssistProgress(status: Exclude<MealInputAssistStatus, 'disabled'>) {
  const [progress, setProgress] = useState<MealInputAssistProgress | null>(null);

  const requestStartedAtRef = useRef<number | null>(null);
  const progressUpdatedAtRef = useRef<number | null>(null);
  const latestProgressUpdateRef = useRef<MealInputAssistProgressUpdate | null>(null);

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

  const resetProgressState = useCallback(() => {
    requestStartedAtRef.current = null;
    progressUpdatedAtRef.current = null;
    latestProgressUpdateRef.current = null;
    setProgress(null);
  }, []);

  return {
    progress,
    setProgressState,
    resetProgressState,
    requestStartedAtRef,
  };
}
