import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { NavigationProp, useFocusEffect, useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { CuisineTypeSelector } from '../../components/common/CuisineTypeSelector';
import { ScreenStateCard } from '../../components/common/ScreenStateCard';
import { Colors } from '../../constants/Colors';
import { GlobalStyles } from '../../constants/Styles';
import { MealService } from '../../database/services/MealService';
import type { Meal } from '../../types/MealTypes';
import type { RootStackParamList } from '../../navigation/types';
import { getMealListImageUri } from '../../utils/mealImage';

type SearchFilterState = {
  searchQuery: string;
  cuisineFilter: string;
  locationFilter: string;
  homemadeOnly: boolean;
};

export const SEARCH_PAGE_SIZE = 60;

// Optimization: Extracted item rendering logic into a React.memo component.
// This prevents all existing list items from re-rendering when new items are added
// (e.g., during pagination) or when other search-related state updates occur,
// which significantly reduces main-thread blocking on keystrokes.
const SearchResultItem = React.memo<{
  item: Meal;
  cellSize: number;
  onPress: (meal: Meal) => void;
}>(({ item, cellSize, onPress }) => (
  <TouchableOpacity
    style={[styles.photoCell, { width: cellSize, height: cellSize }]}
    onPress={() => onPress(item)}
    testID={`search-result-${item.id}`}
    accessibilityRole="button"
    accessibilityLabel={item.meal_name || '食事の記録'}
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
));

export const SearchScreen: React.FC = () => {
  const navigation = useNavigation<NavigationProp<RootStackParamList>>();
  const { width: windowWidth } = useWindowDimensions();
  const [searchQuery, setSearchQuery] = useState('');
  const [cuisineFilter, setCuisineFilter] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [homemadeOnly, setHomemadeOnly] = useState(false);
  const [filtersVisible, setFiltersVisible] = useState(false);
  const [results, setResults] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const activeSearchIdRef = useRef(0);
  const loadingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const hasMoreRef = useRef(false);
  const resultsLengthRef = useRef(0);
  // Optimization: Store the latest results in a ref.
  // This allows handleMealPress to access the latest state without being recreated
  // every time `results` changes, maintaining a stable reference for the memoized SearchResultItem.
  const resultsRef = useRef<Meal[]>(results);
  const filtersRef = useRef<SearchFilterState>({
    searchQuery: '',
    cuisineFilter: '',
    locationFilter: '',
    homemadeOnly: false,
  });

  useEffect(() => {
    resultsRef.current = results;
  }, [results]);
  const previousFiltersRef = useRef<SearchFilterState>({
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
    const searchId = ++activeSearchIdRef.current;
    loadingRef.current = true;
    setLoading(true);
    setErrorMessage(null);
    loadingMoreRef.current = false;
    setLoadingMore(false);

    try {
      const meals = await MealService.searchMeals({
        text: filters.searchQuery.trim() || undefined,
        cuisine_type: filters.cuisineFilter || undefined,
        location_name: filters.locationFilter.trim() || undefined,
        is_homemade: filters.homemadeOnly || undefined,
        limit: SEARCH_PAGE_SIZE,
        offset: 0,
      });
      if (searchId !== activeSearchIdRef.current) {
        return;
      }
      const hasNext = meals.length === SEARCH_PAGE_SIZE;
      hasMoreRef.current = hasNext;
      setHasMore(hasNext);
      resultsLengthRef.current = meals.length;
      setResults(meals);
    } catch (error) {
      if (searchId !== activeSearchIdRef.current) {
        return;
      }
      console.error('Failed to search meals:', error);
      setErrorMessage('検索結果の更新に失敗しました。');
    } finally {
      if (searchId === activeSearchIdRef.current) {
        loadingRef.current = false;
        setHasLoadedOnce(true);
        setLoading(false);
      }
    }
  }, []);

  const handleLoadMore = useCallback(async () => {
    if (loadingRef.current || loadingMoreRef.current || !hasMoreRef.current) {
      return;
    }

    const searchId = activeSearchIdRef.current;
    const currentFilters = filtersRef.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const nextMeals = await MealService.searchMeals({
        text: currentFilters.searchQuery.trim() || undefined,
        cuisine_type: currentFilters.cuisineFilter || undefined,
        location_name: currentFilters.locationFilter.trim() || undefined,
        is_homemade: currentFilters.homemadeOnly || undefined,
        limit: SEARCH_PAGE_SIZE,
        offset: resultsLengthRef.current,
      });

      if (searchId !== activeSearchIdRef.current) {
        return;
      }

      const hasNext = nextMeals.length === SEARCH_PAGE_SIZE;
      hasMoreRef.current = hasNext;
      setHasMore(hasNext);

      if (nextMeals.length > 0) {
        resultsLengthRef.current += nextMeals.length;
        setResults(prev => [...prev, ...nextMeals]);
      }
    } catch (error) {
      if (searchId !== activeSearchIdRef.current) {
        return;
      }
      console.error('Failed to load more search results:', error);
    } finally {
      if (searchId === activeSearchIdRef.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      runSearch();
    }, [runSearch])
  );

  useEffect(() => {
    const prev = previousFiltersRef.current;
    const hasFiltersChanged =
      prev.searchQuery !== searchQuery ||
      prev.cuisineFilter !== cuisineFilter ||
      prev.locationFilter !== locationFilter ||
      prev.homemadeOnly !== homemadeOnly;

    previousFiltersRef.current = {
      searchQuery,
      cuisineFilter,
      locationFilter,
      homemadeOnly,
    };

    if (!hasFiltersChanged || !hasLoadedOnce) {
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

  const handleMealPress = useCallback(
    (meal: Meal) => {
      const currentMeals = resultsRef.current;
      const initialIndex = currentMeals.findIndex(candidate => candidate.id === meal.id);
      navigation.navigate('MealDetail', {
        meal,
        meals: currentMeals,
        initialIndex: initialIndex >= 0 ? initialIndex : undefined,
      });
    },
    [navigation]
  );

  const showLoadingState = loading && results.length === 0;
  const showErrorState = Boolean(errorMessage) && results.length === 0;
  const showInlineError = Boolean(errorMessage) && results.length > 0;
  const showZeroState = hasLoadedOnce && !loading && !errorMessage && results.length === 0;
  const resultsCountText = loading
    ? '読み込み中...'
    : errorMessage
      ? '更新失敗'
      : hasMore
        ? `${results.length}件+`
        : `${results.length}件`;
  const hasActiveFilters = Boolean(cuisineFilter || locationFilter.trim() || homemadeOnly);
  const gridGap = 3;
  const gridHorizontalPadding = 16;
  const cellSize = Math.floor((windowWidth - gridHorizontalPadding * 2 - gridGap * 2) / 3);

  // Optimization: Memoize the renderItem function passed to FlatList.
  // This avoids passing a new function reference to FlatList on every render,
  // which helps to skip unnecessary item re-renders.
  const renderItem = useCallback(
    ({ item }: { item: Meal }) => (
      <SearchResultItem item={item} cellSize={cellSize} onPress={handleMealPress} />
    ),
    [cellSize, handleMealPress]
  );

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
          onPress={() => setFiltersVisible(current => !current)}
          testID="search-filter-toggle"
        >
          <Ionicons
            name="options-outline"
            size={20}
            color={filtersVisible ? Colors.primary : Colors.text}
          />
        </TouchableOpacity>
      </View>
      {hasActiveFilters ? <Text style={styles.activeFilterText}>条件あり</Text> : null}

      {filtersVisible ? (
        <View style={styles.filtersCard}>
          <CuisineTypeSelector
            value={cuisineFilter}
            onChange={setCuisineFilter}
            testIDPrefix="search-cuisine"
          />
          <TextInput
            style={styles.filterInput}
            placeholder="場所フィルター"
            value={locationFilter}
            onChangeText={setLocationFilter}
            testID="search-location-input"
          />
          <View style={styles.switchRow}>
            <Text style={styles.switchLabel}>自炊のみ</Text>
            <Switch
              value={homemadeOnly}
              onValueChange={setHomemadeOnly}
              testID="search-homemade-switch"
            />
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
          keyExtractor={item => item.id}
          testID="search-results-list"
          contentContainerStyle={styles.resultsList}
          columnWrapperStyle={styles.resultGridRow}
          numColumns={3}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.loadingMoreContainer} testID="search-loading-more">
                <ActivityIndicator size="small" color={Colors.primary} />
              </View>
            ) : null
          }
          renderItem={renderItem}
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
  loadingMoreContainer: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
