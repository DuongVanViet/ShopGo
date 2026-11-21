import { Inject, Injectable } from '@nestjs/common';
import { Db, one, rows, Tx } from '../../database/db';
import { ENV, Env } from '../../config/env';
import { Actor } from '../../common/context';
import { expected, ownOrder, storeAccess } from '../../common/access';
import { constantEqual, hash, hmac, randomToken } from '../../common/crypto';
import { fail, must } from '../../common/errors';
import { audit } from '../../common/events';
import { idempotent } from '../../common/idempotency';
import { orderView, paymentDetails, releaseOrder, state, transition } from '../orders/order-domain';
import { paginate } from '../catalog/catalog.service';

@Injectable()
export class FulfillmentService {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}
  private rawToken(orderId: string, nonce: string) {
    return hmac(this.env.AUTH_SECRET, `pickup:${orderId}:${nonce}`);
  }
  private async newToken(tx: Tx, orderId: string) {
    await tx.query(
      'UPDATE pickup_tokens SET revoked_at=clock_timestamp() WHERE order_id=$1 AND used_at IS NULL AND revoked_at IS NULL',
      [orderId],
    );
    const nonce = randomToken();
    await tx.query(
      `INSERT INTO pickup_tokens(order_id,token_hash,nonce,expires_at) VALUES($1,$2,$3,clock_timestamp()+$4*interval '1 second')`,
      [orderId, hash(this.rawToken(orderId, nonce)), nonce, this.env.PICKUP_TOKEN_TTL_SECONDS],
    );
  }
  async token(actor: Actor, orderId: string) {
    return this.db.tx(async (tx) => {
      const order = await ownOrder(tx, actor, orderId, true);
      state(order, ['READY']);
      const token = must(
        await one(
          tx,
          'SELECT *,expires_at>clock_timestamp() AS valid FROM pickup_tokens WHERE order_id=$1 AND used_at IS NULL AND revoked_at IS NULL',
          [orderId],
        ),
      );
      if (!token.valid) fail('QR_EXPIRED', 'Mã nhận hàng hết hạn. Vui lòng cấp lại.', 410);
      return { token: this.rawToken(orderId, token.nonce), expiresAt: token.expires_at };
    });
  }
  rotate(
    actor: Actor,
    orderId: string,
    input: { expectedVersion: number; reason?: string },
    key: string | undefined,
    requestId: string,
  ) {
    return this.db.tx((tx) =>
      idempotent(tx, actor.id, `pickup.rotate:${orderId}`, key, input, async () => {
        const order = await ownOrder(tx, actor, orderId, true);
        expected(order, input.expectedVersion);
        state(order, ['READY']);
        await this.newToken(tx, orderId);
        const updated = await one(
          tx,
          'UPDATE orders SET version=version+1,updated_at=now() WHERE id=$1 RETURNING *',
          [orderId],
        );
        await audit(tx, actor.id, 'pickup.rotate', 'order', orderId, requestId, {
          reason: input.reason,
        });
        return orderView(tx, updated);
      }),
    );
  }
  async list(
    actor: Actor,
    storeId: string,
    input: { status?: string; limit: number; cursor?: string },
  ) {
    await storeAccess(this.db.pool, actor, storeId, ['PICKER', 'COUNTER', 'MANAGER']);
    const items = await rows(
      this.db.pool,
      `SELECT o.* FROM orders o WHERE o.store_id=$1 AND ($3::text IS NULL OR o.status=$3) AND ($4::uuid IS NULL OR o.id>$4)
      AND ($6::boolean OR EXISTS(SELECT 1 FROM store_memberships m WHERE m.user_id=$2 AND m.store_id=$1 AND (m.role='MANAGER' OR
      (m.role='COUNTER' AND o.status IN ('READY','COMPLETED')) OR (m.role='PICKER' AND (o.status='CONFIRMED' OR EXISTS(
      SELECT 1 FROM picking_assignments a WHERE a.order_id=o.id AND a.picker_id=$2)))))) ORDER BY o.id LIMIT $5`,
      [
        storeId,
        actor.id,
        input.status ?? null,
        input.cursor ?? null,
        input.limit + 1,
        actor.is_admin,
      ],
    );
    return paginate(items, input.limit);
  }
  async lookup(actor: Actor, storeId: string, token: string) {
    return this.db.tx(async (tx) => {
      await storeAccess(tx, actor, storeId, ['COUNTER']);
      const row = must(
        await one(
          tx,
          `SELECT o.*,t.expires_at>clock_timestamp() AS valid,t.used_at,t.revoked_at FROM pickup_tokens t JOIN orders o ON o.id=t.order_id
        WHERE t.token_hash=$1 AND o.store_id=$2`,
          [hash(token), storeId],
        ),
      );
      if (row.used_at) fail('QR_ALREADY_USED', 'Đơn đã được nhận.');
      if (!row.valid || row.revoked_at) fail('QR_EXPIRED', 'Mã nhận hàng hết hạn.', 410);
      state(row, ['READY']);
      const { valid, used_at, revoked_at, ...order } = row;
      return orderView(tx, order);
    });
  }
  command(
    actor: Actor,
    storeId: string,
    orderId: string,
    action: string,
    input: any,
    key: string | undefined,
    requestId: string,
  ) {
    const roles = ['claim', 'pick', 'ready'].includes(action)
      ? ['PICKER']
      : ['collection', 'handover'].includes(action)
        ? ['COUNTER']
        : action === 'issue'
          ? ['PICKER', 'MANAGER']
          : ['MANAGER'];
    return this.db.tx(async (tx) => {
      await storeAccess(tx, actor, storeId, roles);
      return idempotent(tx, actor.id, `fulfillment.${action}:${orderId}`, key, input, async () => {
        const order = must(
          await one(tx, 'SELECT * FROM orders WHERE id=$1 AND store_id=$2 FOR UPDATE', [
            orderId,
            storeId,
          ]),
        );
        expected(order, input.expectedVersion);
        let updated: any = order;
        if (action === 'claim') {
          state(order, ['CONFIRMED']);
          await tx.query(
            "INSERT INTO picking_assignments(order_id,picker_id,status) VALUES($1,$2,'ACTIVE')",
            [orderId, actor.id],
          );
          updated = await transition(tx, order, 'PICKING', actor.id, requestId, 'Picker nhận soạn');
        } else if (action === 'pick' || action === 'ready') {
          state(order, ['PICKING']);
          must(
            await one(
              tx,
              "SELECT id FROM picking_assignments WHERE order_id=$1 AND picker_id=$2 AND status='ACTIVE'",
              [orderId, actor.id],
            ),
            'FORBIDDEN',
            'Đơn không được phân cho bạn.',
            403,
          );
          if (action === 'pick') {
            const item = must(
              await one(
                tx,
                'SELECT i.*,s.barcode FROM order_items i JOIN skus s ON s.id=i.sku_id WHERE i.id=$1 AND i.order_id=$2',
                [input.itemId, orderId],
              ),
            );
            if (input.barcode !== (item.barcode ?? item.sku_code))
              fail('BARCODE_MISMATCH', 'Mã hàng không khớp.', 422);
            if (input.pickedQuantity > item.quantity)
              fail('QUANTITY_EXCEEDED', 'Số lượng vượt dòng hàng.', 422);
            await tx.query('UPDATE order_items SET picked_quantity=$2 WHERE id=$1', [
              item.id,
              input.pickedQuantity,
            ]);
            updated = await one(
              tx,
              'UPDATE orders SET version=version+1,updated_at=now() WHERE id=$1 RETURNING *',
              [orderId],
            );
            await audit(tx, actor.id, 'order.pick', 'order', orderId, requestId, {
              itemId: item.id,
              pickedQuantity: input.pickedQuantity,
            });
          } else {
            const incomplete = await one(
              tx,
              'SELECT id FROM order_items WHERE order_id=$1 AND picked_quantity<>quantity LIMIT 1',
              [orderId],
            );
            if (incomplete) fail('PICKING_INCOMPLETE', 'Chưa soạn đủ hàng.');
            updated = await transition(
              tx,
              order,
              'READY',
              actor.id,
              requestId,
              'Đã soạn và kiểm tra',
            );
            await this.newToken(tx, orderId);
          }
        } else if (action === 'collection') {
          state(order, ['READY']);
          const settlement = await paymentDetails(tx, order);
          if (settlement.cashPaid > 0)
            fail('CASH_ALREADY_COLLECTED', 'Đơn đã được ghi nhận tiền mặt.', 409);
          if (settlement.onlineRetained < order.deposit_amount)
            fail('DEPOSIT_REQUIRED', 'Đơn chưa thanh toán đủ tiền đặt cọc.', 422);
          const outstanding = settlement.amountRemaining;
          if (
            order.payment_method !== 'PAY_AT_PICKUP' ||
            outstanding <= 0 ||
            input.amount <= 0 ||
            outstanding !== input.amount
          )
            fail('PAYMENT_AMOUNT_MISMATCH', 'Số tiền/phương thức không phù hợp.', 422);
          await tx.query(
            "INSERT INTO counter_collections(order_id,amount,method,collected_by,request_key,shift_reference) VALUES($1,$2,'CASH',$3,$4,$5)",
            [orderId, input.amount, actor.id, `${actor.id}:${key}`, input.shiftReference],
          );
          updated = await one(
            tx,
            'UPDATE orders SET version=version+1,updated_at=now() WHERE id=$1 RETURNING *',
            [orderId],
          );
          await audit(tx, actor.id, 'payment.cash_collected', 'order', orderId, requestId, {
            amount: input.amount,
            shiftReference: input.shiftReference,
          });
        } else if (action === 'handover') {
          state(order, ['READY']);
          const token = must(
            await one(
              tx,
              'SELECT *,expires_at>clock_timestamp() AS valid FROM pickup_tokens WHERE order_id=$1 AND token_hash=$2 FOR UPDATE',
              [orderId, hash(input.token)],
            ),
          );
          if (token.used_at) fail('QR_ALREADY_USED', 'Đơn đã nhận.');
          if (
            !token.valid ||
            token.revoked_at ||
            !constantEqual(token.token_hash, hash(input.token))
          )
            fail('QR_EXPIRED', 'Mã nhận hàng không còn hiệu lực.', 410);
          if ((await paymentDetails(tx, order)).status !== 'PAID')
            fail('PAYMENT_REQUIRED', 'Phải ghi nhận đủ tiền trước khi bàn giao.', 422);
          const reservations = await rows(
            tx,
            "SELECT * FROM inventory_reservations WHERE order_id=$1 AND status='COMMITTED' ORDER BY sku_id FOR UPDATE",
            [orderId],
          );
          if (!reservations.length) fail('RESERVATION_MISSING', 'Không có giữ tồn hợp lệ.');
          for (const r of reservations) {
            await tx.query(
              'UPDATE inventory_balances SET on_hand=on_hand-$3,reserved=reserved-$3,version=version+1,updated_at=now() WHERE store_id=$1 AND sku_id=$2',
              [storeId, r.sku_id, r.quantity],
            );
            await tx.query("UPDATE inventory_reservations SET status='CONSUMED' WHERE id=$1", [
              r.id,
            ]);
            await tx.query(
              "INSERT INTO stock_movements(store_id,sku_id,delta_on_hand,delta_reserved,reason,reference_id,actor_id) VALUES($1,$2,$3,$3,'HANDOVER',$4,$5)",
              [storeId, r.sku_id, -r.quantity, orderId, actor.id],
            );
          }
          await tx.query('UPDATE pickup_tokens SET used_at=clock_timestamp() WHERE id=$1', [
            token.id,
          ]);
          await tx.query(
            "UPDATE slot_bookings SET status='FULFILLED' WHERE order_id=$1 AND status='ACTIVE'",
            [orderId],
          );
          await tx.query(
            "UPDATE voucher_redemptions SET status='COMMITTED' WHERE order_id=$1 AND status='RESERVED'",
            [orderId],
          );
          await tx.query(
            "UPDATE picking_assignments SET status='COMPLETED',completed_at=clock_timestamp() WHERE order_id=$1 AND status='ACTIVE'",
            [orderId],
          );
          updated = await transition(
            tx,
            order,
            'COMPLETED',
            actor.id,
            requestId,
            'Counter bàn giao',
          );
        } else if (action === 'cancel') {
          state(order, ['PENDING_PAYMENT', 'CONFIRMED', 'PICKING', 'READY']);
          if (['PICKING', 'READY'].includes(order.status) && !input.restockConfirmed)
            fail('RESTOCK_REQUIRED', 'Cần xác nhận hàng đã trả về khu vực bán.', 422);
          if (await one(tx, 'SELECT id FROM counter_collections WHERE order_id=$1', [orderId]))
            fail(
              'CASH_REFUND_REVIEW_REQUIRED',
              'Đơn đã thu tiền mặt cần xử lý hoàn tại quầy, chưa hỗ trợ hủy tự động.',
              422,
            );
          updated = await releaseOrder(tx, order, 'CANCELLED', actor.id, requestId, input.reason);
        } else if (action === 'reassign') {
          state(order, ['CONFIRMED', 'PICKING']);
          must(
            await one(
              tx,
              "SELECT m.user_id FROM store_memberships m JOIN users u ON u.id=m.user_id WHERE m.user_id=$1 AND m.store_id=$2 AND m.role='PICKER' AND u.status='ACTIVE'",
              [input.pickerId, storeId],
            ),
          );
          await tx.query(
            "UPDATE picking_assignments SET status='CANCELLED',completed_at=clock_timestamp() WHERE order_id=$1 AND status='ACTIVE'",
            [orderId],
          );
          await tx.query(
            "INSERT INTO picking_assignments(order_id,picker_id,status) VALUES($1,$2,'ACTIVE')",
            [orderId, input.pickerId],
          );
          updated = await transition(tx, order, 'PICKING', actor.id, requestId, input.reason);
        } else if (action === 'issue') {
          state(order, ['PICKING', 'READY']);
          const manager =
            actor.is_admin ||
            (await one(
              tx,
              "SELECT 1 FROM store_memberships WHERE user_id=$1 AND store_id=$2 AND role='MANAGER'",
              [actor.id, storeId],
            ));
          if (!manager)
            must(
              await one(
                tx,
                "SELECT id FROM picking_assignments WHERE order_id=$1 AND picker_id=$2 AND status='ACTIVE'",
                [orderId, actor.id],
              ),
              'FORBIDDEN',
              'Đơn không được phân cho bạn.',
              403,
            );
          const item = must(
            await one(tx, 'SELECT quantity FROM order_items WHERE id=$1 AND order_id=$2', [
              input.itemId,
              orderId,
            ]),
          );
          if (input.quantity > item.quantity)
            fail('QUANTITY_EXCEEDED', 'Số lượng báo lỗi vượt dòng hàng.', 422);
          await tx.query(
            'INSERT INTO order_issues(order_id,item_id,actor_id,quantity,category,note) VALUES($1,$2,$3,$4,$5,$6)',
            [orderId, input.itemId, actor.id, input.quantity, input.category, input.note],
          );
          updated = await one(tx, 'UPDATE orders SET version=version+1 WHERE id=$1 RETURNING *', [
            orderId,
          ]);
        } else fail('UNKNOWN_ACTION', 'Thao tác không hỗ trợ.', 400);
        return orderView(tx, updated);
      });
    });
  }
}
