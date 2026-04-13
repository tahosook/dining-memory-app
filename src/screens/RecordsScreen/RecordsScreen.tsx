import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { MealService } from '../../database/services/MealService';
import { MealEditModal, type MealEditDraft } from '../../components/common/MealEditModal';
import { formatMealDetailMessage } from '../../utils/mealDetails';

interface MealRecord {
  id: string;
  uuid: string;
  meal_name: string;
  meal_type?: string;
  cuisine_type?: string;
  is_homemade: boolean;
  photo_path?: string;
  photo_thumbnail_path?: string;
  location_name?: string;
  meal_datetime: number;
  notes?: string;
  cooking_level?: string;
}

interface MealGroup {
  date: string;
  dateLabel: string;
  meals: MealRecord[];
}

const emptyEditDraft: MealEditDraft = {
  mealName: '',
  cuisineType: '',
  location: '',
  notes: '',
  isHomemade: true,
};

function createMealEditDraft(meal: MealRecord): MealEditDraft {
  return {
    mealName: meal.meal_name,
    cuisineType: meal.cuisine_type ?? '',
    location: meal.location_name ?? '',
    notes: meal.notes ?? '',
    isHomemade: meal.is_homemade,
  };
}

type MealItemProps = {
  item: MealRecord;
  onPress: (meal: MealRecord) => void;
};

type MealGroupSectionProps = {
  item: MealGroup;
  onMealPress: (meal: MealRecord) => void;
};

const Separator = () => <View style={styles.separator} />;

const GroupSeparator = () => <View style={styles.groupSeparator} />;

const MealGroupHeader: React.FC<{ item: MealGroup }> = ({ item }) => (
  <View style={styles.dateHeader}>
    <Text style={styles.dateHeaderText}>{item.dateLabel}</Text>
  </View>
);

function getDisplayImageUri(path?: string): string | undefined {
  if (!path) {
    return undefined;
  }

  if (path.startsWith('file://') || path.startsWith('content://') || path.startsWith('ph://') || path.startsWith('http')) {
    return path;
  }

  return `file://${path}`;
}

const MealListItem: React.FC<MealItemProps> = ({ item, onPress }) => {
  const imageUri = getDisplayImageUri(item.photo_thumbnail_path ?? item.photo_path);

  return (
    <TouchableOpacity style={styles.mealCard} onPress={() => onPress(item)} testID={`meal-card-${item.id}`}>
      <View style={styles.mealImageContainer}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={styles.mealImage}
            resizeMode="cover"
            testID={`meal-image-${item.id}`}
          />
        ) : (
          <View style={styles.noImageContainer}>
            <Text style={styles.noImageText}>📷</Text>
          </View>
        )}
      </View>

      <View style={styles.mealInfo}>
        <Text style={styles.mealName} numberOfLines={2}>
          {item.meal_name}
        </Text>

        <View style={styles.mealMeta}>
          <Text style={styles.mealTime}>
            {new Date(item.meal_datetime).toLocaleTimeString('ja-JP', {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </Text>

          {item.location_name && (
            <Text style={styles.mealLocation} numberOfLines={1}>
              {item.location_name}
            </Text>
          )}
        </View>

        <View style={styles.mealTags}>
          {item.cuisine_type && (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{item.cuisine_type}</Text>
            </View>
          )}

          <View style={[styles.tag, item.is_homemade ? styles.homemadeTag : styles.takeoutTag]}>
            <Text style={styles.tagText}>
              {item.is_homemade ? '自家製' : '外食'}
            </Text>
          </View>

          {item.cooking_level && (
            <View style={[styles.tag, styles.cookingLevelTag]}>
              <Text style={styles.tagText}>{item.cooking_level}</Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const MealGroupSection: React.FC<MealGroupSectionProps> = ({ item, onMealPress }) => (
  <View>
    <MealGroupHeader item={item} />
    <FlatList
      data={item.meals}
      keyExtractor={(meal) => meal.id}
      renderItem={({ item: meal }) => <MealListItem item={meal} onPress={onMealPress} />}
      scrollEnabled={false}
      ItemSeparatorComponent={Separator}
    />
  </View>
);

function formatDateLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return '今日';
  }

  if (date.toDateString() === yesterday.toDateString()) {
    return '昨日';
  }

  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function groupMealsByDate(records: MealRecord[]): MealGroup[] {
  const groups: Record<string, MealRecord[]> = {};

  records.forEach((meal) => {
    const dateKey = new Date(meal.meal_datetime).toDateString();
    if (!groups[dateKey]) {
      groups[dateKey] = [];
    }
    groups[dateKey].push(meal);
  });

  return Object.entries(groups)
    .map(([dateKey, groupMeals]) => ({
      date: dateKey,
      dateLabel: formatDateLabel(new Date(dateKey)),
      meals: groupMeals.sort((a, b) => b.meal_datetime - a.meal_datetime),
    }))
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

/**
 * 食事記録一覧画面コンポーネント
 *
 * ユーザーが撮影した食事記録の一覧を表示し、
 * 日付ごとにグルーピングして最新順に表示する。
 *
 * @component
 * @returns {JSX.Element} 食事記録一覧画面
 */
export const RecordsScreen: React.FC = () => {
  const [mealGroups, setMealGroups] = useState<MealGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [editingMeal, setEditingMeal] = useState<MealRecord | null>(null);
  const [editDraft, setEditDraft] = useState<MealEditDraft>(emptyEditDraft);
  const [savingEdit, setSavingEdit] = useState(false);

  // Load meal records
  const loadMeals = useCallback(async () => {
    try {
      const meals = await MealService.getRecentMeals(100); // Get last 100 meals
      const groupedMeals = groupMealsByDate(meals as MealRecord[]);
      setMealGroups(groupedMeals);
    } catch (error) {
      console.error('Failed to load meals:', error);
      Alert.alert('エラー', '食事記録の読み込みに失敗しました。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadMeals();
    }, [loadMeals])
  );

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMeals();
  }, [loadMeals]);

  // Handle meal press
  const handleMealPress = (meal: MealRecord) => {
    Alert.alert(meal.meal_name, formatMealDetailMessage(meal), [
      { text: '編集', onPress: () => handleEditMeal(meal) },
      { text: '削除', onPress: () => handleDeleteMeal(meal), style: 'destructive' },
      { text: '閉じる', style: 'cancel' }
    ]);
  };

  // Handle edit meal
  const handleEditMeal = (meal: MealRecord) => {
    setEditingMeal(meal);
    setEditDraft(createMealEditDraft(meal));
  };

  // Handle delete meal
  const handleDeleteMeal = (meal: MealRecord) => {
    Alert.alert(
      '削除確認',
      `${meal.meal_name} を削除してもよろしいですか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            try {
              await MealService.softDeleteMeal(meal.id);
              loadMeals(); // Refresh the list
            } catch (error) {
              console.error('Failed to delete meal:', error);
              Alert.alert('エラー', '削除に失敗しました。');
            }
          }
        }
      ]
    );
  };

  const saveEdit = useCallback(async () => {
    if (!editingMeal) {
      return;
    }

    setSavingEdit(true);

    try {
      await MealService.updateMeal(editingMeal.id, {
        meal_name: editDraft.mealName,
        cuisine_type: editDraft.cuisineType || undefined,
        location_name: editDraft.location || undefined,
        notes: editDraft.notes || undefined,
        is_homemade: editDraft.isHomemade,
      });
      setEditingMeal(null);
      await loadMeals();
    } catch (error) {
      console.error('Failed to update meal:', error);
      Alert.alert('エラー', '更新に失敗しました。');
    } finally {
      setSavingEdit(false);
    }
  }, [editDraft, editingMeal, loadMeals]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>食事記録を読み込んでいます...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="auto" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>食事記録</Text>
        <TouchableOpacity style={styles.settingsButton}>
          <Text style={styles.settingsButtonText}>⚙️</Text>
        </TouchableOpacity>
      </View>

      {/* Content */}
      <View style={styles.content}>
        {mealGroups.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🍽️</Text>
            <Text style={styles.emptyTitle}>まだ食事記録がありません</Text>
            <Text style={styles.emptySubtitle}>
              カメラタブから食事の写真を撮影して記録を始めましょう
            </Text>
          </View>
        ) : (
          <FlatList
            data={mealGroups}
            keyExtractor={(group) => group.date}
            renderItem={({ item }) => <MealGroupSection item={item} onMealPress={handleMealPress} />}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={GroupSeparator}
          />
        )}
      </View>

      <MealEditModal
        visible={Boolean(editingMeal)}
        draft={editDraft}
        onChange={setEditDraft}
        onSave={saveEdit}
        onClose={() => setEditingMeal(null)}
        saving={savingEdit}
        testIDPrefix="edit"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  settingsButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsButtonText: {
    fontSize: 18,
  },
  content: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  dateHeader: {
    backgroundColor: '#fff',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  dateHeaderText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  mealCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    padding: 16,
    marginHorizontal: 20,
  },
  mealImageContainer: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    marginRight: 16,
  },
  mealImage: {
    width: '100%',
    height: '100%',
    borderRadius: 8,
  },
  noImageContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noImageText: {
    fontSize: 20,
  },
  mealInfo: {
    flex: 1,
  },
  mealName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    lineHeight: 20,
  },
  mealMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  mealTime: {
    fontSize: 14,
    color: '#666',
    marginRight: 12,
  },
  mealLocation: {
    fontSize: 14,
    color: '#666',
    flex: 1,
  },
  mealTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: '#e9ecef',
  },
  tagText: {
    fontSize: 12,
    color: '#495057',
    fontWeight: '500',
  },
  homemadeTag: {
    backgroundColor: '#d4edda',
  },
  takeoutTag: {
    backgroundColor: '#f8d7da',
  },
  cookingLevelTag: {
    backgroundColor: '#fff3cd',
  },
  separator: {
    height: 1,
    backgroundColor: '#e9ecef',
    marginLeft: 96, // Align with text (80 + 16 padding)
  },
  groupSeparator: {
    height: 12,
    backgroundColor: '#f8f9fa',
  },
});
