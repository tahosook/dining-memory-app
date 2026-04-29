import React, { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenStateCard } from '../../components/common/ScreenStateCard';
import { Colors } from '../../constants/Colors';
import { MealService, type StatisticsSummary } from '../../database/services/MealService';

const emptyStats: StatisticsSummary = {
  totalMeals: 0,
  homemadeMeals: 0,
  takeoutMeals: 0,
  topCuisines: [],
  topLocations: [],
};

type StatsPeriodKey = 'last7days' | 'thisMonth' | 'lastMonth' | 'all';

const STATS_PERIODS: Array<{ key: StatsPeriodKey; label: string }> = [
  { key: 'last7days', label: '7日' },
  { key: 'thisMonth', label: '今月' },
  { key: 'lastMonth', label: '先月' },
  { key: 'all', label: '全期間' },
];

export default function StatsScreen() {
  const [stats, setStats] = useState<StatisticsSummary>(emptyStats);
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriodKey>('thisMonth');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadStats = useCallback(async (period: StatsPeriodKey = selectedPeriod) => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const nextStats = await MealService.getStatistics(getStatsPeriodRange(period));
      setStats(nextStats);
    } catch (error) {
      console.error('Failed to load stats:', error);
      setErrorMessage('統計情報の更新に失敗しました。');
    } finally {
      setLoading(false);
    }
  }, [selectedPeriod]);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const handlePeriodChange = useCallback((period: StatsPeriodKey) => {
    setSelectedPeriod(period);
    loadStats(period).catch(() => undefined);
  }, [loadStats]);

  const homemadeRatio = stats.totalMeals > 0 ? Math.round((stats.homemadeMeals / stats.totalMeals) * 100) : 0;
  const hasStats = stats.totalMeals > 0;
  const showLoadingState = loading && !hasStats && !errorMessage;
  const showErrorState = Boolean(errorMessage) && !hasStats;
  const showInlineError = Boolean(errorMessage) && hasStats;
  const headerDescription = loading && hasStats
    ? '更新中...'
    : '期間ごとの食事記録を、あとから見返しやすい形でまとめます。';
  const selectedPeriodLabel = STATS_PERIODS.find((period) => period.key === selectedPeriod)?.label ?? '今月';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>統計サマリー</Text>
      <Text style={styles.headerDescription}>{headerDescription}</Text>

      <View style={styles.periodSelector}>
        {STATS_PERIODS.map((period) => {
          const selected = selectedPeriod === period.key;
          return (
            <Pressable
              key={period.key}
              style={[styles.periodButton, selected ? styles.periodButtonSelected : null]}
              onPress={() => handlePeriodChange(period.key)}
              testID={`stats-period-${period.key}`}
            >
              <Text style={[styles.periodButtonText, selected ? styles.periodButtonTextSelected : null]}>
                {period.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

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
          <View style={styles.reflectionCard}>
            <Text style={styles.detailTitle}>ふりかえり</Text>
            <Text style={styles.detailText}>{buildReflectionText(stats, selectedPeriodLabel, selectedPeriod)}</Text>
          </View>

          <View style={styles.grid}>
            <SummaryCard label="総記録数" value={`${stats.totalMeals}件`} />
            <SummaryCard label="自炊" value={`${stats.homemadeMeals}件`} />
            <SummaryCard label="外食" value={`${stats.takeoutMeals}件`} />
            <SummaryCard label="自炊比率" value={`${homemadeRatio}%`} />
          </View>

          <View style={styles.balanceCard}>
            <Text style={styles.detailTitle}>自炊・外食バランス</Text>
            <Text style={styles.detailText}>
              自炊 {stats.homemadeMeals}件 / 外食 {stats.takeoutMeals}件（自炊 {homemadeRatio}%）
            </Text>
            <View style={styles.balanceTrack}>
              <View style={[styles.balanceFill, { width: `${homemadeRatio}%` }]} />
            </View>
          </View>

          <TopRankingCard
            title="よく食べたジャンル Top 3"
            emptyText="まだ集計できるジャンルがありません"
            items={stats.topCuisines ?? []}
          />
          <TopRankingCard
            title="よく行った場所 Top 3"
            emptyText="まだ集計できる場所がありません"
            items={stats.topLocations ?? []}
          />
        </>
      ) : null}
    </ScrollView>
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

function TopRankingCard({
  title,
  emptyText,
  items,
}: {
  title: string;
  emptyText: string;
  items: Array<{ label: string; count: number }>;
}) {
  return (
    <View style={styles.detailCard}>
      <Text style={styles.detailTitle}>{title}</Text>
      {items.length > 0 ? items.map((item, index) => (
        <View key={item.label} style={styles.rankingRow}>
          <Text style={styles.rankingLabel}>{index + 1}. {item.label}</Text>
          <Text style={styles.rankingCount}>{item.count}件</Text>
        </View>
      )) : (
        <Text style={styles.detailText}>{emptyText}</Text>
      )}
    </View>
  );
}

function getStatsPeriodRange(period: StatsPeriodKey): { dateFrom?: Date; dateTo?: Date } {
  const now = new Date();

  if (period === 'all') {
    return {};
  }

  if (period === 'last7days') {
    const dateFrom = startOfDay(now);
    dateFrom.setDate(dateFrom.getDate() - 6);
    return {
      dateFrom,
      dateTo: endOfDay(now),
    };
  }

  if (period === 'lastMonth') {
    const dateFrom = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
    const dateTo = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
    return { dateFrom, dateTo };
  }

  return {
    dateFrom: new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0),
    dateTo: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
  };
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

function buildReflectionText(stats: StatisticsSummary, periodLabel: string, period: StatsPeriodKey) {
  if (stats.totalMeals === 0) {
    return 'この期間の食事記録はまだありません。';
  }

  const subject = period === 'all' ? 'これまで' : periodLabel;
  const lines = [`${subject}は${stats.totalMeals}件の食事を記録しました。`];

  if (stats.favoriteCuisine) {
    lines.push(`よく食べたジャンルは${stats.favoriteCuisine}です。`);
  }
  if (stats.favoriteLocation) {
    lines.push(`よく行った場所は${stats.favoriteLocation}です。`);
  }

  return lines.join('\n');
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
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
  periodSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  periodButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#d9d9d9',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: Colors.white,
  },
  periodButtonSelected: {
    borderColor: Colors.primary,
    backgroundColor: '#eaf4ff',
  },
  periodButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
  },
  periodButtonTextSelected: {
    color: Colors.primary,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  summaryCard: {
    width: '47%',
    backgroundColor: Colors.white,
    borderRadius: 8,
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
  reflectionCard: {
    backgroundColor: Colors.white,
    borderRadius: 8,
    padding: 16,
    gap: 10,
  },
  balanceCard: {
    backgroundColor: Colors.white,
    borderRadius: 8,
    padding: 16,
    gap: 10,
  },
  detailCard: {
    backgroundColor: Colors.white,
    borderRadius: 8,
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
    lineHeight: 22,
  },
  balanceTrack: {
    height: 12,
    borderRadius: 999,
    backgroundColor: '#eceff1',
    overflow: 'hidden',
  },
  balanceFill: {
    height: '100%',
    backgroundColor: Colors.primary,
  },
  rankingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  rankingLabel: {
    flex: 1,
    fontSize: 15,
    color: Colors.text,
  },
  rankingCount: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.text,
  },
});
