import React, { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { NavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CuisineTypeSelector } from '../../components/common/CuisineTypeSelector';
import { ScreenStateCard } from '../../components/common/ScreenStateCard';
import { Colors } from '../../constants/Colors';
import { GlobalStyles } from '../../constants/Styles';
import { MealService } from '../../database/services/MealService';
import type { Meal } from '../../types/MealTypes';
import type { RootTabParamList } from '../../navigation/types';

export const SearchScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const [searchQuery, setSearchQuery] = useState('');
  const [cuisineFilter, setCuisineFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [homemadeOnly, setHomemadeOnly] = useState(false);
  const [results, setResults] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

  const runSearch = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const meals = await MealService.searchMeals({
        text: searchQuery.trim() || undefined,
        cuisine_type: cuisineFilter || undefined,
        location_name: locationFilter.trim() || undefined,
        is_homemade: homemadeOnly || undefined,
      });
      setResults(meals);
    } catch (error) {
      console.error('Failed to search meals:', error);
      setErrorMessage('検索結果の更新に失敗しました。');
    } finally {
      setHasLoadedOnce(true);
      setLoading(false);
    }
  }, [cuisineFilter, homemadeOnly, locationFilter, searchQuery]);

  useFocusEffect(
    useCallback(() => {
      runSearch();
    }, [runSearch])
  );

  const handleMealPress = useCallback((meal: Meal) => {
    navigation.navigate('Records', {
      screen: 'MealDetail',
      params: {
        meal,
      },
    });
  }, [navigation]);

  const showLoadingState = loading && results.length === 0;
  const showErrorState = Boolean(errorMessage) && results.length === 0;
  const showInlineError = Boolean(errorMessage) && results.length > 0;
  const showZeroState = hasLoadedOnce && !loading && !errorMessage && results.length === 0;
  const resultsCountText = loading ? '読み込み中...' : errorMessage ? '更新失敗' : `${results.length}件`;

  return (
    <View style={GlobalStyles.screen}>
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={20} color={Colors.gray} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="料理名・メモ・場所を検索"
          value={searchQuery}
          onChangeText={setSearchQuery}
          testID="search-input"
        />
      </View>

      <View style={styles.filtersCard}>
        <CuisineTypeSelector value={cuisineFilter} onChange={setCuisineFilter} testIDPrefix="search-cuisine" />
        <TextInput
          style={styles.filterInput}
          placeholder="場所フィルター"
          value={locationFilter}
          onChangeText={setLocationFilter}
        />
        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>自炊のみ</Text>
          <Switch value={homemadeOnly} onValueChange={setHomemadeOnly} />
        </View>
        <TouchableOpacity style={styles.searchButton} onPress={runSearch}>
          <Text style={styles.searchButtonText}>検索する</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.resultsHeader}>
        <Text style={styles.resultsTitle}>検索結果</Text>
        <Text style={styles.resultsCount}>{resultsCountText}</Text>
      </View>

      {showLoadingState ? (
        <View style={styles.stateCardContainer}>
          <ScreenStateCard
            title="検索結果を読み込んでいます"
            description="保存済みの記録を読み込み中です。少し待ってから表示されます。"
            variant="loading"
            testIDPrefix="search-loading"
          />
        </View>
      ) : null}

      {showErrorState ? (
        <View style={styles.stateCardContainer}>
          <ScreenStateCard
            title="検索結果を更新できませんでした"
            description="通信ではなくローカル検索ですが、読み込みに失敗しました。もう一度お試しください。"
            variant="error"
            actionLabel="再試行"
            onAction={runSearch}
            testIDPrefix="search-error"
          />
        </View>
      ) : null}

      {showZeroState ? (
        <View style={styles.stateCardContainer}>
          <ScreenStateCard
            title="条件に合う記録がありません"
            description="検索語やフィルターを変えて再度試してください。"
            variant="empty"
            testIDPrefix="search-empty"
          />
        </View>
      ) : null}

      {showInlineError ? (
        <View style={styles.inlineStateCard}>
          <ScreenStateCard
            title="検索結果の一部を更新できませんでした"
            description="前回の結果を表示したままです。必要なら再試行してください。"
            variant="error"
            actionLabel="再試行"
            onAction={runSearch}
            testIDPrefix="search-error"
          />
        </View>
      ) : null}

      {results.length > 0 ? (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.resultsList}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.resultCard}
              onPress={() => handleMealPress(item)}
              testID={`search-result-${item.id}`}
            >
              <Text style={styles.resultName}>{item.meal_name}</Text>
              <Text style={styles.resultMeta}>
                {new Date(item.meal_datetime).toLocaleString('ja-JP')}
                {item.location_name ? ` ・ ${item.location_name}` : ''}
              </Text>
              {item.notes ? <Text style={styles.resultNotes}>{item.notes}</Text> : null}
              <Text style={styles.resultType}>{item.is_homemade ? '自炊' : '外食'}</Text>
            </TouchableOpacity>
          )}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.white,
    borderRadius: 10,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  filtersCard: {
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: Colors.white,
    borderRadius: 12,
    gap: 12,
  },
  filterInput: {
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  switchLabel: {
    ...GlobalStyles.body,
  },
  searchButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  searchButtonText: {
    color: Colors.white,
    fontWeight: '600',
    fontSize: 16,
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  resultsCount: {
    fontSize: 14,
    color: Colors.gray,
  },
  stateCardContainer: {
    marginHorizontal: 16,
  },
  inlineStateCard: {
    marginHorizontal: 16,
    marginBottom: 12,
  },
  resultsList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  resultCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 14,
    gap: 6,
  },
  resultName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
  },
  resultMeta: {
    fontSize: 13,
    color: Colors.gray,
  },
  resultNotes: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.text,
  },
  resultType: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
});
