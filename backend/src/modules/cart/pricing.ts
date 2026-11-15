import { hash, canonical } from '../../common/crypto';
import { fail, must } from '../../common/errors';
import { one, rows, Tx } from '../../database/db';

export interface PricedItem {
  skuId: string;
  skuCode: string;
  name: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  priceVersion: number;
}
export interface Totals {
  subtotal: number;
  discount: number;
  fee: number;
  total: number;
}
export async function priceCart(tx: Tx, cart: any, slotId: string, voucherCode?: string) {
  must(await one(tx, "SELECT id FROM stores WHERE id=$1 AND status='ACTIVE'", [cart.store_id]));
  const slot = must(
    await one(
      tx,
      'SELECT *, starts_at>clock_timestamp() AS future FROM fulfillment_slots WHERE id=$1 AND store_id=$2',
      [slotId, cart.store_id],
    ),
  );
  if (!slot.future || slot.allocated_count >= slot.capacity)
    fail('SLOT_FULL', 'Khung giờ đã đầy hoặc không còn nhận đơn.');
  const source = await rows(
    tx,
    `SELECT ci.sku_id,ci.quantity,s.code,s.name,s.active AS sku_active,ss.active,ss.price,ss.version,b.on_hand-b.reserved AS available
    FROM cart_items ci JOIN skus s ON s.id=ci.sku_id JOIN store_skus ss ON ss.sku_id=s.id AND ss.store_id=$2
    JOIN inventory_balances b ON b.store_id=ss.store_id AND b.sku_id=s.id WHERE ci.cart_id=$1 ORDER BY ci.sku_id`,
    [cart.id, cart.store_id],
  );
  if (!source.length) fail('CART_EMPTY', 'Giỏ hàng trống.', 422);
  const count = await one(tx, 'SELECT count(*)::int AS count FROM cart_items WHERE cart_id=$1', [
    cart.id,
  ]);
  if (count!.count !== source.length)
    fail('SKU_UNAVAILABLE', 'Có sản phẩm không bán ở cửa hàng.', 422);
  const items: PricedItem[] = source.map((row) => {
    if (!row.active || !row.sku_active || row.available < row.quantity)
      fail('OUT_OF_STOCK', 'Sản phẩm không đủ số lượng.', 409, {
        skuId: row.sku_id,
        available: row.available,
      });
    return {
      skuId: row.sku_id,
      skuCode: row.code,
      name: row.name,
      unitPrice: row.price,
      quantity: row.quantity,
      lineTotal: row.price * row.quantity,
      priceVersion: row.version,
    };
  });
  const subtotal = items.reduce((sum, item) => sum + item.lineTotal, 0);
  if (!Number.isSafeInteger(subtotal) || subtotal > 1_000_000_000_000)
    fail('CART_LIMIT', 'Giỏ hàng vượt hạn mức.', 422);
  let voucher: any = null;
  let discount = 0;
  if (voucherCode) {
    voucher = await one(
      tx,
      `SELECT *,valid_from<=clock_timestamp() AND valid_until>clock_timestamp() AS valid FROM vouchers WHERE code=$1`,
      [voucherCode.toUpperCase()],
    );
    if (
      !voucher ||
      !voucher.valid ||
      (voucher.store_id && voucher.store_id !== cart.store_id) ||
      voucher.allocated_count >= voucher.quota ||
      subtotal < voucher.min_total
    ) {
      fail('VOUCHER_INELIGIBLE', 'Voucher không đủ điều kiện.', 422);
    }
    discount =
      voucher.discount_type === 'FIXED'
        ? voucher.value
        : Number((BigInt(subtotal) * BigInt(voucher.value)) / 100n);
    discount = Math.min(subtotal, discount, voucher.max_discount ?? subtotal);
  }
  const totals: Totals = { subtotal, discount, fee: 0, total: subtotal - discount };
  const pricingVersion = hash(
    canonical({ items, totals, voucherId: voucher?.id, voucherVersion: voucher?.version }),
  );
  return { items, totals, pricingVersion, voucherId: voucher?.id ?? null };
}
