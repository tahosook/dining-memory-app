import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import type { MealInputAssistPrewarmStatus } from '../../../ai/mealInputAssist/types';
import type { MealInputAssistEnvironment } from '../../../ai/mealInputAssist/environment';

interface UseMealInputAssistPrewarmParams {
  loadEnvironment: () => Promise<MealInputAssistEnvironment>;
  isRunningRef: MutableRefObject<boolean>;
}

export function useMealInputAssistPrewarm({
  loadEnvironment,
  isRunningRef,
}: UseMealInputAssistPrewarmParams) {
  const [prewarmStatus, setPrewarmStatus] = useState<MealInputAssistPrewarmStatus>('idle');
  const isPrewarmingRef = useRef(false);

  const resetPrewarmState = useCallback(() => {
    isPrewarmingRef.current = false;
    setPrewarmStatus('idle');
  }, []);

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
  }, [loadEnvironment, isRunningRef]);

  return {
    prewarmStatus,
    prewarm,
    resetPrewarmState,
  };
}
