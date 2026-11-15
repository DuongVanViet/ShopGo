import { Inject, Injectable } from '@nestjs/common';
import { Db, one, rows } from '../../database/db';
import { fail, must } from '../../common/errors';

const accentGroups = [
  ['àáạảãâầấậẩẫăằắặẳẵ', 'a'],
  ['èéẹẻẽêềếệểễ', 'e'],
  ['ìíịỉĩ', 'i'],
  ['òóọỏõôồốộổỗơờớợởỡ', 'o'],
  ['ùúụủũưừứựửữ', 'u'],
  ['ỳýỵỷỹ', 'y'],
  ['đ', 'd'],
];
const accentSource = accentGroups.map(([letters]) => letters).join('');
const accentTarget = accentGroups.map(([letters, base]) => base.repeat(letters.length)).join('');
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface DiscoveryInput {
  q?: string;
  categoryId?: string;
  inStock?: boolean;
  limit: number;
  cursor?: string;
}

function discoveryCursor(storeId: string, skuId: string) {
  return Buffer.from(`${storeId}:${skuId}`, 'utf8').toString('base64url');
}

function parseDiscoveryCursor(cursor?: string) {
  if (!cursor) return { storeId: null, skuId: null };
  if (!/^[A-Za-z0-9_-]+$/.test(cursor))
    fail('VALIDATION_ERROR', 'Cursor danh mục không hợp lệ.', 400);
  const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  const parts = decoded.split(':');
  if (parts.length !== 2 || !uuidPattern.test(parts[0]) || !uuidPattern.test(parts[1]))
    fail('VALIDATION_ERROR', 'Cursor danh mục không hợp lệ.', 400);
  return { storeId: parts[0], skuId: parts[1] };
}

@Injectable()
export class CatalogService {
  constructor(@Inject(Db) private readonly db: Db) {}
  async stores(input: { q?: string; limit: number; cursor?: string }) {
    const items = await rows(
      this.db.pool,
      `SELECT id,code,name,address,timezone,status,latitude,longitude FROM stores WHERE status='ACTIVE' AND ($1::text IS NULL OR name ILIKE '%'||$1||'%' OR address ILIKE '%'||$1||'%')
      AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3`,
      [input.q ?? null, input.cursor ?? null, input.limit + 1],
    );
    return paginate(items, input.limit);
  }
  async discoverProducts(input: DiscoveryInput) {
    const cursor = parseDiscoveryCursor(input.cursor);
    const items = await rows(
      this.db.pool,
      `SELECT s.id,s.code,s.barcode,s.name,s.unit,p.description,p.category_id,ss.price,ss.version,
      CASE WHEN pi.storage_key IS NULL THEN NULL ELSE '/api/v1/media/products/'||pi.storage_key END AS image_url,
      b.on_hand-b.reserved AS available,b.updated_at,
      jsonb_build_object('id',st.id,'code',st.code,'name',st.name,'address',st.address,
        'latitude',st.latitude,'longitude',st.longitude) AS store
      FROM store_skus ss
      JOIN stores st ON st.id=ss.store_id AND st.status='ACTIVE'
      JOIN skus s ON s.id=ss.sku_id
      JOIN products p ON p.id=s.product_id
      LEFT JOIN product_images pi ON pi.product_id=p.id
      JOIN inventory_balances b ON b.store_id=ss.store_id AND b.sku_id=s.id
      WHERE ss.active AND s.active AND ($1::text IS NULL OR
      translate(lower(s.name||' '||s.code),$7,$8) LIKE '%'||translate(lower($1),$7,$8)||'%')
      AND ($2::uuid IS NULL OR p.category_id=$2) AND (NOT $3::boolean OR b.on_hand>b.reserved)
      AND ($4::uuid IS NULL OR (ss.store_id,ss.sku_id)>($4::uuid,$5::uuid))
      ORDER BY ss.store_id,ss.sku_id LIMIT $6`,
      [
        input.q ?? null,
        input.categoryId ?? null,
        input.inStock ?? false,
        cursor.storeId,
        cursor.skuId,
        input.limit + 1,
        accentSource,
        accentTarget,
      ],
    );
    const hasMore = items.length > input.limit;
    const page = items.slice(0, input.limit);
    const last = page.at(-1);
    return {
      items: page,
      nextCursor: hasMore && last ? discoveryCursor(last.store.id, last.id) : null,
    };
  }
  async products(
    storeId: string,
    input: { q?: string; categoryId?: string; inStock?: boolean; limit: number; cursor?: string },
    skuId?: string,
  ) {
    must(
      await one(this.db.pool, "SELECT id FROM stores WHERE id=$1 AND status='ACTIVE'", [storeId]),
    );
    const items = await rows(
      this.db.pool,
      `SELECT s.id,s.code,s.barcode,s.name,s.unit,p.description,p.category_id,ss.price,ss.version,
      CASE WHEN pi.storage_key IS NULL THEN NULL ELSE '/api/v1/media/products/'||pi.storage_key END AS image_url,
      b.on_hand-b.reserved AS available,b.updated_at FROM store_skus ss JOIN skus s ON s.id=ss.sku_id JOIN products p ON p.id=s.product_id
      LEFT JOIN product_images pi ON pi.product_id=p.id
      JOIN inventory_balances b ON b.store_id=ss.store_id AND b.sku_id=s.id
      WHERE ss.store_id=$1 AND ss.active AND s.active AND ($2::text IS NULL OR
      translate(lower(s.name||' '||s.code),$8,$9) LIKE '%'||translate(lower($2),$8,$9)||'%')
      AND ($3::uuid IS NULL OR p.category_id=$3) AND (NOT $4::boolean OR b.on_hand>b.reserved)
      AND ($5::uuid IS NULL OR s.id>$5) AND ($6::uuid IS NULL OR s.id=$6) ORDER BY s.id LIMIT $7`,
      [
        storeId,
        input.q ?? null,
        input.categoryId ?? null,
        input.inStock ?? false,
        input.cursor ?? null,
        skuId ?? null,
        input.limit + 1,
        accentSource,
        accentTarget,
      ],
    );
    return skuId ? must(items[0]) : paginate(items, input.limit);
  }
  async categories(storeId: string) {
    must(
      await one(this.db.pool, "SELECT id FROM stores WHERE id=$1 AND status='ACTIVE'", [storeId]),
    );
    return rows(
      this.db.pool,
      `SELECT DISTINCT c.id,c.name,c.slug FROM categories c
       JOIN products p ON p.category_id=c.id JOIN skus s ON s.product_id=p.id
       JOIN store_skus ss ON ss.sku_id=s.id
       WHERE ss.store_id=$1 AND ss.active AND s.active ORDER BY c.name,c.id`,
      [storeId],
    );
  }
  async slots(storeId: string, date?: string) {
    return rows(
      this.db.pool,
      `SELECT *,capacity-allocated_count AS available FROM fulfillment_slots WHERE store_id=$1 AND starts_at>clock_timestamp()
      AND allocated_count<capacity AND ($2::date IS NULL OR (starts_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date=$2::date) ORDER BY starts_at LIMIT 100`,
      [storeId, date ?? null],
    );
  }
}
export function paginate(items: any[], limit: number) {
  const hasMore = items.length > limit;
  const page = items.slice(0, limit);
  return { items: page, nextCursor: hasMore ? page[page.length - 1].id : null };
}
