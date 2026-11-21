import { hash, canonical } from '../../common/crypto';
import { fail, must } from '../../common/errors';
import { one, rows, Tx } from '../../database/db';
import { voucherDiscount, voucherReason, voucherWindow } from '../promotions/voucher-rules';
import { storePriceFields } from '../catalog/store-price';

export interface PricedItem {
  skuId: string;
  skuCode: string;
  name: string;
  unitPrice: number;
  originalUnitPrice: number;
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
    `SELECT ci.sku_id,ci.quantity,s.code,s.name,s.active AS sku_active,ss.active,
    (ss.expires_on IS NULL OR ss.expires_on >=
      (($3::timestamptz - interval '1 microsecond') AT TIME ZONE st.timezone)::date) AS valid_at_pickup,
    ${storePriceFields},ss.version,b.on_hand-b.reserved AS available
    FROM cart_items ci JOIN skus s ON s.id=ci.sku_id JOIN store_skus ss ON ss.sku_id=s.id AND ss.store_id=$2
    JOIN stores st ON st.id=ss.store_id
    JOIN inventory_balances b ON b.store_id=ss.store_id AND b.sku_id=s.id WHERE ci.cart_id=$1 ORDER BY ci.sku_id`,
    [cart.id, cart.store_id, slot.ends_at],
  );
  if (!source.length) fail('CART_EMPTY', 'Giỏ hàng trống.', 422);
  const count = await one(tx, 'SELECT count(*)::int AS count FROM cart_items WHERE cart_id=$1', [
    cart.id,
  ]);
  if (count!.count !== source.length)
    fail('SKU_UNAVAILABLE', 'Có sản phẩm không bán ở cửa hàng.', 422);
  const items: PricedItem[] = source.map((row) => {
    if (!row.active || !row.sku_active)
      fail('SKU_UNAVAILABLE', `“${row.name}” đã ngừng bán. Vui lòng xóa khỏi giỏ hàng.`, 409, {
        skuId: row.sku_id,
      });
    if (!row.valid_at_pickup)
      fail(
        'EXPIRES_BEFORE_PICKUP',
        `“${row.name}” hết hạn trước khi kết thúc khung giờ nhận. Hãy chọn giờ sớm hơn hoặc xóa sản phẩm.`,
        409,
        { skuId: row.sku_id },
      );
    if (row.available < row.quantity)
      fail('OUT_OF_STOCK', 'Sản phẩm không đủ số lượng.', 409, {
        skuId: row.sku_id,
        available: row.available,
      });
    return {
      skuId: row.sku_id,
      skuCode: row.code,
      name: row.name,
      unitPrice: row.price,
      originalUnitPrice: row.original_price,
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
    voucher = await one(tx, `SELECT *, ${voucherWindow} FROM vouchers WHERE code=$1`, [
      voucherCode.toUpperCase(),
    ]);
    if (!voucher || voucherReason(voucher, cart.store_id, subtotal)) {
      fail('VOUCHER_INELIGIBLE', 'Voucher không đủ điều kiện.', 422);
    }
    discount = voucherDiscount(voucher, subtotal);
  }
  const totals: Totals = { subtotal, discount, fee: 0, total: subtotal - discount };
  const pricingVersion = hash(
    canonical({ items, totals, voucherId: voucher?.id, voucherVersion: voucher?.version }),
  );
  return { items, totals, pricingVersion, voucherId: voucher?.id ?? null };
}
