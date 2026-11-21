'use client';

import { useState } from 'react';
import { ArrowRight, Tag } from 'lucide-react';
import { ProductPrice } from '@/components/product-price';
import { ProductVisual } from '@/components/product-visual';
import { ErrorBox, Loading } from '@/components/ui';
import { useResource } from '@/hooks/use-resource';
import { query } from '@/lib/api';
import type { Page, Product } from '@/types';

export function StoreOffers({
  storeId,
  onSelect,
}: {
  storeId: string;
  onSelect: (product: Product) => void;
}) {
  const [cursor, setCursor] = useState('');
  const offers = useResource<Page<Product>>(
    `/stores/${storeId}/products?${query({ discountedOnly: true, limit: 3, cursor })}`,
    30000,
  );
  return (
    <section id="uu-dai" tabIndex={-1} className="store-offers" aria-label="Ưu đãi của cửa hàng">
      <h2>
        <Tag size={21} aria-hidden="true" /> Ưu đãi tại cửa hàng
      </h2>
      <ErrorBox error={offers.error} retry={offers.refresh} />
      {offers.loading && !offers.data && <Loading label="Đang tải ưu đãi…" />}
      {!!offers.data?.items.length && (
        <div className="store-offer-list">
          {offers.data.items.map((product) => (
            <button
              type="button"
              className="store-offer"
              key={product.id}
              onClick={() => onSelect(product)}
            >
              <span className="store-offer-photo">
                <ProductVisual product={product} />
              </span>
              <span className="store-offer-copy">
                <b>{product.name}</b>
                <ProductPrice price={product.price} originalPrice={product.originalPrice} />
                {product.available <= 0 && <small>Tạm hết hàng</small>}
              </span>
              <ArrowRight size={16} aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
      {offers.data?.items.length === 0 && (
        <p className="muted">
          {cursor
            ? 'Đã hết sản phẩm giảm giá ở trang này.'
            : 'Cửa hàng chưa có sản phẩm đang giảm giá.'}
        </p>
      )}
      {(cursor || offers.data?.nextCursor) && (
        <div className="row">
          {cursor && (
            <button type="button" className="text-button" onClick={() => setCursor('')}>
              Về trang đầu
            </button>
          )}
          {offers.data?.nextCursor && (
            <button
              type="button"
              className="text-button"
              disabled={offers.loading}
              onClick={() => setCursor(offers.data!.nextCursor!)}
            >
              Xem thêm ưu đãi <ArrowRight size={15} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
