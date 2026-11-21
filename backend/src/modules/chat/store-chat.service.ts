import { Inject, Injectable } from '@nestjs/common';
import { storeAccess } from '../../common/access';
import { Actor } from '../../common/context';
import { fail, must } from '../../common/errors';
import { Db, one, rows, Tx } from '../../database/db';

interface ChatPage {
  limit: number;
  before?: number;
}

const activeStatuses = ['PENDING_PAYMENT', 'CONFIRMED', 'PICKING', 'READY'];
const staffRoles = ['MANAGER', 'COUNTER', 'PICKER'];
// Both queries bind the actor ID as $2 and use o for the order.
const staffCanChat = `EXISTS (
  SELECT 1 FROM store_memberships m WHERE m.store_id=o.store_id AND m.user_id=$2
  AND (m.role IN ('MANAGER','COUNTER') OR (m.role='PICKER' AND EXISTS (
    SELECT 1 FROM picking_assignments a WHERE a.order_id=o.id AND a.picker_id=$2 AND a.status='ACTIVE'
  )))
)`;

interface OrderContact {
  id: string;
  code: string;
  status: string;
  user_id: string;
  store_name: string;
  customer_name: string;
}

@Injectable()
export class StoreChatService {
  constructor(@Inject(Db) private readonly db: Db) {}

  private async requireCustomer(tx: Tx, actor: Actor) {
    const customer =
      !actor.is_admin &&
      (await one(
        tx,
        `SELECT 1 FROM users u WHERE u.id=$1 AND u.account_type='USER'
       AND NOT EXISTS (SELECT 1 FROM store_memberships m WHERE m.user_id=u.id)`,
        [actor.id],
      ));
    if (!customer) fail('FORBIDDEN', 'Hộp thư này dành cho khách hàng.', 403);
  }

  list(actor: Actor, storeId: string | null, { limit, before }: ChatPage) {
    return this.db.tx(async (tx) => {
      if (storeId) await storeAccess(tx, actor, storeId, staffRoles);
      else await this.requireCustomer(tx, actor);
      const readThrough = storeId ? 't.store_read_through' : 't.customer_read_through';
      const results = await rows(
        tx,
        `SELECT o.id,o.code AS order_code,s.name AS store_name,u.display_name AS customer_name,
           t.last_message_id,m.body AS last_message,m.created_at AS last_message_at,
           t.last_message_id > ${readThrough} AS unread
         FROM order_chat_threads t JOIN orders o ON o.id=t.order_id
         JOIN order_chat_messages m ON m.id=t.last_message_id
         JOIN stores s ON s.id=o.store_id JOIN users u ON u.id=o.user_id
         WHERE (CASE WHEN $1::uuid IS NULL THEN o.user_id=$2
                     ELSE o.store_id=$1 AND ($5::boolean OR ${staffCanChat}) END)
           AND o.status=ANY($6::text[]) AND t.last_message_id > 0
           AND ($3::bigint IS NULL OR t.last_message_id < $3)
         ORDER BY t.last_message_id DESC LIMIT $4`,
        [storeId, actor.id, before ?? null, limit + 1, actor.is_admin, activeStatuses],
      );
      const items = results.slice(0, limit);
      return { items, nextBefore: results.length > limit ? items.at(-1)!.last_message_id : null };
    });
  }

  private async order(tx: Tx, actor: Actor, orderId: string, lock = false) {
    const order = must(
      await one<OrderContact>(
        tx,
        `SELECT o.id,o.code,o.status,o.user_id,s.name AS store_name,u.display_name AS customer_name
       FROM orders o JOIN stores s ON s.id=o.store_id JOIN users u ON u.id=o.user_id
       WHERE o.id=$1 AND (o.user_id=$2 OR $3::boolean OR ${staffCanChat})
       ${lock ? 'FOR UPDATE OF o' : ''}`,
        [orderId, actor.id, actor.is_admin],
      ),
    );
    const side = order.user_id === actor.id ? 'CUSTOMER' : 'STORE';
    if (side === 'CUSTOMER') await this.requireCustomer(tx, actor);
    if (!activeStatuses.includes(order.status))
      fail('ORDER_CHAT_CLOSED', 'Cuộc trò chuyện đã kết thúc cùng đơn hàng.', 410);
    return { order, side };
  }

  history(actor: Actor, orderId: string, { before, limit }: ChatPage) {
    return this.db.tx(async (tx) => {
      const { order, side } = await this.order(tx, actor, orderId);
      const thread = await one(tx, 'SELECT * FROM order_chat_threads WHERE order_id=$1', [orderId]);
      const results = await rows(
        tx,
        `SELECT id,body,sender_side,created_at FROM order_chat_messages
         WHERE order_id=$1 AND ($2::bigint IS NULL OR id < $2)
         ORDER BY id DESC LIMIT $3`,
        [orderId, before ?? null, limit + 1],
      );
      const items = results.slice(0, limit);
      const readThrough =
        side === 'CUSTOMER' ? thread?.customer_read_through : thread?.store_read_through;
      return {
        thread: {
          orderCode: order.code,
          storeName: order.store_name,
          customerName: order.customer_name,
          side,
          unread: !!thread && thread.last_message_id > readThrough,
        },
        nextBefore: results.length > limit ? items.at(-1)!.id : null,
        items: items.reverse(),
      };
    });
  }

  send(actor: Actor, orderId: string, key: string, body: string) {
    return this.db.tx(async (tx) => {
      const { side } = await this.order(tx, actor, orderId, true);
      const existing = await one(
        tx,
        'SELECT id,body FROM order_chat_messages WHERE order_id=$1 AND sender_id=$2 AND request_key=$3',
        [orderId, actor.id, key],
      );
      if (existing) {
        if (existing.body !== body)
          fail('IDEMPOTENCY_CONFLICT', 'Khóa này đã dùng cho nội dung khác.');
        return { id: existing.id };
      }
      await tx.query('INSERT INTO order_chat_threads(order_id) VALUES($1) ON CONFLICT DO NOTHING', [
        orderId,
      ]);
      const message = must(
        await one(
          tx,
          'INSERT INTO order_chat_messages(order_id,sender_id,sender_side,body,request_key) VALUES($1,$2,$3,$4,$5) RETURNING id',
          [orderId, actor.id, side, body, key],
        ),
      );
      const column = side === 'CUSTOMER' ? 'customer_read_through' : 'store_read_through';
      await tx.query(
        `UPDATE order_chat_threads SET last_message_id=$2,${column}=$2 WHERE order_id=$1`,
        [orderId, message.id],
      );
      return { id: message.id };
    });
  }

  markRead(actor: Actor, orderId: string, through: number) {
    return this.db.tx(async (tx) => {
      const { side } = await this.order(tx, actor, orderId);
      const column = side === 'CUSTOMER' ? 'customer_read_through' : 'store_read_through';
      await tx.query(
        `UPDATE order_chat_threads SET ${column}=$2
         WHERE order_id=$1 AND ${column} < $2
           AND EXISTS (SELECT 1 FROM order_chat_messages WHERE order_id=$1 AND id=$2)`,
        [orderId, through],
      );
      return { acknowledged: true };
    });
  }
}
