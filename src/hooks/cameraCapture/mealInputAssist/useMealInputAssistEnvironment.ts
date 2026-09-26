import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createMealInputAssistEnvironmentLoadFailure,
  loadDefaultMealInputAssistRuntimeAvailability,
  loadMealInputAssistEnvironment,
  type MealInputAssistEnvironment,
  type MealInputAssistEnvironmentLoaderDependencies,
} from '../../../ai/mealInputAssist/environment';
import { createOverrideRuntimeAvailability } from '../../../ai/mealInputAssist/runtimeAvailability';
import { AppSettingsService } from '../../../database/services/AppSettingsService';
import type {
  MealInputAssistPolicy,
  MealInputAssistProvider,
  MealInputAssistRuntimeAvailability,
} from '../../../ai/mealInputAssist/types';
import type { CaptureReviewState } from '../useCameraCapture';

interface UseMealInputAssistEnvironmentParams {
  provider?: MealInputAssistProvider;
  policy?: MealInputAssistPolicy;
  loadAiInputAssistEnabled?: () => Promise<boolean>;
  resolveRuntimeAvailability?: () => Promise<MealInputAssistRuntimeAvailability>;
  captureReview: CaptureReviewState | null;
}

export function useMealInputAssistEnvironment({
  provider,
  policy,
  loadAiInputAssistEnabled,
  resolveRuntimeAvailability,
  captureReview,
}: UseMealInputAssistEnvironmentParams) {
  const [isAiInputAssistEnabled, setIsAiInputAssistEnabled] = useState<boolean | null>(
    provider || policy ? true : null
  );
  const [runtimeAvailability, setRuntimeAvailability] =
    useState<MealInputAssistRuntimeAvailability | null>(
      provider ? createOverrideRuntimeAvailability(provider) : null
    );

  const environmentPromiseRef = useRef<Promise<MealInputAssistEnvironment> | null>(null);
  const environmentLoaderDependenciesRef =
    useRef<MealInputAssistEnvironmentLoaderDependencies | null>(null);

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
      .then(nextAiInputAssistEnabled => {
        if (!cancelled) {
          setIsAiInputAssistEnabled(nextAiInputAssistEnabled);
        }
      })
      .catch(error => {
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

  return {
    isAiInputAssistEnabled,
    runtimeAvailability,
    loadEnvironment,
    getRequestEnvironment,
  };
}
