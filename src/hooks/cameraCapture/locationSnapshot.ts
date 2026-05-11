import { Platform } from 'react-native';
import * as Location from 'expo-location';

export interface LocationSnapshot {
  latitude?: number;
  longitude?: number;
}

export async function getCurrentLocationSnapshot(): Promise<LocationSnapshot> {
  if (Platform.OS === 'web') {
    return {};
  }

  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      return {};
    }

    const lastKnownPosition = await Location.getLastKnownPositionAsync({
      maxAge: 1000 * 60 * 5,
      requiredAccuracy: 200,
    });

    const currentPosition = lastKnownPosition
      ?? await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

    return {
      latitude: currentPosition.coords.latitude,
      longitude: currentPosition.coords.longitude,
    };
  } catch {
    console.warn('Location lookup skipped.');
    return {};
  }
}
