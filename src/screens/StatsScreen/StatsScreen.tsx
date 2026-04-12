import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { MealService, type StatisticsSummary } from '../../database/services/MealService';
import { Colors } from '../../constants/Colors';

const emptyStats: StatisticsSummary = {
  totalMeals: 0,
  homemadeMeals: 0,
  takeoutMeals: 0,
};

export default function StatsScreen() {
  const [stats, setStats] = useState<StatisticsSummary>(emptyStats);

  useEffect(() => {
    MealService.getStatistics().then(setStats).catch((error) => {
      console.error('Failed to load stats:', error);
    });
  }, []);

  const homemadeRatio = stats.totalMeals > 0 ? Math.round((stats.homemadeMeals / stats.totalMeals) * 100) : 0;

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>統計サマリー</Text>
      <Text style={styles.headerDescription}>現在の実装では、記録データから集計できる内容だけを表示します。</Text>

      <View style={styles.grid}>
        <SummaryCard label="総記録数" value={`${stats.totalMeals}件`} />
        <SummaryCard label="自炊" value={`${stats.homemadeMeals}件`} />
        <SummaryCard label="外食" value={`${stats.takeoutMeals}件`} />
        <SummaryCard label="自炊比率" value={`${homemadeRatio}%`} />
      </View>

      <View style={styles.detailCard}>
        <Text style={styles.detailTitle}>よく記録している内容</Text>
        <Text style={styles.detailText}>料理ジャンル: {stats.favoriteCuisine ?? 'まだ集計できるデータがありません'}</Text>
        <Text style={styles.detailText}>場所: {stats.favoriteLocation ?? 'まだ集計できるデータがありません'}</Text>
      </View>
    </View>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
    padding: 16,
    gap: 16,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  headerDescription: {
    fontSize: 14,
    color: Colors.gray,
    lineHeight: 20,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCard: {
    width: '47%',
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    gap: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: Colors.gray,
  },
  summaryValue: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.primary,
  },
  detailCard: {
    backgroundColor: Colors.white,
    borderRadius: 12,
    padding: 16,
    gap: 10,
  },
  detailTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
  },
  detailText: {
    fontSize: 15,
    color: Colors.text,
  },
});
