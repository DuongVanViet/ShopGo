import { Tx } from '../database/db';

export async function audit(
  tx: Tx,
  actor: string | null,
  action: string,
  entity: string,
  entityId: string,
  requestId: string,
  details: unknown = {},
) {
  await tx.query(
    'INSERT INTO audit_logs(actor_id,action,entity_type,entity_id,request_id,details) VALUES($1,$2,$3,$4,$5,$6)',
    [actor, action, entity, entityId, requestId, JSON.stringify(details)],
  );
}
export async function event(
  tx: Tx,
  order: any,
  from: string | null,
  actor: string | null,
  requestId: string,
  reason: string,
) {
  await tx.query(
    'INSERT INTO order_events(order_id,from_status,to_status,actor_id,reason,request_id) VALUES($1,$2,$3,$4,$5,$6)',
    [order.id, from, order.status, actor, reason, requestId],
  );
  await tx.query(
    'INSERT INTO outbox_events(aggregate_id,aggregate_version,type,payload) VALUES($1,$2,$3,$4)',
    [
      order.id,
      order.version,
      `order.${order.status.toLowerCase()}`,
      JSON.stringify({
        orderId: order.id,
        userId: order.user_id,
        storeId: order.store_id,
        status: order.status,
      }),
    ],
  );
}
