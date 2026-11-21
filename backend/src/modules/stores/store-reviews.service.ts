import { Inject, Injectable } from '@nestjs/common';
import { ownOrder } from '../../common/access';
import { Actor } from '../../common/context';
import { fail, must } from '../../common/errors';
import { Db, one, rows, Tx } from '../../database/db';
import { state } from '../orders/order-domain';
import { paginate } from '../catalog/catalog.service';

interface ReviewInput {
  rating: number;
  comment: string;
}

const reviewFields = 'id,rating,comment,created_at,updated_at';

@Injectable()
export class StoreReviewsService {
  constructor(@Inject(Db) private readonly db: Db) {}

  list(storeId: string, { limit, cursor }: { limit: number; cursor?: string }) {
    return this.db.tx(async (tx) => {
      must(await one(tx, "SELECT id FROM stores WHERE id=$1 AND status='ACTIVE'", [storeId]));
      const summary = await one(
        tx,
        'SELECT avg(rating)::float8 AS average,count(*) AS count FROM store_reviews WHERE store_id=$1',
        [storeId],
      );
      const items = await rows(
        tx,
        `SELECT ${reviewFields} FROM store_reviews
         WHERE store_id=$1 AND ($2::uuid IS NULL OR (created_at,id) <
           (SELECT created_at,id FROM store_reviews WHERE store_id=$1 AND id=$2))
         ORDER BY created_at DESC,id DESC LIMIT $3`,
        [storeId, cursor ?? null, limit + 1],
      );
      return { ...paginate(items, limit), summary };
    });
  }

  private async eligibleOrder(tx: Tx, actor: Actor, orderId: string, lock = false) {
    const customer =
      !actor.is_admin &&
      (await one(
        tx,
        `SELECT 1 FROM users u WHERE u.id=$1 AND u.account_type='USER'
         AND NOT EXISTS (SELECT 1 FROM store_memberships WHERE user_id=u.id)`,
        [actor.id],
      ));
    if (!customer) fail('FORBIDDEN', 'Tính năng đánh giá dành cho khách hàng.', 403);
    const order = await ownOrder(tx, actor, orderId, lock);
    state(order, ['COMPLETED']);
    return order;
  }

  get(actor: Actor, orderId: string) {
    return this.db.tx(async (tx) => {
      await this.eligibleOrder(tx, actor, orderId);
      const review = await one(tx, `SELECT ${reviewFields} FROM store_reviews WHERE order_id=$1`, [
        orderId,
      ]);
      return { review: review ?? null };
    });
  }

  save(actor: Actor, orderId: string, input: ReviewInput) {
    return this.db.tx(async (tx) => {
      const order = await this.eligibleOrder(tx, actor, orderId, true);
      return must(
        await one(
          tx,
          `INSERT INTO store_reviews(order_id,store_id,rating,comment)
           VALUES($1,$2,$3,$4)
           ON CONFLICT(order_id) DO UPDATE SET rating=excluded.rating,comment=excluded.comment,
             updated_at=clock_timestamp()
           RETURNING ${reviewFields}`,
          [order.id, order.store_id, input.rating, input.comment],
        ),
      );
    });
  }
}
