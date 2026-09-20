import type { PersistedMealRow } from '../../database/services/localDatabase';

export interface StatisticsSummary {
  totalMeals: number;
  homemadeMeals: number;
  takeoutMeals: number;
  favoriteCuisine?: string;
  favoriteLocation?: string;
  topCuisines?: Array<{ label: string; count: number }>;
  topLocations?: Array<{ label: string; count: number }>;
}

export interface StatisticsOptions {
  dateFrom?: Date;
  dateTo?: Date;
}

export function filterRowsForStatistics(
  rows: PersistedMealRow[],
  options: StatisticsOptions = {}
): PersistedMealRow[] {
  return rows.filter(row => {
    if (row.is_deleted) {
      return false;
    }
    if (options.dateFrom && row.meal_datetime < options.dateFrom.getTime()) {
      return false;
    }
    if (options.dateTo && row.meal_datetime > options.dateTo.getTime()) {
      return false;
    }

    return true;
  });
}

export interface RankedCountItem {
  label: string;
  count: number;
}

export interface RawCountCandidate {
  label?: string | null;
  count?: number;
}

export function rankTopEntries(candidates: RawCountCandidate[], limit = 3): RankedCountItem[] {
  const counts = new Map<string, number>();
  for (const item of candidates) {
    const label = item.label?.trim();
    if (!label) {
      continue;
    }
    counts.set(label, (counts.get(label) ?? 0) + Number(item.count ?? 1));
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja'))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

export function topCounts(values: Array<string | null | undefined>, limit = 3): RankedCountItem[] {
  return rankTopEntries(
    values.map(label => ({ label, count: 1 })),
    limit
  );
}

export function buildStatisticsSummary(rows: PersistedMealRow[]): StatisticsSummary {
  const homemadeMeals = rows.filter(row => Boolean(row.is_homemade)).length;
  const takeoutMeals = rows.length - homemadeMeals;
  const topCuisines = topCounts(rows.map(row => row.cuisine_type));
  const topLocations = topCounts(rows.map(row => row.location_name));

  return {
    totalMeals: rows.length,
    homemadeMeals,
    takeoutMeals,
    favoriteCuisine: topCuisines[0]?.label,
    favoriteLocation: topLocations[0]?.label,
    topCuisines,
    topLocations,
  };
}
