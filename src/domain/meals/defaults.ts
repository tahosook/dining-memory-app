import type { PersistedMealRow } from '../../database/services/localDatabase';

const SAME_LOCATION_THRESHOLD_METERS = 100;

interface MealLocationInput {
  meal_name: string;
  location_name?: string;
  latitude?: number;
  longitude?: number;
  meal_datetime: Date;
}

interface NearbyRowOptions {
  minMealDatetime?: number;
  maxDistanceMeters?: number;
  requireLocationName?: boolean;
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

export function getDistanceMeters(
  first: { latitude: number; longitude: number },
  second: { latitude: number; longitude: number }
) {
  const earthRadiusMeters = 6371000;
  const latitudeDelta = toRadians(second.latitude - first.latitude);
  const longitudeDelta = toRadians(second.longitude - first.longitude);
  const startLatitude = toRadians(first.latitude);
  const endLatitude = toRadians(second.latitude);
  const haversine =
    Math.sin(latitudeDelta / 2) * Math.sin(latitudeDelta / 2)
    + Math.cos(startLatitude) * Math.cos(endLatitude) * Math.sin(longitudeDelta / 2) * Math.sin(longitudeDelta / 2);

  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

export function getMealNameByTime(date: Date): string {
  const hour = date.getHours();

  if (hour >= 5 && hour < 10) {
    return '朝食';
  }
  if (hour >= 10 && hour < 14) {
    return '昼食';
  }
  if (hour >= 14 && hour < 18) {
    return '午後の軽食';
  }
  if (hour >= 18 && hour < 22) {
    return '夕食';
  }
  return '深夜の食事';
}

export function findMostRecentNearbyRow(
  rows: PersistedMealRow[],
  origin: { latitude: number; longitude: number },
  options: NearbyRowOptions = {}
): PersistedMealRow | undefined {
  let candidate: PersistedMealRow | undefined;
  const maxDistanceMeters = options.maxDistanceMeters ?? SAME_LOCATION_THRESHOLD_METERS;
  const requireLocationName = options.requireLocationName ?? true;

  for (const row of rows) {
    if (requireLocationName && !row.location_name) {
      continue;
    }
    if (typeof row.latitude !== 'number' || typeof row.longitude !== 'number' || row.is_deleted) {
      continue;
    }
    if (typeof options?.minMealDatetime === 'number' && row.meal_datetime < options.minMealDatetime) {
      continue;
    }
    if (getDistanceMeters(origin, { latitude: row.latitude, longitude: row.longitude }) > maxDistanceMeters) {
      continue;
    }

    if (!candidate || row.meal_datetime > candidate.meal_datetime) {
      candidate = row;
    }
  }

  return candidate;
}

export function resolveDefaultMealName(data: MealLocationInput, rows: PersistedMealRow[]): string {
  if (data.meal_name.trim()) {
    return data.meal_name.trim();
  }

  const timeBasedName = getMealNameByTime(data.meal_datetime);

  if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const origin = { latitude: data.latitude, longitude: data.longitude };
    const recentNearbyRow = findMostRecentNearbyRow(rows, origin, { minMealDatetime: oneWeekAgo });

    if (recentNearbyRow?.location_name) {
      return `${recentNearbyRow.location_name} の ${timeBasedName}`;
    }
  }

  return timeBasedName;
}

export function resolveNearbyLocationName(rows: PersistedMealRow[], data: MealLocationInput) {
  if (
    data.location_name?.trim()
    || typeof data.latitude !== 'number'
    || typeof data.longitude !== 'number'
  ) {
    return data.location_name;
  }

  const nearbyRow = findMostRecentNearbyRow(rows, {
    latitude: data.latitude,
    longitude: data.longitude,
  });

  return nearbyRow?.location_name ?? data.location_name;
}

export function resolveNearbyHomemadeDefault(
  rows: PersistedMealRow[],
  origin: { latitude: number; longitude: number },
  options: { minMealDatetime?: number; maxDistanceMeters?: number } = {}
): boolean | null {
  const nearbyRow = findMostRecentNearbyRow(rows, origin, {
    minMealDatetime: options.minMealDatetime,
    maxDistanceMeters: options.maxDistanceMeters,
    requireLocationName: false,
  });

  return nearbyRow ? Boolean(nearbyRow.is_homemade) : null;
}
