import { Inject, Injectable } from '@nestjs/common';
import { Db, one, rows } from '../database/db';
import { releaseOrder } from '../modules/orders/order-domain';

@Injectable()
export class JobsService {
  constructor(@Inject(Db) private readonly db: Db) {}
  async expire() {
    return this.db.tx(async (tx) => {
      const orders = await rows(
        tx,
        "SELECT * FROM orders WHERE status='PENDING_PAYMENT' AND expires_at<=clock_timestamp() ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED",
      );
      for (const order of orders)
        await releaseOrder(tx, order, 'EXPIRED', null, `expiry:${order.id}`, 'Hết hạn thanh toán');
      return orders.length;
    });
  }
  async dispatch() {
    return this.db.tx(async (tx) => {
      const events = await rows(
        tx,
        "SELECT * FROM outbox_events WHERE status='PENDING' AND available_at<=clock_timestamp() ORDER BY created_at,id LIMIT 100 FOR UPDATE SKIP LOCKED",
      );
      for (const event of events) {
        const receipt = await one(
          tx,
          "INSERT INTO consumer_receipts(consumer,event_id) VALUES('in-app-notifications',$1) ON CONFLICT DO NOTHING RETURNING event_id",
          [event.id],
        );
        if (
          receipt &&
          ['order.ready', 'order.cancelled', 'order.expired', 'order.completed'].includes(
            event.type,
          )
        ) {
          await tx.query(
            'INSERT INTO notification_deliveries(event_id,user_id,payload) VALUES($1,$2,$3) ON CONFLICT(event_id) DO NOTHING',
            [
              event.id,
              event.payload.userId,
              JSON.stringify({ orderId: event.payload.orderId, status: event.payload.status }),
            ],
          );
        }
        await tx.query(
          "UPDATE outbox_events SET status='PROCESSED',processed_at=clock_timestamp() WHERE id=$1",
          [event.id],
        );
      }
      return events.length;
    });
  }
}
