import { useState, useRef, useCallback } from 'react';
import { MealService } from '../../database/services/MealService';
import { getCurrentLocationSnapshot } from './locationSnapshot';
import {
  createCaptureReviewState,
  type CaptureReviewEditableField,
  type CaptureReviewSource,
  type CaptureReviewState,
  type ReviewablePhoto,
} from './captureReviewState';

export const useCaptureReview = () => {
  const captureReviewRequestIdRef = useRef(0);
  const captureReviewManualHomemadeOverrideRef = useRef(false);
  const [captureReview, setCaptureReview] = useState<CaptureReviewState | null>(null);
  const captureReviewRef = useRef<CaptureReviewState | null>(null);
  captureReviewRef.current = captureReview;

  const applyNearbyHomemadeDefault = useCallback(async (reviewRequestId: number) => {
    try {
      const locationSnapshot = await getCurrentLocationSnapshot();
      if (
        captureReviewRequestIdRef.current !== reviewRequestId ||
        captureReviewManualHomemadeOverrideRef.current
      ) {
        return;
      }

      if (
        typeof locationSnapshot.latitude !== 'number' ||
        typeof locationSnapshot.longitude !== 'number'
      ) {
        return;
      }

      const defaultValue = await MealService.getRecentNearbyHomemadeDefault({
        latitude: locationSnapshot.latitude,
        longitude: locationSnapshot.longitude,
      });

      if (
        captureReviewRequestIdRef.current !== reviewRequestId ||
        captureReviewManualHomemadeOverrideRef.current
      ) {
        return;
      }

      if (typeof defaultValue !== 'boolean') {
        return;
      }

      setCaptureReview(current => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          isHomemade: defaultValue,
        };
      });
    } catch {
      // 位置取得や履歴参照に失敗しても、手動入力と保存を優先する
    }
  }, []);

  const beginReview = useCallback(
    (photo: ReviewablePhoto, source: CaptureReviewSource) => {
      const reviewRequestId = captureReviewRequestIdRef.current + 1;
      captureReviewRequestIdRef.current = reviewRequestId;
      captureReviewManualHomemadeOverrideRef.current = false;

      setCaptureReview(createCaptureReviewState(photo, source));
      void applyNearbyHomemadeDefault(reviewRequestId);
    },
    [applyNearbyHomemadeDefault]
  );

  const updateCaptureReview = useCallback(
    (field: CaptureReviewEditableField, value: string | boolean) => {
      if (field === 'isHomemade') {
        captureReviewManualHomemadeOverrideRef.current = true;
      }

      setCaptureReview(current => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          [field]: value,
        };
      });
    },
    []
  );

  const clearReview = useCallback(() => {
    setCaptureReview(null);
  }, []);

  return {
    captureReview,
    captureReviewRef,
    beginReview,
    updateCaptureReview,
    clearReview,
  };
};
