import type { CartItem } from '@/types';

export function cartItemNeedsAttention(item: CartItem) {
  return !!item.unavailableReason || item.quantity > item.available;
}
