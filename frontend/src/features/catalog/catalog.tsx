'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowDown,
  ArrowRight,
  Beef,
  Building2,
  Carrot,
  CheckCircle2,
  Clock3,
  Egg,
  Grid2X2,
  Leaf,
  MapPin,
  Milk,
  PackageCheck,
  Plus,
  Search,
  ShoppingBag,
  Sparkles,
  Wheat,
} from 'lucide-react';
import { useShop } from '@/store/shop';
import { useResource } from '@/hooks/use-resource';
import { api, query } from '@/lib/api';
import { money } from '@/lib/format';
import type { Category, Page, Product, Store } from '@/types';
import { GroceryArt, ProductArt, productKind } from '@/components/product-art';
import { Empty, ErrorBox, Loading, Modal } from '@/components/ui';

function ProductVisual({ product, large = false }: { product: Product; large?: boolean }) {
  if (product.imageUrl) {
    return (
      <img
        className={`product-uploaded-image${large ? ' product-uploaded-image-large' : ''}`}
        src={product.imageUrl}
        alt={product.name}
      />
    );
  }
  return <ProductArt name={product.name} large={large} />;
}

function productStore(product: Product, selectedStore: Store | null) {
  return product.store ?? selectedStore;
}

export function Catalog() {
  const shop = useShop();
  const [search, setSearch] = useState(''),
    [debounced, setDebounced] = useState(''),
    [category, setCategory] = useState(''),
    [onlyStock, setOnlyStock] = useState(false),
    [cursor, setCursor] = useState('');
  const limit = 20;
  const [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<Product | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search);
      setCursor('');
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setCursor('');
    setSelected(null);
  }, [shop.store?.id, category, onlyStock]);
  const categories = useResource<Category[]>(
    shop.store ? `/stores/${shop.store.id}/categories` : '/categories',
  );
  const products = useResource<Page<Product>>(
    shop.store
      ? `/stores/${shop.store.id}/products?${query({ limit, cursor, q: debounced, categoryId: category, inStock: onlyStock ? true : undefined })}`
      : `/products?${query({ limit, cursor, q: debounced, categoryId: category, inStock: onlyStock ? true : undefined })}`,
  );
  function chooseStore(storeId: string) {
    shop.setStore(storeId);
    setCategory('');
    setCursor('');
    setSelected(null);
    requestAnimationFrame(() =>
      document.getElementById('san-pham')?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  }
  async function add(product: Product) {
    if (!shop.token) {
      shop.openAuth();
      return;
    }
    const offerStore = productStore(product, shop.store);
    if (!shop.store || !offerStore || offerStore.id !== shop.store.id) {
      if (offerStore) chooseStore(offerStore.id);
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
    <div className="container home">
      {shop.storesError && (
        <ErrorBox error={new Error(shop.storesError)} retry={() => void shop.refreshStores()} />
      )}
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">TƯƠI NGON MỖI NGÀY · NHẬN HÀNG THEO GIỜ BẠN CHỌN</p>
          <h1>
            Đi chợ nhẹ tênh.
            <br />
            <em>Nhận hàng thảnh thơi.</em>
          </h1>
          <p>
            Chọn những món bạn cần, để ShopGo chuẩn bị.
            <br />
            Ghé cửa hàng, nhận túi ngon lành rồi đi.
          </p>
          <a href="#san-pham" className="button">
            Bắt đầu mua sắm <ArrowRight size={17} />
          </a>
        </div>
        <div className="hero-visual">
          <GroceryArt />
          <div className="hero-tag">
            <PackageCheck size={25} />
            <div>
              <strong>Chọn online. Ghé nhận ngay.</strong>
              <small>Gọn một túi, nhẹ cả ngày.</small>
            </div>
          </div>
        </div>
      </section>
      <div className="benefits">
        <div className="benefit">
          <span>
            <Leaf size={20} />
          </span>
          <div>
            <strong>Chọn món ngay tại cửa hàng</strong>
            <p>Giá và hàng có sẵn theo từng chi nhánh</p>
          </div>
        </div>
        <div className="benefit">
          <span>
            <Clock3 size={20} />
          </span>
          <div>
            <strong>Chủ động thời gian nhận</strong>
            <p>Chọn khung giờ phù hợp với bạn</p>
          </div>
        </div>
        <div className="benefit">
          <span>
            <CheckCircle2 size={20} />
          </span>
          <div>
            <strong>Soạn sẵn, nhận gọn</strong>
            <p>Mã QR giúp nhận đúng đơn, thật nhanh</p>
          </div>
        </div>
      </div>
      <section className="store-discovery" aria-labelledby="store-discovery-title">
        <div className="store-discovery-heading">
          <div>
            <p className="eyebrow">MỖI CỬA HÀNG, MỘT GIAN HÀNG RIÊNG</p>
            <h2 id="store-discovery-title">Bạn muốn mua ở đâu?</h2>
            <p>Xem toàn bộ sản phẩm hoặc vào một cửa hàng để xem đúng giá và tồn kho tại đó.</p>
          </div>
          {shop.store && (
            <button className="button secondary small" onClick={() => chooseStore('')}>
              Xem tất cả cửa hàng
            </button>
          )}
        </div>
        <div className="store-scope-list" data-testid="store-scope-list">
          <button
            className={`store-scope-card all-stores${!shop.store ? ' active' : ''}`}
            aria-pressed={!shop.store}
            onClick={() => chooseStore('')}
          >
            <span className="store-scope-icon">
              <Building2 size={21} />
            </span>
            <span>
              <strong>Tất cả cửa hàng</strong>
              <small>Khám phá sản phẩm từ toàn bộ ShopGo</small>
            </span>
          </button>
          {shop.stores.map((store) => (
            <button
              key={store.id}
              className={`store-scope-card${shop.store?.id === store.id ? ' active' : ''}`}
              aria-label={`Xem cửa hàng ${store.name}`}
              aria-pressed={shop.store?.id === store.id}
              onClick={() => chooseStore(store.id)}
            >
              <span className="store-scope-icon">
                <MapPin size={20} />
              </span>
              <span>
                <strong>{store.name}</strong>
                <small>{store.address}</small>
              </span>
              <ArrowRight size={16} />
            </button>
          ))}
        </div>
      </section>
      <section className="catalog" id="san-pham">
        <div className="catalog-heading">
          <div>
            <p className="eyebrow">MỘT CHÚT TƯƠI NGON CHO NGÀY MỚI</p>
            <h2>Hôm nay, bạn cần gì?</h2>
          </div>
          <label className="search-box">
            <Search size={18} />
            <input
              aria-label="Tìm sản phẩm"
              placeholder="Tìm rau củ, thịt, sữa và nhiều hơn…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        <div className="catalog-layout">
          <aside>
            <div className="category-menu" aria-label="Danh mục sản phẩm">
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
            <div className="pickup-note">
              <ShoppingBag size={28} strokeWidth={1.4} />
              <h3>Mua gọn. Sống chậm.</h3>
              <p>Đặt trước những món cần thiết, dành thêm một chút thời gian cho mình.</p>
              <Link className="text-button" href="/huong-dan">
                Cách nhận hàng <ArrowRight size={13} />
              </Link>
            </div>
          </aside>
          <div>
            <div className="catalog-toolbar">
              <span>
                {products.data
                  ? `${products.data.items.length} sản phẩm đang hiển thị`
                  : 'Đang tải sản phẩm'}
                {shop.store ? ` · ${shop.store.name}` : ' · Tất cả cửa hàng'}
              </span>
              <label>
                <input
                  type="checkbox"
                  checked={onlyStock}
                  onChange={(e) => setOnlyStock(e.target.checked)}
                />{' '}
                Chỉ còn hàng
              </label>
            </div>
            <ErrorBox error={products.error} retry={products.refresh} />
            {products.loading && !products.data ? (
              <Loading />
            ) : products.data?.items.length === 0 ? (
              <Empty title="Chưa tìm thấy món bạn cần">
                <button
                  className="text-button"
                  onClick={() => {
                    setSearch('');
                    setCategory('');
                    setOnlyStock(false);
                  }}
                >
                  Xem tất cả sản phẩm
                </button>
              </Empty>
            ) : (
              <div className="product-grid">
                {products.data?.items.map((product) => {
                  const offerStore = productStore(product, shop.store);
                  const isInsideStore = !!shop.store && offerStore?.id === shop.store.id;
                  return (
                    <article
                      className="product-card"
                      key={`${offerStore?.id ?? 'unknown'}:${product.id}`}
                    >
                      <button
                        className={`product-picture${product.imageUrl ? ' has-image' : ''}`}
                        onClick={() => setSelected(product)}
                        aria-label={`Xem ${product.name}`}
                      >
                        <span className={`stock-tag ${product.available <= 0 ? 'sold' : ''}`}>
                          {product.available <= 0
                            ? 'Tạm hết hàng'
                            : product.available <= 5
                              ? 'Sắp hết hàng'
                              : 'Có sẵn tại cửa hàng'}
                        </span>
                        <ProductVisual product={product} />
                      </button>
                      <div className="product-info">
                        <small>
                          {categories.data?.find((c) => c.id === product.categoryId)?.name ??
                            'Thực phẩm & thiết yếu'}
                        </small>
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
                              Bán bởi <strong>{offerStore.name}</strong>
                            </span>
                          </div>
                        )}
                        <div className="product-bottom">
                          <strong>{money(product.price)}</strong>
                          {isInsideStore ? (
                            <button
                              className="add-button"
                              aria-label={`Thêm ${product.name}`}
                              disabled={busy || product.available <= 0}
                              onClick={() => void add(product)}
                            >
                              <Plus size={18} />
                            </button>
                          ) : (
                            <button
                              className="visit-store-button"
                              aria-label={`Vào cửa hàng ${offerStore?.name ?? ''}`}
                              disabled={!offerStore}
                              onClick={() => offerStore && chooseStore(offerStore.id)}
                            >
                              Vào cửa hàng <ArrowRight size={13} />
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
      <section className="journey">
        <div>
          <p className="eyebrow">CLICK & COLLECT</p>
          <h2>
            Ba bước nhỏ.
            <br />
            Một ngày nhẹ hơn.
          </h2>
        </div>
        <div className="journey-step">
          <b>01 / CHỌN</b>
          <h3>Thêm món yêu thích</h3>
          <p>Chọn cửa hàng và những thứ bạn cần.</p>
        </div>
        <div className="journey-step">
          <b>02 / ĐẶT</b>
          <h3>Hẹn một khung giờ</h3>
          <p>Cửa hàng nhận đơn, chuẩn bị túi của bạn.</p>
        </div>
        <div className="journey-step">
          <b>03 / NHẬN</b>
          <h3>Ghé qua, mang về</h3>
          <p>Đưa mã QR và nhận đơn đã soạn sẵn.</p>
        </div>
      </section>
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
              <strong style={{ fontSize: 25 }}>{money(selected.price)}</strong>
              <span className="badge">Còn {selected.available} đơn vị</span>
            </div>
            <small>Mã SKU: {selected.code}</small>
            {productStore(selected, shop.store) && (
              <div className="product-store-detail">
                <span>
                  <MapPin size={18} />
                </span>
                <div>
                  <small>CỬA HÀNG BÁN SẢN PHẨM NÀY</small>
                  <strong>{productStore(selected, shop.store)!.name}</strong>
                  <p>{productStore(selected, shop.store)!.address}</p>
                </div>
              </div>
            )}
            {shop.store?.id === productStore(selected, shop.store)?.id ? (
              <button
                disabled={busy || selected.available <= 0}
                className="button wide"
                onClick={() => void add(selected)}
              >
                <Plus size={18} />
                Thêm vào giỏ
              </button>
            ) : (
              <button
                className="button wide"
                onClick={() => chooseStore(productStore(selected, shop.store)!.id)}
              >
                <Building2 size={18} />
                Xem cửa hàng {productStore(selected, shop.store)?.name}
              </button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
