import React, { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { ScreenStateCard } from '../../components/common/ScreenStateCard';
import { Colors } from '../../constants/Colors';
import { MealService, type StatisticsSummary } from '../../database/services/MealService';
import { sanitizeLogObject } from '../../utils/logSanitizer';
import { SummaryCard } from './components/SummaryCard';
import { TopRankingCard } from './components/TopRankingCard';
import { STATS_PERIODS } from './constants';
import type { StatsPeriodKey } from './types';
import { buildReflectionText, getStatsPeriodRange } from './utils';

const emptyStats: StatisticsSummary = {
  totalMeals: 0,
  homemadeMeals: 0,
  takeoutMeals: 0,
  topCuisines: [],
  topLocations: [],
};

export default function StatsScreen() {
  const [stats, setStats] = useState<StatisticsSummary>(emptyStats);
  const [selectedPeriod, setSelectedPeriod] = useState<StatsPeriodKey>('thisMonth');
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const selectedPeriodRef = useRef<StatsPeriodKey>(selectedPeriod);
  const activeStatsRequestIdRef = useRef(0);

  const loadStats = useCallback(async (period: StatsPeriodKey = selectedPeriodRef.current) => {
    const requestId = ++activeStatsRequestIdRef.current;
    setLoading(true);
    setErrorMessage(null);

    try {
      const nextStats = await MealService.getStatistics(getStatsPeriodRange(period));
      if (requestId !== activeStatsRequestIdRef.current) {
        return;
      }
      setStats(nextStats);
    } catch (error) {
      if (requestId !== activeStatsRequestIdRef.current) {
        return;
      }
      console.error('Failed to load stats:', sanitizeLogObject(error));
      setErrorMessage('統計情報の更新に失敗しました。');
    } finally {
      if (requestId === activeStatsRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  const handlePeriodChange = useCallback(
    (period: StatsPeriodKey) => {
      selectedPeriodRef.current = period;
      setSelectedPeriod(period);
      loadStats(period).catch(() => undefined);
    },
    [loadStats]
  );

  const homemadeRatio =
    stats.totalMeals > 0 ? Math.round((stats.homemadeMeals / stats.totalMeals) * 100) : 0;
  const hasStats = stats.totalMeals > 0;
  const showLoadingState = loading && !hasStats && !errorMessage;
  const showErrorState = Boolean(errorMessage) && !hasStats;
  const showInlineError = Boolean(errorMessage) && hasStats;
  const headerDescription =
    loading && hasStats
      ? '更新中...'
      : '期間ごとの食事記録を、あとから見返しやすい形でまとめます。';
  const selectedPeriodLabel =
    STATS_PERIODS.find(period => period.key === selectedPeriod)?.label ?? '今月';

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.headerTitle}>統計サマリー</Text>
      <Text style={styles.headerDescription}>{headerDescription}</Text>

      <View style={styles.periodSelector}>
        {STATS_PERIODS.map(period => {
          const selected = selectedPeriod === period.key;
          return (
            <Pressable
              key={period.key}
              style={[styles.periodButton, selected ? styles.periodButtonSelected : null]}
              onPress={() => handlePeriodChange(period.key)}
              testID={`stats-period-${period.key}`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
            >
              <Text
                style={[styles.periodButtonText, selected ? styles.periodButtonTextSelected : null]}
              >
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
            <Text style={styles.detailText}>
              {buildReflectionText(stats, selectedPeriodLabel, selectedPeriod)}
            </Text>
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
});
