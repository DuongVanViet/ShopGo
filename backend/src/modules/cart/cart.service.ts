import { Inject, Injectable } from '@nestjs/common';
import { storePriceFields } from '../catalog/store-price';
import { Db, one, rows, Tx } from '../../database/db';
import { Actor } from '../../common/context';
import { expected } from '../../common/access';
import { fail, must } from '../../common/errors';
import { ENV, Env } from '../../config/env';
import { priceCart } from './pricing';
import { orderPaymentTerms, quotePaymentOptions } from '../orders/payment-plan';

@Injectable()
export class CartService {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
  ) {}
  async active(tx: Tx, actor: Actor, storeId: string) {
    must(await one(tx, "SELECT id FROM stores WHERE id=$1 AND status='ACTIVE'", [storeId]));
    await tx.query(
      "INSERT INTO carts(user_id,store_id) VALUES($1,$2) ON CONFLICT(user_id,store_id) WHERE status='ACTIVE' DO NOTHING",
      [actor.id, storeId],
    );
    return must(
      await one(
        tx,
        "SELECT * FROM carts WHERE user_id=$1 AND store_id=$2 AND status='ACTIVE' FOR UPDATE",
        [actor.id, storeId],
      ),
    );
  }
  async view(tx: Tx, cart: any) {
    return {
      ...cart,
      items: await rows(
        tx,
        `SELECT ci.*,s.name,s.code,s.unit,${storePriceFields},COALESCE(b.on_hand-b.reserved,0) AS available,
        CASE WHEN ss.sku_id IS NULL OR b.sku_id IS NULL OR NOT ss.active OR NOT s.active THEN 'DISCONTINUED'
             WHEN ss.expires_on < (statement_timestamp() AT TIME ZONE st.timezone)::date THEN 'EXPIRED'
        END AS unavailable_reason,
        CASE WHEN pi.storage_key IS NULL THEN NULL ELSE '/api/v1/media/products/'||pi.storage_key END AS image_url
        FROM cart_items ci JOIN skus s ON s.id=ci.sku_id
        JOIN stores st ON st.id=$2
        LEFT JOIN store_skus ss ON ss.sku_id=ci.sku_id AND ss.store_id=st.id
        LEFT JOIN inventory_balances b ON b.sku_id=ci.sku_id AND b.store_id=st.id
        LEFT JOIN product_images pi ON pi.product_id=s.product_id
        WHERE ci.cart_id=$1 ORDER BY ci.sku_id`,
        [cart.id, cart.store_id],
      ),
    };
  }
  get(actor: Actor, storeId: string) {
    return this.db.tx(async (tx) => this.view(tx, await this.active(tx, actor, storeId)));
  }
  change(
    actor: Actor,
    skuId: string,
    input: { storeId: string; quantity?: number; expectedVersion: number },
  ) {
    return this.db.tx(async (tx) => {
      const cart = await this.active(tx, actor, input.storeId);
      expected(cart, input.expectedVersion);
      if (input.quantity !== undefined) {
        must(
          await one(
            tx,
            `SELECT ss.sku_id FROM store_skus ss JOIN skus s ON s.id=ss.sku_id
             JOIN stores st ON st.id=ss.store_id
             WHERE ss.store_id=$1 AND ss.sku_id=$2 AND ss.active AND s.active
             AND (ss.expires_on IS NULL OR ss.expires_on >= (statement_timestamp() AT TIME ZONE st.timezone)::date)`,
            [input.storeId, skuId],
          ),
        );
        await tx.query(
          'INSERT INTO cart_items(cart_id,sku_id,quantity) VALUES($1,$2,$3) ON CONFLICT(cart_id,sku_id) DO UPDATE SET quantity=$3',
          [cart.id, skuId, input.quantity],
        );
      } else
        await tx.query('DELETE FROM cart_items WHERE cart_id=$1 AND sku_id=$2', [cart.id, skuId]);
      const updated = await one(
        tx,
        'UPDATE carts SET version=version+1,updated_at=now() WHERE id=$1 RETURNING *',
        [cart.id],
      );
      return this.view(tx, updated);
    });
  }
  quote(
    actor: Actor,
    input: { cartId: string; cartVersion: number; slotId: string; voucherCode?: string },
  ) {
    return this.db.tx(async (tx) => {
      const cart = must(
        await one(
          tx,
          "SELECT * FROM carts WHERE id=$1 AND user_id=$2 AND status='ACTIVE' FOR UPDATE",
          [input.cartId, actor.id],
        ),
      );
      expected(cart, input.cartVersion);
      const pricing = await priceCart(tx, cart, input.slotId, input.voucherCode);
      const quote = must(
        await one(
          tx,
          `INSERT INTO checkout_quotes(cart_id,cart_version,pricing_version,slot_id,voucher_id,totals,items,expires_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()+$8*interval '1 second') RETURNING *`,
          [
            cart.id,
            cart.version,
            pricing.pricingVersion,
            input.slotId,
            pricing.voucherId,
            JSON.stringify(pricing.totals),
            JSON.stringify(pricing.items),
            this.env.QUOTE_TTL_SECONDS,
          ],
        ),
      );
      const deposit = orderPaymentTerms(pricing.totals.total, 'PAY_AT_PICKUP');
      return {
        ...quote,
        ...deposit,
        paymentOptions: quotePaymentOptions(pricing.totals.total),
      };
    });
  }
  switchStore(
    actor: Actor,
    input: {
      sourceStoreId: string;
      targetStoreId: string;
      expectedVersion: number;
      expectedTargetVersion?: number;
      confirm: boolean;
    },
  ) {
    if (input.sourceStoreId === input.targetStoreId)
      fail('SAME_STORE', 'Hãy chọn cửa hàng khác.', 422);
    return this.db.tx(async (tx) => {
      const source = await this.active(tx, actor, input.sourceStoreId);
      expected(source, input.expectedVersion);
      const target = await this.active(tx, actor, input.targetStoreId);
      const sourceItems = await rows(
        tx,
        `SELECT ci.sku_id,ci.quantity,${storePriceFields},ss.active,s.active AS sku_active,
        (ss.expires_on IS NULL OR ss.expires_on >= (clock_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date) AS not_expired,
        b.on_hand-b.reserved AS available
        FROM cart_items ci JOIN skus s ON s.id=ci.sku_id LEFT JOIN store_skus ss ON ss.sku_id=ci.sku_id AND ss.store_id=$2
        LEFT JOIN inventory_balances b ON b.sku_id=ci.sku_id AND b.store_id=$2 WHERE ci.cart_id=$1`,
        [source.id, target.store_id],
      );
      const preview = {
        items: sourceItems,
        replacesTargetCart: true,
        targetCartVersion: target.version,
      };
      if (!input.confirm) return preview;
      if (input.expectedTargetVersion === undefined)
        fail('TARGET_VERSION_REQUIRED', 'Cần phiên bản giỏ đích từ bước xem trước.', 400);
      expected(target, input.expectedTargetVersion);
      if (
        sourceItems.some(
          (i) =>
            i.price === null ||
            !i.active ||
            !i.sku_active ||
            !i.not_expired ||
            i.available < i.quantity,
        )
      )
        fail(
          'SKU_UNAVAILABLE',
          'Cần điều chỉnh các sản phẩm không đủ ở cửa hàng mới.',
          422,
          preview,
        );
      await tx.query('DELETE FROM cart_items WHERE cart_id=$1', [target.id]);
      await tx.query(
        'INSERT INTO cart_items(cart_id,sku_id,quantity) SELECT $2,sku_id,quantity FROM cart_items WHERE cart_id=$1',
        [source.id, target.id],
      );
      const updated = await one(tx, 'UPDATE carts SET version=version+1 WHERE id=$1 RETURNING *', [
        target.id,
      ]);
      return this.view(tx, updated);
    });
  }
}
