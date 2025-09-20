import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function SearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <View style={styles.container}>
      {/* 検索バー */}
      <View style={styles.searchBar}>
        <Ionicons name="search-outline" size={20} color="#666" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="検索キーワード入力..."
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
            <Ionicons name="close-circle" size={20} color="#666" />
          </TouchableOpacity>
        )}
      </View>

      {/* 検索範囲タブ */}
      <View style={styles.scopeTabs}>
        <TouchableOpacity style={[styles.scopeTab, styles.activeScopeTab]}>
          <Text style={styles.activeScopeTabText}>すべて</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.scopeTab}>
          <Text style={styles.scopeTabText}>料理</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.scopeTab}>
          <Text style={styles.scopeTabText}>場所</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.scopeTab}>
          <Text style={styles.scopeTabText}>メモ</Text>
        </TouchableOpacity>
      </View>

      {/* フィルターボタン */}
      <View style={styles.filterButtons}>
        <TouchableOpacity style={styles.filterButton}>
          <Text style={styles.filterButtonText}>📅 期間</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterButton}>
          <Text style={styles.filterButtonText}>📍 場所</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterButton}>
          <Text style={styles.filterButtonText}>🏷️ タグ</Text>
        </TouchableOpacity>
      </View>

      {/* 検索結果または候補 */}
      <ScrollView style={styles.content}>
        {searchQuery.length === 0 ? (
          // 検索候補表示
          <View style={styles.suggestions}>
            <Text style={styles.sectionTitle}>💭 検索候補</Text>
            <TouchableOpacity style={styles.suggestionItem}>
              <Text style={styles.suggestionText}>🍜 ラーメン (28件)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.suggestionItem}>
              <Text style={styles.suggestionText}>🥗 ランチ (15件)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.suggestionItem}>
              <Text style={styles.suggestionText}>🍛 ライス (8件)</Text>
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>🕐 最近の検索</Text>
            <TouchableOpacity style={styles.suggestionItem}>
              <Text style={styles.recentSearchText}>ラーメン</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.suggestionItem}>
              <Text style={styles.recentSearchText}>渋谷 ランチ</Text>
            </TouchableOpacity>
          </View>
        ) : (
          // 検索結果表示
          <View style={styles.searchResults}>
            <Text style={styles.resultsHeader}>検索結果: 12件</Text>
            
            {/* 検索結果カード */}
            <TouchableOpacity style={styles.resultCard}>
              <View style={styles.resultThumbnail}>
                <Text style={styles.thumbnailText}>📸</Text>
              </View>
              <View style={styles.resultInfo}>
                <Text style={styles.resultTitle}>
                  🍜 <Text style={styles.highlightText}>ラーメン</Text>（醤油）
                </Text>
                <Text style={styles.resultDate}>2025/9/11 19:30</Text>
                <Text style={styles.resultLocation}>
                  📍 ○○<Text style={styles.highlightText}>ラーメン</Text>店
                </Text>
                <Text style={styles.resultNote}>💬 美味しかった！</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.resultCard}>
              <View style={styles.resultThumbnail}>
                <Text style={styles.thumbnailText}>📸</Text>
              </View>
              <View style={styles.resultInfo}>
                <Text style={styles.resultTitle}>
                  🍜 <Text style={styles.highlightText}>ラーメン</Text>（味噌）
                </Text>
                <Text style={styles.resultDate}>2025/9/8 20:15</Text>
                <Text style={styles.resultLocation}>📍 △△食堂</Text>
              </View>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
  },
  clearButton: {
    marginLeft: 8,
  },
  scopeTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  scopeTab: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: 16,
    backgroundColor: '#f0f0f0',
  },
  activeScopeTab: {
    backgroundColor: '#2196F3',
  },
  scopeTabText: {
    color: '#666',
    fontSize: 14,
  },
  activeScopeTabText: {
    color: 'white',
    fontSize: 14,
  },
  filterButtons: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#666',
  },
  content: {
    flex: 1,
  },
  suggestions: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  suggestionItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  suggestionText: {
    fontSize: 16,
  },
  recentSearchText: {
    fontSize: 16,
    color: '#666',
  },
  searchResults: {
    padding: 16,
  },
  resultsHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  resultCard: {
    flexDirection: 'row',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: '#f9f9f9',
  },
  resultThumbnail: {
    width: 50,
    height: 50,
    backgroundColor: '#e0e0e0',
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  thumbnailText: {
    fontSize: 20,
  },
  resultInfo: {
    flex: 1,
  },
  resultTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  highlightText: {
    backgroundColor: '#ffeb3b',
    fontWeight: 'bold',
  },
  resultDate: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  resultLocation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  resultNote: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
  },
});