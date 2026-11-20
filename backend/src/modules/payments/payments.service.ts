import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Db, one } from '../../database/db';
import { ENV, Env } from '../../config/env';
import { Actor } from '../../common/context';
import { expected, ownOrder, storeAccess } from '../../common/access';
import { constantEqual, hash, hmac } from '../../common/crypto';
import { fail, must } from '../../common/errors';
import { audit } from '../../common/events';
import { idempotent } from '../../common/idempotency';
import { orderView, refundPaid, releaseOrder, state, transition } from '../orders/order-domain';

@Injectable()
export class PaymentsService {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}
  private sandbox() {
    if (this.env.PAYMENT_MODE !== 'sandbox' || this.env.NODE_ENV === 'production')
      fail('PAYMENT_UNAVAILABLE', 'Chưa cấu hình cổng thanh toán thật.', 503);
  }
  attempt(
    actor: Actor,
    orderId: string,
    input: { expectedVersion: number },
    key: string | undefined,
  ) {
    this.sandbox();
    return this.db.tx((tx) =>
      idempotent(tx, actor.id, `payment.attempt:${orderId}`, key, input, async () => {
        const order = await ownOrder(tx, actor, orderId, true);
        expected(order, input.expectedVersion);
        state(order, ['PENDING_PAYMENT']);
        const valid = await one(
          tx,
          'SELECT expires_at>clock_timestamp() AS valid FROM orders WHERE id=$1',
          [orderId],
        );
        if (!valid!.valid) fail('ORDER_EXPIRED', 'Đơn đã hết hạn thanh toán.', 410);
        const active = await one(
          tx,
          "SELECT * FROM payment_attempts WHERE order_id=$1 AND status='PENDING' ORDER BY created_at DESC LIMIT 1",
          [orderId],
        );
        const attempt =
          active ??
          (await one(
            tx,
            "INSERT INTO payment_attempts(order_id,provider,provider_reference,amount,status) VALUES($1,'sandbox',$2,$3,'PENDING') RETURNING *",
            [orderId, randomUUID(), order.amount_due_now],
          ));
        return {
          ...attempt,
          sandbox: true,
          instructions:
            'Local simulator only. Send a signed sandbox webhook; this does not collect real money.',
        };
      }),
    );
  }
  confirmSandboxPayment(
    actor: Actor,
    orderId: string,
    attemptId: string,
    input: { expectedVersion: number },
    key: string | undefined,
    requestId: string,
  ) {
    this.sandbox();
    return this.db.tx((tx) =>
      idempotent(
        tx,
        actor.id,
        `payment.sandbox.confirm:${orderId}:${attemptId}`,
        key,
        input,
        async () => {
          const order = await ownOrder(tx, actor, orderId, true);
          expected(order, input.expectedVersion);
          state(order, ['PENDING_PAYMENT']);
          const payment = must(
            await one(
              tx,
              `SELECT * FROM payment_attempts
               WHERE id=$1 AND order_id=$2 AND provider='sandbox' FOR UPDATE`,
              [attemptId, orderId],
            ),
            'PAYMENT_ATTEMPT_NOT_FOUND',
            'Không tìm thấy lần thanh toán mô phỏng.',
            404,
          );
          if (payment.status !== 'PENDING')
            fail('PAYMENT_ATTEMPT_NOT_PENDING', 'Lần thanh toán không còn ở trạng thái chờ.', 409);
          if (payment.amount !== order.amount_due_now)
            fail('PAYMENT_AMOUNT_MISMATCH', 'Số tiền thanh toán không khớp đơn hàng.', 422);
          const valid = await one(
            tx,
            'SELECT expires_at>clock_timestamp() AS valid FROM orders WHERE id=$1',
            [orderId],
          );
          if (!valid!.valid) fail('ORDER_EXPIRED', 'Đơn đã hết hạn thanh toán.', 410);
          await tx.query(
            "UPDATE payment_attempts SET status='PAID',paid_at=clock_timestamp() WHERE id=$1",
            [payment.id],
          );
          await tx.query(
            "UPDATE inventory_reservations SET status='COMMITTED' WHERE order_id=$1 AND status='ACTIVE'",
            [order.id],
          );
          const updated = await transition(
            tx,
            order,
            'CONFIRMED',
            actor.id,
            requestId,
            'Thanh toán mô phỏng được người đặt đơn xác nhận',
          );
          await audit(
            tx,
            actor.id,
            'payment.sandbox_owner_confirm',
            'payment',
            payment.id,
            requestId,
            { orderId, amount: payment.amount },
          );
          return orderView(tx, updated);
        },
      ),
    );
  }
  async webhook(
    provider: string,
    raw: Buffer,
    timestamp: string | undefined,
    signature: string | undefined,
    input: {
      eventId: string;
      reference: string;
      merchant: string;
      amount: number;
      currency: 'VND';
      status: 'PAID' | 'FAILED';
    },
  ) {
    this.sandbox();
    if (provider !== 'sandbox')
      fail('PROVIDER_UNSUPPORTED', 'Nhà cung cấp chưa được tích hợp.', 404);
    if (
      !timestamp ||
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(Date.now() / 1000 - Number(timestamp)) > 300 ||
      !signature ||
      !constantEqual(
        hmac(this.env.PAYMENT_WEBHOOK_SECRET!, `${timestamp}.${raw.toString('utf8')}`),
        signature,
      )
    ) {
      fail('WEBHOOK_SIGNATURE_INVALID', 'Webhook không hợp lệ.', 401);
    }
    return this.db.tx(async (tx) => {
      const order = must(
        await one(
          tx,
          'SELECT o.* FROM orders o JOIN payment_attempts p ON p.order_id=o.id WHERE p.provider=$1 AND p.provider_reference=$2 FOR UPDATE OF o',
          [provider, input.reference],
        ),
      );
      const payment = must(
        await one(
          tx,
          'SELECT * FROM payment_attempts WHERE provider=$1 AND provider_reference=$2 FOR UPDATE',
          [provider, input.reference],
        ),
      );
      if (
        input.merchant !== 'shopgo-local' ||
        input.amount !== payment.amount ||
        payment.amount !== order.amount_due_now ||
        input.currency !== payment.currency
      )
        fail('PAYMENT_AMOUNT_MISMATCH', 'Merchant, số tiền hoặc tiền tệ không khớp.', 422);
      const digest = hash(raw.toString('utf8'));
      const previous = await one(
        tx,
        'SELECT * FROM payment_webhook_inbox WHERE provider=$1 AND provider_event_id=$2',
        [provider, input.eventId],
      );
      if (previous) {
        if (previous.payload_hash !== digest)
          fail('WEBHOOK_EVENT_CONFLICT', 'Sự kiện trùng ID nhưng khác nội dung.');
        return { accepted: true, duplicate: true };
      }
      await tx.query(
        'INSERT INTO payment_webhook_inbox(provider,provider_event_id,payload_hash,processed_at) VALUES($1,$2,$3,clock_timestamp())',
        [provider, input.eventId, digest],
      );
      if (payment.status === 'PAID') return { accepted: true };
      if (input.status === 'FAILED') {
        await tx.query("UPDATE payment_attempts SET status='FAILED' WHERE id=$1", [payment.id]);
        return { accepted: true };
      }
      await tx.query(
        "UPDATE payment_attempts SET status='PAID',paid_at=clock_timestamp() WHERE id=$1",
        [payment.id],
      );
      const inTime = await one(
        tx,
        'SELECT expires_at>clock_timestamp() AS valid FROM orders WHERE id=$1',
        [order.id],
      );
      if (order.status === 'PENDING_PAYMENT' && inTime!.valid) {
        await tx.query(
          "UPDATE inventory_reservations SET status='COMMITTED' WHERE order_id=$1 AND status='ACTIVE'",
          [order.id],
        );
        await transition(
          tx,
          order,
          'CONFIRMED',
          null,
          input.eventId,
          'Thanh toán sandbox được xác minh',
        );
      } else if (order.status === 'PENDING_PAYMENT') {
        await releaseOrder(tx, order, 'EXPIRED', null, input.eventId, 'Thanh toán đến muộn');
      } else if (['CANCELLED', 'EXPIRED'].includes(order.status)) {
        await refundPaid(tx, order.id, 'Thanh toán sau khi đơn kết thúc');
      } else {
        if (payment.amount > 0)
          await tx.query(
            "INSERT INTO refunds(payment_attempt_id,amount,reason,status) VALUES($1,$2,'Thu dư từ payment attempt khác','REQUESTED')",
            [payment.id, payment.amount],
          );
      }
      await audit(tx, null, 'payment.sandbox_verified', 'payment', payment.id, input.eventId, {
        amount: payment.amount,
      });
      return { accepted: true };
    });
  }
  refund(
    actor: Actor,
    storeId: string,
    input: { paymentId: string; amount: number; reason: string },
    key: string | undefined,
    requestId: string,
  ) {
    if (!actor.can_refund) fail('FORBIDDEN', 'Chưa được cấp quyền hoàn tiền.', 403);
    return this.db.tx(async (tx) => {
      await storeAccess(tx, actor, storeId, ['MANAGER']);
      return idempotent(tx, actor.id, `refund.create:${storeId}`, key, input, async () => {
        const payment = must(
          await one(
            tx,
            "SELECT p.* FROM payment_attempts p JOIN orders o ON o.id=p.order_id WHERE p.id=$1 AND o.store_id=$2 AND p.status='PAID' FOR UPDATE OF p",
            [input.paymentId, storeId],
          ),
        );
        const used = await one(
          tx,
          "SELECT COALESCE(sum(amount),0)::bigint AS total FROM refunds WHERE payment_attempt_id=$1 AND status IN ('REQUESTED','PROCESSING','SUCCEEDED')",
          [payment.id],
        );
        if (used!.total + input.amount > payment.amount)
          fail('REFUND_EXCEEDS_PAYMENT', 'Số tiền hoàn vượt phần có thể hoàn.', 422);
        const refund = must(
          await one(
            tx,
            "INSERT INTO refunds(payment_attempt_id,amount,reason,status) VALUES($1,$2,$3,'REQUESTED') RETURNING *",
            [payment.id, input.amount, input.reason],
          ),
        );
        await audit(tx, actor.id, 'refund.request', 'refund', refund.id, requestId, {
          amount: input.amount,
          reason: input.reason,
        });
        return refund;
      });
    });
  }
  confirmSandboxRefund(
    actor: Actor,
    storeId: string,
    refundId: string,
    key: string | undefined,
    requestId: string,
  ) {
    this.sandbox();
    if (!actor.can_refund) fail('FORBIDDEN', 'Chưa được cấp quyền hoàn tiền.', 403);
    return this.db.tx(async (tx) => {
      await storeAccess(tx, actor, storeId, ['MANAGER']);
      return idempotent(tx, actor.id, `refund.sandbox:${refundId}`, key, {}, async () => {
        const refund = must(
          await one(
            tx,
            `SELECT r.* FROM refunds r JOIN payment_attempts p ON p.id=r.payment_attempt_id JOIN orders o ON o.id=p.order_id
          WHERE r.id=$1 AND o.store_id=$2 AND p.provider='sandbox' FOR UPDATE OF r`,
            [refundId, storeId],
          ),
        );
        if (refund.status !== 'REQUESTED')
          fail('INVALID_TRANSITION', 'Yêu cầu hoàn không ở trạng thái chờ.');
        const updated = await one(
          tx,
          "UPDATE refunds SET status='SUCCEEDED',provider_reference=$2,succeeded_at=clock_timestamp() WHERE id=$1 RETURNING *",
          [refundId, `sandbox-${refundId}`],
        );
        await audit(tx, actor.id, 'refund.sandbox_confirm', 'refund', refundId, requestId);
        return updated;
      });
    });
  }
}
