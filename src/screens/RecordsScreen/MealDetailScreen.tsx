import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MealEditModal } from '../../components/common/MealEditModal';
import { MealPhotoViewer } from '../../components/common/MealPhotoViewer';
import { MealDetailContent } from '../../components/screens/mealDetail/MealDetailContent';
import { MealShareComposerModal } from '../../components/screens/mealDetail/MealShareComposerModal';
import { Colors } from '../../constants/Colors';
import { useMealDetailScreen } from '../../hooks/mealDetail/useMealDetailScreen';
import type { RootStackParamList } from '../../navigation/types';

export type { DetailNavigationDirection } from '../../hooks/mealDetail/mealDetailHelpers';
export {
  canNavigateMealDetail,
  createMealDetailViewerPhotos,
  getAdjacentMealIndex,
  getMealDetailViewerPhotoIndex,
} from '../../hooks/mealDetail/mealDetailHelpers';

type MealDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'MealDetail'>;

export const MealDetailScreen: React.FC<MealDetailScreenProps> = ({ route, navigation }) => {
  const {
    meal,
    detailMealsCount,
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
  } = useMealDetailScreen({
    initialMeal: route.params.meal,
    initialMeals: route.params.meals,
    initialIndex: route.params.initialIndex,
    onNavigateBack: () => navigation.goBack(),
  });

  return (
    <View style={styles.container} testID="meal-detail-container">
      <MealDetailContent
        meal={meal}
        photoUri={photoUri}
        detailMealsCount={detailMealsCount}
        currentIndex={currentIndex}
        canNavigateDetail={canNavigateDetail}
        isAtFirstMeal={isAtFirstMeal}
        isAtLastMeal={isAtLastMeal}
        onOpenPhotoViewer={openPhotoViewer}
        onNavigateToAdjacentMeal={navigateToAdjacentMeal}
        onOpenEditModal={openEditModal}
        onOpenShareComposer={openShareComposer}
        onConfirmDelete={confirmDelete}
      />

      <MealEditModal
        visible={Boolean(editingMeal)}
        draft={editDraft}
        onChange={setEditDraft}
        onSave={saveEdit}
        onClose={closeEditModal}
        saving={savingEdit}
        testIDPrefix="detail-edit"
        imageUri={photoUri}
        onRotateImage={rotatePhotoClockwise}
        rotatingImage={rotatingPhoto}
        aiAssist={editAiAssist}
      />

      {photoViewerVisible ? (
        <MealPhotoViewer
          visible={photoViewerVisible}
          photos={viewerPhotos}
          initialIndex={viewerPhotoIndex}
          onClose={closePhotoViewer}
          onIndexChange={handlePhotoViewerIndexChange}
        />
      ) : null}

      <MealShareComposerModal
        visible={shareComposerVisible}
        photoUri={photoUri}
        shareText={shareText}
        onChangeShareText={setShareText}
        onClose={closeShareComposer}
        onSubmit={submitShare}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
});
