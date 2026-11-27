import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import { MealService } from '../../database/services/MealService';
import { shareMealContent } from '../../media/mealShare';
import type { Meal } from '../../types/MealTypes';
import { sanitizeLogObject } from '../../utils/logSanitizer';
import { getMealDetailImageUri } from '../../utils/mealImage';
import {
  buildInitialShareText,
  canNavigateMealDetail,
  clampDetailIndex,
  createInitialDetailMeals,
  createMealDetailViewerPhotos,
  getAdjacentMealIndex,
  getMealDetailViewerPhotoIndex,
  type DetailNavigationDirection,
} from './mealDetailHelpers';
import { useMealDetailEdit } from './useMealDetailEdit';

interface UseMealDetailScreenParams {
  initialMeal: Meal;
  initialMeals?: Meal[];
  initialIndex?: number;
  onNavigateBack: () => void;
}

/**
 * Coordinates MealDetail screen navigation, photo viewer, X share composer, deletion, and edit workflows.
 */
export function useMealDetailScreen({
  initialMeal,
  initialMeals,
  initialIndex,
  onNavigateBack,
}: UseMealDetailScreenParams) {
  const [detailMeals, setDetailMeals] = useState<Meal[]>(() =>
    createInitialDetailMeals(initialMeal, initialMeals)
  );
  const [currentIndex, setCurrentIndex] = useState(() => {
    const resolvedMeals = createInitialDetailMeals(initialMeal, initialMeals);
    const index = initialIndex ?? 0;
    return clampDetailIndex(index, resolvedMeals.length);
  });
  const meal = detailMeals[currentIndex] ?? detailMeals[0] ?? initialMeal;

  const [shareComposerVisible, setShareComposerVisible] = useState(false);
  const [photoViewerVisible, setPhotoViewerVisible] = useState(false);
  const [shareText, setShareText] = useState(() => buildInitialShareText(meal));

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const photoUri = useMemo(() => getMealDetailImageUri(meal), [meal]);
  const viewerPhotos = useMemo(() => createMealDetailViewerPhotos(detailMeals), [detailMeals]);
  const viewerPhotoIndex = useMemo(
    () => getMealDetailViewerPhotoIndex(viewerPhotos, currentIndex),
    [currentIndex, viewerPhotos]
  );

  const editState = useMealDetailEdit({
    meal,
    photoUri,
    currentIndex,
    isMountedRef,
    shareComposerVisible,
    setDetailMeals,
    setShareText,
  });

  const openShareComposer = useCallback(() => {
    setShareText(buildInitialShareText(meal));
    setShareComposerVisible(true);
  }, [meal]);

  const closeShareComposer = useCallback(() => {
    setShareComposerVisible(false);
  }, []);

  const openPhotoViewer = useCallback(() => {
    if (!photoUri) {
      return;
    }

    setPhotoViewerVisible(true);
  }, [photoUri]);

  const closePhotoViewer = useCallback(() => {
    setPhotoViewerVisible(false);
  }, []);

  const handlePhotoViewerIndexChange = useCallback(
    (viewerIndex: number) => {
      const nextMealIndex = viewerPhotos[viewerIndex]?.mealIndex;

      if (typeof nextMealIndex !== 'number' || nextMealIndex === currentIndex) {
        return;
      }

      const nextMeal = detailMeals[nextMealIndex];

      if (!nextMeal) {
        return;
      }

      setCurrentIndex(nextMealIndex);
      setShareText(buildInitialShareText(nextMeal));
    },
    [currentIndex, detailMeals, viewerPhotos]
  );

  const confirmDelete = useCallback(() => {
    Alert.alert('削除確認', `${meal.meal_name} を削除してもよろしいですか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await MealService.softDeleteMeal(meal.id);
            onNavigateBack();
          } catch (error) {
            console.error('Failed to delete meal:', sanitizeLogObject(error));
            Alert.alert('エラー', '削除に失敗しました。');
          }
        },
      },
    ]);
  }, [meal.id, meal.meal_name, onNavigateBack]);

  const canNavigateDetail = canNavigateMealDetail(
    Boolean(editState.editingMeal),
    shareComposerVisible || photoViewerVisible
  );
  const isAtFirstMeal = currentIndex === 0;
  const isAtLastMeal = currentIndex >= detailMeals.length - 1;

  const navigateToAdjacentMeal = useCallback(
    (direction: DetailNavigationDirection) => {
      if (!canNavigateDetail) {
        return;
      }

      const nextIndex = getAdjacentMealIndex(currentIndex, detailMeals.length, direction);

      if (nextIndex !== currentIndex) {
        setCurrentIndex(nextIndex);
        setShareText(buildInitialShareText(detailMeals[nextIndex]));
      }
    },
    [canNavigateDetail, currentIndex, detailMeals]
  );

  const submitShare = useCallback(async () => {
    try {
      await shareMealContent({
        title: meal.meal_name,
        text: shareText,
        photoUri,
        mimeType: 'image/jpeg',
      });

      setShareComposerVisible(false);
    } catch (error) {
      console.error('Failed to open share sheet:', sanitizeLogObject(error));
      Alert.alert('エラー', '共有シートを開けませんでした。');
    }
  }, [meal.meal_name, photoUri, shareText]);

  return {
    meal,
    detailMealsCount: detailMeals.length,
    currentIndex,
    photoUri,
    viewerPhotos,
    viewerPhotoIndex,
    photoViewerVisible,
    openPhotoViewer,
    closePhotoViewer,
    handlePhotoViewerIndexChange,
    canNavigateDetail,
    isAtFirstMeal,
    isAtLastMeal,
    navigateToAdjacentMeal,
    shareComposerVisible,
    shareText,
    setShareText,
    openShareComposer,
    closeShareComposer,
    submitShare,
    confirmDelete,
    ...editState,
  };
}
