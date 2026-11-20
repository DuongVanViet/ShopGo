'use client';

import { useEffect, useId, useState } from 'react';
import { ChevronDown, LocateFixed, MapPin, Search } from 'lucide-react';
import { api, query } from '@/lib/api';
import { useShop } from '@/store/shop';
import type { Page, Store } from '@/types';
import { ErrorBox, Loading, Modal } from '@/components/ui';

type Location = { lat: number; lng: number };
type StoreResult = Store & { distanceMeters?: number };

function StoreResults({
  term,
  location,
  onSelect,
}: {
  term: string;
  location: Location | null;
  onSelect: (store: Store) => void;
}) {
  const [results, setResults] = useState<StoreResult[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setBusy(true);
    setError(null);
    api<Page<StoreResult>>(`/stores?${query({ limit: 10, q: term, cursor, ...location })}`, {
      signal: controller.signal,
    })
      .then((page) => {
        if (controller.signal.aborted) return;
        setResults((previous) => {
          if (!cursor) return page.items;
          const seen = new Set(previous.map(({ id }) => id));
          return [...previous, ...page.items.filter(({ id }) => !seen.has(id))];
        });
        setNextCursor(page.nextCursor);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(failure);
      })
      .finally(() => {
        if (!controller.signal.aborted) setBusy(false);
      });
    return () => controller.abort();
  }, [term, location, cursor, revision]);

  return (
    <div className="store-picker-results" aria-busy={busy}>
      {results.length > 0 && (
        <ul aria-label={location ? 'Cửa hàng theo khoảng cách' : 'Kết quả tìm cửa hàng'}>
          {results.map((store) => (
            <li key={store.id}>
              <button type="button" className="store-picker-result" onClick={() => onSelect(store)}>
                <MapPin size={17} aria-hidden="true" />
                <span>
                  <strong>{store.name}</strong>
                  <small>{store.address}</small>
                </span>
                {store.distanceMeters !== undefined && (
                  <span className="store-picker-distance">
                    {store.distanceMeters < 1000
                      ? `${store.distanceMeters} m`
                      : `${(store.distanceMeters / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km`}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {busy && <Loading label="Đang tìm cửa hàng…" />}
      <ErrorBox error={error} retry={() => setRevision((value) => value + 1)} />
      {!busy && !error && results.length === 0 && (
        <p className="muted">
          {location
            ? 'Chưa tìm thấy cửa hàng có tọa độ phù hợp. Hãy tắt chế độ gần tôi hoặc đổi từ khóa.'
            : 'Chưa tìm thấy cửa hàng. Hãy thử tên hoặc địa chỉ khác.'}
        </p>
      )}
      {nextCursor && !error && (
        <button
          type="button"
          className="button secondary small"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setCursor(nextCursor);
          }}
        >
          Xem thêm
        </button>
      )}
    </div>
  );
}

function StorePickerBody({ onSelect }: { onSelect: (store: Store | null) => void }) {
  const { store, recentStore } = useShop();
  const inputId = useId();
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [location, setLocation] = useState<Location | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  function findNearby() {
    setLocationError('');
    if (location) {
      setLocation(null);
      return;
    }
    if (!navigator.geolocation) {
      setLocationError('Trình duyệt chưa hỗ trợ vị trí. Bạn vẫn có thể tìm theo địa chỉ.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocation({
          lat: Number(coords.latitude.toFixed(3)),
          lng: Number(coords.longitude.toFixed(3)),
        });
        setLocating(false);
      },
      () => {
        setLocationError('Không lấy được vị trí. Bạn vẫn có thể tìm theo tên hoặc địa chỉ.');
        setLocating(false);
      },
      { timeout: 10000, maximumAge: 60000 },
    );
  }

  return (
    <div className="store-picker-body">
      <div className="store-picker-tools">
        <label htmlFor={inputId} className="store-picker-search">
          <Search size={18} aria-hidden="true" />
          <input
            id={inputId}
            aria-label="Tìm theo tên hoặc địa chỉ"
            placeholder="Tên cửa hàng hoặc địa chỉ"
            type="search"
            maxLength={100}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            autoFocus
          />
        </label>
        <button
          type="button"
          className="button secondary small"
          aria-pressed={!!location}
          disabled={locating}
          onClick={findNearby}
        >
          <LocateFixed size={16} aria-hidden="true" />
          {locating ? 'Đang lấy vị trí…' : 'Gần tôi'}
        </button>
      </div>
      {locationError && <p role="status">{locationError}</p>}
      {location && <p className="muted">Sắp xếp theo khoảng cách ước tính từ vị trí của bạn.</p>}
      {recentStore && !search.trim() && !location && (
        <button
          type="button"
          className="store-picker-result store-picker-recent"
          aria-label={`Chọn lại ${recentStore.name}`}
          onClick={() => onSelect(recentStore)}
        >
          <MapPin size={17} aria-hidden="true" />
          <span>
            <small>Cửa hàng đã dùng gần nhất</small>
            <strong>{recentStore.name}</strong>
            <small>{recentStore.address}</small>
          </span>
        </button>
      )}
      <StoreResults
        key={JSON.stringify([term, location])}
        term={term}
        location={location}
        onSelect={onSelect}
      />
      {store && (
        <button type="button" className="text-button" onClick={() => onSelect(null)}>
          Xem tất cả cửa hàng
        </button>
      )}
    </div>
  );
}

export function StorePicker({ onSelect }: { onSelect?: (store: Store | null) => void }) {
  const { store } = useShop();
  const [open, setOpen] = useState(false);
  const action = store ? 'Đổi cửa hàng' : 'Chọn cửa hàng';

  return (
    <>
      <button
        type="button"
        className="store-picker-trigger"
        aria-label={action}
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        <MapPin size={20} aria-hidden="true" />
        <span className="store-select-copy">
          {store && <span>Nhận hàng tại</span>}
          <strong>{store?.name ?? action}</strong>
          {store && <small>{store.address}</small>}
        </span>
        {store && (
          <span className="store-picker-change" aria-hidden="true">
            Đổi
          </span>
        )}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      <StorePickerDialog open={open} onClose={() => setOpen(false)} onSelect={onSelect} />
    </>
  );
}

export function StorePickerDialog({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect?: (store: Store | null) => void;
}) {
  const { store, setStore } = useShop();
  return (
    <Modal open={open} onClose={onClose} title={store ? 'Đổi cửa hàng' : 'Chọn cửa hàng'}>
      <StorePickerBody
        onSelect={(nextStore) => {
          setStore(nextStore);
          onClose();
          onSelect?.(nextStore);
        }}
      />
    </Modal>
  );
}
