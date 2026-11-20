import { Inject, Injectable } from '@nestjs/common';
import { Actor } from '../../common/context';
import { expected, storeAccess } from '../../common/access';
import { audit } from '../../common/events';
import { fail, must } from '../../common/errors';
import { idempotent } from '../../common/idempotency';
import { Db, one, rows } from '../../database/db';
import { paginate } from '../catalog/catalog.service';
import { voucherDiscount, voucherReason, voucherWindow } from './voucher-rules';
import { storePrice } from '../catalog/store-price';

interface Paging {
  limit: number;
  cursor?: string;
}
export interface PromotionInput {
  code: string;
  discountType: 'FIXED' | 'PERCENT';
  value: number;
  minTotal: number;
  maxDiscount?: number;
  quota: number;
  validFrom: string;
  validUntil: string;
}
@Injectable()
export class PromotionsService {
  constructor(@Inject(Db) private readonly db: Db) {}
  async list(actor: Actor, storeId: string, page: Paging) {
    await storeAccess(this.db.pool, actor, storeId, ['MANAGER']);
    return paginate(
      await rows(
        this.db.pool,
        `SELECT v.*, ${voucherWindow},
        (SELECT count(*)::int FROM voucher_redemptions r WHERE r.voucher_id=v.id AND r.status='COMMITTED') AS used_count,
        (SELECT count(*)::int FROM voucher_redemptions r WHERE r.voucher_id=v.id AND r.status='RESERVED') AS reserved_count
       FROM vouchers v WHERE store_id=$1 AND ($2::uuid IS NULL OR v.id>$2) ORDER BY v.id LIMIT $3`,
        [storeId, page.cursor ?? null, page.limit + 1],
      ),
      page.limit,
    );
  }
  create(
    actor: Actor,
    storeId: string,
    input: PromotionInput,
    key: string | undefined,
    requestId: string,
  ) {
    return this.db.tx(async (tx) => {
      await storeAccess(tx, actor, storeId, ['MANAGER']);
      return idempotent(tx, actor.id, `promotion.create:${storeId}`, key, input, async () => {
        must(await one(tx, 'SELECT id FROM stores WHERE id=$1', [storeId]));
        if (
          new Date(input.validFrom) >= new Date(input.validUntil) ||
          (input.discountType === 'PERCENT' && input.value > 100)
        )
          fail('VALIDATION_ERROR', 'Kiểm tra thời hạn và giá trị giảm giá.', 400);
        const voucher = must(
          await one(
            tx,
            `INSERT INTO vouchers(code,store_id,discount_type,value,min_total,max_discount,quota,valid_from,valid_until)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [
              input.code.toUpperCase(),
              storeId,
              input.discountType,
              input.value,
              input.minTotal,
              input.maxDiscount ?? null,
              input.quota,
              input.validFrom,
              input.validUntil,
            ],
          ),
        );
        await audit(tx, actor.id, 'promotion.create', 'voucher', voucher.id, requestId, {
          storeId,
        });
        return voucher;
      });
    });
  }
  toggle(
    actor: Actor,
    storeId: string,
    voucherId: string,
    input: { active: boolean; expectedVersion: number },
    key: string | undefined,
    requestId: string,
  ) {
    return this.db.tx(async (tx) => {
      await storeAccess(tx, actor, storeId, ['MANAGER']);
      return idempotent(tx, actor.id, `promotion.toggle:${voucherId}`, key, input, async () => {
        const voucher = must(
          await one(tx, 'SELECT * FROM vouchers WHERE id=$1 AND store_id=$2 FOR UPDATE', [
            voucherId,
            storeId,
          ]),
        );
        expected(voucher, input.expectedVersion);
        const result = await one(
          tx,
          'UPDATE vouchers SET active=$2,version=version+1 WHERE id=$1 RETURNING *',
          [voucherId, input.active],
        );
        await audit(tx, actor.id, 'promotion.toggle', 'voucher', voucherId, requestId, {
          storeId,
          active: input.active,
        });
        return result;
      });
    });
  }
  async offers(storeId: string, page: Paging) {
    must(
      await one(this.db.pool, "SELECT id FROM stores WHERE id=$1 AND status='ACTIVE'", [storeId]),
    );
    return paginate(
      await rows(
        this.db.pool,
        `SELECT id,code,discount_type,value,min_total,max_discount,valid_until FROM vouchers
       WHERE (store_id=$1 OR store_id IS NULL) AND active AND allocated_count<quota
       AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp()
       AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,
        [storeId, page.cursor ?? null, page.limit + 1],
      ),
      page.limit,
    );
  }
  preview(actor: Actor, input: Paging & { storeId: string; code?: string; cartVersion?: number }) {
    return this.db.tx(async (tx) => {
      must(await one(tx, "SELECT id FROM stores WHERE id=$1 AND status='ACTIVE'", [input.storeId]));
      const cart = await one(
        tx,
        "SELECT id,version FROM carts WHERE user_id=$1 AND store_id=$2 AND status='ACTIVE'",
        [actor.id, input.storeId],
      );
      if (input.cartVersion !== undefined) expected(cart ?? {}, input.cartVersion);
      const sum = await one(
        tx,
        `SELECT COALESCE(sum(ci.quantity::numeric*(${storePrice})),0) AS subtotal FROM cart_items ci
         JOIN store_skus ss ON ss.sku_id=ci.sku_id AND ss.store_id=$2 WHERE ci.cart_id=$1`,
        [cart?.id ?? null, input.storeId],
      );
      const subtotal = Number(sum!.subtotal);
      if (!Number.isSafeInteger(subtotal) || subtotal > 1_000_000_000_000)
        fail('CART_LIMIT', 'Giỏ hàng vượt hạn mức.', 422);
      const evaluate = (voucher: any) => ({
        ...voucher,
        eligible: !voucherReason(voucher, input.storeId, subtotal),
        reason: voucherReason(voucher, input.storeId, subtotal),
        missingAmount: Math.max(0, voucher.min_total - subtotal),
        discountAmount: voucherDiscount(voucher, subtotal),
      });
      const found = await rows(
        tx,
        `SELECT *, ${voucherWindow} FROM vouchers WHERE (store_id=$1 OR store_id IS NULL) AND
         (($2::text IS NOT NULL AND code=$2) OR ($2::text IS NULL AND active AND allocated_count<quota
          AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp()))
         AND ($3::uuid IS NULL OR id>$3) ORDER BY id LIMIT $4`,
        [input.storeId, input.code?.toUpperCase() ?? null, input.cursor ?? null, input.limit + 1],
      );
      const best = await one(
        tx,
        `SELECT *, ${voucherWindow} FROM vouchers WHERE (store_id=$1 OR store_id IS NULL)
         AND active AND allocated_count<quota AND min_total<=$2 AND valid_from<=clock_timestamp() AND valid_until>clock_timestamp()
         ORDER BY LEAST($2::bigint,COALESCE(max_discount,$2::bigint),CASE WHEN discount_type='FIXED' THEN value
           ELSE floor($2::numeric*value/100)::bigint END) DESC,id LIMIT 1`,
        [input.storeId, subtotal],
      );
      return {
        ...paginate(found.map(evaluate), input.limit),
        subtotal,
        cartVersion: cart?.version ?? null,
        recommended: best && !voucherReason(best, input.storeId, subtotal) ? evaluate(best) : null,
      };
    });
  }
}
