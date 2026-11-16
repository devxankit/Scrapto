/**
 * Current position and a readable address for it.
 *
 * Position: @react-native-community/geolocation (asks for permission first).
 * Address: OpenStreetMap Nominatim, as the web app's home screen does; if it
 * fails, the screen keeps the coordinates and the user types the address.
 */
import { PermissionsAndroid, Platform } from 'react-native';
import Geolocation from '@react-native-community/geolocation';

export type LatLng = { lat: number; lng: number };

export async function askLocationPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  const res = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ]);
  return Object.values(res).some((r) => r === PermissionsAndroid.RESULTS.GRANTED);
}

export function currentPosition(): Promise<LatLng> {
  return new Promise((resolve, reject) => {
    Geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      (e) => reject(new Error(e.code === 1 ? 'Location permission is off. Turn it on in Settings.' : 'Could not find your location. Check that GPS is on.')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 },
    );
  });
}

export type Place = { street: string; city: string; state: string; pincode: string; short: string };

export async function reverseGeocode({ lat, lng }: LatLng): Promise<Place | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`, {
      headers: { 'User-Agent': 'ScraptoxApp/1.0', 'Accept-Language': 'en' },
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const j = await r.json();
    const a = j.address ?? {};
    const area = a.suburb || a.neighbourhood || a.residential || a.quarter || a.village || '';
    const road = [a.house_number, a.road].filter(Boolean).join(' ');
    const city = a.city || a.town || a.state_district || a.county || '';
    const street = [road, area].filter(Boolean).join(', ') || (j.display_name ?? '').split(',').slice(0, 2).join(',');
    return { street, city, state: a.state || '', pincode: a.postcode || '', short: [area || road, city].filter(Boolean).join(', ') };
  } catch {
    return null;
  }
}

/** Straight-line distance in km. */
export function distanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Sample location for the demo when GPS is off (Sector 21, Gurugram). */
export const DEMO_POINT: LatLng = { lat: 28.5108, lng: 77.0705 };
