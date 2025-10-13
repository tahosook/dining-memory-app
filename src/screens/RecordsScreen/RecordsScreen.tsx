import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  Dimensions,
  Image,
  SafeAreaView,
  ActivityIndicator
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { MealService } from '../../database/services/MealService';

const { width: screenWidth } = Dimensions.get('window');

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

export default function RecordsScreen() {
  const [mealGroups, setMealGroups] = useState<MealGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load meal records
  const loadMeals = useCallback(async () => {
    try {
      const meals = await MealService.getRecentMeals(100); // Get last 100 meals
      const groupedMeals = groupMealsByDate(meals);
      setMealGroups(groupedMeals);
    } catch (error) {
      console.error('Failed to load meals:', error);
      Alert.alert('エラー', '食事記録の読み込みに失敗しました。');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Group meals by date
  const groupMealsByDate = (meals: any[]): MealGroup[] => {
    const groups: Record<string, MealRecord[]> = {};

    meals.forEach(meal => {
      const date = new Date(meal.meal_datetime).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push({
        id: meal.id,
        uuid: meal.uuid,
        meal_name: meal.meal_name,
        meal_type: meal.meal_type,
        cuisine_type: meal.cuisine_type,
        is_homemade: meal.is_homemade,
        photo_path: meal.photo_path,
        photo_thumbnail_path: meal.photo_thumbnail_path,
        location_name: meal.location_name,
        meal_datetime: meal.meal_datetime,
        notes: meal.notes,
        cooking_level: meal.cooking_level
      });
    });

    // Convert to array and sort by date (newest first)
    return Object.entries(groups)
      .map(([date, meals]) => {
        const dateObj = new Date(date);
        const dateLabel = formatDateLabel(dateObj);
        return {
          date,
          dateLabel,
          meals: meals.sort((a, b) => b.meal_datetime - a.meal_datetime) // Within date, sort by time (newest first)
        };
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Sort groups by date (newest first)
  };

  // Format date label for display
  const formatDateLabel = (date: Date): string => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return '今日';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return '昨日';
    } else {
      return `${date.getMonth() + 1}月${date.getDate()}日`;
    }
  };

  // Initial load
  useEffect(() => {
    loadMeals();
  }, [loadMeals]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadMeals();
  }, [loadMeals]);

  // Handle meal press
  const handleMealPress = (meal: MealRecord) => {
    Alert.alert(
      meal.meal_name,
      `撮影日時: ${new Date(meal.meal_datetime).toLocaleString('ja-JP')}\n${
        meal.location_name ? `場所: ${meal.location_name}\n` : ''
      }${
        meal.cuisine_type ? `料理種別: ${meal.cuisine_type}\n` : ''
      }${meal.is_homemade ? '自家製' : '外食'}${
        meal.notes ? `\nメモ: ${meal.notes}` : ''
      }`,
      [
        { text: '編集', onPress: () => handleEditMeal(meal) },
        { text: '削除', onPress: () => handleDeleteMeal(meal), style: 'destructive' },
        { text: '閉じる', style: 'cancel' }
      ]
    );
  };

  // Handle edit meal
  const handleEditMeal = (meal: MealRecord) => {
    // TODO: Navigate to edit screen
    Alert.alert('編集機能', '編集画面は準備中です。');
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

  // Render meal item
  const renderMealItem = ({ item }: { item: MealRecord }) => (
    <TouchableOpacity
      style={styles.mealCard}
      onPress={() => handleMealPress(item)}
    >
      {/* Thumbnail Image */}
      <View style={styles.mealImageContainer}>
        {item.photo_thumbnail_path ? (
          <Image
            source={{ uri: `file://${item.photo_thumbnail_path}` }}
            style={styles.mealImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.noImageContainer}>
            <Text style={styles.noImageText}>📷</Text>
          </View>
        )}
      </View>

      {/* Meal Info */}
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

  // Render date group header
  const renderGroupHeader = ({ item }: { item: MealGroup }) => (
    <View style={styles.dateHeader}>
      <Text style={styles.dateHeaderText}>{item.dateLabel}</Text>
    </View>
  );

  // Render meal group
  const renderMealGroup = ({ item }: { item: MealGroup }) => (
    <View>
      {renderGroupHeader({ item })}
      <FlatList
        data={item.meals}
        keyExtractor={(meal) => meal.id}
        renderItem={renderMealItem}
        scrollEnabled={false}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />
    </View>
  );

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
            renderItem={renderMealGroup}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            showsVerticalScrollIndicator={false}
            ItemSeparatorComponent={() => <View style={styles.groupSeparator} />}
          />
        )}
      </View>
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
