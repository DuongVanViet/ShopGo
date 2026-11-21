import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Db, one, rows } from '../../database/db';
import { ENV, Env } from '../../config/env';
import { Actor } from '../../common/context';
import { expected, ownOrder } from '../../common/access';
import { fail, must } from '../../common/errors';
import { idempotent } from '../../common/idempotency';
import { event } from '../../common/events';
import { priceCart } from '../cart/pricing';
import { orderView, releaseOrder, state } from './order-domain';
import { paginate } from '../catalog/catalog.service';
import { orderPaymentTerms, type PaymentMethod } from './payment-plan';

@Injectable()
export class OrdersService {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}
  create(
    actor: Actor,
    input: {
      quoteId: string;
      paymentMethod: PaymentMethod;
      expectedCartVersion: number;
      expectedStoreId?: string;
    },
    key: string | undefined,
    requestId: string,
  ) {
    return this.db.tx((tx) =>
      idempotent(tx, actor.id, 'order.create', key, input, async () => {
        const quote = must(
          await one(
            tx,
            `SELECT q.*,q.expires_at>clock_timestamp() AS valid FROM checkout_quotes q JOIN carts c ON c.id=q.cart_id WHERE q.id=$1 AND c.user_id=$2 FOR UPDATE OF q`,
            [input.quoteId, actor.id],
          ),
        );
        if (!quote.valid) fail('QUOTE_EXPIRED', 'Báo giá đã hết hạn.', 410);
        if (quote.consumed_order_id) fail('QUOTE_CONSUMED', 'Báo giá đã được dùng.');
        const cart = must(
          await one(
            tx,
            "SELECT * FROM carts WHERE id=$1 AND user_id=$2 AND status='ACTIVE' FOR UPDATE",
            [quote.cart_id, actor.id],
          ),
        );
        if (input.expectedStoreId && input.expectedStoreId !== cart.store_id)
          fail('STORE_CHANGED', 'Báo giá thuộc cửa hàng khác. Vui lòng lấy báo giá mới.');
        expected(cart, input.expectedCartVersion);
        expected(cart, quote.cart_version);
        const voucher = quote.voucher_id
          ? await one(tx, 'SELECT code FROM vouchers WHERE id=$1', [quote.voucher_id])
          : null;
        const pricing = await priceCart(tx, cart, quote.slot_id, voucher?.code);
        if (pricing.pricingVersion !== quote.pricing_version)
          fail('PRICE_CHANGED', 'Giá hoặc khuyến mãi đã đổi. Vui lòng lấy báo giá mới.');
        const orderId = randomUUID();
        const terms = orderPaymentTerms(pricing.totals.total, input.paymentMethod);
        const awaitingPayment = terms.amountDueNow > 0;
        if (awaitingPayment && this.env.PAYMENT_MODE === 'disabled')
          fail('PAYMENT_UNAVAILABLE', 'Thanh toán online chưa được cấu hình.', 503);
        const order = must(
          await one(
            tx,
            `INSERT INTO orders(id,code,user_id,store_id,slot_id,status,payment_method,subtotal,discount,fee,total,
              payment_plan,deposit_percent,deposit_amount,amount_due_now,remaining_amount,expires_at)
             VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,
              CASE WHEN $17 THEN clock_timestamp()+$18*interval '1 second' ELSE NULL END) RETURNING *`,
            [
              orderId,
              `SG-${orderId.toUpperCase()}`,
              actor.id,
              cart.store_id,
              quote.slot_id,
              awaitingPayment ? 'PENDING_PAYMENT' : 'CONFIRMED',
              input.paymentMethod,
              pricing.totals.subtotal,
              pricing.totals.discount,
              pricing.totals.fee,
              pricing.totals.total,
              terms.paymentPlan,
              terms.depositPercent,
              terms.depositAmount,
              terms.amountDueNow,
              terms.remainingAmount,
              awaitingPayment,
              this.env.RESERVATION_TTL_SECONDS,
            ],
          ),
        );
        if (voucher) {
          await tx.query('UPDATE orders SET voucher_code=$2 WHERE id=$1', [order.id, voucher.code]);
          order.voucher_code = voucher.code;
        }
        for (const item of pricing.items) {
          const balance = await one(
            tx,
            `UPDATE inventory_balances SET reserved=reserved+$3,version=version+1,updated_at=now()
          WHERE store_id=$1 AND sku_id=$2 AND on_hand-reserved >= $3 RETURNING sku_id`,
            [cart.store_id, item.skuId, item.quantity],
          );
          if (!balance) fail('OUT_OF_STOCK', 'Sản phẩm vừa hết hàng.', 409, { skuId: item.skuId });
          await tx.query(
            'INSERT INTO order_items(order_id,sku_id,sku_code,name,unit_price,quantity,line_total,original_unit_price) VALUES($1,$2,$3,$4,$5,$6,$7,$8)',
            [
              order.id,
              item.skuId,
              item.skuCode,
              item.name,
              item.unitPrice,
              item.quantity,
              item.lineTotal,
              item.originalUnitPrice,
            ],
          );
          await tx.query(
            'INSERT INTO inventory_reservations(order_id,store_id,sku_id,quantity,status,expires_at) VALUES($1,$2,$3,$4,$5,$6)',
            [
              order.id,
              cart.store_id,
              item.skuId,
              item.quantity,
              awaitingPayment ? 'ACTIVE' : 'COMMITTED',
              order.expires_at,
            ],
          );
          await tx.query(
            "INSERT INTO stock_movements(store_id,sku_id,delta_on_hand,delta_reserved,reason,reference_id,actor_id) VALUES($1,$2,0,$3,'RESERVE',$4,$5)",
            [cart.store_id, item.skuId, item.quantity, order.id, actor.id],
          );
        }
        const slot = await one(
          tx,
          'UPDATE fulfillment_slots SET allocated_count=allocated_count+1,version=version+1 WHERE id=$1 AND store_id=$2 AND starts_at>clock_timestamp() AND allocated_count<capacity RETURNING id',
          [quote.slot_id, cart.store_id],
        );
        if (!slot) fail('SLOT_FULL', 'Khung giờ vừa hết suất.');
        await tx.query(
          "INSERT INTO slot_bookings(order_id,slot_id,status) VALUES($1,$2,'ACTIVE')",
          [order.id, quote.slot_id],
        );
        if (pricing.voucherId) {
          const allocated = await one(
            tx,
            'UPDATE vouchers SET allocated_count=allocated_count+1 WHERE id=$1 AND active AND allocated_count<quota AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp() RETURNING id',
            [pricing.voucherId],
          );
          if (!allocated) fail('VOUCHER_INELIGIBLE', 'Voucher đã hết lượt.', 422);
          await tx.query(
            "INSERT INTO voucher_redemptions(voucher_id,order_id,user_id,status) VALUES($1,$2,$3,'RESERVED')",
            [pricing.voucherId, order.id, actor.id],
          );
        }
        await tx.query('UPDATE checkout_quotes SET consumed_order_id=$2 WHERE id=$1', [
          quote.id,
          order.id,
        ]);
        await tx.query(
          "UPDATE carts SET status='CONVERTED',version=version+1,updated_at=now() WHERE id=$1",
          [cart.id],
        );
        await event(tx, order, null, actor.id, requestId, 'Checkout');
        return orderView(tx, order);
      }),
    );
  }
  async list(actor: Actor, input: { limit: number; cursor?: string; status?: string }) {
    return paginate(
      await rows(
        this.db.pool,
        `SELECT * FROM orders WHERE user_id=$1 AND ($2::uuid IS NULL OR id>$2)
      AND ($3::text IS NULL OR status=$3) ORDER BY id LIMIT $4`,
        [actor.id, input.cursor ?? null, input.status ?? null, input.limit + 1],
      ),
      input.limit,
    );
  }
  async get(actor: Actor, orderId: string) {
    return this.db.tx(async (tx) => {
      const order = must(
        await one(
          tx,
          `SELECT o.* FROM orders o WHERE o.id=$1 AND ($3::boolean OR o.user_id=$2 OR EXISTS(
        SELECT 1 FROM store_memberships m WHERE m.user_id=$2 AND m.store_id=o.store_id AND (m.role='MANAGER' OR
        (m.role='COUNTER' AND o.status IN ('READY','COMPLETED')) OR (m.role='PICKER' AND EXISTS(
          SELECT 1 FROM picking_assignments a WHERE a.order_id=o.id AND a.picker_id=$2)))))`,
          [orderId, actor.id, actor.is_admin],
        ),
      );
      return orderView(tx, order);
    });
  }
  cancel(
    actor: Actor,
    orderId: string,
    input: { expectedVersion: number; reason: string },
    key: string | undefined,
    requestId: string,
  ) {
    return this.db.tx((tx) =>
      idempotent(tx, actor.id, `order.cancel:${orderId}`, key, input, async () => {
        const order = await ownOrder(tx, actor, orderId, true);
        expected(order, input.expectedVersion);
        state(order, ['PENDING_PAYMENT', 'CONFIRMED']);
        return orderView(
          tx,
          await releaseOrder(tx, order, 'CANCELLED', actor.id, requestId, input.reason),
        );
      }),
    );
  }
}
