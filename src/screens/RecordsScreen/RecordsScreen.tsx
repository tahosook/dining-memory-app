import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function RecordsScreen() {
  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>📋 食事記録 (今月45件)</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity style={styles.headerButton}>
            <Ionicons name="search-outline" size={24} color="#2196F3" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton}>
            <Ionicons name="stats-chart-outline" size={24} color="#2196F3" />
          </TouchableOpacity>
        </View>
      </View>

      {/* フィルタータブ */}
      <View style={styles.filterTabs}>
        <TouchableOpacity style={[styles.filterTab, styles.activeTab]}>
          <Text style={styles.activeTabText}>全て</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterTab}>
          <Text style={styles.tabText}>今日</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterTab}>
          <Text style={styles.tabText}>今週</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.filterTab}>
          <Text style={styles.tabText}>今月</Text>
        </TouchableOpacity>
      </View>

      {/* 記録一覧 */}
      <ScrollView style={styles.recordsList}>
        {/* 日付セクション */}
        <Text style={styles.dateSection}>📅 2025年9月11日（水）</Text>
        
        {/* 食事カード例 */}
        <TouchableOpacity style={styles.mealCard}>
          <View style={styles.thumbnail}>
            <Text style={styles.thumbnailText}>📸</Text>
          </View>
          <View style={styles.mealInfo}>
            <Text style={styles.mealTime}>19:30 ラーメン（醤油）</Text>
            <Text style={styles.mealLocation}>📍 ○○ラーメン店</Text>
            <Text style={styles.mealTags}>🏷️ 和食 ラーメン</Text>
            <Text style={styles.mealNote}>💬 美味しかった！</Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity style={styles.mealCard}>
          <View style={styles.thumbnail}>
            <Text style={styles.thumbnailText}>📸</Text>
          </View>
          <View style={styles.mealInfo}>
            <Text style={styles.mealTime}>15:00 コーヒー</Text>
            <Text style={styles.mealLocation}>📍 自宅</Text>
            <Text style={styles.mealTags}>🏷️ ドリンク</Text>
          </View>
        </TouchableOpacity>

        {/* 別の日付セクション */}
        <Text style={styles.dateSection}>📅 2025年9月10日（火）</Text>
        
        <TouchableOpacity style={styles.mealCard}>
          <View style={styles.thumbnail}>
            <Text style={styles.thumbnailText}>📸</Text>
          </View>
          <View style={styles.mealInfo}>
            <Text style={styles.mealTime}>18:00 手作り親子丼</Text>
            <Text style={styles.mealLocation}>📍 自宅</Text>
            <Text style={styles.mealTags}>🏷️ 和食 自炊</Text>
            <Text style={styles.mealNote}>💬 久しぶりに作った</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerButtons: {
    flexDirection: 'row',
  },
  headerButton: {
    marginLeft: 12,
    padding: 4,
  },
  filterTabs: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 8,
    borderRadius: 20,
    backgroundColor: '#f5f5f5',
  },
  activeTab: {
    backgroundColor: '#2196F3',
  },
  tabText: {
    color: '#666',
    fontSize: 14,
  },
  activeTabText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  recordsList: {
    flex: 1,
  },
  dateSection: {
    fontSize: 16,
    fontWeight: 'bold',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f8f8f8',
  },
  mealCard: {
    flexDirection: 'row',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  thumbnail: {
    width: 60,
    height: 60,
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  thumbnailText: {
    fontSize: 24,
  },
  mealInfo: {
    flex: 1,
  },
  mealTime: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  mealLocation: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  mealTags: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  mealNote: {
    fontSize: 14,
    color: '#888',
    fontStyle: 'italic',
  },
});