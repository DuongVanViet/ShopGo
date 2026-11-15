'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  CreditCard,
  MapPin,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useShop } from '@/store/shop';
import { useResource } from '@/hooks/use-resource';
import { api, messageOf } from '@/lib/api';
import { dateTime, money, paymentLabels, shortCode, statuses, time } from '@/lib/format';
import type { Order, OrderStatus, Page } from '@/types';
import { AccessGate, Badge, Empty, ErrorBox, Loading, PageTitle } from '@/components/ui';

interface PaymentAttempt {
  id: string;
  provider: string;
  providerReference: string;
  amount: number;
  status: string;
  sandbox?: boolean;
  instructions?: string;
  checkoutUrl?: string;
}

export function OrdersView() {
  const shop = useShop(),
    [status, setStatus] = useState(''),
    [cursor, setCursor] = useState('');
  const orders = useResource<Page<Order>>(
    shop.user
      ? `/orders?limit=20${status ? `&status=${status}` : ''}${cursor ? `&cursor=${cursor}` : ''}`
      : null,
    10000,
  );
  return (
    <AccessGate>
      <div className="container">
        <PageTitle
          eyebrow="MỖI ĐƠN LÀ MỘT TÚI NGON LÀNH"
          title="Đơn của tôi"
          subtitle="Theo dõi cửa hàng chuẩn bị, lấy mã QR khi đơn sẵn sàng."
          action={
            <button className="button secondary small" onClick={orders.refresh}>
              <RefreshCw size={15} />
              Cập nhật
            </button>
          }
        />
        <div className="filters">
          {[
            ['', 'Tất cả'],
            ['PENDING_PAYMENT', 'Chờ thanh toán'],
            ['CONFIRMED', 'Đã xác nhận'],
            ['PICKING', 'Đang soạn'],
            ['READY', 'Sẵn sàng'],
            ['COMPLETED', 'Đã nhận'],
            ['CANCELLED', 'Đã hủy'],
          ].map(([value, label]) => (
            <button
              className={`filter-button ${status === value ? 'active' : ''}`}
              key={value}
              onClick={() => {
                setStatus(value);
                setCursor('');
              }}
            >
              {label}
            </button>
          ))}
        </div>
        <ErrorBox error={orders.error} retry={orders.refresh} />
        {orders.loading && !orders.data ? (
          <Loading />
        ) : !orders.data?.items.length ? (
          <div className="panel">
            <Empty title="Chưa có đơn hàng ở đây">
              <Link className="button" href="/">
                Chọn món đầu tiên <ArrowRight size={16} />
              </Link>
            </Empty>
          </div>
        ) : (
          <div className="stack">
            {orders.data.items.map((order) => (
              <Link href={`/don-hang/${order.id}`} className="order-card" key={order.id}>
                <div>
                  <h3 className="row">
                    <ShoppingBag size={17} />
                    {shortCode(order.code)}
                  </h3>
                  <p>{dateTime(order.createdAt)} · Nhận tại cửa hàng</p>
                </div>
                <div>
                  <strong>{money(order.total)}</strong>
                  <Badge status={order.status} />
                </div>
                <ArrowRight size={18} />
              </Link>
            ))}
          </div>
        )}
        <div className="load-more row">
          {cursor && (
            <button className="button secondary small" onClick={() => setCursor('')}>
              Về trang đầu
            </button>
          )}
          {orders.data?.nextCursor && (
            <button
              className="button secondary small"
              onClick={() => setCursor(orders.data!.nextCursor!)}
            >
              Xem các đơn tiếp theo <ArrowRight size={15} />
            </button>
          )}
        </div>
      </div>
    </AccessGate>
  );
}
export function OrderDetail({ id }: { id: string }) {
  const shop = useShop(),
    order = useResource<Order>(shop.user ? `/orders/${id}` : null, 5000);
  const current = order.data,
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [reason, setReason] = useState(''),
    [support, setSupport] = useState(''),
    [paymentAttempt, setPaymentAttempt] = useState<PaymentAttempt | null>(null);
  const qr = useResource<{ token: string; expiresAt: string }>(
    current?.status === 'READY' && current.userId === shop.user?.id
      ? `/orders/${id}/pickup-token`
      : null,
  );
  async function cancel() {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/orders/${id}/cancel`, {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: { expectedVersion: current.version, reason },
      });
      order.refresh();
      await shop.refreshCart();
      shop.notice('Đã gửi hủy đơn.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function rotate() {
    if (!current) return;
    setBusy(true);
    try {
      await api(`/orders/${id}/pickup-token/rotate`, {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: { expectedVersion: current.version },
      });
      order.refresh();
      qr.refresh();
      shop.notice('Mã nhận hàng đã được cấp lại.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function sendSupport() {
    setBusy(true);
    try {
      await api('/support/cases', {
        method: 'POST',
        token: shop.token,
        body: { orderId: id, category: 'ORDER', message: support },
      });
      setSupport('');
      shop.notice('Đã gửi yêu cầu hỗ trợ.');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  async function createPaymentAttempt() {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const attempt = await api<PaymentAttempt>(`/orders/${id}/payment-attempts`, {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: { expectedVersion: current.version },
      });
      setPaymentAttempt(attempt);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }
  async function confirmSandboxPayment() {
    if (!current || !paymentAttempt) return;
    setBusy(true);
    setError(null);
    try {
      await api<Order>(`/orders/${id}/payment-attempts/${paymentAttempt.id}/confirm-sandbox`, {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: { expectedVersion: current.version },
      });
      setPaymentAttempt(null);
      order.refresh();
      shop.notice(
        current.paymentPlan === 'DEPOSIT_15'
          ? 'Đã xác nhận thanh toán cọc. Cửa hàng sẽ bắt đầu xử lý đơn.'
          : 'Đã xác nhận thanh toán toàn bộ đơn.',
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }
  return (
    <AccessGate>
      <div className="container">
        <PageTitle
          eyebrow="THEO DÕI TỪ LÚC CHỌN ĐẾN KHI NHẬN"
          title={current ? `Đơn ${shortCode(current.code)}` : 'Chi tiết đơn hàng'}
          subtitle={current ? `Đặt lúc ${dateTime(current.createdAt)}` : undefined}
          action={
            <Link className="text-button" href="/don-hang">
              <ArrowLeft size={15} />
              Đơn của tôi
            </Link>
          }
        />
        <ErrorBox error={order.error} retry={order.refresh} />
        <ErrorBox error={error} />
        {!current ? (
          order.loading && <Loading />
        ) : (
          <div className="checkout-grid">
            <div className="stack">
              <section className={`panel ${current.status === 'COMPLETED' ? 'success-panel' : ''}`}>
                <div className="row between">
                  <h2 style={{ fontSize: 21 }}>
                    {current.status === 'COMPLETED'
                      ? 'Túi hàng đã đến tay bạn.'
                      : current.status === 'PENDING_PAYMENT'
                        ? 'Hoàn tất thanh toán để giữ đơn.'
                        : 'Cửa hàng đang chăm chút đơn của bạn.'}
                  </h2>
                  <Badge status={current.status} />
                </div>
                <p className="muted" style={{ marginTop: 13 }}>
                  {current.status === 'READY'
                    ? 'Đơn đã soạn xong. Mang mã QR tới quầy để nhận nhé.'
                    : current.status === 'COMPLETED'
                      ? 'Cảm ơn bạn đã mua sắm cùng ShopGo.'
                      : current.status === 'CANCELLED'
                        ? 'Đơn đã hủy. Thông tin hoàn tiền, nếu có, được hiển thị bên dưới.'
                        : current.status === 'PENDING_PAYMENT'
                          ? current.paymentPlan === 'DEPOSIT_15'
                            ? `Thanh toán khoản cọc ${current.depositPercent ?? 15}% để cửa hàng xác nhận và bắt đầu soạn đơn.`
                            : 'Hoàn tất thanh toán online để cửa hàng xác nhận đơn.'
                          : 'Trạng thái sẽ tự cập nhật khi cửa hàng xử lý.'}
                </p>
              </section>
              <section className="panel">
                <div className="panel-heading">
                  <h2>Các món đã chọn</h2>
                  <small>{current.items?.length ?? 0} dòng sản phẩm</small>
                </div>
                <table className="order-lines">
                  <tbody>
                    {current.items?.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.name}</strong>
                          <small>{item.skuCode}</small>
                        </td>
                        <td>× {item.quantity}</td>
                        <td>{money(item.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="spacer" />
                <div className="summary-line">
                  <span>Giảm giá</span>
                  <strong>−{money(current.discount)}</strong>
                </div>
                <div className="summary-line total">
                  <span>Tổng đơn</span>
                  <strong>{money(current.total)}</strong>
                </div>
                {current.paymentPlan === 'DEPOSIT_15' && (
                  <div className="payment-breakdown compact" aria-label="Chi tiết tiền cọc">
                    <div>
                      <span>
                        {current.paymentStatus === 'PARTIALLY_PAID' ||
                        current.paymentStatus === 'PAID'
                          ? 'Đã đặt cọc online'
                          : 'Cần đặt cọc online'}{' '}
                        ({current.depositPercent ?? 15}%)
                      </span>
                      <strong>{money(current.depositAmount)}</strong>
                    </div>
                    <div>
                      <span>Còn lại trả tại quầy</span>
                      <strong>{money(current.remainingAmount)}</strong>
                    </div>
                  </div>
                )}
                {current.paymentPlan === 'FULL_ONLINE' && (
                  <div className="info-note payment-paid-note">
                    <CreditCard size={17} /> Thanh toán toàn bộ online · không thu thêm tại quầy
                  </div>
                )}
                <p className="muted">{paymentLabels[current.paymentStatus ?? 'UNPAID']}</p>
                {current.refunds?.map((refund) => (
                  <div className="warning-note" key={refund.id} style={{ marginTop: 10 }}>
                    Hoàn {money(refund.amount)} ·{' '}
                    {refund.status === 'SUCCEEDED'
                      ? 'Đã hoàn'
                      : refund.status === 'FAILED'
                        ? 'Cần hỗ trợ'
                        : 'Đang xử lý'}
                  </div>
                ))}
              </section>
              <section className="panel">
                <h2 className="form-section-title">Hành trình đơn hàng</h2>
                <div className="timeline">
                  {current.timeline?.map((event, index) => (
                    <div className="timeline-item" key={`${event.createdAt}-${index}`}>
                      <b>{statuses[event.toStatus]}</b>
                      <small>
                        {dateTime(event.createdAt)} · {event.reason}
                      </small>
                    </div>
                  ))}
                </div>
              </section>
              {['PENDING_PAYMENT', 'CONFIRMED'].includes(current.status) && (
                <details className="panel">
                  <summary className="details-summary danger-text">Bạn muốn hủy đơn?</summary>
                  <form
                    className="form-stack"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void cancel();
                    }}
                  >
                    <label>
                      Lý do hủy
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        required
                        minLength={3}
                        maxLength={500}
                      />
                    </label>
                    <button className="button danger" disabled={busy}>
                      Xác nhận hủy đơn
                    </button>
                  </form>
                </details>
              )}
              <details className="panel">
                <summary className="details-summary">Cần hỗ trợ về đơn hàng</summary>
                <form
                  className="form-stack"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendSupport();
                  }}
                >
                  <label>
                    Nội dung cần hỗ trợ
                    <textarea
                      value={support}
                      onChange={(e) => setSupport(e.target.value)}
                      required
                      minLength={3}
                      maxLength={5000}
                    />
                  </label>
                  <button className="button secondary" disabled={busy}>
                    Gửi cửa hàng
                  </button>
                </form>
              </details>
            </div>
            <aside className="stack">
              <section className="panel">
                <h2 className="form-section-title">
                  <MapPin size={20} />
                  Thông tin nhận hàng
                </h2>
                <strong>{current.store?.name}</strong>
                <p className="muted">{current.store?.address}</p>
                {current.slot && (
                  <div className="info-note" style={{ marginTop: 16 }}>
                    <strong>
                      {time(current.slot.startsAt)} – {time(current.slot.endsAt)}
                    </strong>
                    <p>{dateTime(current.slot.startsAt)}</p>
                  </div>
                )}
              </section>
              {current.status === 'PENDING_PAYMENT' && (
                <section className="panel payment-action-panel">
                  <h2 className="form-section-title">
                    <CreditCard size={20} />
                    {current.paymentPlan === 'DEPOSIT_15'
                      ? 'Thanh toán tiền cọc'
                      : 'Thanh toán đơn hàng'}
                  </h2>
                  <div className="payment-due-now">
                    <span>Cần thanh toán ngay</span>
                    <strong>{money(current.amountDueNow)}</strong>
                  </div>
                  {!paymentAttempt ? (
                    <button
                      type="button"
                      className="button wide"
                      disabled={busy}
                      onClick={() => void createPaymentAttempt()}
                    >
                      <CreditCard size={17} />
                      {busy ? 'Đang tạo phiên…' : 'Tiếp tục thanh toán'}
                    </button>
                  ) : (
                    <div className="stack payment-attempt-box">
                      <div className="info-note">
                        <strong>{money(paymentAttempt.amount)}</strong>
                        <small>
                          Mã phiên: {paymentAttempt.providerReference} · {paymentAttempt.provider}
                        </small>
                        {paymentAttempt.instructions && !paymentAttempt.sandbox && (
                          <p>{paymentAttempt.instructions}</p>
                        )}
                      </div>
                      {paymentAttempt.checkoutUrl && !paymentAttempt.sandbox && (
                        <a className="button wide" href={paymentAttempt.checkoutUrl}>
                          Mở cổng thanh toán <ArrowRight size={16} />
                        </a>
                      )}
                      {paymentAttempt.sandbox && (
                        <>
                          <div className="warning-note">
                            Chế độ thử nghiệm local: thao tác dưới đây chỉ mô phỏng thanh toán,
                            không thu tiền thật.
                          </div>
                          <button
                            type="button"
                            className="button wide"
                            disabled={busy}
                            onClick={() => void confirmSandboxPayment()}
                          >
                            <CheckCircle2 size={17} />
                            {busy ? 'Đang xác nhận…' : 'Thanh toán mô phỏng'}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </section>
              )}
              {current.status === 'READY' && (
                <section className="panel qr-panel">
                  <h2 style={{ fontSize: 21 }}>Mã nhận túi của bạn</h2>
                  <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                    Đưa mã này cho nhân viên tại quầy.
                  </p>
                  <ErrorBox error={qr.error} retry={qr.refresh} />
                  {qr.loading && !qr.data ? (
                    <Loading />
                  ) : (
                    qr.data && (
                      <>
                        <div className="qr-code">
                          <QRCodeSVG value={qr.data.token} size={185} marginSize={2} />
                        </div>
                        <small>Mã có hạn đến {time(qr.data.expiresAt)}.</small>
                        <button
                          className="text-button"
                          onClick={() =>
                            void navigator.clipboard
                              .writeText(qr.data!.token)
                              .then(() => shop.notice('Đã sao chép mã nhận hàng.'))
                              .catch(() =>
                                shop.notice('Bạn có thể chọn và sao chép mã bên dưới.', true),
                              )
                          }
                        >
                          <Copy size={14} />
                          Sao chép mã nhận hàng
                        </button>
                        <details>
                          <summary className="details-summary muted" style={{ fontSize: 11 }}>
                            Xem mã để nhập tại quầy
                          </summary>
                          <p className="token-value" data-testid="pickup-token">
                            {qr.data.token}
                          </p>
                        </details>
                      </>
                    )
                  )}
                  <button
                    className="button secondary small wide"
                    disabled={busy}
                    onClick={() => void rotate()}
                    style={{ marginTop: 14 }}
                  >
                    <RefreshCw size={14} />
                    Cấp lại mã QR
                  </button>
                </section>
              )}
              {current.status === 'COMPLETED' && (
                <section className="panel qr-panel success-panel">
                  <CheckCircle2 size={42} />
                  <h2 style={{ fontSize: 22 }}>Hẹn gặp bạn lần tới.</h2>
                  <Link className="button wide" href="/" style={{ marginTop: 20 }}>
                    Tiếp tục mua sắm
                  </Link>
                </section>
              )}
            </aside>
          </div>
        )}
      </div>
    </AccessGate>
  );
}
