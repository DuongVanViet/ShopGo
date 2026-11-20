import { Inject, Injectable } from '@nestjs/common';
import { Db, one, rows } from '../../database/db';
import { Actor } from '../../common/context';
import { expected, storeAccess } from '../../common/access';
import { fail, must } from '../../common/errors';
import { audit } from '../../common/events';
import { idempotent } from '../../common/idempotency';
import { paginate } from '../catalog/catalog.service';

@Injectable()
export class InventoryService {
  constructor(@Inject(Db) private readonly db: Db) {}
  async list(
    actor: Actor,
    storeId: string,
    input: { q?: string; lowStock?: boolean; limit: number; cursor?: string },
  ) {
    await storeAccess(this.db.pool, actor, storeId, ['MANAGER']);
    const items = await rows(
      this.db.pool,
      `SELECT s.id,s.code,s.name,b.*,b.on_hand-b.reserved AS available FROM inventory_balances b JOIN skus s ON s.id=b.sku_id
      WHERE b.store_id=$1 AND ($2::text IS NULL OR s.name ILIKE '%'||$2||'%' OR s.code ILIKE '%'||$2||'%')
      AND (NOT $3::boolean OR b.on_hand-b.reserved<=5) AND ($4::uuid IS NULL OR s.id>$4) ORDER BY s.id LIMIT $5`,
      [storeId, input.q ?? null, input.lowStock ?? false, input.cursor ?? null, input.limit + 1],
    );
    return paginate(items, input.limit);
  }
  adjust(
    actor: Actor,
    storeId: string,
    input: { skuId: string; delta: number; reason: string; expectedVersion: number },
    key: string | undefined,
    requestId: string,
  ) {
    return this.db.tx(async (tx) => {
      await storeAccess(tx, actor, storeId, ['MANAGER']);
      return idempotent(tx, actor.id, `inventory.adjust:${storeId}`, key, input, async () => {
        const balance = must(
          await one(
            tx,
            'SELECT * FROM inventory_balances WHERE store_id=$1 AND sku_id=$2 FOR UPDATE',
            [storeId, input.skuId],
          ),
        );
        expected(balance, input.expectedVersion);
        if (balance.on_hand + input.delta < balance.reserved)
          fail('INSUFFICIENT_UNRESERVED_STOCK', 'Không thể giảm tồn xuống dưới lượng đã giữ.', 422);
        const updated = await one(
          tx,
          'UPDATE inventory_balances SET on_hand=on_hand+$3,version=version+1,updated_at=now() WHERE store_id=$1 AND sku_id=$2 RETURNING *',
          [storeId, input.skuId, input.delta],
        );
        await tx.query(
          "INSERT INTO stock_movements(store_id,sku_id,delta_on_hand,delta_reserved,reason,reference_id,actor_id) VALUES($1,$2,$3,0,'ADJUSTMENT',$4,$5)",
          [storeId, input.skuId, input.delta, `${actor.id}:${key}`, actor.id],
        );
        await audit(tx, actor.id, 'inventory.adjust', 'sku', input.skuId, requestId, {
          storeId,
          delta: input.delta,
          reason: input.reason,
        });
        return updated;
      });
    });
  }

  writeOff(
    actor: Actor,
    storeId: string,
    skuId: string,
    input: { quantity: number; reason: 'EXPIRED' | 'DAMAGED'; note?: string },
    key: string | undefined,
    requestId: string,
  ) {
    return this.db.tx(async (tx) => {
      await storeAccess(tx, actor, storeId, ['MANAGER']);
      return idempotent(
        tx,
        actor.id,
        `inventory.write-off:${storeId}:${skuId}`,
        key,
        input,
        async () => {
          const balance = must(
            await one(
              tx,
              `SELECT b.*,s.name FROM inventory_balances b
               JOIN skus s ON s.id=b.sku_id
               WHERE b.store_id=$1 AND b.sku_id=$2 FOR UPDATE OF b`,
              [storeId, skuId],
            ),
            'INVENTORY_NOT_FOUND',
            'Sản phẩm không thuộc tồn kho của cửa hàng này.',
            404,
          );
          const available = balance.on_hand - balance.reserved;
          if (input.quantity > available)
            fail(
              'INSUFFICIENT_AVAILABLE_STOCK',
              `Chỉ có thể loại tối đa ${available} sản phẩm; ${balance.reserved} sản phẩm đang được giữ cho đơn hàng.`,
              422,
            );
          const updated = must(
            await one(
              tx,
              `UPDATE inventory_balances
               SET on_hand=on_hand-$3,version=version+1,updated_at=now()
               WHERE store_id=$1 AND sku_id=$2
               RETURNING *,on_hand-reserved AS available`,
              [storeId, skuId, input.quantity],
            ),
          );
          await tx.query(
            "INSERT INTO stock_movements(store_id,sku_id,delta_on_hand,delta_reserved,reason,reference_id,actor_id) VALUES($1,$2,$3,0,'ADJUSTMENT',$4,$5)",
            [
              storeId,
              skuId,
              -input.quantity,
              `write-off:${input.reason.toLowerCase()}:${actor.id}:${key}`,
              actor.id,
            ],
          );
          await audit(tx, actor.id, 'inventory.write-off', 'sku', skuId, requestId, {
            storeId,
            productName: balance.name,
            quantity: input.quantity,
            reason: input.reason,
            note: input.note ?? null,
            before: {
              onHand: balance.on_hand,
              reserved: balance.reserved,
              available,
            },
            after: {
              onHand: updated.on_hand,
              reserved: updated.reserved,
              available: updated.available,
            },
          });
          return updated;
        },
      );
    });
  }
}
