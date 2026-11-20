import { Inject, Injectable } from '@nestjs/common';
import { Actor } from '../../common/context';
import { fail, must } from '../../common/errors';
import { Db, one, rows } from '../../database/db';
import { storePriceFields } from './store-price';

const sellableOffer = `st.status='ACTIVE' AND ss.active AND s.active
  AND (ss.expires_on IS NULL OR ss.expires_on >= (clock_timestamp() AT TIME ZONE st.timezone)::date)`;

@Injectable()
export class FavoritesService {
  constructor(@Inject(Db) private readonly db: Db) {}

  private async requireCustomer(actor: Actor) {
    const customer =
      !actor.is_admin &&
      (await one(
        this.db.pool,
        `SELECT 1 FROM users u WHERE u.id=$1 AND u.account_type='USER'
       AND NOT EXISTS (SELECT 1 FROM store_memberships WHERE user_id=u.id)`,
        [actor.id],
      ));
    if (!customer) fail('FORBIDDEN', 'Danh sách yêu thích dành cho tài khoản khách hàng.', 403);
  }

  async list(actor: Actor) {
    await this.requireCustomer(actor);
    return rows(
      this.db.pool,
      `SELECT s.id,s.code,s.name,s.unit,${storePriceFields},
        coalesce(b.on_hand-b.reserved,0) AS available,
        (${sellableOffer}) AS sellable,
        CASE WHEN pi.storage_key IS NULL THEN NULL ELSE '/api/v1/media/products/'||pi.storage_key END AS image_url,
        jsonb_build_object('id',st.id,'code',st.code,'name',st.name,
          'address',CASE WHEN st.status='ACTIVE' THEN st.address ELSE '' END) AS store
      FROM product_favorites f JOIN store_skus ss USING (store_id,sku_id)
      JOIN stores st ON st.id=ss.store_id JOIN skus s ON s.id=ss.sku_id
      LEFT JOIN product_images pi ON pi.product_id=s.product_id
      LEFT JOIN inventory_balances b ON b.store_id=ss.store_id AND b.sku_id=ss.sku_id
      WHERE f.user_id=$1 ORDER BY f.created_at DESC,f.store_id,f.sku_id`,
      [actor.id],
    );
  }

  async save(actor: Actor, storeId: string, skuId: string) {
    await this.requireCustomer(actor);
    await this.db.tx(async (tx) => {
      must(
        await one(
          tx,
          `SELECT 1 FROM store_skus ss JOIN stores st ON st.id=ss.store_id
           JOIN skus s ON s.id=ss.sku_id
           WHERE ss.store_id=$1 AND ss.sku_id=$2 AND (${sellableOffer}) FOR KEY SHARE OF ss`,
          [storeId, skuId],
        ),
        'PRODUCT_UNAVAILABLE',
        'Sản phẩm hiện không mở bán tại cửa hàng này.',
      );
      await tx.query(
        'INSERT INTO product_favorites(user_id,store_id,sku_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        [actor.id, storeId, skuId],
      );
    });
    return { saved: true };
  }

  async remove(actor: Actor, storeId: string, skuId: string) {
    await this.requireCustomer(actor);
    await this.db.pool.query(
      'DELETE FROM product_favorites WHERE user_id=$1 AND store_id=$2 AND sku_id=$3',
      [actor.id, storeId, skuId],
    );
    return { saved: false };
  }
}
