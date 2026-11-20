'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Home,
  MapPin,
  Minus,
  PackageCheck,
  Plus,
  ShieldCheck,
  ShoppingCart,
  Store as StoreIcon,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { useShop } from '@/store/shop';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { AccessGate, Empty, ErrorBox, Loading } from '@/components/ui';
import { ProductArt } from '@/components/product-art';
import { ProductPrice } from '@/components/product-price';
import { useSelectedVoucher, VoucherPicker } from '@/features/promotions/voucher-picker';

const cartUnitLabels: Record<string, string> = {
  piece: 'Cái / đơn vị',
  pack: 'Gói',
  box: 'Hộp',
  bottle: 'Chai',
  case: 'Thùng',
  multipack: 'Lốc',
  kg: 'Kilogram (kg)',
  g: 'Gram (g)',
  l: 'Lít',
  ml: 'Mililít',
};

function cartUnitLabel(unit: string) {
  return cartUnitLabels[unit] ?? unit;
}

export function CartView() {
  const voucher = useSelectedVoucher();
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
  const hasStockIssue = shop.cart?.items.some((item) => item.quantity > item.available) ?? false;
  return (
    <AccessGate>
      <div className="container retail-checkout-page retail-cart-page">
        <nav className="retail-cart-breadcrumb" aria-label="Đường dẫn trang">
          <Link href="/">
            <Home size={16} /> Cửa hàng
          </Link>
          <ChevronRight size={15} aria-hidden="true" />
          <span>Giỏ hàng & thanh toán</span>
        </nav>
        <ErrorBox
          error={error ?? shop.cartError}
          retry={() => {
            setError(null);
            void shop.refreshCart().catch(() => {});
          }}
        />
        {shop.store && !shop.cart ? (
          !shop.cartError && <Loading />
        ) : !shop.cart?.items.length ? (
          <div className="panel">
            <Empty
              title={shop.store ? 'Giỏ hàng đang chờ những món ngon' : 'Chọn cửa hàng nhận hàng'}
            >
              <p>
                {shop.store
                  ? 'Chọn một vài món cho bữa ăn hôm nay nhé.'
                  : 'Mỗi cửa hàng có giỏ hàng riêng. Hãy chọn cửa hàng ở đầu trang để xem giỏ.'}
              </p>
              <Link href="/" className="button">
                Khám phá cửa hàng <ArrowRight size={16} />
              </Link>
            </Empty>
          </div>
        ) : (
          <div className="retail-cart-grid">
            <div className="retail-cart-main">
              <section className="panel retail-cart-card">
                <div className="retail-card-heading">
                  <span className="retail-heading-icon">
                    <ShoppingCart size={24} />
                  </span>
                  <div>
                    <h2>Giỏ hàng của bạn</h2>
                    <p>
                      {shop.cart.items.length} sản phẩm · {shop.store?.name}
                    </p>
                  </div>
                </div>
                <div className="retail-cart-lines">
                  {shop.cart.items.map((item) => (
                    <article className="retail-cart-line" key={item.skuId}>
                      <span className="retail-selected-check" aria-hidden="true">
                        <Check size={16} />
                      </span>
                      <div className="retail-cart-art">
                        {item.imageUrl ? (
                          <img
                            className="retail-cart-product-image"
                            src={item.imageUrl}
                            alt={`Ảnh ${item.name}`}
                          />
                        ) : (
                          <ProductArt name={item.name} />
                        )}
                      </div>
                      <div className="retail-cart-copy">
                        <h3>{item.name}</h3>
                        <small>
                          {cartUnitLabel(item.unit)} · {item.code}
                        </small>
                        <div className="retail-unit-price">
                          <ProductPrice price={item.price} originalPrice={item.originalPrice} />
                        </div>
                        {item.quantity > item.available && (
                          <small className="danger-text">
                            Hiện chỉ còn {item.available} đơn vị. Vui lòng giảm số lượng.
                          </small>
                        )}
                      </div>
                      <div className="quantity retail-cart-quantity">
                        <button
                          disabled={busy}
                          aria-label={`Giảm ${item.name}`}
                          onClick={() => void change(item.skuId, item.quantity - 1)}
                        >
                          <Minus size={14} />
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          disabled={busy || item.quantity >= item.available}
                          aria-label={`Tăng ${item.name}`}
                          onClick={() => void change(item.skuId, item.quantity + 1)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                      <strong className="retail-line-total">
                        {money(item.price * item.quantity)}
                      </strong>
                      <button
                        className="retail-remove-button"
                        aria-label={`Xóa ${item.name}`}
                        disabled={busy}
                        onClick={() => void change(item.skuId, 0)}
                      >
                        <Trash2 size={18} />
                      </button>
                    </article>
                  ))}
                </div>
                <div className="retail-cart-card-footer">
                  <span className={hasStockIssue ? 'danger-text' : undefined}>
                    <span className="retail-selected-check" aria-hidden="true">
                      {hasStockIssue ? <TriangleAlert size={15} /> : <Check size={15} />}
                    </span>
                    {hasStockIssue
                      ? 'Hãy giảm số lượng các sản phẩm đang thiếu tồn kho'
                      : 'Tất cả sản phẩm đã sẵn sàng đặt'}
                  </span>
                  <Link href="/" className="text-button">
                    <Plus size={15} /> Mua thêm sản phẩm
                  </Link>
                </div>
              </section>

              <section className="panel retail-cart-benefits" aria-label="Lợi ích khi đặt hàng">
                <div className="retail-benefit-heading">
                  <ShieldCheck size={24} />
                  <h2>Lợi ích khi đặt hàng online tại ShopGo</h2>
                </div>
                <div className="retail-benefit-grid">
                  <div>
                    <span>
                      <Clock3 size={23} />
                    </span>
                    <strong>Tiết kiệm thời gian</strong>
                    <p>Đặt trước, ghé cửa hàng và nhận đúng khung giờ.</p>
                  </div>
                  <div>
                    <span>
                      <PackageCheck size={23} />
                    </span>
                    <strong>Được soạn sẵn</strong>
                    <p>Cửa hàng chuẩn bị và kiểm tra đơn trước khi nhận.</p>
                  </div>
                  <div>
                    <span>
                      <ShieldCheck size={23} />
                    </span>
                    <strong>An toàn, rõ ràng</strong>
                    <p>Giá và tồn kho được xác nhận trước khi đặt.</p>
                  </div>
                </div>
              </section>
            </div>

            <aside className="retail-cart-aside">
              <section className="panel retail-pickup-preview">
                <div className="retail-card-heading compact">
                  <span className="retail-heading-icon">
                    <MapPin size={22} />
                  </span>
                  <div>
                    <h2>Thông tin nhận hàng</h2>
                    <p>Click & Collect tại cửa hàng</p>
                  </div>
                </div>
                <div className="retail-pickup-row">
                  <span className="retail-pickup-row-icon">
                    <StoreIcon size={18} />
                  </span>
                  <div>
                    <small>Địa điểm lấy hàng</small>
                    <strong>{shop.store?.name}</strong>
                    <p>{shop.store?.address}</p>
                  </div>
                </div>
                <div className="retail-pickup-row muted-row">
                  <span className="retail-pickup-row-icon">
                    <Clock3 size={18} />
                  </span>
                  <div>
                    <small>Thời gian nhận hàng</small>
                    <strong>Chọn ở bước tiếp theo</strong>
                  </div>
                </div>
              </section>
              <section className="panel summary retail-cart-summary">
                <h2>Tóm tắt giỏ hàng</h2>
                <VoucherPicker preview={voucher} disabled={busy} />
                <div className="summary-line">
                  <span>Số lượng</span>
                  <strong>
                    {shop.cart.items.reduce((sum, item) => sum + item.quantity, 0)} món
                  </strong>
                </div>
                <div className="summary-line">
                  <span>Tạm tính</span>
                  <strong>{money(total)}</strong>
                </div>
                <div className="summary-line">
                  <span>Phí chuẩn bị</span>
                  <strong className="retail-free">Xác nhận sau</strong>
                </div>
                {voucher.discount > 0 && (
                  <div className="summary-line">
                    <span>Giảm giá</span>
                    <strong className="voucher-saving">−{money(voucher.discount)}</strong>
                  </div>
                )}
                <div className="summary-line total">
                  <span>Tổng tạm tính</span>
                  <strong>{money(total - voucher.discount)}</strong>
                </div>
                {hasStockIssue ? (
                  <button className="button wide retail-primary-cta" type="button" disabled>
                    Điều chỉnh số lượng để tiếp tục
                  </button>
                ) : (
                  <Link className="button wide retail-primary-cta" href="/thanh-toan">
                    Tiếp tục đặt hàng <ArrowRight size={18} />
                  </Link>
                )}
                <p className="retail-secure-note">
                  <ShieldCheck size={15} /> Giá, voucher và tồn kho được backend xác nhận trước khi
                  đặt.
                </p>
              </section>
            </aside>
          </div>
        )}
      </div>
    </AccessGate>
  );
}
