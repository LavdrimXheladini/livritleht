import * as Location from 'expo-location';

import type { MapPoint } from './pin-map-html';

/**
 * Where this phone (or browser) is, once, to open a map there — asked with the system's own question
 * the first time. Used on the device only: it is not saved and not sent anywhere; what the customer
 * then pins is the stop. Null: not allowed, switched off, or not found in time.
 */
export async function deviceLocation(timeoutMs = 8_000): Promise<MapPoint | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const found = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
    ]);
    // Too slow: the last place the phone knew, if any.
    const position = found ?? (await Location.getLastKnownPositionAsync());
    return position ? { lat: position.coords.latitude, lon: position.coords.longitude } : null;
  } catch {
    return null;
  }
}
