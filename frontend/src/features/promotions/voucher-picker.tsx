'use client';
import { useEffect, useState } from 'react';
import { TicketPercent } from 'lucide-react';
import { useShop } from '@/store/shop';
import { useResource } from '@/hooks/use-resource';
import { query } from '@/lib/api';
import { money, dateTime } from '@/lib/format';
import type { Page } from '@/types';
import { ErrorBox, Loading, Modal } from '@/components/ui';

export interface Voucher {
  id: string;
  code: string;
  discountType: 'FIXED' | 'PERCENT';
  value: number;
  minTotal: number;
  maxDiscount: number | null;
  validUntil: string;
}
interface EvaluatedVoucher extends Voucher {
  eligible: boolean;
  reason: string | null;
  missingAmount: number;
  discountAmount: number;
}
interface Preview extends Page<EvaluatedVoucher> {
  subtotal: number;
  cartVersion: number;
}
export function voucherLabel(voucher: Voucher) {
  return `Giảm ${voucher.discountType === 'PERCENT' ? `${voucher.value}%` : money(voucher.value)}${voucher.maxDiscount ? `, tối đa ${money(voucher.maxDiscount)}` : ''}`;
}
function reasonText(voucher: EvaluatedVoucher) {
  if (voucher.reason === 'MIN_TOTAL')
    return `Mua thêm ${money(voucher.missingAmount)} để dùng mã này`;
  return (
    (
      {
        PAUSED: 'Mã đang tạm dừng',
        NOT_STARTED: 'Chưa đến thời gian áp dụng',
        EXPIRED: 'Mã đã hết hạn',
        EXHAUSTED: 'Mã đã hết lượt',
        NO_DISCOUNT: 'Giỏ hàng chưa đủ điều kiện',
      } as Record<string, string>
    )[voucher.reason ?? ''] ?? 'Mã không dùng được tại cửa hàng này'
  );
}
export function useSelectedVoucher() {
  const shop = useShop();
  const resource = useResource<Preview>(
    shop.token && shop.store && shop.cart && shop.voucherCode
      ? `/cart/vouchers?${query({ storeId: shop.store.id, code: shop.voucherCode, cartVersion: shop.cart.version })}`
      : null,
    15000,
  );
  const selected = resource.data?.items[0];
  const subtotal = shop.cart?.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const synchronized = resource.data?.subtotal === subtotal;
  useEffect(() => {
    if (resource.data && !synchronized) void shop.refreshCart().catch(() => {});
  }, [resource.data, synchronized, shop.refreshCart]);
  return {
    ...resource,
    selected,
    discount: synchronized && selected?.eligible ? selected.discountAmount : 0,
  };
}

function VoucherLookup({ onSelect }: { onSelect: (code: string) => void }) {
  const shop = useShop();
  const [input, setInput] = useState('');
  const [code, setCode] = useState('');
  const lookup = useResource<Preview>(
    code && shop.cart && shop.store
      ? `/cart/vouchers?${query({ storeId: shop.store.id, cartVersion: shop.cart.version, code })}`
      : null,
  );
  const voucher = lookup.data?.items[0];
  return (
    <div className="voucher-choices">
      <form
        className="voucher-search"
        onSubmit={(e) => {
          e.preventDefault();
          const submitted = input.trim().toUpperCase();
          if (submitted === code) lookup.refresh();
          else setCode(submitted);
        }}
      >
        <input
          aria-label="Nhập mã giảm giá"
          placeholder="Nhập mã bạn có"
          value={input}
          autoComplete="off"
          maxLength={40}
          onChange={(e) => {
            setInput(e.target.value);
            setCode('');
          }}
        />
        <button className="button secondary" type="submit" disabled={!input.trim()}>
          Kiểm tra mã
        </button>
      </form>
      <ErrorBox error={lookup.error} retry={lookup.refresh} />
      {lookup.loading && !lookup.data && <Loading label="Đang kiểm tra mã…" />}
      {lookup.data && !voucher && <p role="status">Không tìm thấy mã tại cửa hàng này.</p>}
      {voucher && (
        <article className={`voucher-ticket${voucher.eligible ? '' : ' unavailable'}`}>
          <TicketPercent size={25} aria-hidden="true" />
          <div>
            <strong>{voucher.code}</strong>
            <p>{voucherLabel(voucher)}</p>
            <small>
              Đơn từ {money(voucher.minTotal)} · Hết hạn {dateTime(voucher.validUntil)}
            </small>
            {voucher.eligible ? (
              <p className="voucher-saving">Tiết kiệm {money(voucher.discountAmount)}</p>
            ) : (
              <p className="muted">{reasonText(voucher)}</p>
            )}
          </div>
          <button
            type="button"
            className="button secondary small"
            disabled={!voucher.eligible}
            aria-label={`Dùng mã ${voucher.code}`}
            onClick={() => onSelect(voucher.code)}
          >
            Dùng mã
          </button>
        </article>
      )}
    </div>
  );
}
export function VoucherPicker({
  preview,
  disabled = false,
  onChange,
}: {
  preview: ReturnType<typeof useSelectedVoucher>;
  disabled?: boolean;
  onChange?: () => void;
}) {
  const shop = useShop();
  const [open, setOpen] = useState(false);
  function choose(code: string) {
    shop.setVoucherCode(code);
    setOpen(false);
    onChange?.();
  }
  return (
    <div className="voucher-control">
      <button
        type="button"
        className="voucher-trigger"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <TicketPercent size={21} aria-hidden="true" />
        <span>{shop.voucherCode || 'Mã giảm giá'}</span>
        <span>{shop.voucherCode ? 'Đổi mã' : 'Nhập mã'}</span>
      </button>
      {shop.voucherCode && (
        <>
          {preview.loading && !preview.data && <Loading label="Đang kiểm tra mã…" />}
          <ErrorBox error={preview.error} retry={preview.refresh} />
          {preview.data && (
            <p className={preview.selected?.eligible ? 'voucher-saving' : 'muted'} role="status">
              {preview.selected
                ? preview.selected.eligible
                  ? `Đã giảm ${money(preview.discount)}`
                  : reasonText(preview.selected)
                : 'Mã không còn khả dụng. Hãy chọn mã khác.'}
            </p>
          )}
          <button
            type="button"
            className="text-button"
            disabled={disabled}
            onClick={() => choose('')}
          >
            Bỏ mã
          </button>
        </>
      )}
      <Modal open={open && !disabled} onClose={() => setOpen(false)} title="Nhập mã giảm giá">
        <VoucherLookup key={shop.store?.id} onSelect={choose} />
      </Modal>
    </div>
  );
}
