import { one, rows, Tx } from '../../database/db';
import { event } from '../../common/events';
import { fail, must } from '../../common/errors';

export async function transition(
  tx: Tx,
  order: any,
  to: string,
  actor: string | null,
  requestId: string,
  reason: string,
) {
  const updated = must(
    await one(
      tx,
      "UPDATE orders SET status=$2,version=version+1,updated_at=now(),completed_at=CASE WHEN $2='COMPLETED' THEN clock_timestamp() ELSE completed_at END WHERE id=$1 RETURNING *",
      [order.id, to],
    ),
  );
  await event(tx, updated, order.status, actor, requestId, reason);
  return updated;
}
export async function refundPaid(tx: Tx, orderId: string, reason: string) {
  const paid = await rows(
    tx,
    "SELECT * FROM payment_attempts WHERE order_id=$1 AND status='PAID' ORDER BY id FOR UPDATE",
    [orderId],
  );
  for (const payment of paid) {
    const sum = await one(
      tx,
      "SELECT COALESCE(sum(amount),0)::bigint AS amount FROM refunds WHERE payment_attempt_id=$1 AND status IN ('REQUESTED','PROCESSING','SUCCEEDED')",
      [payment.id],
    );
    const remaining = payment.amount - sum!.amount;
    if (remaining > 0)
      await tx.query(
        "INSERT INTO refunds(payment_attempt_id,amount,reason,status) VALUES($1,$2,$3,'REQUESTED')",
        [payment.id, remaining, reason],
      );
  }
}
export async function releaseOrder(
  tx: Tx,
  order: any,
  status: 'CANCELLED' | 'EXPIRED',
  actor: string | null,
  requestId: string,
  reason: string,
) {
  const reservations = await rows(
    tx,
    "SELECT * FROM inventory_reservations WHERE order_id=$1 AND status IN ('ACTIVE','COMMITTED') ORDER BY sku_id FOR UPDATE",
    [order.id],
  );
  for (const r of reservations) {
    await tx.query(
      'UPDATE inventory_balances SET reserved=reserved-$3,version=version+1,updated_at=now() WHERE store_id=$1 AND sku_id=$2',
      [r.store_id, r.sku_id, r.quantity],
    );
    await tx.query("UPDATE inventory_reservations SET status='RELEASED' WHERE id=$1", [r.id]);
    await tx.query(
      "INSERT INTO stock_movements(store_id,sku_id,delta_on_hand,delta_reserved,reason,reference_id,actor_id) VALUES($1,$2,0,$3,'RELEASE',$4,$5)",
      [r.store_id, r.sku_id, -r.quantity, order.id, actor],
    );
  }
  const booking = await one(
    tx,
    "UPDATE slot_bookings SET status='RELEASED' WHERE order_id=$1 AND status='ACTIVE' RETURNING slot_id",
    [order.id],
  );
  if (booking)
    await tx.query(
      'UPDATE fulfillment_slots SET allocated_count=allocated_count-1,version=version+1 WHERE id=$1',
      [booking.slot_id],
    );
  const redemption = await one(
    tx,
    "UPDATE voucher_redemptions SET status='RELEASED' WHERE order_id=$1 AND status='RESERVED' RETURNING voucher_id",
    [order.id],
  );
  if (redemption)
    await tx.query('UPDATE vouchers SET allocated_count=allocated_count-1 WHERE id=$1', [
      redemption.voucher_id,
    ]);
  await tx.query(
    "UPDATE picking_assignments SET status='CANCELLED',completed_at=clock_timestamp() WHERE order_id=$1 AND status='ACTIVE'",
    [order.id],
  );
  await tx.query(
    'UPDATE pickup_tokens SET revoked_at=clock_timestamp() WHERE order_id=$1 AND used_at IS NULL AND revoked_at IS NULL',
    [order.id],
  );
  await refundPaid(tx, order.id, reason);
  return transition(tx, order, status, actor, requestId, reason);
}
export async function paymentDetails(tx: Pick<Tx, 'query'>, order: any) {
  const totals = must(
    await one(
      tx,
      `SELECT
    (SELECT COALESCE(sum(amount),0) FROM payment_attempts WHERE order_id=$1 AND status='PAID')::bigint AS online_paid,
    (SELECT COALESCE(sum(amount),0) FROM counter_collections WHERE order_id=$1)::bigint AS cash_paid,
    (SELECT COALESCE(sum(r.amount),0) FROM refunds r JOIN payment_attempts p ON p.id=r.payment_attempt_id WHERE p.order_id=$1 AND r.status='SUCCEEDED')::bigint AS refunded,
    (SELECT COALESCE(sum(r.amount),0) FROM refunds r JOIN payment_attempts p ON p.id=r.payment_attempt_id WHERE p.order_id=$1 AND r.status IN ('REQUESTED','PROCESSING'))::bigint AS pending`,
      [order.id],
    ),
  );
  const paid = totals.online_paid + totals.cash_paid;
  const onlineRetained = totals.online_paid - totals.refunded - totals.pending;
  const retained = onlineRetained + totals.cash_paid;
  const cancelled = order.status === 'CANCELLED' || order.status === 'EXPIRED';
  const closed = cancelled || order.status === 'COMPLETED';
  let status: string;
  if (!cancelled && retained >= order.total) status = 'PAID';
  else if (!closed && order.deposit_amount > 0 && retained >= order.deposit_amount)
    status = 'PARTIALLY_PAID';
  else if (totals.pending > 0) status = 'REFUND_PENDING';
  else if (totals.refunded > 0)
    status = totals.refunded >= paid ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
  else if (paid >= order.total) status = 'PAID';
  else if (paid > 0) status = 'PARTIALLY_PAID';
  else status = order.status === 'PENDING_PAYMENT' ? 'PENDING' : 'UNPAID';
  return {
    status,
    onlineRetained,
    cashPaid: totals.cash_paid,
    amountPaid: paid,
    amountRefunded: totals.refunded,
    amountRemaining: closed ? 0 : Math.max(order.total - retained, 0),
  };
}
export async function orderView(tx: Pick<Tx, 'query'>, order: any) {
  const payment = await paymentDetails(tx, order);
  return {
    ...order,
    paymentStatus: payment.status,
    amountPaid: payment.amountPaid,
    amountRefunded: payment.amountRefunded,
    amountRemaining: payment.amountRemaining,
    canCollectCash:
      order.status === 'READY' &&
      order.payment_method === 'PAY_AT_PICKUP' &&
      payment.amountRemaining > 0 &&
      payment.cashPaid === 0 &&
      payment.onlineRetained >= order.deposit_amount,
    items: await rows(
      tx,
      'SELECT i.*,s.barcode FROM order_items i JOIN skus s ON s.id=i.sku_id WHERE i.order_id=$1 ORDER BY i.id',
      [order.id],
    ),
    slot: await one(tx, 'SELECT id,starts_at,ends_at FROM fulfillment_slots WHERE id=$1', [
      order.slot_id,
    ]),
    store: await one(tx, 'SELECT id,code,name,address,latitude,longitude FROM stores WHERE id=$1', [
      order.store_id,
    ]),
    timeline: await rows(
      tx,
      'SELECT from_status,to_status,reason,created_at FROM order_events WHERE order_id=$1 ORDER BY created_at,id',
      [order.id],
    ),
    refunds: await rows(
      tx,
      'SELECT r.id,r.amount,r.status,r.created_at FROM refunds r JOIN payment_attempts p ON p.id=r.payment_attempt_id WHERE p.order_id=$1',
      [order.id],
    ),
  };
}
export function state(order: any, allowed: string[]) {
  if (!allowed.includes(order.status))
    fail('INVALID_TRANSITION', 'Trạng thái đơn không cho phép thao tác.');
}
