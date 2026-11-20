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
  recommended: EvaluatedVoucher | null;
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

function VoucherChoices({ onSelect }: { onSelect: (code: string) => void }) {
  const shop = useShop();
  const [input, setInput] = useState('');
  const [code, setCode] = useState('');
  const [cursor, setCursor] = useState('');
  const offers = useResource<Preview>(
    shop.cart && shop.store
      ? `/cart/vouchers?${query({ storeId: shop.store.id, cartVersion: shop.cart.version, code, cursor, limit: 10 })}`
      : null,
    15000,
  );
  const recommended = offers.data?.recommended;
  const items = offers.data?.items ?? [];
  const choices =
    !code && recommended && !items.some((v) => v.id === recommended.id)
      ? [recommended, ...items]
      : items;
  return (
    <div className="voucher-choices">
      <form
        className="voucher-search"
        onSubmit={(e) => {
          e.preventDefault();
          setCursor('');
          setCode(input.trim().toUpperCase());
        }}
      >
        <input
          aria-label="Nhập mã giảm giá"
          placeholder="Nhập mã giảm giá"
          value={input}
          maxLength={40}
          onChange={(e) => setInput(e.target.value)}
        />
        <button className="button secondary" type="submit">
          Tìm mã
        </button>
      </form>
      {code && (
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setCode('');
            setInput('');
            setCursor('');
          }}
        >
          Xem các mã của cửa hàng
        </button>
      )}
      <ErrorBox error={offers.error} retry={offers.refresh} />
      {offers.loading && !offers.data && <Loading />}
      {!offers.loading && !offers.error && !choices.length && (
        <p className="muted">
          {code ? 'Không tìm thấy mã tại cửa hàng này.' : 'Cửa hàng chưa có mã giảm giá khả dụng.'}
        </p>
      )}
      {choices.map((v) => (
        <article className={`voucher-ticket${v.eligible ? '' : ' unavailable'}`} key={v.id}>
          <TicketPercent size={25} aria-hidden="true" />
          <div>
            <strong>{v.code}</strong>
            <p>{voucherLabel(v)}</p>
            <small>
              Đơn từ {money(v.minTotal)} · Hết hạn {dateTime(v.validUntil)}
            </small>
            {v.eligible ? (
              <p className="voucher-saving">
                Tiết kiệm {money(v.discountAmount)}
                {recommended?.id === v.id ? ' · Có lợi nhất cho giỏ hàng' : ''}
              </p>
            ) : (
              <p className="muted">{reasonText(v)}</p>
            )}
          </div>
          <button
            type="button"
            className="button secondary small"
            disabled={!v.eligible}
            aria-label={`Dùng mã ${v.code}`}
            onClick={() => onSelect(v.code)}
          >
            Dùng mã
          </button>
        </article>
      ))}
      {offers.data?.nextCursor && (
        <button
          type="button"
          className="button secondary"
          disabled={offers.loading}
          onClick={() => setCursor(offers.data!.nextCursor!)}
        >
          Xem thêm mã
        </button>
      )}
      {cursor && (
        <button type="button" className="text-button" onClick={() => setCursor('')}>
          Về đầu danh sách
        </button>
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
        <span>{shop.voucherCode || 'Chọn mã giảm giá'}</span>
        <span>{shop.voucherCode ? 'Đổi mã' : 'Chọn mã'}</span>
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
      <Modal open={open && !disabled} onClose={() => setOpen(false)} title="Chọn mã giảm giá">
        <VoucherChoices onSelect={choose} />
      </Modal>
    </div>
  );
}
export function StoreOffers({ storeId }: { storeId: string }) {
  const [cursor, setCursor] = useState('');
  const offers = useResource<Page<Voucher>>(
    `/stores/${storeId}/vouchers?${query({ limit: 3, cursor })}`,
    30000,
  );
  return (
    <section id="uu-dai" tabIndex={-1} className="store-vouchers" aria-label="Ưu đãi của cửa hàng">
      <h2>
        <TicketPercent size={21} />
        Ưu đãi tại cửa hàng
      </h2>
      <ErrorBox error={offers.error} retry={offers.refresh} />
      {offers.loading && !offers.data && <Loading label="Đang tải ưu đãi…" />}
      <div className="store-voucher-list">
        {offers.data?.items.map((v) => (
          <article className="voucher-ticket" key={v.id}>
            <div>
              <strong>{v.code}</strong>
              <p>{voucherLabel(v)}</p>
              <small>
                Đơn từ {money(v.minTotal)} · Đến {dateTime(v.validUntil)}
              </small>
            </div>
          </article>
        ))}
      </div>
      {offers.data && (
        <p className="muted">
          {offers.data.items.length
            ? 'Chọn mã trong giỏ hàng để xem số tiền được giảm.'
            : 'Cửa hàng chưa có mã giảm giá khả dụng.'}
        </p>
      )}
      {offers.data?.nextCursor && (
        <button
          type="button"
          className="text-button"
          onClick={() => setCursor(offers.data!.nextCursor!)}
        >
          Xem thêm ưu đãi
        </button>
      )}
      {cursor && (
        <button type="button" className="text-button" onClick={() => setCursor('')}>
          Về đầu danh sách
        </button>
      )}
    </section>
  );
}
