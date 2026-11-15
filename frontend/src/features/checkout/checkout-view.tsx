'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ArrowRight, CreditCard, MapPin, ShieldCheck, WalletCards } from 'lucide-react';
import { useShop } from '@/store/shop';
import { useResource } from '@/hooks/use-resource';
import { api, ApiError } from '@/lib/api';
import { dateTime, money, time } from '@/lib/format';
import type { Order, PaymentBreakdown, PaymentMethod, Quote, Slot } from '@/types';
import { AccessGate, Empty, ErrorBox, Loading, PageTitle } from '@/components/ui';

export function CheckoutView() {
  const shop = useShop(),
    router = useRouter();
  const slots = useResource<Slot[]>(shop.store ? `/stores/${shop.store.id}/slots` : null);
  const [slotId, setSlotId] = useState(''),
    [voucher, setVoucher] = useState(''),
    [quote, setQuote] = useState<Quote | null>(null),
    [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PAY_AT_PICKUP'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [uncertain, setUncertain] = useState(false),
    [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    setQuote(null);
    setSlotId('');
    setPaymentMethod('PAY_AT_PICKUP');
    setUncertain(false);
    setError(null);
  }, [shop.store?.id, shop.user?.id, shop.cart?.version]);
  async function getQuote() {
    if (!shop.cart) return;
    setBusy(true);
    setError(null);
    try {
      setQuote(
        await api<Quote>('/checkout/quotes', {
          method: 'POST',
          token: shop.token,
          body: {
            cartId: shop.cart.id,
            cartVersion: shop.cart.version,
            slotId,
            ...(voucher.trim() ? { voucherCode: voucher.trim() } : {}),
          },
        }),
      );
    } catch (e) {
      setError(e);
      setQuote(null);
    } finally {
      setBusy(false);
    }
  }
  async function placeOrder() {
    if (!quote) return;
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
          expectedCartVersion: quote.cartVersion,
        },
      });
      shop.notice(
        paymentMethod === 'PAY_AT_PICKUP'
          ? 'Đơn đã được tạo. Hãy thanh toán khoản cọc để cửa hàng xác nhận.'
          : 'Đơn đã được tạo. Hãy hoàn tất thanh toán online.',
      );
      router.push(`/don-hang/${result.id}`);
      void shop.refreshCart();
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
      <div className="container">
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
        {!shop.cart ? (
          !shop.cartError && <Loading />
        ) : !shop.cart.items.length ? (
          <Empty title="Chưa có sản phẩm để đặt">
            <Link className="button" href="/">
              Về cửa hàng
            </Link>
          </Empty>
        ) : (
          <div className="checkout-grid">
            <div className="stack">
              <section className="panel">
                <h2 className="form-section-title">
                  <span className="step-number">1</span>Nhận tại cửa hàng
                </h2>
                <div className="row">
                  <MapPin size={22} />
                  <div>
                    <strong>{shop.store?.name}</strong>
                    <p className="muted">{shop.store?.address}</p>
                  </div>
                </div>
              </section>
              <section className="panel">
                <h2 className="form-section-title">
                  <span className="step-number">2</span>Chọn khung giờ
                </h2>
                <ErrorBox error={slots.error} retry={slots.refresh} />
                {slots.loading ? (
                  <Loading />
                ) : !slots.data?.length ? (
                  <div className="warning-note">
                    Chưa có khung giờ còn nhận đơn. Quản lý có thể mở thêm khung giờ ở mục Quản lý
                    cửa hàng.
                  </div>
                ) : (
                  <div className="slot-grid">
                    {slots.data.map((slot) => (
                      <label className="slot-option" key={slot.id}>
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
                          {dateTime(slot.startsAt).split(' ')[0]} · Còn {slot.available} suất
                        </small>
                      </label>
                    ))}
                  </div>
                )}
              </section>
              <section className="panel form-stack">
                <h2 className="form-section-title">
                  <span className="step-number">3</span>Ưu đãi & cách thanh toán
                </h2>
                <label>
                  Mã ưu đãi
                  <input
                    placeholder="Nhập voucher nếu có"
                    value={voucher}
                    disabled={busy || uncertain}
                    onChange={(e) => {
                      setVoucher(e.target.value);
                      setQuote(null);
                    }}
                    maxLength={40}
                  />
                </label>
                <div
                  className="payment-plan-options"
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
                <button
                  className="button secondary"
                  disabled={!slotId || busy || uncertain}
                  onClick={() => void getQuote()}
                >
                  Xem tổng thanh toán <ArrowRight size={16} />
                </button>
              </section>
            </div>
            <aside className="panel summary">
              <h2>Xác nhận túi của bạn</h2>
              {shop.cart.items.map((item) => (
                <div className="summary-line" key={item.skuId}>
                  <span>
                    {item.quantity} × {item.name}
                  </span>
                  <strong>{money(item.price * item.quantity)}</strong>
                </div>
              ))}
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
                    {expired
                      ? 'Báo giá đã hết hạn. Vui lòng xem lại tổng thanh toán.'
                      : `Báo giá còn ${Math.max(0, Math.ceil((new Date(quote.expiresAt).getTime() - now) / 1000))} giây.`}
                  </small>
                  <button
                    className="button wide"
                    disabled={busy || (expired && !uncertain)}
                    onClick={() => void placeOrder()}
                  >
                    {busy
                      ? 'Đang xử lý…'
                      : uncertain
                        ? 'Kiểm tra lại giao dịch'
                        : paymentMethod === 'PAY_AT_PICKUP'
                          ? `Đặt đơn & thanh toán cọc ${money(payment?.amountDueNow)}`
                          : `Đặt đơn & thanh toán ${money(payment?.amountDueNow)}`}
                    <ArrowRight size={17} />
                  </button>
                </>
              ) : (
                <div className="info-note">
                  <ShieldCheck size={17} style={{ marginBottom: 7 }} />
                  Chọn giờ rồi bấm “Xem tổng thanh toán” để nhận giá chính xác từ cửa hàng.
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
