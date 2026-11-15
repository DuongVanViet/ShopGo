'use client';
import { useState } from 'react';
import { ExternalLink, MapPinned, Navigation } from 'lucide-react';
import { Modal } from '@/components/ui';
import { googleMapsDirectionsUrl, googleMapsPinUrl, hasStoreCoordinates } from '@/lib/maps';
import type { Store } from '@/types';
import { StoreLocationMap } from './store-location-map';

export function StoreLocationDialog({ store }: { store: Store }) {
  const [open, setOpen] = useState(false);
  const located = hasStoreCoordinates(store);
  return (
    <>
      <button
        type="button"
        className="store-location-trigger"
        aria-label={`Xem vị trí ${store.name}`}
        onClick={() => setOpen(true)}
      >
        <MapPinned size={14} />
        Xem vị trí
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`Vị trí ${store.name}`}>
        <div className="store-location-detail">
          <div className="store-location-address">
            <MapPinned size={21} />
            <div>
              <strong>{store.name}</strong>
              <p>{store.address}</p>
              {located && (
                <small>
                  {store.latitude.toFixed(6)}, {store.longitude.toFixed(6)}
                </small>
              )}
            </div>
          </div>
          {located ? (
            <>
              <StoreLocationMap
                latitude={store.latitude}
                longitude={store.longitude}
                name={store.name}
              />
              <div className="store-location-actions">
                <a
                  className="button secondary"
                  href={googleMapsPinUrl(store)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <ExternalLink size={17} />
                  Xem ghim Google Maps
                </a>
                <a
                  className="button"
                  href={googleMapsDirectionsUrl(store)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Navigation size={17} />
                  Chỉ đường đến cửa hàng
                </a>
              </div>
              <small className="store-location-note">
                Google Maps sẽ dùng vị trí hiện tại của thiết bị làm điểm xuất phát nếu bạn cấp
                quyền cho Google Maps.
              </small>
            </>
          ) : (
            <div className="info-note">
              Cửa hàng chưa ghim tọa độ. ShopGo chỉ hiển thị địa chỉ đã lưu và không tự đặt vị trí
              ước lượng.
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
