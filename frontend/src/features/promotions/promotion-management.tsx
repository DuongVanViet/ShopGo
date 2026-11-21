'use client';
import { useState, type FormEvent } from 'react';
import { Plus, TicketPercent } from 'lucide-react';
import { useShop } from '@/store/shop';
import { useResource } from '@/hooks/use-resource';
import { api, query } from '@/lib/api';
import { dateTime, money } from '@/lib/format';
import type { Page } from '@/types';
import { Empty, ErrorBox, Loading, Modal } from '@/components/ui';
import { voucherLabel, type Voucher } from './voucher-picker';
interface Promotion extends Voucher {
  active: boolean;
  version: number;
  quota: number;
  allocatedCount: number;
  usedCount: number;
  reservedCount: number;
  started: boolean;
  unexpired: boolean;
  validFrom: string;
}
function status(v: Promotion) {
  if (!v.active) return 'Tạm dừng';
  if (!v.unexpired) return 'Đã kết thúc';
  if (!v.started) return 'Sắp bắt đầu';
  return v.allocatedCount >= v.quota ? 'Hết lượt' : 'Đang áp dụng';
}
export function PromotionManagement({ base }: { base: string }) {
  const shop = useShop();
  const [cursor, setCursor] = useState('');
  const list = useResource<Page<Promotion>>(`${base}/promotions?${query({ limit: 10, cursor })}`);
  const [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  const [kind, setKind] = useState('PERCENT');
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const text = (name: string) => String(data.get(name) ?? '');
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/promotions`, {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: {
          code: text('code').trim(),
          discountType: kind,
          value: Number(text('value')),
          minTotal: Number(text('minTotal')),
          ...(text('maxDiscount') ? { maxDiscount: Number(text('maxDiscount')) } : {}),
          quota: Number(text('quota')),
          validFrom: new Date(`${text('validFrom')}:00+07:00`).toISOString(),
          validUntil: new Date(`${text('validUntil')}:00+07:00`).toISOString(),
        },
      });
      setOpen(false);
      setCursor('');
      list.refresh();
      shop.notice('Đã tạo mã giảm giá.');
    } catch (failure) {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }
  async function toggle(v: Promotion) {
    setBusy(true);
    setError(null);
    try {
      await api(`${base}/promotions/${v.id}`, {
        method: 'PATCH',
        token: shop.token,
        idempotent: true,
        body: { active: !v.active, expectedVersion: v.version },
      });
      list.refresh();
    } catch (failure) {
      setError(failure);
      list.refresh();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel promotion-management">
      <div className="panel-heading">
        <h2>
          <TicketPercent size={21} />
          Mã giảm giá riêng của cửa hàng
        </h2>
        <button
          type="button"
          className="button small"
          onClick={() => {
            setError(null);
            setOpen(true);
          }}
        >
          <Plus size={17} />
          Tạo mã giảm giá
        </button>
      </div>
      <ErrorBox error={list.error} retry={list.refresh} />
      <ErrorBox error={open ? null : error} />
      {list.loading && !list.data && <Loading />}
      {list.data?.items.length === 0 && <Empty title="Cửa hàng chưa có mã giảm giá" />}
      <div className="promotion-list">
        {list.data?.items.map((v) => (
          <article className="voucher-ticket" key={v.id}>
            <div>
              <strong>{v.code}</strong>
              <p>{voucherLabel(v)}</p>
              <small>Đơn từ {money(v.minTotal)}</small>
              <small>
                {dateTime(v.validFrom)} – {dateTime(v.validUntil)}
              </small>
              <p>
                {status(v)} · Đã dùng {v.usedCount} · Đang giữ {v.reservedCount} · Còn{' '}
                {v.quota - v.allocatedCount}/{v.quota} lượt
              </p>
            </div>
            <button
              type="button"
              className="button secondary small"
              disabled={busy}
              aria-label={`${v.active ? 'Tạm dừng' : 'Bật lại'} ${v.code}`}
              onClick={() => void toggle(v)}
            >
              {v.active ? 'Tạm dừng' : 'Bật lại'}
            </button>
          </article>
        ))}
      </div>
      {list.data?.nextCursor && (
        <button
          type="button"
          className="button secondary small"
          onClick={() => setCursor(list.data!.nextCursor!)}
        >
          Xem thêm mã
        </button>
      )}
      {cursor && (
        <button type="button" className="text-button" onClick={() => setCursor('')}>
          Về đầu danh sách
        </button>
      )}
      <Modal
        open={open}
        onClose={() => {
          if (!busy) setOpen(false);
        }}
        title="Tạo mã giảm giá"
      >
        <form className="form-stack promotion-form" onSubmit={(event) => void create(event)}>
          <ErrorBox error={error} />
          <label>
            Mã giảm giá
            <input
              name="code"
              required
              pattern="[A-Za-z0-9_-]{2,40}"
              maxLength={40}
              placeholder="RAUXANH10"
            />
          </label>
          <label>
            Kiểu giảm
            <select value={kind} onChange={(e) => setKind(e.target.value)}>
              <option value="PERCENT">Theo phần trăm</option>
              <option value="FIXED">Số tiền cố định</option>
            </select>
          </label>
          <label>
            {kind === 'PERCENT' ? 'Giá trị giảm (%)' : 'Số tiền giảm (₫)'}
            <input
              name="value"
              type="number"
              min={1}
              max={kind === 'PERCENT' ? 100 : 1000000000000}
              required
            />
          </label>
          <label>
            Đơn tối thiểu (₫)
            <input
              name="minTotal"
              type="number"
              min={0}
              max={1000000000000}
              defaultValue={0}
              required
            />
          </label>
          <label>
            Giảm tối đa (₫)
            <input
              name="maxDiscount"
              type="number"
              min={1}
              max={1000000000000}
              placeholder="Để trống nếu không giới hạn"
            />
          </label>
          <label>
            Số lượt áp dụng
            <input name="quota" type="number" min={1} max={1000000} defaultValue={100} required />
          </label>
          <label>
            Bắt đầu (giờ Việt Nam)
            <input name="validFrom" type="datetime-local" required />
          </label>
          <label>
            Kết thúc (giờ Việt Nam)
            <input name="validUntil" type="datetime-local" required />
          </label>
          <button className="button wide" disabled={busy}>
            {busy ? 'Đang lưu…' : 'Tạo ưu đãi'}
          </button>
        </form>
      </Modal>
    </section>
  );
}
