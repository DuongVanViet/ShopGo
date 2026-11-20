'use client';

import { useRef, useState } from 'react';
import { useResource } from '@/hooks/use-resource';
import { isCustomerUser } from '@/lib/access';
import { api, messageOf } from '@/lib/api';
import { useShop } from '@/store/shop';
import type { Product, Store } from '@/types';

export type FavoriteOffer = Pick<
  Product,
  'id' | 'name' | 'code' | 'unit' | 'price' | 'originalPrice' | 'available' | 'imageUrl'
> & { store: Store; sellable: boolean };

export function favoriteKey(offer: FavoriteOffer) {
  return `${offer.store.id}:${offer.id}`;
}

export function useFavorites() {
  const shop = useShop();
  const resource = useResource<FavoriteOffer[]>(
    isCustomerUser(shop.user) ? '/me/favorites' : null,
    30000,
  );
  const [pending, setPending] = useState(false);
  const pendingRequest = useRef(false);
  const keys = new Set(resource.data?.map(favoriteKey));

  async function toggle(offer: FavoriteOffer) {
    if (!shop.user) {
      shop.openAuth();
      return;
    }
    if (pendingRequest.current || !shop.token || !isCustomerUser(shop.user)) return;
    if (!resource.data) {
      if (resource.error) {
        shop.notice(messageOf(resource.error), true);
        resource.refresh();
      }
      return;
    }

    const key = favoriteKey(offer);
    const saved = keys.has(key);
    pendingRequest.current = true;
    setPending(true);
    try {
      await api(`/me/favorites/${offer.store.id}/${offer.id}`, {
        method: saved ? 'DELETE' : 'PUT',
        token: shop.token,
      });
      resource.updateData((items) =>
        saved ? items.filter((item) => favoriteKey(item) !== key) : [offer, ...items],
      );
    } catch (error) {
      shop.notice(messageOf(error), true);
    } finally {
      pendingRequest.current = false;
      setPending(false);
    }
  }

  return { ...resource, keys, toggle, busy: pending || resource.loading };
}
