import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenStateCard } from '../../components/common/ScreenStateCard';
import { Colors } from '../../constants/Colors';
import { MealService, type StatisticsSummary } from '../../database/services/MealService';

const emptyStats: StatisticsSummary = {
  totalMeals: 0,
  homemadeMeals: 0,
  takeoutMeals: 0,
};

export default function StatsScreen() {
  const [stats, setStats] = useState<StatisticsSummary>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const nextStats = await MealService.getStatistics();
      setStats(nextStats);
    } catch (error) {
      console.error('Failed to load stats:', error);
      setErrorMessage('統計情報の更新に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const homemadeRatio = stats.totalMeals > 0 ? Math.round((stats.homemadeMeals / stats.totalMeals) * 100) : 0;
  const hasStats = stats.totalMeals > 0;
  const showLoadingState = loading && !hasStats && !errorMessage;
  const showErrorState = Boolean(errorMessage) && !hasStats;
  const showInlineError = Boolean(errorMessage) && hasStats;
  const headerDescription = loading && hasStats
    ? '更新中...'
    : '現在の実装では、記録データから集計できる内容だけを表示します。';

  return (
    <View style={styles.container}>
      <Text style={styles.headerTitle}>統計サマリー</Text>
      <Text style={styles.headerDescription}>{headerDescription}</Text>

      {showLoadingState ? (
        <ScreenStateCard
          title="統計を読み込んでいます"
          description="保存済みの記録を集計しています。少し待ってから表示されます。"
          variant="loading"
          testIDPrefix="stats-loading"
        />
      ) : null}

      {showErrorState ? (
        <ScreenStateCard
          title="統計を更新できませんでした"
          description="集計の読み込みに失敗しました。もう一度お試しください。"
          variant="error"
          actionLabel="再試行"
          onAction={loadStats}
          testIDPrefix="stats-error"
        />
      ) : null}

      {showInlineError ? (
        <ScreenStateCard
          title="統計の更新に失敗しました"
          description="前回の集計を表示したままです。必要なら再試行してください。"
          variant="error"
          actionLabel="再試行"
          onAction={loadStats}
          testIDPrefix="stats-error"
        />
      ) : null}

      {!showLoadingState && !showErrorState ? (
        <>
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
        </>
      ) : null}
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
