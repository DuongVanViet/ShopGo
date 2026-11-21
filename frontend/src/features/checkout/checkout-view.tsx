'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  MapPin,
  ShieldCheck,
  ShoppingBag,
  Store,
  WalletCards,
} from 'lucide-react';
import { useShop } from '@/store/shop';
import { useResource } from '@/hooks/use-resource';
import { api, ApiError } from '@/lib/api';
import { calendarDate, money, time } from '@/lib/format';
import type { Order, PaymentBreakdown, PaymentMethod, Quote, Slot } from '@/types';
import { AccessGate, Empty, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { useSelectedVoucher, VoucherPicker } from '@/features/promotions/voucher-picker';
import { ProductPrice } from '@/components/product-price';
import { cartItemNeedsAttention } from '@/lib/cart';

export function CheckoutView() {
  const { store, user, cart } = useShop();
  return <CheckoutForm key={JSON.stringify([user?.id, store?.id, cart?.id, cart?.version])} />;
}

function CheckoutForm() {
  const shop = useShop(),
    router = useRouter();
  const slots = useResource<Slot[]>(shop.store ? `/stores/${shop.store.id}/slots` : null);
  const selectedVoucher = useSelectedVoucher();
  const [slotId, setSlotId] = useState(''),
    [received, setQuote] = useState<{ value: Quote; slotId: string; voucherCode: string } | null>(
      null,
    ),
    [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PAY_AT_PICKUP'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [uncertain, setUncertain] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const quote =
    received &&
    received.slotId === slotId &&
    received.voucherCode === shop.voucherCode &&
    shop.cart?.storeId === shop.store?.id &&
    received.value.cartVersion === shop.cart?.version
      ? received.value
      : null;
  const blockedCart = shop.cart?.items.some(cartItemNeedsAttention);
  useEffect(() => {
    setQuote(null);
  }, [shop.voucherCode]);
  async function getQuote() {
    if (!shop.cart || shop.cart.storeId !== shop.store?.id || !slotId || blockedCart) return;
    setBusy(true);
    setError(null);
    try {
      const value = await api<Quote>('/checkout/quotes', {
        method: 'POST',
        token: shop.token,
        body: {
          cartId: shop.cart.id,
          cartVersion: shop.cart.version,
          slotId,
          ...(shop.voucherCode ? { voucherCode: shop.voucherCode } : {}),
        },
      });
      setQuote({ value, slotId, voucherCode: shop.voucherCode });
    } catch (e) {
      setError(e);
      setQuote(null);
    } finally {
      setBusy(false);
    }
  }
  async function placeOrder() {
    if (!quote || !shop.store || !shop.cart || (blockedCart && !uncertain)) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<Order>('/orders', {
        method: 'POST',
        token: shop.token,
        idempotent: true,
        body: {
          quoteId: quote.id,
          paymentMethod,
          expectedCartVersion: shop.cart.version,
          expectedStoreId: shop.store.id,
        },
      });
      shop.notice(
        result.amountDueNow === 0
          ? 'Đơn đã được xác nhận.'
          : paymentMethod === 'PAY_AT_PICKUP'
            ? 'Đơn đã được tạo. Hãy thanh toán khoản cọc để cửa hàng xác nhận.'
            : 'Đơn đã được tạo. Hãy hoàn tất thanh toán online.',
      );
      router.push(`/don-hang/${result.id}`);
      shop.setVoucherCode('');
      void shop.refreshCart().catch(() => {});
    } catch (e) {
      setError(e);
      if (!(e instanceof ApiError) || e.status === 0 || e.status >= 500) setUncertain(true);
      else {
        setQuote(null);
        setUncertain(false);
      }
    } finally {
      setBusy(false);
    }
  }
  const expired = quote ? new Date(quote.expiresAt).getTime() <= now : false;
  const payment = quote ? paymentBreakdown(quote, paymentMethod) : null;
  return (
    <AccessGate>
      <div className="container retail-checkout-page retail-order-checkout-page">
        <PageTitle
          eyebrow="SẮP XONG RỒI"
          title="Hẹn giờ nhận hàng"
          subtitle="Cửa hàng sẽ soạn sẵn để bạn chỉ việc ghé nhận."
          action={
            <Link href="/gio-hang" className="text-button">
              <ArrowLeft size={15} />
              Về giỏ hàng
            </Link>
          }
        />
        <ErrorBox error={shop.cartError} retry={() => void shop.refreshCart().catch(() => {})} />
        {shop.store && !shop.cart ? (
          !shop.cartError && <Loading />
        ) : !shop.cart?.items.length ? (
          <Empty title="Chưa có sản phẩm để đặt">
            <Link className="button" href="/">
              Về cửa hàng
            </Link>
          </Empty>
        ) : (
          <div className="retail-order-checkout-grid">
            <div className="retail-checkout-main">
              <section className="panel retail-fulfillment-card">
                <div className="retail-card-heading">
                  <span className="retail-heading-icon">
                    <MapPin size={24} />
                  </span>
                  <div>
                    <h2>Thông tin nhận hàng</h2>
                    <p>Chọn cửa hàng và thời gian phù hợp với bạn</p>
                  </div>
                </div>

                <div className="retail-checkout-section">
                  <div className="retail-section-label">
                    <Store size={19} />
                    <div>
                      <strong>Địa điểm lấy hàng</strong>
                      <small>Cửa hàng đang phục vụ giỏ hàng này</small>
                    </div>
                  </div>
                  <div className="retail-store-choice">
                    <span>
                      <Store size={22} />
                    </span>
                    <div>
                      <strong>{shop.store?.name}</strong>
                      <p>{shop.store?.address}</p>
                    </div>
                    <CheckCircle2 size={20} />
                  </div>
                </div>

                <div className="retail-checkout-section">
                  <div className="retail-section-label">
                    <CalendarDays size={19} />
                    <div>
                      <strong>Thời gian nhận hàng</strong>
                      <small>Chọn một khung giờ cửa hàng còn nhận</small>
                    </div>
                  </div>
                  <ErrorBox error={slots.error} retry={slots.refresh} />
                  {slots.loading ? (
                    <Loading />
                  ) : !slots.data?.length ? (
                    <div className="warning-note">
                      Chưa có khung giờ còn nhận đơn. Quản lý có thể mở thêm khung giờ ở mục Quản lý
                      cửa hàng.
                    </div>
                  ) : (
                    <div className="slot-grid retail-slot-grid">
                      {slots.data.map((slot) => (
                        <label className="slot-option retail-slot-option" key={slot.id}>
                          <input
                            type="radio"
                            name="slot"
                            value={slot.id}
                            checked={slotId === slot.id}
                            disabled={busy || uncertain}
                            onChange={() => {
                              setSlotId(slot.id);
                              setQuote(null);
                            }}
                          />
                          <b>
                            {time(slot.startsAt)} – {time(slot.endsAt)}
                          </b>
                          <small>
                            {calendarDate(slot.startsAt)} · Còn {slot.available} suất
                          </small>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <section className="panel retail-payment-card">
                <div className="retail-card-heading compact">
                  <span className="retail-heading-icon">
                    <WalletCards size={22} />
                  </span>
                  <div>
                    <h2>Phương thức thanh toán</h2>
                    <p>Chọn khoản thanh toán ban đầu</p>
                  </div>
                </div>
                <div
                  className="payment-plan-options retail-payment-options"
                  role="radiogroup"
                  aria-label="Cách thanh toán"
                >
                  <label className="payment-plan-option">
                    <input
                      type="radio"
                      name="payment-method"
                      value="PAY_AT_PICKUP"
                      checked={paymentMethod === 'PAY_AT_PICKUP'}
                      disabled={busy || uncertain}
                      onChange={() => setPaymentMethod('PAY_AT_PICKUP')}
                    />
                    <span className="payment-plan-icon">
                      <WalletCards size={21} />
                    </span>
                    <span>
                      <strong>Đặt cọc 15% online</strong>
                      <small>Thanh toán 85% còn lại tại quầy khi nhận hàng.</small>
                    </span>
                    <b>Khuyên dùng</b>
                  </label>
                  <label className="payment-plan-option">
                    <input
                      type="radio"
                      name="payment-method"
                      value="ONLINE"
                      checked={paymentMethod === 'ONLINE'}
                      disabled={busy || uncertain}
                      onChange={() => setPaymentMethod('ONLINE')}
                    />
                    <span className="payment-plan-icon">
                      <CreditCard size={21} />
                    </span>
                    <span>
                      <strong>Thanh toán toàn bộ online</strong>
                      <small>Thanh toán 100% ngay, không cần trả thêm tại quầy.</small>
                    </span>
                  </label>
                </div>
              </section>
            </div>

            <aside className="panel summary retail-checkout-summary">
              <div className="retail-summary-title">
                <ShoppingBag size={22} />
                <div>
                  <h2>Xác nhận đơn hàng</h2>
                  <small>{shop.cart.items.length} dòng sản phẩm</small>
                </div>
              </div>
              <div className="retail-summary-items">
                {shop.cart.items.map((item) => (
                  <div className="summary-line" key={item.skuId}>
                    <span>
                      {item.quantity} × {item.name}
                    </span>
                    <ProductPrice
                      price={item.price * item.quantity}
                      originalPrice={
                        item.originalPrice ? item.originalPrice * item.quantity : undefined
                      }
                    />
                  </div>
                ))}
              </div>

              <VoucherPicker
                preview={selectedVoucher}
                disabled={busy || uncertain}
                onChange={() => setQuote(null)}
              />

              {blockedCart && (
                <p className="warning-note">
                  Có sản phẩm cần điều chỉnh. <Link href="/gio-hang">Kiểm tra giỏ hàng</Link>
                </p>
              )}
              {(!quote || (expired && !uncertain)) && (
                <button
                  className="button wide retail-quote-button"
                  disabled={!slotId || busy || uncertain || blockedCart}
                  onClick={() => void getQuote()}
                >
                  {expired ? 'Cập nhật báo giá' : 'Xem tổng thanh toán'} <ArrowRight size={16} />
                </button>
              )}

              {quote ? (
                <>
                  <div className="summary-line">
                    <span>Giảm giá</span>
                    <strong>−{money(quote.totals.discount)}</strong>
                  </div>
                  <div className="summary-line">
                    <span>Phí</span>
                    <strong>{money(quote.totals.fee)}</strong>
                  </div>
                  <div className="summary-line total">
                    <span>Tổng đơn</span>
                    <strong>{money(quote.totals.total)}</strong>
                  </div>
                  {payment && (
                    <div className="payment-breakdown" aria-label="Chi tiết thanh toán">
                      <div>
                        <span>
                          {paymentMethod === 'PAY_AT_PICKUP'
                            ? `Thanh toán cọc online (${payment.depositPercent}%)`
                            : 'Thanh toán online ngay'}
                        </span>
                        <strong>{money(payment.amountDueNow)}</strong>
                      </div>
                      <div>
                        <span>Còn lại tại quầy</span>
                        <strong>{money(payment.remainingAmount)}</strong>
                      </div>
                    </div>
                  )}
                  <small>
                    {uncertain
                      ? 'Chưa xác định được kết quả đặt đơn. Hãy kiểm tra lại giao dịch.'
                      : expired
                        ? 'Báo giá đã hết hạn. Hãy cập nhật báo giá để tiếp tục.'
                        : `Báo giá còn ${Math.max(0, Math.ceil((new Date(quote.expiresAt).getTime() - now) / 1000))} giây.`}
                  </small>
                  <button
                    className="button wide retail-primary-cta"
                    disabled={busy || ((expired || blockedCart) && !uncertain)}
                    onClick={() => void placeOrder()}
                  >
                    {busy
                      ? 'Đang xử lý…'
                      : uncertain
                        ? 'Kiểm tra lại giao dịch'
                        : paymentMethod === 'PAY_AT_PICKUP'
                          ? `Đặt đơn & tiếp tục thanh toán cọc ${money(payment?.amountDueNow)}`
                          : `Đặt đơn & tiếp tục thanh toán ${money(payment?.amountDueNow)}`}
                    <ArrowRight size={17} />
                  </button>
                </>
              ) : (
                <div className="info-note retail-quote-note">
                  <ShieldCheck size={17} />
                  <span>
                    Chọn giờ rồi bấm “Xem tổng thanh toán” để nhận giá chính xác từ cửa hàng.
                  </span>
                </div>
              )}
              <ErrorBox error={error} />
              {uncertain && (
                <div className="warning-note">
                  Chưa rõ kết quả do mất kết nối. Giữ nguyên báo giá và bấm kiểm tra lại; hệ thống
                  dùng lại cùng giao dịch để tránh tạo đơn trùng.
                </div>
              )}
            </aside>
          </div>
        )}
      </div>
    </AccessGate>
  );
}

function paymentBreakdown(quote: Quote, method: PaymentMethod): PaymentBreakdown {
  const option = quote.paymentOptions?.find((item) => item.paymentMethod === method);
  if (option) return option;
  if (method === 'ONLINE') {
    return {
      paymentMethod: method,
      paymentPlan: 'FULL_ONLINE',
      depositPercent: 0,
      depositAmount: 0,
      amountDueNow: quote.totals.total,
      remainingAmount: 0,
    };
  }
  const depositPercent = quote.depositPercent ?? 15;
  const depositAmount =
    quote.depositAmount ?? Math.ceil((quote.totals.total * depositPercent) / 100);
  return {
    paymentMethod: method,
    paymentPlan: quote.paymentPlan ?? 'DEPOSIT_15',
    depositPercent,
    depositAmount,
    amountDueNow: quote.amountDueNow ?? depositAmount,
    remainingAmount: quote.remainingAmount ?? Math.max(0, quote.totals.total - depositAmount),
  };
}
