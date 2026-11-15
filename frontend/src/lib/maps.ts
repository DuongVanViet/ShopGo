import type { Store } from '@/types';

export type LocatedStore = Store & { latitude: number; longitude: number };

export function hasStoreCoordinates(store: Store): store is LocatedStore {
  return (
    typeof store.latitude === 'number' &&
    Number.isFinite(store.latitude) &&
    store.latitude >= -90 &&
    store.latitude <= 90 &&
    typeof store.longitude === 'number' &&
    Number.isFinite(store.longitude) &&
    store.longitude >= -180 &&
    store.longitude <= 180
  );
}

function point(store: LocatedStore) {
  return `${store.latitude.toFixed(6)},${store.longitude.toFixed(6)}`;
}

export function googleMapsPinUrl(store: LocatedStore) {
  return `https://www.google.com/maps/search/?${new URLSearchParams({
    api: '1',
    query: point(store),
  }).toString()}`;
}

export function googleMapsDirectionsUrl(store: LocatedStore) {
  return `https://www.google.com/maps/dir/?${new URLSearchParams({
    api: '1',
    destination: point(store),
    travelmode: 'driving',
  }).toString()}`;
}
