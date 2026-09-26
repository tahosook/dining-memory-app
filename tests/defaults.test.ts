import { getGeoBoundingBox, getDistanceMeters } from '../src/domain/meals/defaults';

describe('getGeoBoundingBox', () => {
  test('calculates correct bounding box containing 100m radius with 1500m margin', () => {
    const origin = { latitude: 35.6812, longitude: 139.7671 }; // 東京
    const bbox = getGeoBoundingBox(origin, 1500);

    expect(bbox).not.toBeNull();
    expect(bbox!.minLat).toBeLessThan(origin.latitude);
    expect(bbox!.maxLat).toBeGreaterThan(origin.latitude);
    expect(bbox!.minLon).toBeLessThan(origin.longitude);
    expect(bbox!.maxLon).toBeGreaterThan(origin.longitude);

    // 100m 以内の地点（東へ約80m）
    const nearbyPoint = { latitude: 35.6812, longitude: 139.7679 };
    expect(getDistanceMeters(origin, nearbyPoint)).toBeLessThan(100);

    // 100m 以内の地点が必ず bbox 内に入ること
    expect(nearbyPoint.latitude).toBeGreaterThanOrEqual(bbox!.minLat);
    expect(nearbyPoint.latitude).toBeLessThanOrEqual(bbox!.maxLat);
    expect(nearbyPoint.longitude).toBeGreaterThanOrEqual(bbox!.minLon);
    expect(nearbyPoint.longitude).toBeLessThanOrEqual(bbox!.maxLon);

    // 5km 離れた地点（新宿方面: 35.6900, 139.7000）は bbox の外に出ること
    const distantPoint = { latitude: 35.6900, longitude: 139.7000 };
    expect(distantPoint.longitude).toBeLessThan(bbox!.minLon);
  });

  test('returns null for invalid or extreme coordinates', () => {
    expect(getGeoBoundingBox({ latitude: NaN, longitude: 139.0 })).toBeNull();
    expect(getGeoBoundingBox({ latitude: 35.0, longitude: NaN })).toBeNull();
    expect(getGeoBoundingBox({ latitude: Infinity, longitude: 139.0 })).toBeNull();
    expect(getGeoBoundingBox({ latitude: 95.0, longitude: 139.0 })).toBeNull();
    expect(getGeoBoundingBox({ latitude: -95.0, longitude: 139.0 })).toBeNull();
    expect(getGeoBoundingBox({ latitude: 35.0, longitude: 185.0 })).toBeNull();
    expect(getGeoBoundingBox({ latitude: 35.0, longitude: -185.0 })).toBeNull();
  });

  test('returns null when margin crosses date line or polar regions to ensure safe fallback', () => {
    // 日付変更線直前（179.99度）で1500mマージンを取ると180度を超える
    expect(getGeoBoundingBox({ latitude: 0, longitude: 179.995 }, 1500)).toBeNull();
    expect(getGeoBoundingBox({ latitude: 0, longitude: -179.995 }, 1500)).toBeNull();
    // 極点付近 (latitude 89.9度)
    expect(getGeoBoundingBox({ latitude: 89.95, longitude: 0 }, 1500)).toBeNull();
  });
});
