import { useCallback, useRef, useState } from 'react';
import { createMealInputAssistPolicy } from '../../../ai/mealInputAssist/policy';
import { prepareMealInputAssistRequest } from '../../../ai/mealInputAssist/preparedPhoto';
import type { MealInputAssistRequest } from '../../../ai/mealInputAssist/types';
import { normalizeMealInputAssistResult } from '../../../ai/mealInputAssist/normalizer';
import {
  countNormalizedSuggestions,
  countProviderResultCandidates,
  hasAnyMealInputAssistSuggestions,
} from '../../../ai/mealInputAssist/suggestionDiagnostics';
import type { MealInputAssistEnvironment } from '../../../ai/mealInputAssist/environment';
import {
  EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS,
  type MealInputAssistPolicy,
  type MealInputAssistProgressUpdate,
  type MealInputAssistStatus,
  type MealInputAssistSuggestions,
} from '../../../ai/mealInputAssist/types';

interface UseMealInputAssistRequestParams {
  request: MealInputAssistRequest | null;
  policy?: MealInputAssistPolicy;
  getRequestEnvironment: () => Promise<
    Pick<MealInputAssistEnvironment, 'isAiInputAssistEnabled' | 'runtimeAvailability'>
  >;
  setProgressState: (update: MealInputAssistProgressUpdate | null) => void;
}

export function useMealInputAssistRequest({
  request,
  policy,
  getRequestEnvironment,
  setProgressState,
}: UseMealInputAssistRequestParams) {
  const [status, setStatus] = useState<Exclude<MealInputAssistStatus, 'disabled'>>('idle');
  const [suggestions, setSuggestions] = useState<MealInputAssistSuggestions>(
    EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const isRunningRef = useRef(false);

  const resetRequestState = useCallback(() => {
    setStatus('idle');
    setSuggestions(EMPTY_MEAL_INPUT_ASSIST_SUGGESTIONS);
    setErrorMessage(null);
    requestIdRef.current += 1;
    isRunningRef.current = false;
  }, []);

  const requestSuggestions = useCallback(async () => {
    if (!request || isRunningRef.current) {
      return;
    }

    isRunningRef.current = true;
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

  return {
    status,
    suggestions,
    errorMessage,
    requestSuggestions,
    resetRequestState,
    isRunningRef,
  };
}
