import React, { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Image,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as Sharing from 'expo-sharing';
import { MealEditModal, type MealEditDraft } from '../../components/common/MealEditModal';
import { Colors } from '../../constants/Colors';
import { MealService } from '../../database/services/MealService';
import { useMealInputAssist } from '../../hooks/cameraCapture/useMealInputAssist';
import type { Meal } from '../../types/MealTypes';
import type {
  CaptureReviewEditableField,
  CaptureReviewState,
} from '../../hooks/cameraCapture/useCameraCapture';
import type { RecordsStackParamList } from '../../navigation/types';
import { getMealDetailImageUri } from '../../utils/mealImage';
import { formatCookingLevel, normalizeCookingLevel } from '../../utils/cookingLevel';
import { deleteMealPhotoFileIfSafe, rotateMealPhotoClockwise } from '../../utils/mealPhotoRotation';

type MealDetailScreenProps = NativeStackScreenProps<RecordsStackParamList, 'MealDetail'>;

const emptyEditDraft: MealEditDraft = {
  mealName: '',
  cuisineType: '',
  location: '',
  notes: '',
  isHomemade: true,
  cookingLevel: '',
};

function createMealEditDraft(meal: Meal): MealEditDraft {
  return {
    mealName: meal.meal_name,
    cuisineType: meal.cuisine_type ?? '',
    location: meal.location_name ?? '',
    notes: meal.notes ?? '',
    isHomemade: meal.is_homemade,
    cookingLevel: normalizeCookingLevel(meal.cooking_level) ?? '',
  };
}

function buildInitialShareText(meal: Meal): string {
  const parts = [`食事記録: ${meal.meal_name}`];

  if (meal.cuisine_type) {
    parts.push(`料理ジャンル: ${meal.cuisine_type}`);
  }

  if (meal.location_name) {
    parts.push(`場所: ${meal.location_name}`);
  }

  return parts.join('\n');
}

function formatMealDate(mealDatetime: number): string {
  return new Date(mealDatetime).toLocaleString('ja-JP');
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export const MealDetailScreen: React.FC<MealDetailScreenProps> = ({ route, navigation }) => {
  const [meal, setMeal] = useState<Meal>(route.params.meal);
  const [editingMeal, setEditingMeal] = useState<Meal | null>(null);
  const [editDraft, setEditDraft] = useState<MealEditDraft>(emptyEditDraft);
  const [savingEdit, setSavingEdit] = useState(false);
  const [rotatingPhoto, setRotatingPhoto] = useState(false);
  const [shareComposerVisible, setShareComposerVisible] = useState(false);
  const [shareText, setShareText] = useState(() => buildInitialShareText(route.params.meal));

  const photoUri = useMemo(() => getMealDetailImageUri(meal), [meal]);
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

  const openEditModal = useCallback(() => {
    setEditingMeal(meal);
    setEditDraft(createMealEditDraft(meal));
  }, [meal]);

  const openShareComposer = useCallback(() => {
    setShareText(buildInitialShareText(meal));
    setShareComposerVisible(true);
  }, [meal]);

  const saveEdit = useCallback(async () => {
    if (!editingMeal) {
      return;
    }

    setSavingEdit(true);

    try {
      const updatedMeal = await MealService.updateMeal(editingMeal.id, {
        meal_name: editDraft.mealName,
        cuisine_type: editDraft.cuisineType || undefined,
        location_name: editDraft.location || undefined,
        notes: editDraft.notes || undefined,
        is_homemade: editDraft.isHomemade,
        cooking_level: editDraft.isHomemade ? editDraft.cookingLevel || undefined : undefined,
      });

      if (updatedMeal) {
        setMeal(updatedMeal);
      }

      setEditingMeal(null);
    } catch (error) {
      console.error('Failed to update meal:', error);
      Alert.alert('エラー', '更新に失敗しました。');
    } finally {
      setSavingEdit(false);
    }
  }, [editDraft, editingMeal]);

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
        photo_thumbnail_path: rotatedUri,
      });

      if (!updatedMeal) {
        await deleteMealPhotoFileIfSafe(rotatedUri);
        Alert.alert('エラー', '写真の回転に失敗しました。');
        return;
      }

      const previousPhotoUri = photoUri;
      const previousThumbnailUri = meal.photo_thumbnail_path;
      setMeal(updatedMeal);
      await deleteMealPhotoFileIfSafe(previousPhotoUri, rotatedUri).catch(() => undefined);
      if (previousThumbnailUri && previousThumbnailUri !== previousPhotoUri) {
        await deleteMealPhotoFileIfSafe(previousThumbnailUri, rotatedUri).catch(() => undefined);
      }
    } catch {
      if (rotatedUri) {
        await deleteMealPhotoFileIfSafe(rotatedUri).catch(() => undefined);
      }
      console.error('Failed to rotate meal photo.');
      Alert.alert('エラー', '写真の回転に失敗しました。');
    } finally {
      setRotatingPhoto(false);
    }
  }, [meal.id, meal.photo_thumbnail_path, photoUri, rotatingPhoto]);

  const confirmDelete = useCallback(() => {
    Alert.alert('削除確認', `${meal.meal_name} を削除してもよろしいですか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          try {
            await MealService.softDeleteMeal(meal.id);
            navigation.goBack();
          } catch (error) {
            console.error('Failed to delete meal:', error);
            Alert.alert('エラー', '削除に失敗しました。');
          }
        },
      },
    ]);
  }, [meal.id, meal.meal_name, navigation]);

  const submitShare = useCallback(async () => {
    try {
      if (Platform.OS === 'ios' && photoUri) {
        await Share.share({
          title: meal.meal_name,
          message: shareText,
          url: photoUri,
        });
      } else if (Platform.OS === 'android' && photoUri) {
        const sharingAvailable = await Sharing.isAvailableAsync();

        if (sharingAvailable) {
          await Sharing.shareAsync(photoUri, {
            dialogTitle: '共有',
            mimeType: 'image/jpeg',
          });
        } else {
          await Share.share(
            {
              title: meal.meal_name,
              message: shareText,
            },
            {
              dialogTitle: '共有',
            }
          );
        }
      } else {
        await Share.share(
          {
            title: meal.meal_name,
            message: shareText,
          },
          {
            dialogTitle: '共有',
          }
        );
      }

      setShareComposerVisible(false);
    } catch (error) {
      console.error('Failed to open share sheet:', error);
      Alert.alert('エラー', '共有シートを開けませんでした。');
    }
  }, [meal.meal_name, photoUri, shareText]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {photoUri ? (
          <Image
            source={{ uri: photoUri }}
            style={styles.heroImage}
            resizeMode="cover"
            testID="meal-detail-image"
          />
        ) : (
          <View
            style={[styles.heroImage, styles.noImageHero]}
            testID="meal-detail-image-placeholder"
          >
            <Text style={styles.noImageText}>写真はありません</Text>
          </View>
        )}

        <View style={styles.headerCard}>
          <Text style={styles.mealName}>{meal.meal_name}</Text>
          <Text style={styles.mealDate}>{formatMealDate(meal.meal_datetime)}</Text>
        </View>

        <View style={styles.actionRow}>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={openEditModal}
            testID="meal-detail-edit-button"
          >
            <Text style={styles.secondaryButtonText}>編集</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={openShareComposer}
            testID="meal-detail-share-button"
          >
            <Text style={styles.primaryButtonText}>共有</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.dangerButton}
            onPress={confirmDelete}
            testID="meal-detail-delete-button"
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

      <MealEditModal
        visible={Boolean(editingMeal)}
        draft={editDraft}
        onChange={setEditDraft}
        onSave={saveEdit}
        onClose={() => setEditingMeal(null)}
        saving={savingEdit}
        testIDPrefix="detail-edit"
        imageUri={photoUri}
        onRotateImage={rotatePhotoClockwise}
        rotatingImage={rotatingPhoto}
        aiAssistStatus={editMealInputAssist.status}
        aiAssistSuggestions={editMealInputAssist.suggestions}
        aiAssistErrorMessage={editMealInputAssist.errorMessage}
        aiAssistProgress={editMealInputAssist.progress}
        aiAssistDisabledReason={editMealInputAssist.disabledReason}
        onRequestAiSuggestions={editMealInputAssist.requestSuggestions}
        onApplyNoteDraftSuggestion={editMealInputAssist.applyNoteDraftSuggestion}
      />

      <Modal
        animationType="slide"
        transparent
        visible={shareComposerVisible}
        onRequestClose={() => setShareComposerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.shareCard}>
            <Text style={styles.shareTitle}>共有する前に確認</Text>
            {photoUri ? (
              <Image
                source={{ uri: photoUri }}
                style={styles.sharePreviewImage}
                resizeMode="cover"
                testID="share-preview-image"
              />
            ) : null}
            <TextInput
              style={styles.shareInput}
              value={shareText}
              onChangeText={setShareText}
              multiline
              testID="share-text-input"
            />
            {Platform.OS === 'android' && photoUri ? (
              <Text style={styles.shareNote}>写真を共有します。投稿文は共有先で調整できます。</Text>
            ) : null}
            <View style={styles.shareButtonRow}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setShareComposerVisible(false)}
                testID="share-cancel-button"
              >
                <Text style={styles.secondaryButtonText}>閉じる</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={submitShare}
                testID="share-submit-button"
              >
                <Text style={styles.primaryButtonText}>共有を開く</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    padding: 16,
    gap: 16,
  },
  heroImage: {
    width: '100%',
    height: 320,
    borderRadius: 16,
    backgroundColor: '#e9ecef',
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
  detailRow: {
    gap: 6,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.gray,
  },
  detailValue: {
    fontSize: 16,
    color: Colors.text,
    lineHeight: 22,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
  shareCard: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    gap: 14,
  },
  shareTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  sharePreviewImage: {
    width: '100%',
    height: 200,
    borderRadius: 14,
    backgroundColor: '#e9ecef',
  },
  shareInput: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 16,
    textAlignVertical: 'top',
  },
  shareNote: {
    fontSize: 13,
    lineHeight: 18,
    color: Colors.gray,
  },
  shareButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
});
