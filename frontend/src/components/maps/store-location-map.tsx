'use client';
import { useEffect, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';

export function StoreLocationMap({
  latitude,
  longitude,
  name,
}: {
  latitude: number;
  longitude: number;
  name: string;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void import('leaflet')
      .then((L) => {
        if (cancelled || !container.current) return;
        const point: [number, number] = [latitude, longitude];
        const instance = L.map(container.current, {
          scrollWheelZoom: false,
          dragging: true,
        }).setView(point, 17);
        map.current = instance;
        const tileUrl =
          process.env.NEXT_PUBLIC_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
        L.tileLayer(tileUrl, {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap contributors</a>',
          keepBuffer: 1,
        })
          .on('tileerror', () => {
            if (!cancelled)
              setError('Chưa tải được nền bản đồ. Bạn vẫn có thể mở ghim bằng Google Maps.');
          })
          .addTo(instance);
        const icon = L.divIcon({
          className: 'shop-pin-wrapper',
          html: '<span class="shop-map-pin"></span>',
          iconSize: [32, 42],
          iconAnchor: [16, 40],
        });
        L.marker(point, {
          icon,
          title: `Vị trí ${name}`,
          keyboard: true,
        }).addTo(instance);
        requestAnimationFrame(() => {
          if (!cancelled) instance.invalidateSize();
        });
      })
      .catch(() => {
        if (!cancelled) setError('Không khởi tạo được bản đồ trong ShopGo.');
      });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, [latitude, longitude, name]);

  return (
    <>
      <div
        ref={container}
        className="store-map customer-store-map"
        role="region"
        aria-label={`Bản đồ vị trí ${name}`}
      />
      {error && (
        <p className="warning-note" role="alert">
          {error}
        </p>
      )}
    </>
  );
}
