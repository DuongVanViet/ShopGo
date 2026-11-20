'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  Beef,
  Building2,
  CalendarDays,
  Carrot,
  CheckCircle2,
  Clock3,
  Egg,
  Grid2X2,
  Leaf,
  MapPin,
  Milk,
  PackageCheck,
  Percent,
  Plus,
  RotateCcw,
  Search,
  SlidersHorizontal,
  ShoppingBag,
  Store as StoreIcon,
  Tag,
  Wheat,
} from 'lucide-react';
import { useShop } from '@/store/shop';
import { useResource } from '@/hooks/use-resource';
import { api, query } from '@/lib/api';
import { isCustomerUser } from '@/lib/access';
import type { Category, Page, Product, Store } from '@/types';
import { GroceryArt, productKind } from '@/components/product-art';
import { ProductVisual } from '@/components/product-visual';
import { Empty, ErrorBox, Loading, Modal } from '@/components/ui';
import { StorePicker, StorePickerDialog } from '@/components/store-picker';
import { FavoriteToggle } from '@/features/favorites/favorite-toggle';
import { favoriteKey, useFavorites } from '@/features/favorites/use-favorites';
import { StoreOffers } from '@/features/promotions/voucher-picker';
import { ProductPrice } from '@/components/product-price';

type SearchScope = 'auto' | 'all' | 'store';
type StoreDestination = 'san-pham' | 'uu-dai';

function productStore(product: Product, selectedStore: Store | null) {
  return product.store ?? selectedStore;
}

function expiryLabel(value: string) {
  return new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(`${value}T00:00:00+07:00`));
}

export function Catalog() {
  const shop = useShop();
  const favorites = useFavorites();
  const [search, setSearch] = useState(''),
    [debounced, setDebounced] = useState(''),
    [searchScope, setSearchScope] = useState<SearchScope>('auto'),
    [category, setCategory] = useState(''),
    [onlyStock, setOnlyStock] = useState(false),
    [cursor, setCursor] = useState('');
  const limit = 20;
  const [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Product | null>(null);
  const [storeDestination, setStoreDestination] = useState<StoreDestination | null>(null);
  const [scrollTarget, setScrollTarget] = useState<StoreDestination | null>(null);
  const activeSearchScope = shop.store && searchScope !== 'all' ? 'store' : 'all';
  useEffect(() => {
    if (!scrollTarget) return;
    const target = document.getElementById(scrollTarget);
    if (!target) return;
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
    target.focus({ preventScroll: true });
    setScrollTarget(null);
  }, [scrollTarget, activeSearchScope, shop.store?.id]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setCursor('');
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initialSearch = params.get('q');
    if (initialSearch) setSearch(initialSearch);
    const initialScope = params.get('scope');
    if (initialScope === 'all' || initialScope === 'store') setSearchScope(initialScope);
    const receiveHeaderSearch = (event: Event) => {
      const detail = (event as CustomEvent<string | { query?: string; scope?: 'all' | 'store' }>)
        .detail;
      if (typeof detail === 'string') {
        setSearch(detail);
      } else {
        setSearch(detail?.query ?? '');
        if (detail?.scope) setSearchScope(detail.scope);
      }
      requestAnimationFrame(() =>
        document.getElementById('san-pham')?.scrollIntoView({ behavior: 'smooth' }),
      );
    };
    window.addEventListener('shopgo:header-search', receiveHeaderSearch);
    window.addEventListener('shopgo:pickup-store-selected', showStoreCatalog);
    return () => {
      window.removeEventListener('shopgo:header-search', receiveHeaderSearch);
      window.removeEventListener('shopgo:pickup-store-selected', showStoreCatalog);
    };
  }, []);
  useEffect(() => {
    setCursor('');
    setSelected(null);
  }, [shop.store?.id, category, onlyStock, activeSearchScope]);
  const categories = useResource<Category[]>(
    activeSearchScope === 'store' && shop.store
      ? `/stores/${shop.store.id}/categories`
      : '/categories',
  );
  const products = useResource<Page<Product>>(
    activeSearchScope === 'store' && shop.store
      ? `/stores/${shop.store.id}/products?${query({ limit, cursor, q: debounced, categoryId: category, inStock: onlyStock ? true : undefined })}`
      : `/products?${query({ limit, cursor, q: debounced, categoryId: category, inStock: onlyStock ? true : undefined })}`,
    30000,
  );
  const selectedProductStore = selected ? productStore(selected, shop.store) : null;
  function favoriteButton(product: Product, store: Store | null, inline = false) {
    if (!store || (shop.user && !isCustomerUser(shop.user))) return null;
    const offer = { ...product, store, sellable: true };
    return (
      <FavoriteToggle
        name={product.name}
        saved={favorites.keys.has(favoriteKey(offer))}
        disabled={favorites.busy}
        inline={inline}
        onToggle={() => void favorites.toggle(offer)}
      />
    );
  }
  function showStoreCatalog() {
    setSearchScope('auto');
    setSearch('');
    setDebounced('');
    setCategory('');
    setOnlyStock(false);
    setCursor('');
    setSelected(null);
    setScrollTarget('san-pham');
  }
  function openStoreSection(destination: StoreDestination) {
    if (!isCustomerUser(shop.user)) {
      shop.openAuth();
      return;
    }
    if (!shop.store) {
      setStoreDestination(destination);
      return;
    }
    showStoreCatalog();
    setScrollTarget(destination);
  }
  async function enterProductStore(storeId: string) {
    setBusy(true);
    try {
      if (await shop.openStore(storeId)) showStoreCatalog();
    } finally {
      setBusy(false);
    }
  }
  async function add(product: Product) {
    if (!shop.token) {
      shop.openAuth();
      return;
    }
    const offerStore = productStore(product, shop.store);
    if (!shop.store || !offerStore || offerStore.id !== shop.store.id) {
      if (offerStore) await enterProductStore(offerStore.id);
      return;
    }
    setBusy(true);
    try {
      const cart = await shop.refreshCart();
      if (!cart) return;
      const quantity = (cart.items.find((item) => item.skuId === product.id)?.quantity ?? 0) + 1;
      await api(`/cart/items/${product.id}`, {
        method: 'PUT',
        token: shop.token,
        body: { storeId: shop.store.id, quantity, expectedVersion: cart.version },
      });
      await shop.refreshCart();
      shop.notice(`Đã thêm ${product.name} vào giỏ.`);
    } catch (error) {
      shop.notice(error instanceof Error ? error.message : 'Chưa thêm được sản phẩm.', true);
    } finally {
      setBusy(false);
    }
  }
  const icons = [Carrot, Beef, Egg, Wheat, Milk];
  return (
    <div className="container home shopgo-retail-home">
      <section className="shopgo-retail-hero">
        <div className="shopgo-retail-hero-copy">
          <p className="shopgo-retail-kicker">ĐẶT HÀNG SIÊU THỊ ONLINE</p>
          <h1>
            Chọn hàng trước
            <span>Đến lấy sau</span>
          </h1>
          <p>
            Mua sắm nhanh chóng, không cần xếp hàng, tránh đông người và chủ động thời gian của bạn.
          </p>
          <div className="shopgo-retail-hero-points" aria-label="Lợi ích ShopGo">
            <span>
              <CheckCircle2 size={18} /> Đặt hàng nhanh
            </span>
            <span>
              <Clock3 size={18} /> Nhận đúng hẹn
            </span>
            <span>
              <PackageCheck size={18} /> Không xếp hàng
            </span>
          </div>
          <a href="#san-pham" className="button shopgo-retail-hero-action">
            <ShoppingBag size={19} /> Đặt hàng ngay <ArrowRight size={17} />
          </a>
        </div>
        <div
          className="shopgo-retail-hero-media"
          role="img"
          aria-label="Khách hàng đặt trước thực phẩm và đến siêu thị nhận hàng"
        >
          <GroceryArt />
          <div className="shopgo-retail-floating-card card-order">
            <ShoppingBag size={20} />
            <span>Đặt hàng online</span>
            <CheckCircle2 size={16} />
          </div>
          <div className="shopgo-retail-floating-card card-time">
            <Clock3 size={21} />
            <span>Chọn giờ lấy hàng</span>
          </div>
          <div className="shopgo-retail-floating-card card-pickup">
            <MapPin size={21} />
            <span>Đến điểm lấy hàng</span>
          </div>
        </div>
      </section>

      <section
        className={`shopgo-retail-shop-tools${isCustomerUser(shop.user) ? '' : ' without-picker'}`}
        aria-label="Tìm kiếm sản phẩm"
      >
        <div className="shopgo-retail-search-box">
          <div className="shopgo-retail-search-scope" role="group" aria-label="Phạm vi tìm kiếm">
            <button
              type="button"
              className={activeSearchScope === 'all' ? 'active' : ''}
              aria-pressed={activeSearchScope === 'all'}
              onClick={() => {
                setSearchScope('all');
                setCategory('');
                setCursor('');
              }}
            >
              <Building2 size={16} />
              <span>
                <strong>Toàn ShopGo</strong>
                <small>Tất cả cửa hàng</small>
              </span>
            </button>
            <button
              type="button"
              className={activeSearchScope === 'store' ? 'active' : ''}
              aria-pressed={activeSearchScope === 'store'}
              disabled={!shop.store}
              onClick={() => {
                setSearchScope('store');
                setCategory('');
                setCursor('');
              }}
            >
              <StoreIcon size={16} />
              <span>
                <strong>Trong cửa hàng</strong>
                <small>{shop.store?.name ?? 'Chọn cửa hàng trước'}</small>
              </span>
            </button>
          </div>
          <form
            className="shopgo-retail-main-search"
            role="search"
            onSubmit={(event) => {
              event.preventDefault();
              setDebounced(search.trim());
              setCursor('');
              document.getElementById('san-pham')?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <Search size={23} />
            <input
              aria-label="Tìm sản phẩm"
              placeholder={
                activeSearchScope === 'store' && shop.store
                  ? `Tìm trong ${shop.store.name}…`
                  : 'Tìm sản phẩm ở tất cả cửa hàng…'
              }
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button type="submit">Tìm kiếm</button>
          </form>
        </div>
        {isCustomerUser(shop.user) && (
          <div className="shopgo-retail-pickup-select">
            <StorePicker onSelect={showStoreCatalog} />
          </div>
        )}
      </section>

      {activeSearchScope === 'store' && shop.store && (
        <StoreOffers key={shop.store.id} storeId={shop.store.id} />
      )}
      <section className="shopgo-retail-category-strip" aria-label="Danh mục nổi bật">
        <button
          className={!category ? 'active' : ''}
          onClick={() => {
            setCategory('');
            setCursor('');
          }}
        >
          <Grid2X2 size={24} />
          <span>Tất cả danh mục</span>
        </button>
        {categories.data?.slice(0, 8).map((item) => {
          const Icon = icons[productKind(item.name)] ?? Grid2X2;
          return (
            <button
              key={item.id}
              className={category === item.id ? 'active' : ''}
              onClick={() => {
                setCategory(item.id);
                setCursor('');
                document.getElementById('san-pham')?.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              <Icon size={25} />
              <span>{item.name}</span>
            </button>
          );
        })}
      </section>

      <section className="shopgo-retail-promo-grid" aria-label="Thông tin mua sắm">
        <article className="promo-sale">
          <div>
            <small>KHUYẾN MÃI SHOPGO</small>
            <h2 id="store-offers-card-title">Ưu đãi từ cửa hàng</h2>
            <p>Chọn cửa hàng và xem các mã giảm giá dành cho giỏ hàng của bạn.</p>
          </div>
          <Percent size={68} aria-hidden="true" />
          <button
            type="button"
            className="store-card-action"
            aria-labelledby="store-offers-card-title"
            onClick={() => openStoreSection('uu-dai')}
          />
        </article>
        <article className="promo-pickup">
          <div>
            <small>CLICK & COLLECT</small>
            <h2 id="store-shopping-card-title">Mua sắm thông minh</h2>
            <p>Chọn cửa hàng, đặt giờ nhận và theo dõi đơn ngay trong ShopGo.</p>
          </div>
          <StoreIcon size={66} aria-hidden="true" />
          <button
            type="button"
            className="store-card-action"
            aria-labelledby="store-shopping-card-title"
            onClick={() => openStoreSection('san-pham')}
          />
        </article>
        <Link href="/huong-dan" className="promo-guide">
          <div>
            <small>CHỈ 3 BƯỚC</small>
            <h2>Nhận hàng tiện lợi</h2>
            <span className="promo-guide-action">Xem hướng dẫn</span>
          </div>
          <CalendarDays size={64} aria-hidden="true" />
        </Link>
      </section>

      <div className="benefits shopgo-retail-benefits">
        <div className="benefit">
          <span>
            <Leaf size={20} />
          </span>
          <div>
            <strong id="store-products-card-title">Hàng hóa theo cửa hàng</strong>
            <p>Giá và tồn kho hiển thị theo từng chi nhánh</p>
          </div>
          <button
            type="button"
            className="store-card-action"
            aria-labelledby="store-products-card-title"
            onClick={() => openStoreSection('san-pham')}
          />
        </div>
        <Link href="/thanh-toan" className="benefit">
          <span>
            <Clock3 size={20} />
          </span>
          <div>
            <strong>Chủ động thời gian nhận</strong>
            <p>Chọn khung giờ phù hợp với bạn</p>
          </div>
        </Link>
        <Link href="/don-hang" className="benefit">
          <span>
            <CheckCircle2 size={20} />
          </span>
          <div>
            <strong>Nhận hàng an toàn</strong>
            <p>Mã QR dùng một lần giúp nhận đúng đơn</p>
          </div>
        </Link>
      </div>

      <section className="catalog shopgo-retail-catalog" id="san-pham" tabIndex={-1}>
        <div className="catalog-heading shopgo-retail-catalog-heading">
          <div>
            <p className="eyebrow">MUA SẮM TẠI SHOPGO</p>
            <h2>Hôm nay, bạn cần gì?</h2>
          </div>
          <p>
            {products.data
              ? `${products.data.items.length} sản phẩm đang hiển thị`
              : 'Đang tải sản phẩm'}
            {activeSearchScope === 'store' && shop.store
              ? ` tại ${shop.store.name}`
              : ' từ tất cả cửa hàng'}
          </p>
        </div>
        <div className="catalog-layout shopgo-retail-catalog-layout">
          <aside className="shopgo-retail-filter-panel">
            <div className="shopgo-retail-filter-title">
              <SlidersHorizontal size={19} />
              <strong>Bộ lọc sản phẩm</strong>
            </div>
            <div className="category-menu" aria-label="Danh mục sản phẩm">
              <h3>Danh mục</h3>
              <button
                className={!category ? 'active' : ''}
                onClick={() => {
                  setCategory('');
                  setCursor('');
                }}
              >
                <Grid2X2 size={17} />
                Tất cả sản phẩm
              </button>
              {categories.data?.map((item, index) => {
                const Icon = icons[productKind(item.name)] ?? Grid2X2;
                return (
                  <button
                    key={item.id}
                    className={category === item.id ? 'active' : ''}
                    onClick={() => {
                      setCategory(item.id);
                      setCursor('');
                    }}
                  >
                    <Icon size={17} />
                    {item.name}
                  </button>
                );
              })}
            </div>
            <div className="shopgo-retail-stock-filter">
              <h3>Tình trạng hàng</h3>
              <label>
                <input
                  type="checkbox"
                  checked={onlyStock}
                  onChange={(event) => setOnlyStock(event.target.checked)}
                />
                <span>Chỉ hiển thị còn hàng</span>
              </label>
            </div>
            <div className="shopgo-retail-coming-filter">
              <Tag size={18} />
              <div>
                <strong>Thương hiệu & khoảng giá</strong>
                <small>Sắp ra mắt khi dữ liệu sản phẩm được bổ sung.</small>
              </div>
            </div>
            <button
              className="shopgo-retail-reset-filter"
              onClick={() => {
                setSearch('');
                setCategory('');
                setOnlyStock(false);
              }}
            >
              <RotateCcw size={16} /> Xóa tất cả bộ lọc
            </button>
            <div className="pickup-note shopgo-retail-pickup-note">
              <ShoppingBag size={27} strokeWidth={1.5} />
              <h3>Đặt trước, nhận nhanh</h3>
              <p>Chọn món và khung giờ, ShopGo sẽ chuẩn bị đơn trước khi bạn đến.</p>
            </div>
          </aside>
          <div className="shopgo-retail-product-results">
            <div className="catalog-toolbar shopgo-retail-catalog-toolbar">
              <span>
                <Grid2X2 size={17} />
                {debounced ? `Kết quả cho “${debounced}”` : 'Tất cả sản phẩm'}
              </span>
              <small>
                {activeSearchScope === 'store' && shop.store
                  ? `Trong ${shop.store.name}`
                  : 'Trên toàn ShopGo'}
              </small>
            </div>
            <ErrorBox error={products.error} retry={products.refresh} />
            {products.loading && !products.data ? (
              <Loading />
            ) : products.data?.items.length === 0 ? (
              <Empty title="Chưa tìm thấy món bạn cần">
                <div className="shopgo-retail-empty-actions">
                  {activeSearchScope === 'store' && (
                    <button
                      className="button secondary small"
                      onClick={() => {
                        setSearchScope('all');
                        setCategory('');
                        setCursor('');
                      }}
                    >
                      Tìm trong tất cả cửa hàng
                    </button>
                  )}
                  <button
                    className="text-button"
                    onClick={() => {
                      setSearch('');
                      setDebounced('');
                      setCategory('');
                      setOnlyStock(false);
                    }}
                  >
                    Xem tất cả sản phẩm
                  </button>
                </div>
              </Empty>
            ) : (
              <div className="product-grid">
                {products.data?.items.map((product) => {
                  const offerStore = productStore(product, shop.store);
                  const isInsideStore = activeSearchScope === 'store' && !!offerStore;
                  return (
                    <article
                      className="product-card shopgo-retail-product-card"
                      key={`${offerStore?.id ?? 'unknown'}:${product.id}`}
                    >
                      {favoriteButton(product, offerStore)}
                      <button
                        className={`product-picture${product.imageUrl ? ' has-image' : ''}`}
                        onClick={() => setSelected(product)}
                        aria-label={`Xem ${product.name}`}
                      >
                        <ProductVisual product={product} />
                      </button>
                      <div className="product-info">
                        <button className="product-name" onClick={() => setSelected(product)}>
                          {product.name}
                        </button>
                        <p>
                          {product.unit === 'piece' ? '1 đơn vị' : product.unit} · {product.code}
                        </p>
                        {offerStore && (
                          <div className="product-store-line">
                            <MapPin size={13} />
                            <span>
                              <span>
                                Bán bởi <strong>{offerStore.name}</strong>
                              </span>
                              <small>{offerStore.address}</small>
                            </span>
                          </div>
                        )}
                        <span className={`stock-tag ${product.available <= 0 ? 'sold' : ''}`}>
                          {product.available <= 0
                            ? 'Tạm hết hàng'
                            : product.available <= 5
                              ? `Chỉ còn ${product.available}`
                              : 'Còn hàng'}
                        </span>
                        {product.expiresOn && (
                          <span className="shopgo-retail-product-expiry">
                            <CalendarDays size={12} /> HSD {expiryLabel(product.expiresOn)}
                          </span>
                        )}
                        <div className="product-bottom">
                          <ProductPrice
                            price={product.price}
                            originalPrice={product.originalPrice}
                          />
                          {isInsideStore ? (
                            <button
                              className="add-button"
                              aria-label={`Thêm ${product.name}`}
                              disabled={busy || product.available <= 0}
                              onClick={() => void add(product)}
                            >
                              <ShoppingBag size={17} />
                              <span>Thêm vào giỏ</span>
                            </button>
                          ) : (
                            <button
                              className="visit-store-button"
                              aria-label={`Vào cửa hàng ${offerStore?.name ?? ''} và xem sản phẩm khác`}
                              disabled={!offerStore || busy}
                              onClick={() => offerStore && void enterProductStore(offerStore.id)}
                            >
                              Xem cửa hàng & sản phẩm khác <ArrowRight size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
            {(products.data?.nextCursor || cursor) && (
              <div className="load-more">
                {cursor && (
                  <button
                    className="button secondary small"
                    style={{ marginRight: 12 }}
                    onClick={() => setCursor('')}
                  >
                    Về trang đầu
                  </button>
                )}
                {products.data?.nextCursor && (
                  <button
                    className="button secondary small"
                    disabled={products.loading}
                    onClick={() => {
                      setCursor(products.data!.nextCursor!);
                      document.getElementById('san-pham')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                  >
                    Xem thêm sản phẩm <ArrowDown size={14} />
                  </button>
                )}
              </div>
            )}
            <p className="illustration-note">
              Ảnh do cửa hàng cung cấp hoặc hình minh họa · Giá và tồn kho được cập nhật từ cửa
              hàng.
            </p>
          </div>
        </div>
      </section>
      <section className="journey shopgo-retail-journey">
        <h2>Đặt hàng và nhận hàng chỉ với 3 bước</h2>
        {[
          ['01', 'Chọn sản phẩm', 'Mua sắm online như tại siêu thị'],
          ['02', 'Chọn cửa hàng & thời gian', 'Chọn điểm lấy hàng và khung giờ phù hợp'],
          ['03', 'Đến nhận hàng', 'Lấy hàng nhanh chóng, không cần xếp hàng'],
        ].map(([step, title, copy]) => (
          <div className="journey-step" key={step}>
            <b>{step}</b>
            <div>
              <h3>{title}</h3>
              <p>{copy}</p>
            </div>
          </div>
        ))}
      </section>
      {isCustomerUser(shop.user) && (
        <StorePickerDialog
          open={!!storeDestination}
          onClose={() => setStoreDestination(null)}
          onSelect={(store) => {
            showStoreCatalog();
            setScrollTarget(store ? storeDestination : 'san-pham');
          }}
        />
      )}
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? 'Sản phẩm'}
      >
        {selected && (
          <div className="stack">
            <ProductVisual product={selected} large />
            <p className="muted">
              {selected.description || 'Sản phẩm được bán tại cửa hàng đang chọn.'}
            </p>
            <div className="row between">
              <ProductPrice price={selected.price} originalPrice={selected.originalPrice} />
              <span className="badge">Còn {selected.available} đơn vị</span>
            </div>
            <small>Mã SKU: {selected.code}</small>
            {selected.expiresOn && (
              <div className="info-note shopgo-retail-expiry-note">
                <CalendarDays size={16} /> Hạn sử dụng gần nhất: {expiryLabel(selected.expiresOn)}
              </div>
            )}
            {selectedProductStore && (
              <div className="product-store-detail">
                <span>
                  <MapPin size={18} />
                </span>
                <div>
                  <small>CỬA HÀNG BÁN SẢN PHẨM NÀY</small>
                  <strong>{selectedProductStore.name}</strong>
                  <p>{selectedProductStore.address}</p>
                </div>
              </div>
            )}
            {favoriteButton(selected, selectedProductStore, true)}
            {activeSearchScope === 'store' && selectedProductStore ? (
              <button
                disabled={busy || selected.available <= 0}
                className="button wide"
                onClick={() => void add(selected)}
              >
                <Plus size={18} />
                Thêm vào giỏ
              </button>
            ) : selectedProductStore ? (
              <button
                className="button wide"
                disabled={busy}
                onClick={() => void enterProductStore(selectedProductStore.id)}
              >
                <Building2 size={18} />
                Vào {selectedProductStore.name} và xem sản phẩm khác
              </button>
            ) : (
              <button className="button wide" disabled>
                Chưa xác định được cửa hàng bán
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
