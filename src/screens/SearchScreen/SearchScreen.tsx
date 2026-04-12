import React, { useCallback, useState } from 'react';
import { View, Text, TextInput, StyleSheet, Switch, TouchableOpacity, FlatList } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { MealService } from '../../database/services/MealService';
import { Colors } from '../../constants/Colors';
import { GlobalStyles } from '../../constants/Styles';
import type { Meal } from '../../types/MealTypes';

export const SearchScreen: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [homemadeOnly, setHomemadeOnly] = useState(false);
  const [results, setResults] = useState<Meal[]>([]);
  const [loading, setLoading] = useState(false);

  const runSearch = useCallback(async () => {
    setLoading(true);
    try {
      const meals = await MealService.searchMeals({
        text: searchQuery.trim() || undefined,
        location_name: locationFilter.trim() || undefined,
        is_homemade: homemadeOnly || undefined,
      });
      setResults(meals);
    } finally {
      setLoading(false);
    }
  }, [homemadeOnly, locationFilter, searchQuery]);

  useFocusEffect(
    useCallback(() => {
      runSearch();
    }, [runSearch])
  );

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
        <Text style={styles.resultsCount}>{loading ? '読み込み中...' : `${results.length}件`}</Text>
      </View>

      {results.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>条件に合う記録がありません</Text>
          <Text style={styles.emptyDescription}>検索語やフィルターを変えて再度試してください。</Text>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.resultsList}
          renderItem={({ item }) => (
            <View style={styles.resultCard}>
              <Text style={styles.resultName}>{item.meal_name}</Text>
              <Text style={styles.resultMeta}>
                {new Date(item.meal_datetime).toLocaleString('ja-JP')}
                {item.location_name ? ` ・ ${item.location_name}` : ''}
              </Text>
              {item.notes ? <Text style={styles.resultNotes}>{item.notes}</Text> : null}
              <Text style={styles.resultType}>{item.is_homemade ? '自炊' : '外食'}</Text>
            </View>
          )}
        />
      )}
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
  emptyState: {
    margin: 16,
    padding: 20,
    backgroundColor: Colors.white,
    borderRadius: 12,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 8,
  },
  emptyDescription: {
    fontSize: 14,
    color: Colors.gray,
    textAlign: 'center',
  },
  resultsList: {
    paddingHorizontal: 16,
    paddingBottom: 24,
    gap: 12,
  },
  resultCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    gap: 6,
  },
  resultName: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  resultMeta: {
    fontSize: 13,
    color: Colors.gray,
  },
  resultNotes: {
    fontSize: 14,
    color: Colors.text,
  },
  resultType: {
    fontSize: 13,
    color: Colors.primary,
    fontWeight: '600',
  },
});
