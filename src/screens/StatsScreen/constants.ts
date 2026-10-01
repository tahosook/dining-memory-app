import { StatsPeriodKey } from './types';

export const STATS_PERIODS: Array<{ key: StatsPeriodKey; label: string }> = [
  { key: 'last7days', label: '7日' },
  { key: 'thisMonth', label: '今月' },
  { key: 'lastMonth', label: '先月' },
  { key: 'all', label: '全期間' },
];
