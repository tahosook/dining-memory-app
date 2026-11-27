import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Colors } from '../../../constants/Colors';
import type { DetailNavigationDirection } from '../../../hooks/mealDetail/mealDetailHelpers';
import { formatMealDate } from '../../../hooks/mealDetail/mealDetailHelpers';
import type { Meal } from '../../../types/MealTypes';
import { formatCookingLevel } from '../../../utils/cookingLevel';
import { DetailRow } from '../../common/DetailRow';

interface MealDetailContentProps {
  meal: Meal;
  photoUri: string | undefined;
  detailMealsCount: number;
  currentIndex: number;
  canNavigateDetail: boolean;
  isAtFirstMeal: boolean;
  isAtLastMeal: boolean;
  onOpenPhotoViewer: () => void;
  onNavigateToAdjacentMeal: (direction: DetailNavigationDirection) => void;
  onOpenEditModal: () => void;
  onOpenShareComposer: () => void;
  onConfirmDelete: () => void;
}

export const MealDetailContent: React.FC<MealDetailContentProps> = ({
  meal,
  photoUri,
  detailMealsCount,
  currentIndex,
  canNavigateDetail,
  isAtFirstMeal,
  isAtLastMeal,
  onOpenPhotoViewer,
  onNavigateToAdjacentMeal,
  onOpenEditModal,
  onOpenShareComposer,
  onConfirmDelete,
}) => (
  <ScrollView testID="meal-detail-scroll" contentContainerStyle={styles.content}>
    <View style={styles.heroImageFrame}>
      {photoUri ? (
        <TouchableOpacity
          accessibilityHint="写真全体を黒背景の画面で表示します"
          accessibilityLabel={`${meal.meal_name}の写真を全画面表示`}
          accessibilityRole="imagebutton"
          activeOpacity={0.88}
          onPress={onOpenPhotoViewer}
          style={styles.heroImageButton}
          testID="meal-detail-image-button"
        >
          <Image
            source={{ uri: photoUri }}
            style={styles.heroImage}
            resizeMode="cover"
            testID="meal-detail-image"
          />
        </TouchableOpacity>
      ) : (
        <View style={[styles.heroImage, styles.noImageHero]} testID="meal-detail-image-placeholder">
          <Text style={styles.noImageText}>写真はありません</Text>
        </View>
      )}
    </View>
    {detailMealsCount > 1 ? (
      <View style={styles.photoNavRow}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="前の食事記録へ"
          accessibilityState={{ disabled: !canNavigateDetail || isAtFirstMeal }}
          disabled={!canNavigateDetail || isAtFirstMeal}
          onPress={() => onNavigateToAdjacentMeal('previous')}
          style={[
            styles.photoNavButton,
            !canNavigateDetail || isAtFirstMeal ? styles.photoNavButtonDisabled : null,
          ]}
          testID="meal-detail-photo-nav-previous"
        >
          <Text style={styles.photoNavButtonText}>前の記録</Text>
        </TouchableOpacity>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="次の食事記録へ"
          accessibilityState={{ disabled: !canNavigateDetail || isAtLastMeal }}
          disabled={!canNavigateDetail || isAtLastMeal}
          onPress={() => onNavigateToAdjacentMeal('next')}
          style={[
            styles.photoNavButton,
            !canNavigateDetail || isAtLastMeal ? styles.photoNavButtonDisabled : null,
          ]}
          testID="meal-detail-photo-nav-next"
        >
          <Text style={styles.photoNavButtonText}>次の記録</Text>
        </TouchableOpacity>
      </View>
    ) : null}

    <View style={styles.headerCard}>
      {detailMealsCount > 1 ? (
        <Text style={styles.positionText}>
          {currentIndex + 1} / {detailMealsCount}
        </Text>
      ) : null}
      <Text style={styles.mealName}>{meal.meal_name}</Text>
      <Text style={styles.mealDate}>{formatMealDate(meal.meal_datetime)}</Text>
    </View>

    <View style={styles.actionRow}>
      <TouchableOpacity
        style={styles.secondaryButton}
        onPress={onOpenEditModal}
        testID="meal-detail-edit-button"
        accessibilityRole="button"
        accessibilityLabel="編集"
      >
        <Text style={styles.secondaryButtonText}>編集</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.primaryButton}
        onPress={onOpenShareComposer}
        testID="meal-detail-share-button"
        accessibilityRole="button"
        accessibilityLabel="共有"
      >
        <Text style={styles.primaryButtonText}>共有</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={styles.dangerButton}
        onPress={onConfirmDelete}
        testID="meal-detail-delete-button"
        accessibilityRole="button"
        accessibilityLabel="削除"
      >
        <Text style={styles.dangerButtonText}>削除</Text>
      </TouchableOpacity>
    </View>

    <View style={styles.detailsCard}>
      <DetailRow label="日時" value={formatMealDate(meal.meal_datetime)} />
      <DetailRow label="場所" value={meal.location_name ?? '未設定'} />
      <DetailRow label="料理ジャンル" value={meal.cuisine_type ?? '未設定'} />
      <DetailRow label="メモ" value={meal.notes?.trim() ? meal.notes : '未設定'} />
      <DetailRow label="食事タイプ" value={meal.is_homemade ? '自家製' : '外食'} />
      <DetailRow
        label="自炊スタイル"
        value={meal.is_homemade ? formatCookingLevel(meal.cooking_level) : '未設定'}
      />
    </View>
  </ScrollView>
);

const styles = StyleSheet.create({
  content: {
    padding: 16,
    gap: 16,
  },
  heroImageFrame: {
    position: 'relative',
    width: '100%',
    height: 320,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#e9ecef',
  },
  heroImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e9ecef',
  },
  heroImageButton: {
    width: '100%',
    height: '100%',
  },
  photoNavRow: {
    flexDirection: 'row',
    gap: 10,
  },
  photoNavButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#d9d9d9',
  },
  photoNavButtonDisabled: {
    opacity: 0.45,
  },
  photoNavButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  noImageHero: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  noImageText: {
    color: Colors.gray,
    fontSize: 16,
  },
  headerCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    gap: 6,
  },
  positionText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  mealName: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  mealDate: {
    fontSize: 14,
    color: Colors.gray,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryButton: {
    flex: 1,
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: Colors.white,
    fontWeight: '700',
  },
  secondaryButton: {
    flex: 1,
    backgroundColor: Colors.white,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#d9d9d9',
  },
  secondaryButtonText: {
    color: Colors.text,
    fontWeight: '600',
  },
  dangerButton: {
    flex: 1,
    backgroundColor: '#fff3f2',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f1c2bf',
  },
  dangerButtonText: {
    color: Colors.error,
    fontWeight: '700',
  },
  detailsCard: {
    backgroundColor: Colors.white,
    borderRadius: 16,
    padding: 16,
    gap: 14,
  },
});
