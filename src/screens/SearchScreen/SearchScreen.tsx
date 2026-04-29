import React, { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { NavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CuisineTypeSelector } from '../../components/common/CuisineTypeSelector';
import { ScreenStateCard } from '../../components/common/ScreenStateCard';
import { Colors } from '../../constants/Colors';
import { GlobalStyles } from '../../constants/Styles';
import { MealService } from '../../database/services/MealService';
import type { Meal } from '../../types/MealTypes';
import type { RootTabParamList } from '../../navigation/types';
import { getMealListImageUri } from '../../utils/mealImage';

type SearchFilterState = {
  searchQuery: string;
  cuisineFilter: string;
  locationFilter: string;
  homemadeOnly: boolean;
};

export const SearchScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootTabParamList>>();
  const { width: windowWidth } = useWindowDimensions();
  const [searchQuery, setSearchQuery] = useState('');
  const [cuisineFilter, setCuisineFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [homemadeOnly, setHomemadeOnly] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [results, setResults] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const filtersRef = useRef<SearchFilterState>({
    searchQuery: '',
    cuisineFilter: '',
    locationFilter: '',
    homemadeOnly: false,
  });

  useEffect(() => {
    filtersRef.current = {
      searchQuery,
      cuisineFilter,
      locationFilter,
      homemadeOnly,
    };
  }, [cuisineFilter, homemadeOnly, locationFilter, searchQuery]);

  const runSearch = useCallback(async (filters: SearchFilterState = filtersRef.current) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const meals = await MealService.searchMeals({
        text: filters.searchQuery.trim() || undefined,
        cuisine_type: filters.cuisineFilter || undefined,
        location_name: filters.locationFilter.trim() || undefined,
        is_homemade: filters.homemadeOnly || undefined,
      });
      setResults(meals);
    } catch (error) {
      console.error('Failed to search meals:', error);
      setErrorMessage('検索結果の更新に失敗しました。');
    } finally {
      setHasLoadedOnce(true);
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      runSearch();
    }, [runSearch])
  );

  useEffect(() => {
    if (!hasLoadedOnce) {
      return undefined;
    }

    const nextFilters = {
      searchQuery,
      cuisineFilter,
      locationFilter,
      homemadeOnly,
    };
    const timeoutId = setTimeout(() => {
      runSearch(nextFilters).catch(() => undefined);
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [cuisineFilter, hasLoadedOnce, homemadeOnly, locationFilter, runSearch, searchQuery]);

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
  const hasActiveFilters = Boolean(cuisineFilter || locationFilter.trim() || homemadeOnly);
  const gridGap = 3;
  const gridHorizontalPadding = 16;
  const cellSize = Math.floor((windowWidth - gridHorizontalPadding * 2 - gridGap * 2) / 3);

  return (
    <View style={GlobalStyles.screen}>
      <View style={styles.searchRow}>
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
        <TouchableOpacity
          style={[styles.filterToggle, filtersVisible ? styles.filterToggleActive : null]}
          onPress={() => setFiltersVisible((current) => !current)}
          testID="search-filter-toggle"
        >
          <Ionicons name="options-outline" size={20} color={filtersVisible ? Colors.primary : Colors.text} />
        </TouchableOpacity>
      </View>
      {hasActiveFilters ? <Text style={styles.activeFilterText}>条件あり</Text> : null}

      {filtersVisible ? (
        <View style={styles.filtersCard}>
          <CuisineTypeSelector value={cuisineFilter} onChange={setCuisineFilter} testIDPrefix="search-cuisine" />
          <TextInput
            style={styles.filterInput}
            placeholder="場所フィルター"
            value={locationFilter}
            onChangeText={setLocationFilter}
            testID="search-location-input"
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>自炊のみ</Text>
            <Switch value={homemadeOnly} onValueChange={setHomemadeOnly} testID="search-homemade-switch" />
          </View>
        </View>
      ) : null}

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
          columnWrapperStyle={styles.resultGridRow}
          numColumns={3}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.photoCell, { width: cellSize, height: cellSize }]}
              onPress={() => handleMealPress(item)}
              testID={`search-result-${item.id}`}
            >
              {getMealListImageUri(item) ? (
                <Image
                  source={{ uri: getMealListImageUri(item) }}
                  style={styles.photo}
                  resizeMode="cover"
                  testID={`search-result-image-${item.id}`}
                />
              ) : (
                <View style={styles.photoPlaceholder} testID={`search-result-placeholder-${item.id}`}>
                  <Ionicons name="camera-outline" size={22} color={Colors.gray} />
                </View>
              )}
            </TouchableOpacity>
          )}
        />
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    marginBottom: 8,
    gap: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
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
  filterToggle: {
    width: 44,
    height: 44,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: '#d9d9d9',
  },
  filterToggleActive: {
    borderColor: Colors.primary,
    backgroundColor: '#eaf4ff',
  },
  activeFilterText: {
    marginHorizontal: 16,
    marginBottom: 8,
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '700',
  },
  filtersCard: {
    marginHorizontal: 16,
    padding: 16,
    backgroundColor: Colors.white,
    borderRadius: 8,
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
    gap: 3,
  },
  resultGridRow: {
    gap: 3,
    marginBottom: 3,
  },
  photoCell: {
    backgroundColor: '#eceff1',
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },
  photoPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f1f3f4',
  },
});
