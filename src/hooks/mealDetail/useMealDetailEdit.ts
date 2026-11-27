import type React from 'react';
import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import type { MealEditDraft } from '../../components/common/MealEditModal';
import { buildMealInputAssistUiProps } from '../../components/common/MealInputAssistSection';
import { MealService } from '../../database/services/MealService';
import type {
  CaptureReviewEditableField,
  CaptureReviewState,
} from '../cameraCapture/useCameraCapture';
import { useMealInputAssist } from '../cameraCapture/useMealInputAssist';
import { requestMealThumbnail } from '../../media/mealThumbnail';
import type { Meal } from '../../types/MealTypes';
import { sanitizeLogObject } from '../../utils/logSanitizer';
import { deleteMealPhotoFileIfSafe, rotateMealPhotoClockwise } from '../../utils/mealPhotoRotation';
import { buildInitialShareText, createMealEditDraft, emptyEditDraft } from './mealDetailHelpers';

interface UseMealDetailEditParams {
  meal: Meal;
  photoUri: string | undefined;
  currentIndex: number;
  isMountedRef: React.MutableRefObject<boolean>;
  shareComposerVisible: boolean;
  setDetailMeals: React.Dispatch<React.SetStateAction<Meal[]>>;
  setShareText: React.Dispatch<React.SetStateAction<string>>;
}

/**
 * Manages MealDetail edit modal draft, AI input assist wiring, save persistence, and 90-degree photo rotation.
 */
export function useMealDetailEdit({
  meal,
  photoUri,
  currentIndex,
  isMountedRef,
  shareComposerVisible,
  setDetailMeals,
  setShareText,
}: UseMealDetailEditParams) {
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [editDraft, setEditDraft] = useState<MealEditDraft>(emptyEditDraft);
  const [savingEdit, setSavingEdit] = useState(false);
  const [rotatingPhoto, setRotatingPhoto] = useState(false);

  const editCaptureReview = useMemo<CaptureReviewState | null>(() => {
    if (!editingMeal || !photoUri) {
      return null;
    }

    return {
      source: 'camera',
      photoUri,
      width: 0,
      height: 0,
      capturedAtMs: editingMeal.meal_datetime,
      mealName: editDraft.mealName,
      cuisineType: editDraft.cuisineType as CaptureReviewState['cuisineType'],
      notes: editDraft.notes,
      locationName: editDraft.location,
      isHomemade: editDraft.isHomemade,
    };
  }, [editDraft, editingMeal, photoUri]);

  const handleEditCaptureReviewChange = useCallback(
    (field: CaptureReviewEditableField, value: string | boolean) => {
      setEditDraft(current => {
        if (field === 'mealName') {
          return { ...current, mealName: String(value) };
        }

        if (field === 'cuisineType') {
          return { ...current, cuisineType: String(value) };
        }

        if (field === 'notes') {
          return { ...current, notes: String(value) };
        }

        if (field === 'locationName') {
          return { ...current, location: String(value) };
        }

        if (field === 'isHomemade') {
          const isHomemade = Boolean(value);
          return {
            ...current,
            isHomemade,
            cookingLevel: isHomemade ? current.cookingLevel : '',
          };
        }

        return current;
      });
    },
    []
  );

  const editMealInputAssist = useMealInputAssist({
    captureReview: editCaptureReview,
    onCaptureReviewChange: handleEditCaptureReviewChange,
  });

  const editAiAssist = useMemo(
    () =>
      buildMealInputAssistUiProps({
        status: editMealInputAssist.status,
        suggestions: editMealInputAssist.suggestions,
        errorMessage: editMealInputAssist.errorMessage,
        progress: editMealInputAssist.progress,
        disabledReason: editMealInputAssist.disabledReason,
        requestSuggestions: editMealInputAssist.requestSuggestions,
        applyNoteDraftSuggestion: editMealInputAssist.applyNoteDraftSuggestion,
        applyMealNameSuggestion: editMealInputAssist.applyMealNameSuggestion,
        applyCuisineSuggestion: editMealInputAssist.applyCuisineSuggestion,
      }),
    [
      editMealInputAssist.status,
      editMealInputAssist.suggestions,
      editMealInputAssist.errorMessage,
      editMealInputAssist.progress,
      editMealInputAssist.disabledReason,
      editMealInputAssist.requestSuggestions,
      editMealInputAssist.applyNoteDraftSuggestion,
      editMealInputAssist.applyMealNameSuggestion,
      editMealInputAssist.applyCuisineSuggestion,
    ]
  );

  const openEditModal = useCallback(() => {
    setEditingMeal(meal);
    setEditDraft(createMealEditDraft(meal));
  }, [meal]);

  const closeEditModal = useCallback(() => {
    setEditingMeal(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingMeal) {
      return;
    }

    setSavingEdit(true);

    try {
      const updatedMeal = await MealService.updateMeal(editingMeal.id, {
        meal_name: editDraft.mealName,
        cuisine_type: editDraft.cuisineType.trim() || null,
        location_name: editDraft.location.trim() || null,
        notes: editDraft.notes.trim() || null,
        is_homemade: editDraft.isHomemade,
        cooking_level: editDraft.isHomemade ? editDraft.cookingLevel || null : null,
        ...(editMealInputAssist.appliedMetadata
          ? {
              ai_confidence: editMealInputAssist.appliedMetadata.aiConfidence,
              ai_source: editMealInputAssist.appliedMetadata.aiSource,
            }
          : {}),
      });

      if (updatedMeal) {
        setDetailMeals(current =>
          current.map((item, index) => (index === currentIndex ? updatedMeal : item))
        );
        if (!shareComposerVisible) {
          setShareText(buildInitialShareText(updatedMeal));
        }
      }

      setEditingMeal(null);
    } catch (error) {
      console.error('Failed to update meal:', sanitizeLogObject(error));
      Alert.alert('エラー', '更新に失敗しました。');
    } finally {
      setSavingEdit(false);
    }
  }, [
    currentIndex,
    editDraft,
    editMealInputAssist.appliedMetadata,
    editingMeal,
    setDetailMeals,
    setShareText,
    shareComposerVisible,
  ]);

  const rotatePhotoClockwise = useCallback(async () => {
    if (!photoUri || rotatingPhoto) {
      return;
    }

    setRotatingPhoto(true);
    let rotatedUri: string | null = null;

    try {
      rotatedUri = await rotateMealPhotoClockwise(photoUri);
      const updatedMeal = await MealService.updateMeal(meal.id, {
        photo_path: rotatedUri,
        photo_thumbnail_path: null,
      });

      if (!updatedMeal) {
        await deleteMealPhotoFileIfSafe(rotatedUri);
        Alert.alert('エラー', '写真の回転に失敗しました。');
        return;
      }

      setDetailMeals(current =>
        current.map((item, index) => (index === currentIndex ? updatedMeal : item))
      );

      requestMealThumbnail(meal.id, rotatedUri, {
        onGenerated: (mealId, thumbUri) => {
          if (!isMountedRef.current) {
            return;
          }
          setDetailMeals(current =>
            current.map(item =>
              item.id === mealId ? { ...item, photo_thumbnail_path: thumbUri } : item
            )
          );
        },
      });
    } catch {
      if (rotatedUri) {
        await deleteMealPhotoFileIfSafe(rotatedUri).catch(() => undefined);
      }
      console.error('Failed to rotate meal photo.');
      Alert.alert('エラー', '写真の回転に失敗しました。');
    } finally {
      if (isMountedRef.current) {
        setRotatingPhoto(false);
      }
    }
  }, [currentIndex, isMountedRef, meal.id, photoUri, rotatingPhoto, setDetailMeals]);

  return {
    editingMeal,
    editDraft,
    savingEdit,
    rotatingPhoto,
    editAiAssist,
    setEditDraft,
    openEditModal,
    closeEditModal,
    saveEdit,
    rotatePhotoClockwise,
  };
}
