'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Minus, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { useShop } from '@/store/shop';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { AccessGate, Empty, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { ProductArt } from '@/components/product-art';

export function CartView() {
  const shop = useShop(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null);
  useEffect(() => {
    void shop.refreshCart().catch(() => {});
  }, [shop.refreshCart]);
  async function change(skuId: string, quantity: number) {
    if (!shop.cart || !shop.store) return;
    setBusy(true);
    setError(null);
    try {
      await api(`/cart/items/${skuId}`, {
        method: quantity ? 'PUT' : 'DELETE',
        token: shop.token,
        body: {
          storeId: shop.store.id,
          ...(quantity ? { quantity } : {}),
          expectedVersion: shop.cart.version,
        },
      });
      await shop.refreshCart();
    } catch (e) {
      setError(e);
      await shop.refreshCart().catch(() => {});
    } finally {
      setBusy(false);
    }
  }
  const total = shop.cart?.items.reduce((sum, item) => sum + item.price * item.quantity, 0) ?? 0;
  return (
    <AccessGate>
      <div className="container">
        <PageTitle
          eyebrow="TÚI TƯƠI NGON CỦA BẠN"
          title="Giỏ hàng"
          subtitle={
            shop.store
              ? `Các món được chọn tại ${shop.store.name}.`
              : 'Hãy chọn cửa hàng ở đầu trang.'
          }
          action={
            <Link href="/" className="text-button">
              <ArrowLeft size={15} />
              Mua thêm
            </Link>
          }
        />
        <ErrorBox
          error={error ?? shop.cartError}
          retry={() => void shop.refreshCart().catch(() => {})}
        />
        {!shop.cart ? (
          !shop.cartError && <Loading />
        ) : !shop.cart.items.length ? (
          <div className="panel">
            <Empty title="Giỏ hàng đang chờ những món ngon">
              <p>Chọn một vài món cho bữa ăn hôm nay nhé.</p>
              <Link href="/" className="button">
                Khám phá cửa hàng <ArrowRight size={16} />
              </Link>
            </Empty>
          </div>
        ) : (
          <div className="checkout-grid">
            <div className="panel">
              {shop.cart.items.map((item) => (
                <div className="cart-item" key={item.skuId}>
                  <ProductArt name={item.name} />
                  <div>
                    <h3>{item.name}</h3>
                    <small>
                      {item.code} · {money(item.price)} / đơn vị
                    </small>
                    <div className="quantity">
                      <button
                        disabled={busy}
                        aria-label={`Giảm ${item.name}`}
                        onClick={() => void change(item.skuId, item.quantity - 1)}
                      >
                        <Minus size={13} />
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        disabled={busy || item.quantity >= item.available}
                        aria-label={`Tăng ${item.name}`}
                        onClick={() => void change(item.skuId, item.quantity + 1)}
                      >
                        <Plus size={13} />
                      </button>
                    </div>
                    {item.quantity > item.available && (
                      <small className="danger-text">
                        Hiện chỉ còn {item.available} đơn vị. Vui lòng giảm số lượng.
                      </small>
                    )}
                  </div>
                  <div className="cart-item-right">
                    <strong>{money(item.price * item.quantity)}</strong>
                    <button
                      className="icon-button"
                      aria-label={`Xóa ${item.name}`}
                      disabled={busy}
                      onClick={() => void change(item.skuId, 0)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <aside className="panel summary">
              <h2>Giỏ hôm nay</h2>
              <div className="summary-line">
                <span>Số lượng</span>
                <strong>{shop.cart.items.reduce((sum, item) => sum + item.quantity, 0)} món</strong>
              </div>
              <div className="summary-line">
                <span>Tạm tính</span>
                <strong>{money(total)}</strong>
              </div>
              <div className="summary-line total">
                <span>Tổng tạm tính</span>
                <strong>{money(total)}</strong>
              </div>
              <Link className="button wide" href="/thanh-toan">
                Chọn giờ & đặt hàng <ArrowRight size={17} />
              </Link>
              <p className="muted" style={{ fontSize: 11, marginTop: 17 }}>
                <ShieldCheck size={14} style={{ display: 'inline', marginRight: 5 }} />
                Giá, voucher và tồn sẽ được xác nhận trước khi đặt.
              </p>
            </aside>
          </div>
        )}
      </div>
    </AccessGate>
  );
}
