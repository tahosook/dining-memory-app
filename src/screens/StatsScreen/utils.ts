import type { StatisticsSummary } from '../../database/services/MealService';
import type { StatsPeriodKey } from './types';

export function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

export function endOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
}

export function getStatsPeriodRange(period: StatsPeriodKey): { dateFrom?: Date; dateTo?: Date } {
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

export function buildReflectionText(
  stats: StatisticsSummary,
  periodLabel: string,
  period: StatsPeriodKey
) {
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
