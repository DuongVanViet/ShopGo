'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowRight, MapPin } from 'lucide-react';
import { ProductVisual } from '@/components/product-visual';
import { ProductPrice } from '@/components/product-price';
import { Empty, ErrorBox, Loading, PageTitle } from '@/components/ui';
import { isCustomerUser } from '@/lib/access';
import { useShop } from '@/store/shop';
import { FavoriteToggle } from './favorite-toggle';
import { favoriteKey, useFavorites, type FavoriteOffer } from './use-favorites';

export function FavoritesView() {
  const shop = useShop();
  const router = useRouter();
  const favorites = useFavorites();
  const [opening, setOpening] = useState(false);

  async function visit(offer: FavoriteOffer) {
    setOpening(true);
    try {
      if (await shop.openStore(offer.store.id)) {
        router.push(`/?q=${encodeURIComponent(offer.code)}&scope=store#san-pham`);
      }
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="container retail-favorites-page">
      <PageTitle title="Sản phẩm yêu thích" />
      {!shop.user ? (
        <Empty title="Đăng nhập để xem sản phẩm yêu thích">
          <Link href="/login" className="button">
            Đăng nhập
          </Link>
        </Empty>
      ) : !isCustomerUser(shop.user) ? (
        <Empty title="Danh sách yêu thích dành cho khách hàng" />
      ) : (
        <>
          <ErrorBox error={favorites.error} retry={favorites.refresh} />
          {favorites.loading && !favorites.data && <Loading label="Đang tải sản phẩm yêu thích…" />}
          {favorites.data?.length === 0 && (
            <Empty title="Bạn chưa lưu sản phẩm nào">
              <p>Bấm vào biểu tượng tim trên sản phẩm để lưu lại.</p>
              <Link href="/#san-pham" className="button">
                Khám phá sản phẩm <ArrowRight size={16} />
              </Link>
            </Empty>
          )}
          {!!favorites.data?.length && (
            <div className="shopgo-retail-product-results">
              <div className="product-grid">
                {favorites.data.map((offer) => (
                  <article
                    className="product-card shopgo-retail-product-card"
                    key={favoriteKey(offer)}
                  >
                    <FavoriteToggle
                      name={offer.name}
                      saved
                      disabled={favorites.busy}
                      onToggle={() => void favorites.toggle(offer)}
                    />
                    <div className="product-picture">
                      <ProductVisual product={offer} />
                    </div>
                    <div className="product-info">
                      <h2 className="product-name">{offer.name}</h2>
                      <div className="product-store-line">
                        <MapPin size={13} aria-hidden="true" />
                        <span>
                          <strong>{offer.store.name}</strong>
                          <small>{offer.store.address}</small>
                        </span>
                      </div>
                      <span
                        className={`stock-tag${offer.sellable && offer.available > 0 ? '' : ' sold'}`}
                      >
                        {!offer.sellable
                          ? 'Tạm ngừng bán'
                          : offer.available > 0
                            ? 'Còn hàng'
                            : 'Tạm hết hàng'}
                      </span>
                      <div className="product-bottom">
                        <ProductPrice price={offer.price} originalPrice={offer.originalPrice} />
                        <button
                          type="button"
                          className="visit-store-button"
                          disabled={!offer.sellable || opening}
                          onClick={() => void visit(offer)}
                        >
                          Xem tại cửa hàng <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
