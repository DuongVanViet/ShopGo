'use client';
import type { StoreAddress } from '@/types/location';
export function AddressFields({
  value,
  onChange,
}: {
  value: StoreAddress;
  onChange: (address: StoreAddress) => void;
}) {
  return (
    <div className="form-stack">
      <label>
        Số nhà, tên đường
        <input
          value={value.street}
          onChange={(event) => onChange({ ...value, street: event.target.value })}
          required
          minLength={3}
          maxLength={250}
          autoComplete="address-line1"
          placeholder="Ví dụ: 25 Nguyễn Huệ"
        />
      </label>
      <div className="grid-2">
        <label>
          Phường / xã
          <input
            value={value.ward}
            onChange={(event) => onChange({ ...value, ward: event.target.value })}
            required
            minLength={2}
            maxLength={120}
            placeholder="Phường / xã của cửa hàng"
          />
        </label>
        <label>
          Quận / huyện (nếu có)
          <input
            value={value.district ?? ''}
            onChange={(event) => onChange({ ...value, district: event.target.value })}
            maxLength={120}
          />
        </label>
      </div>
      <label>
        Tỉnh / thành phố
        <input
          value={value.city}
          onChange={(event) => onChange({ ...value, city: event.target.value })}
          required
          minLength={2}
          maxLength={120}
          autoComplete="address-level1"
          placeholder="Ví dụ: Thành phố Hồ Chí Minh"
        />
      </label>
    </div>
  );
}
