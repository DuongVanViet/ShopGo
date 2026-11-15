'use client';
import { useEffect, useRef, useState } from 'react';
import { Crosshair, MapPin, Navigation } from 'lucide-react';
import type * as Leaflet from 'leaflet';
import type { LocationPin } from '@/types/location';

export default function LocationPicker({
  value,
  onChange,
}: {
  value: LocationPin | null;
  onChange: (value: LocationPin) => void;
}) {
  const container = useRef<HTMLDivElement>(null),
    map = useRef<Leaflet.Map | null>(null),
    marker = useRef<Leaflet.Marker | null>(null),
    circle = useRef<Leaflet.Circle | null>(null);
  const callback = useRef(onChange),
    mounted = useRef(false);
  const [ready, setReady] = useState(false),
    [mapError, setMapError] = useState(''),
    [gpsBusy, setGpsBusy] = useState(false),
    [gpsError, setGpsError] = useState('');
  const [latitude, setLatitude] = useState(''),
    [longitude, setLongitude] = useState(''),
    [coordinateError, setCoordinateError] = useState('');
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;
    void import('leaflet')
      .then((L) => {
        if (cancelled || !container.current) return;
        const instance = L.map(container.current, { scrollWheelZoom: false }).setView(
          [10.7769, 106.7009],
          12,
        );
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
              setMapError(
                'Chưa tải được nền bản đồ. Kiểm tra kết nối Internet hoặc dịch vụ bản đồ; tọa độ GPS/ghim vẫn được hiển thị để bạn kiểm tra.',
              );
          })
          .addTo(instance);
        instance.on('click', (event: Leaflet.LeafletMouseEvent) => {
          const point = event.latlng.wrap();
          callback.current({ latitude: point.lat, longitude: point.lng, source: 'MAP' });
        });
        setReady(true);
        requestAnimationFrame(() => {
          if (!cancelled) instance.invalidateSize();
        });
      })
      .catch(() => {
        if (!cancelled) setMapError('Không khởi tạo được bản đồ. Vui lòng tải lại trang.');
      });
    return () => {
      cancelled = true;
      mounted.current = false;
      map.current?.remove();
      map.current = null;
      marker.current = null;
      circle.current = null;
    };
  }, []);
  useEffect(() => {
    setLatitude(value ? value.latitude.toFixed(6) : '');
    setLongitude(value ? value.longitude.toFixed(6) : '');
    if (!ready || !map.current || !value) return;
    const instance = map.current;
    void import('leaflet').then((L) => {
      if (map.current !== instance) return;
      const point: [number, number] = [value.latitude, value.longitude];
      if (!marker.current) {
        const icon = L.divIcon({
          className: 'shop-pin-wrapper',
          html: '<span class="shop-map-pin"></span>',
          iconSize: [32, 42],
          iconAnchor: [16, 40],
        });
        marker.current = L.marker(point, {
          draggable: true,
          icon,
          title: 'Ghim cửa hàng — kéo để chỉnh vị trí',
          keyboard: true,
        }).addTo(instance);
        marker.current.on('dragend', () => {
          const moved = marker.current!.getLatLng().wrap();
          callback.current({ latitude: moved.lat, longitude: moved.lng, source: 'MAP' });
        });
      } else marker.current.setLatLng(point);
      circle.current?.remove();
      circle.current = null;
      if (value.source === 'GPS' && value.accuracyMeters !== undefined)
        circle.current = L.circle(point, {
          radius: value.accuracyMeters,
          color: '#38734c',
          fillOpacity: 0.08,
          weight: 1,
        }).addTo(instance);
      instance.setView(point, Math.max(instance.getZoom(), 17));
    });
  }, [value, ready]);
  function locate() {
    setGpsError('');
    if (!navigator.geolocation) {
      setGpsError('Trình duyệt chưa hỗ trợ GPS. Chọn ghim trực tiếp trên bản đồ hoặc nhập tọa độ.');
      return;
    }
    setGpsBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!mounted.current) return;
        onChange({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: 'GPS',
          accuracyMeters: position.coords.accuracy,
        });
        setGpsBusy(false);
      },
      (error) => {
        if (!mounted.current) return;
        setGpsBusy(false);
        setGpsError(
          error.code === 1
            ? 'Bạn chưa cho phép định vị. Có thể bật quyền vị trí hoặc ghim thủ công.'
            : 'Chưa lấy được vị trí thiết bị. Hãy thử lại hoặc chọn ghim thủ công.',
        );
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }
  function applyCoordinates() {
    const lat = Number(latitude),
      lng = Number(longitude);
    if (
      !latitude.trim() ||
      !longitude.trim() ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lng) ||
      lat < -90 ||
      lat > 90 ||
      lng < -180 ||
      lng > 180
    ) {
      setCoordinateError('Nhập vĩ độ từ −90 đến 90 và kinh độ từ −180 đến 180.');
      return;
    }
    setCoordinateError('');
    onChange({ latitude: lat, longitude: lng, source: 'COORDINATES' });
  }
  return (
    <section className="location-picker">
      <div className="location-toolbar">
        <div>
          <strong>
            <MapPin size={17} />
            Ghim đúng cửa hàng
          </strong>
          <small>Chạm bản đồ để ghim, kéo ghim để điều chỉnh.</small>
        </div>
        <button
          className="button secondary small"
          type="button"
          disabled={gpsBusy}
          onClick={locate}
        >
          <Crosshair size={16} />
          {gpsBusy ? 'Đang định vị…' : 'Dùng vị trí hiện tại'}
        </button>
      </div>
      <div
        ref={container}
        className="store-map"
        role="region"
        aria-label="Bản đồ chọn vị trí cửa hàng"
      />
      {!value && (
        <div className="info-note" style={{ marginTop: 12 }}>
          Chưa có ghim. Chọn vị trí trên bản đồ, dùng GPS khi đang ở cửa hàng hoặc nhập tọa độ thực
          tế.
        </div>
      )}
      {value && (
        <div className="location-result" role="status">
          <Navigation size={17} />
          <div>
            <strong>
              {value.latitude.toFixed(6)}, {value.longitude.toFixed(6)}
            </strong>
            <small>
              {value.source === 'GPS'
                ? value.accuracyMeters !== undefined
                  ? `GPS · Sai số thiết bị báo khoảng ${Math.round(value.accuracyMeters)} m`
                  : 'GPS · Chưa có số liệu sai số'
                : 'Ghim do bạn chọn trên bản đồ / tọa độ WGS84'}
            </small>
          </div>
        </div>
      )}
      {value?.source === 'GPS' && (value.accuracyMeters ?? 0) > 100 && (
        <p className="warning-note">
          GPS đang có sai số lớn. Hãy phóng to và kiểm tra ghim với vị trí cửa hàng trước khi xác
          nhận.
        </p>
      )}
      {gpsError && (
        <p className="warning-note" role="alert">
          {gpsError}
        </p>
      )}
      {mapError && (
        <p className="warning-note" role="alert">
          {mapError}
        </p>
      )}
      <details className="coordinate-details">
        <summary>Nhập tọa độ cụ thể</summary>
        <div className="grid-2" style={{ marginTop: 12 }}>
          <label>
            Vĩ độ
            <input
              className="field"
              aria-label="Vĩ độ"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyCoordinates();
                }
              }}
              value={latitude}
              onChange={(event) => setLatitude(event.target.value)}
              inputMode="decimal"
              placeholder="10.776900"
            />
          </label>
          <label>
            Kinh độ
            <input
              className="field"
              aria-label="Kinh độ"
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyCoordinates();
                }
              }}
              value={longitude}
              onChange={(event) => setLongitude(event.target.value)}
              inputMode="decimal"
              placeholder="106.700900"
            />
          </label>
        </div>
        <button className="text-button" type="button" onClick={applyCoordinates}>
          Đặt ghim theo tọa độ
        </button>
        {coordinateError && (
          <p className="danger-text" role="alert">
            {coordinateError}
          </p>
        )}
      </details>
      <small>
        Ghim chỉ được lưu trong ShopGo. Nền bản đồ do OpenStreetMap cung cấp; địa chỉ bạn nhập không
        được gửi sang dịch vụ tìm kiếm bản đồ.
      </small>
    </section>
  );
}
