import type { CookingLevel } from '../../types/MealTypes';
import type { PersistedMealRow } from '../../database/services/localDatabase';
import { normalizeCookingLevel } from '../../utils/cookingLevel';

export interface SearchFilters {
  dateFrom?: Date;
  dateTo?: Date;
  cuisine_type?: string;
  is_homemade?: boolean;
  cooking_level?: CookingLevel | string;
  location_name?: string;
  text?: string;
}

export function generateSearchText(data: {
  meal_name?: string;
  cuisine_type?: string;
  location_name?: string;
  notes?: string;
  tags?: string;
}): string {
  return [data.meal_name, data.cuisine_type, data.location_name, data.notes, data.tags]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function applyNonTextFilters(rows: PersistedMealRow[], filters: SearchFilters): PersistedMealRow[] {
  return rows.filter((row) => {
    if (row.is_deleted) {
      return false;
    }

    if (filters.dateFrom && row.meal_datetime < filters.dateFrom.getTime()) {
      return false;
    }

    if (filters.dateTo && row.meal_datetime > filters.dateTo.getTime()) {
      return false;
    }

    if (filters.cuisine_type && row.cuisine_type !== filters.cuisine_type) {
      return false;
    }

    if (typeof filters.is_homemade === 'boolean' && Boolean(row.is_homemade) !== filters.is_homemade) {
      return false;
    }

    if (filters.cooking_level) {
      const filterCookingLevel = normalizeCookingLevel(filters.cooking_level);
      if (!filterCookingLevel || normalizeCookingLevel(row.cooking_level) !== filterCookingLevel) {
        return false;
      }
    }

    if (filters.location_name && !(row.location_name ?? '').toLowerCase().includes(filters.location_name.toLowerCase())) {
      return false;
    }

    return true;
  });
}

export function matchesTextFilter(row: PersistedMealRow, text: string) {
  const haystack = `${row.meal_name} ${row.location_name ?? ''} ${row.notes ?? ''} ${row.search_text ?? ''}`.toLowerCase();
  return haystack.includes(text.toLowerCase());
}

export function sortByRecency(left: PersistedMealRow, right: PersistedMealRow) {
  return right.meal_datetime - left.meal_datetime;
}
