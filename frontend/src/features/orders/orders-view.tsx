'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Copy,
  CreditCard,
  ExternalLink,
  House,
  MapPin,
  Navigation,
  PackageCheck,
  QrCode,
  RefreshCw,
  ShoppingBag,
  Store as StoreIcon,
  Truck,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useShop } from '@/store/shop';
import { useResource } from '@/hooks/use-resource';
import { api, messageOf } from '@/lib/api';
import { dateTime, money, paymentLabels, shortCode, statuses, time } from '@/lib/format';
import { googleMapsDirectionsUrl, googleMapsPinUrl, hasStoreCoordinates } from '@/lib/maps';
import { isCustomerUser } from '@/lib/access';
import type { Order, OrderStatus, Page } from '@/types';
import { ProductArt } from '@/components/product-art';
import { OrderReview } from '@/features/reviews/order-review';
import { ChatLink } from '@/features/chat/chat-link';
import { StoreLocationMap } from '@/components/maps/store-location-map';
import { AccessGate, Badge, Empty, ErrorBox, Loading } from '@/components/ui';

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

const progressSteps = [
  { label: 'Đã đặt hàng', icon: ClipboardCheck },
  { label: 'Đang chuẩn bị', icon: ShoppingBag },
  { label: 'Sẵn sàng nhận', icon: StoreIcon },
  { label: 'Đã nhận hàng', icon: CheckCircle2 },
] as const;

function progressIndex(status: OrderStatus) {
  if (status === 'COMPLETED') return 3;
  if (status === 'READY') return 2;
  if (status === 'PICKING') return 1;
  if (status === 'CONFIRMED') return 0;
  return -1;
}

function progressCopy(order: Order, index: number) {
  if (index === 0) return dateTime(order.createdAt);
  const eventStatus: OrderStatus[] = ['CONFIRMED', 'PICKING', 'READY', 'COMPLETED'];
  const event = order.timeline?.findLast((item) => item.toStatus === eventStatus[index]);
  return event ? dateTime(event.createdAt) : 'Đang chờ cập nhật';
}

function OrderProgress({ order }: { order: Order }) {
  const active = progressIndex(order.status);
  const stopped = order.status === 'CANCELLED' || order.status === 'EXPIRED';
  return (
    <section
      className={`retail-order-progress${stopped ? ' is-stopped' : ''}`}
      aria-label="Tiến độ đơn hàng"
    >
      {progressSteps.map((step, index) => {
        const Icon = step.icon;
        const completed = active >= index;
        const current = active === index;
        return (
          <div
            className={`retail-order-progress-step${completed ? ' is-complete' : ''}${current ? ' is-current' : ''}`}
            key={step.label}
          >
            <span className="retail-order-progress-icon">
              <Icon size={22} />
            </span>
            <strong>{step.label}</strong>
            <small>{stopped ? 'Đơn đã dừng xử lý' : progressCopy(order, index)}</small>
          </div>
        );
      })}
    </section>
  );
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
      <div className="container retail-orders-page">
        <nav className="retail-order-breadcrumb" aria-label="Đường dẫn">
          <Link href="/">
            <House size={15} /> Trang chủ
          </Link>
          <ArrowRight size={14} />
          <span>Đơn hàng của tôi</span>
        </nav>
        <header className="retail-orders-header">
          <div>
            <span className="retail-orders-kicker">MUA ONLINE · NHẬN TẠI CỬA HÀNG</span>
            <h1>Đơn hàng của tôi</h1>
            <p>Theo dõi tiến độ chuẩn bị và lấy mã nhận hàng khi đơn đã sẵn sàng.</p>
          </div>
          <button className="button secondary" onClick={orders.refresh}>
            <RefreshCw size={17} />
            Cập nhật
          </button>
        </header>
        <div className="filters retail-order-filters">
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
          <div className="panel retail-order-empty">
            <Empty title="Chưa có đơn hàng ở đây">
              <Link className="button" href="/">
                Chọn món đầu tiên <ArrowRight size={16} />
              </Link>
            </Empty>
          </div>
        ) : (
          <div className="retail-order-list">
            {orders.data.items.map((order) => (
              <Link
                href={`/don-hang/${order.id}`}
                className="order-card retail-order-card"
                key={order.id}
              >
                <span className="retail-order-card-icon">
                  <PackageCheck size={25} />
                </span>
                <div className="retail-order-card-copy">
                  <small>ĐƠN HÀNG</small>
                  <h3>{shortCode(order.code)}</h3>
                  <p>
                    <CalendarDays size={14} /> {dateTime(order.createdAt)}
                  </p>
                </div>
                <div className="retail-order-card-summary">
                  <Badge status={order.status} />
                  <strong>{money(order.total)}</strong>
                  <small>Nhận tại cửa hàng</small>
                </div>
                <span className="retail-order-card-arrow">
                  <ArrowRight size={18} />
                </span>
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
  const canChooseFulfillment =
    !!current &&
    isCustomerUser(shop.user) &&
    current.userId === shop.user?.id &&
    ['PARTIALLY_PAID', 'DEPOSIT_PAID', 'PAID'].includes(current.paymentStatus ?? '') &&
    ['CONFIRMED', 'PICKING', 'READY'].includes(current.status);
  const awaitingDeposit = current?.status === 'PENDING_PAYMENT';
  const pickupBalance = current
    ? awaitingDeposit
      ? current.remainingAmount
      : (current.amountRemaining ?? current.remainingAmount)
    : 0;
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
      <div className="container retail-order-detail-page">
        <nav className="retail-order-breadcrumb" aria-label="Đường dẫn">
          <Link href="/don-hang">Đơn hàng của tôi</Link>
          <ArrowRight size={14} />
          <span>Chi tiết đơn hàng</span>
        </nav>
        <header className="retail-order-detail-header">
          <div>
            <span className="retail-orders-kicker">THEO DÕI ĐƠN HÀNG</span>
            <h1>{current ? `Đơn ${shortCode(current.code)}` : 'Chi tiết đơn hàng'}</h1>
            {current && (
              <p>
                <ClipboardCheck size={17} /> Đặt lúc {dateTime(current.createdAt)}
              </p>
            )}
          </div>
          <div className="retail-order-detail-actions">
            <Link className="button secondary" href="/don-hang">
              <ArrowLeft size={15} />
              Đơn của tôi
            </Link>
            <button className="button secondary" onClick={order.refresh} disabled={order.loading}>
              <RefreshCw size={16} /> Cập nhật trạng thái
            </button>
          </div>
        </header>
        <ErrorBox error={order.error} retry={order.refresh} />
        <ErrorBox error={error} />
        {!current ? (
          order.loading && <Loading />
        ) : (
          <>
            <OrderProgress order={current} />
            <div className="checkout-grid retail-order-detail-grid">
              <div className="stack">
                <section
                  className={`panel retail-order-status-card ${current.status === 'COMPLETED' ? 'success-panel' : ''}`}
                >
                  <div className="row between">
                    <h2 style={{ fontSize: 21 }}>
                      {current.status === 'COMPLETED'
                        ? 'Túi hàng đã đến tay bạn.'
                        : current.status === 'PENDING_PAYMENT'
                          ? 'Hoàn tất thanh toán để giữ đơn.'
                          : current.status === 'CANCELLED'
                            ? 'Đơn hàng đã được hủy.'
                            : current.status === 'EXPIRED'
                              ? 'Đơn hàng đã hết thời gian thanh toán.'
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
                          : current.status === 'EXPIRED'
                            ? 'Đơn đã hết hạn giữ hàng. Bạn có thể quay lại cửa hàng để tạo đơn mới.'
                            : current.status === 'PENDING_PAYMENT'
                              ? current.paymentPlan === 'DEPOSIT_15'
                                ? `Thanh toán khoản cọc ${current.depositPercent ?? 15}% để cửa hàng xác nhận và bắt đầu soạn đơn.`
                                : 'Hoàn tất thanh toán online để cửa hàng xác nhận đơn.'
                              : 'Trạng thái sẽ tự cập nhật khi cửa hàng xử lý.'}
                  </p>
                </section>
                <section className="panel retail-order-items-card">
                  <div className="panel-heading">
                    <h2>Các món đã chọn</h2>
                    <small>{current.items?.length ?? 0} dòng sản phẩm</small>
                  </div>
                  <table className="order-lines">
                    <tbody>
                      {current.items?.map((item) => (
                        <tr key={item.id}>
                          <td className="retail-order-product-art">
                            <ProductArt name={item.name} />
                          </td>
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
                    <span>Giảm giá{current.voucherCode ? ` · ${current.voucherCode}` : ''}</span>
                    <strong>−{money(current.discount)}</strong>
                  </div>
                  <div className="summary-line total">
                    <span>Tổng đơn</span>
                    <strong>{money(current.total)}</strong>
                  </div>
                  {current.paymentPlan === 'DEPOSIT_15' &&
                    !['CANCELLED', 'EXPIRED'].includes(current.status) && (
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
                          <span>
                            {awaitingDeposit
                              ? 'Trả tại quầy sau khi đặt cọc'
                              : 'Còn lại trả tại quầy'}
                          </span>
                          <strong>{money(pickupBalance)}</strong>
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
                <section className="panel retail-order-timeline-card">
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
                {isCustomerUser(shop.user) &&
                  current.userId === shop.user?.id &&
                  ['PENDING_PAYMENT', 'CONFIRMED', 'PICKING', 'READY'].includes(current.status) && (
                    <section className="panel order-store-contact">
                      <div>
                        <h2>Liên lạc về đơn hàng</h2>
                        <p className="muted">Tin nhắn được xóa khi đơn hàng kết thúc.</p>
                      </div>
                      <ChatLink orderId={current.id} />
                    </section>
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
              <aside className="stack retail-order-side">
                {canChooseFulfillment && (
                  <section
                    className="panel retail-order-fulfillment-card"
                    aria-labelledby="fulfillment-title"
                  >
                    <div className="retail-order-section-heading">
                      <span>
                        <PackageCheck size={21} />
                      </span>
                      <div>
                        <small>CÁCH NHẬN HÀNG</small>
                        <h2 id="fulfillment-title">Bạn muốn nhận đơn thế nào?</h2>
                      </div>
                    </div>
                    <p className="retail-fulfillment-intro">
                      Khoản thanh toán đã được xác nhận. Hiện tại bạn có thể đến cửa hàng nhận đơn;
                      giao tận nơi sẽ được mở ở phiên bản tiếp theo.
                    </p>
                    <div
                      className="retail-fulfillment-options"
                      role="radiogroup"
                      aria-label="Chọn cách nhận hàng"
                    >
                      <button
                        type="button"
                        className="retail-fulfillment-option is-selected"
                        role="radio"
                        aria-checked="true"
                        onClick={() => shop.notice('Đã chọn đến cửa hàng lấy đơn.')}
                      >
                        <span className="retail-fulfillment-option-icon">
                          <StoreIcon size={22} />
                        </span>
                        <span>
                          <strong>Đến cửa hàng lấy</strong>
                          <small>Nhận đúng khung giờ và dùng mã QR tại quầy.</small>
                        </span>
                        <span className="retail-fulfillment-badge selected">Đã chọn</span>
                      </button>
                      <button
                        type="button"
                        className="retail-fulfillment-option is-coming"
                        disabled
                        aria-label="Đặt ship giao tận nơi · Sắp ra mắt"
                      >
                        <span className="retail-fulfillment-option-icon">
                          <Truck size={22} />
                        </span>
                        <span>
                          <strong>Đặt ship giao tận nơi</strong>
                          <small>Liên hệ shipper nhận tại quán và giao tới địa chỉ của bạn.</small>
                        </span>
                        <span className="retail-fulfillment-badge">Sắp ra mắt</span>
                      </button>
                    </div>
                    <div className="retail-fulfillment-confirmation">
                      <CheckCircle2 size={17} />
                      <span>
                        Đơn sẽ được chuẩn bị tại{' '}
                        <strong>{current.store?.name ?? 'cửa hàng đã chọn'}</strong>.
                        {current.paymentPlan === 'DEPOSIT_15' && (pickupBalance ?? 0) > 0
                          ? ` Số tiền còn lại ${money(pickupBalance)} thanh toán khi nhận.`
                          : ' Bạn không cần thanh toán thêm tại quầy.'}
                      </span>
                    </div>
                  </section>
                )}
                <section className="panel retail-order-pickup-card">
                  <div className="retail-order-section-heading">
                    <span>
                      <MapPin size={21} />
                    </span>
                    <div>
                      <small>ĐIỂM NHẬN HÀNG</small>
                      <h2>Thông tin nhận hàng</h2>
                    </div>
                  </div>
                  <div className="retail-order-store-row">
                    <span className="retail-order-store-icon">
                      <StoreIcon size={22} />
                    </span>
                    <div>
                      <small>Siêu thị nhận hàng</small>
                      <strong>{current.store?.name ?? 'Đang cập nhật cửa hàng'}</strong>
                      <p>{current.store?.address}</p>
                    </div>
                    {current.store && hasStoreCoordinates(current.store) && (
                      <a
                        className="retail-order-directions"
                        href={googleMapsDirectionsUrl(current.store)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <Navigation size={15} /> Chỉ đường
                      </a>
                    )}
                  </div>
                  {current.slot && (
                    <div className="retail-order-slot-row">
                      <span className="retail-order-store-icon">
                        <Clock3 size={22} />
                      </span>
                      <div>
                        <small>Thời gian lấy hàng</small>
                        <strong>{dateTime(current.slot.startsAt)}</strong>
                      </div>
                      <span className="retail-order-slot-time">
                        <CalendarDays size={15} /> {time(current.slot.startsAt)} –{' '}
                        {time(current.slot.endsAt)}
                      </span>
                    </div>
                  )}
                  {current.store && hasStoreCoordinates(current.store) ? (
                    <div className="retail-order-map-wrap">
                      <StoreLocationMap
                        latitude={current.store.latitude}
                        longitude={current.store.longitude}
                        name={current.store.name}
                      />
                      <a
                        href={googleMapsPinUrl(current.store)}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink size={14} /> Mở ghim Google Maps
                      </a>
                    </div>
                  ) : (
                    <div className="info-note retail-order-map-unavailable">
                      Cửa hàng chưa ghim tọa độ. ShopGo chỉ hiển thị địa chỉ đã lưu, không tự đặt vị
                      trí ước lượng.
                    </div>
                  )}
                </section>
                {current.status === 'PENDING_PAYMENT' && (
                  <section className="panel payment-action-panel retail-order-payment-card">
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
                  <section className="panel qr-panel retail-order-qr-card">
                    <div className="retail-order-receipt-code">
                      <span>
                        <QrCode size={27} />
                      </span>
                      <div>
                        <small>Mã nhận hàng</small>
                        <strong>{shortCode(current.code)}</strong>
                      </div>
                    </div>
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
                  <>
                    {isCustomerUser(shop.user) && current.userId === shop.user?.id && (
                      <OrderReview key={current.id} orderId={current.id} />
                    )}
                    <section className="panel qr-panel success-panel">
                      <CheckCircle2 size={42} />
                      <h2 style={{ fontSize: 22 }}>Hẹn gặp bạn lần tới.</h2>
                      <Link className="button wide" href="/" style={{ marginTop: 20 }}>
                        Tiếp tục mua sắm
                      </Link>
                    </section>
                  </>
                )}
              </aside>
            </div>
          </>
        )}
      </div>
    </AccessGate>
  );
}
