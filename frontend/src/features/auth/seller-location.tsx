'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { MapPin, ArrowLeft } from 'lucide-react';
import { useShop } from '@/store/shop';
import { useResource } from '@/hooks/use-resource';
import { api } from '@/lib/api';
import { AddressFields } from '@/components/maps/address-fields';
import { AccessGate, ErrorBox, Loading, PageTitle } from '@/components/ui';
import type { LocationPin, SellerStore, StoreAddress } from '@/types/location';
const LocationPicker = dynamic(() => import('@/components/maps/location-picker'), {
  ssr: false,
  loading: () => <Loading label="Đang mở bản đồ…" />,
});
export function SellerLocationLink() {
  const shop = useShop();
  if (shop.user?.accountType !== 'SELLER') return null;
  return (
    <div className="seller-location-banner">
      <MapPin size={23} />
      <div>
        <strong>Cửa hàng của bạn đã có vị trí trên ShopGo</strong>
        <small>Kiểm tra lại địa chỉ và ghim để khách tìm đúng cửa hàng.</small>
      </div>
      <Link className="button secondary small" href="/seller/location">
        Xem / sửa vị trí
      </Link>
    </div>
  );
}
export function SellerLocationPage() {
  const shop = useShop(),
    store = useResource<SellerStore>(shop.user?.accountType === 'SELLER' ? '/seller/store' : null);
  const [address, setAddress] = useState<StoreAddress>({ street: '', ward: '', city: '' }),
    [location, setLocation] = useState<LocationPin | null>(null),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  useEffect(() => {
    if (store.data) {
      setAddress(store.data.addressDetails);
      setLocation({
        latitude: store.data.latitude,
        longitude: store.data.longitude,
        source: store.data.locationSource,
        ...(store.data.locationAccuracyMeters !== null
          ? { accuracyMeters: store.data.locationAccuracyMeters }
          : {}),
      });
      setConfirmed(false);
    }
  }, [store.data]);
  async function save() {
    if (!store.data || !location || !confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await api('/seller/store/location', {
        method: 'PATCH',
        token: shop.token,
        idempotent: true,
        body: {
          expectedVersion: store.data.locationVersion,
          address,
          location: { ...location, confirmed: true },
        },
      });
      store.refresh();
      await shop.refreshStores();
      shop.notice('Đã lưu địa chỉ và ghim mới.');
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccessGate roles={['MANAGER']}>
      <div className="container narrow">
        <PageTitle
          eyebrow="CỬA HÀNG CỦA BẠN"
          title="Địa chỉ & vị trí đã lưu"
          subtitle={store.data?.name}
          action={
            <Link href="/quan-ly" className="text-button">
              <ArrowLeft size={15} />
              Quản lý
            </Link>
          }
        />
        <ErrorBox error={store.error} retry={store.refresh} />
        {store.loading && !store.data ? (
          <Loading />
        ) : store.data ? (
          <form
            className="panel form-stack"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <AddressFields
              value={address}
              onChange={(value) => {
                setAddress(value);
                setConfirmed(false);
              }}
            />
            <LocationPicker
              value={location}
              onChange={(value) => {
                setLocation(value);
                setConfirmed(false);
              }}
            />
            <label className="location-confirm">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                required
              />
              Tôi đã kiểm tra ghim nằm đúng vị trí cửa hàng thực tế.
            </label>
            <ErrorBox error={error} />
            <button className="button" disabled={busy || !location || !confirmed}>
              {busy ? 'Đang lưu…' : 'Lưu vị trí cửa hàng'}
            </button>
          </form>
        ) : (
          <div className="info-note">
            Tài khoản này chưa sở hữu cửa hàng được đăng ký bằng luồng người bán.
          </div>
        )}
      </div>
    </AccessGate>
  );
}
