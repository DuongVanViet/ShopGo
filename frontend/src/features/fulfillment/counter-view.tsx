'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Banknote, CheckCircle2, PackageCheck, ScanLine } from 'lucide-react';
import { useShop } from '@/store/shop';
import { api } from '@/lib/api';
import { dateTime, localDate, money, paymentLabels, shortCode } from '@/lib/format';
import type { Order } from '@/types';
import { AccessGate, Badge, Empty, ErrorBox, PageTitle } from '@/components/ui';

export function CounterView() {
  const shop = useShop(),
    [token, setToken] = useState(''),
    [lookupToken, setLookupToken] = useState(''),
    [order, setOrder] = useState<Order | null>(null),
    [shift, setShift] = useState(`CA-${localDate()}`),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  useEffect(() => {
    setToken('');
    setLookupToken('');
    setOrder(null);
    setError(null);
  }, [shop.user?.id, shop.store?.id]);
  async function lookup() {
    if (!shop.store) return;
    setBusy(true);
    setError(null);
    setOrder(null);
    try {
      const result = await api<Order>(`/stores/${shop.store.id}/pickup/lookup`, {
        method: 'POST',
        token: shop.token,
        body: { token: token.trim() },
      });
      setOrder(result);
      setLookupToken(token.trim());
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function action(kind: 'collections' | 'handover') {
    if (!shop.store || !order) return;
    const remainingAmount = amountRemainingAtCounter(order);
    setBusy(true);
    setError(null);
    try {
      setOrder(
        await api<Order>(`/stores/${shop.store.id}/orders/${order.id}/${kind}`, {
          method: 'POST',
          token: shop.token,
          idempotent: true,
          body:
            kind === 'collections'
              ? {
                  expectedVersion: order.version,
                  amount: remainingAmount,
                  method: 'CASH',
                  shiftReference: shift,
                }
              : { expectedVersion: order.version, token: lookupToken },
        }),
      );
      shop.notice(
        kind === 'collections' ? 'Đã ghi nhận thu tiền.' : 'Đã bàn giao hàng thành công.',
      );
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  const remainingAmount = order ? amountRemainingAtCounter(order) : 0;
  const needsCashCollection =
    order?.canCollectCash ??
    (order?.paymentMethod === 'PAY_AT_PICKUP' &&
      remainingAmount > 0 &&
      order.paymentStatus !== 'PAID');
  return (
    <AccessGate roles={['COUNTER']}>
      <div className="container">
        <PageTitle
          eyebrow="CLICK & COLLECT · QUẦY NHẬN"
          title="Đúng túi hàng. Đúng người nhận."
          subtitle="Nhập mã khách cung cấp, kiểm tra tiền và xác nhận bàn giao."
          action={
            <Link href="/tin-nhan" className="button secondary small">
              Tin nhắn
            </Link>
          }
        />
        <div className="checkout-grid">
          <section className="panel form-stack">
            <h2 className="form-section-title">
              <ScanLine size={21} />
              Tra cứu mã nhận hàng
            </h2>
            <form
              className="form-stack"
              onSubmit={(e) => {
                e.preventDefault();
                void lookup();
              }}
            >
              <label>
                Mã QR của khách
                <textarea
                  aria-label="Mã nhận hàng"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Dán mã đã sao chép từ trang đơn hàng của khách"
                  minLength={32}
                  maxLength={256}
                  required
                />
              </label>
              <small>Bạn có thể sao chép mã từ trang đơn hàng khi thử nghiệm trên cùng máy.</small>
              <button className="button" disabled={busy || !shop.store}>
                <ScanLine size={17} />
                {busy ? 'Đang xử lý…' : 'Kiểm tra đơn hàng'}
              </button>
            </form>
            <ErrorBox error={error} />
            {order && (
              <div className="info-note">
                <strong>{shortCode(order.code)}</strong> ·{' '}
                {paymentLabels[order.paymentStatus ?? 'UNPAID']}
                <p>Khung nhận: {order.slot ? dateTime(order.slot.startsAt) : '—'}</p>
              </div>
            )}
          </section>
          <section className={`panel ${order?.status === 'COMPLETED' ? 'success-panel' : ''}`}>
            {!order ? (
              <Empty title="Đơn hợp lệ sẽ hiển thị ở đây">
                <p>Tra cứu chỉ xem trước đơn. Hàng chỉ được bàn giao sau bước xác nhận cuối.</p>
              </Empty>
            ) : order.status === 'COMPLETED' ? (
              <div className="empty">
                <CheckCircle2 size={52} />
                <h2>Đã bàn giao thành công!</h2>
                <p className="muted">
                  Đơn {shortCode(order.code)} đã hoàn tất. Tồn kho đã được cập nhật.
                </p>
                <button
                  className="button secondary"
                  onClick={() => {
                    setToken('');
                    setOrder(null);
                  }}
                >
                  Nhận đơn tiếp theo
                </button>
              </div>
            ) : (
              <div className="stack">
                <div className="row between">
                  <h2 style={{ fontSize: 22 }}>Kiểm tra trước bàn giao</h2>
                  <Badge status={order.status} />
                </div>
                <table className="order-lines">
                  <tbody>
                    {order.items?.map((item) => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td>×{item.quantity}</td>
                        <td>{money(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {order.voucherCode && (
                  <div className="summary-line">
                    <span>Mã {order.voucherCode}</span>
                    <strong>−{money(order.discount)}</strong>
                  </div>
                )}
                <div className="summary-line total">
                  <span>Tổng đơn</span>
                  <strong>{money(order.total)}</strong>
                </div>
                {order.paymentPlan === 'DEPOSIT_15' && (
                  <div className="payment-breakdown compact" aria-label="Đối soát tiền cọc">
                    <div>
                      <span>Đã đặt cọc online ({order.depositPercent ?? 15}%)</span>
                      <strong>{money(order.depositAmount)}</strong>
                    </div>
                    <div>
                      <span>Còn thu tại quầy</span>
                      <strong>{money(remainingAmount)}</strong>
                    </div>
                  </div>
                )}
                {order.paymentPlan === 'FULL_ONLINE' && (
                  <div className="info-note">
                    <CheckCircle2 size={17} style={{ display: 'inline', marginRight: 5 }} />
                    Khách đã thanh toán toàn bộ online. Không thu thêm tại quầy.
                  </div>
                )}
                {needsCashCollection ? (
                  <form
                    className="form-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void action('collections');
                    }}
                  >
                    <label>
                      Mã ca thu tiền
                      <input
                        value={shift}
                        onChange={(e) => setShift(e.target.value)}
                        required
                        maxLength={100}
                      />
                    </label>
                    <div className="warning-note">
                      {order.paymentPlan === 'DEPOSIT_15'
                        ? 'Khoản cọc đã được ghi nhận online. Chỉ xác nhận sau khi đã nhận đúng số tiền còn lại từ khách.'
                        : 'Chỉ xác nhận sau khi đã nhận đủ tiền mặt từ khách.'}
                    </div>
                    <button className="button" disabled={busy}>
                      <Banknote size={17} />
                      Xác nhận đã thu {money(remainingAmount)}
                    </button>
                  </form>
                ) : order.paymentStatus === 'PAID' ? (
                  <div className="info-note">
                    <CheckCircle2 size={17} style={{ display: 'inline', marginRight: 5 }} />
                    Đã ghi nhận đủ tiền cho đơn này.
                  </div>
                ) : (
                  <div className="warning-note">Cần kiểm tra giao dịch trước khi bàn giao.</div>
                )}
                <button
                  className="button wide"
                  disabled={busy || order.paymentStatus !== 'PAID'}
                  onClick={() => void action('handover')}
                >
                  <PackageCheck size={18} />
                  Xác nhận bàn giao hàng
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </AccessGate>
  );
}

function amountRemainingAtCounter(order: Order): number {
  if (typeof order.amountRemaining === 'number') return order.amountRemaining;
  if (typeof order.remainingAmount === 'number') return order.remainingAmount;
  return order.paymentMethod === 'ONLINE' ? 0 : order.total;
}
