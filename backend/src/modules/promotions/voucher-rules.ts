interface VoucherTerms {
  discount_type: 'FIXED' | 'PERCENT';
  value: number;
  max_discount: number | null;
  min_total: number;
  active: boolean;
  store_id: string | null;
  started: boolean;
  unexpired: boolean;
  allocated_count: number;
  quota: number;
}
export function voucherDiscount(voucher: VoucherTerms, subtotal: number): number {
  const amount =
    voucher.discount_type === 'FIXED'
      ? voucher.value
      : Number((BigInt(subtotal) * BigInt(voucher.value)) / 100n);
  return Math.min(subtotal, amount, voucher.max_discount ?? subtotal);
}
export function voucherReason(
  voucher: VoucherTerms,
  storeId: string,
  subtotal: number,
): string | null {
  if (!voucher.active) return 'PAUSED';
  if (voucher.store_id && voucher.store_id !== storeId) return 'OTHER_STORE';
  if (!voucher.started) return 'NOT_STARTED';
  if (!voucher.unexpired) return 'EXPIRED';
  if (voucher.allocated_count >= voucher.quota) return 'EXHAUSTED';
  if (subtotal < voucher.min_total) return 'MIN_TOTAL';
  if (!subtotal || !voucherDiscount(voucher, subtotal)) return 'NO_DISCOUNT';
  return null;
}
export const voucherWindow =
  'valid_from<=clock_timestamp() AS started, valid_until>clock_timestamp() AS unexpired';
