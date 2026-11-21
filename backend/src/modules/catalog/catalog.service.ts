import { Inject, Injectable } from '@nestjs/common';
import { Db, one, rows } from '../../database/db';
import { fail, must } from '../../common/errors';
import { uuid } from '../../common/validation';
import { storePrice, storePriceFields } from './store-price';

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
const publicStoreFields = 'id,code,name,address,timezone,status,latitude,longitude';
const storeSearch = `($1::text IS NULL OR
  strpos(translate(lower(name),$2,$3),translate(lower($1),$2,$3))>0 OR
  strpos(translate(lower(address),$2,$3),translate(lower($1),$2,$3))>0)`;

interface StorePageInput {
  q?: string;
  limit: number;
  cursor?: string;
  lat?: number;
  lng?: number;
}

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
  async stores(input: StorePageInput) {
    const search = [input.q || null, accentSource, accentTarget];
    if (input.lat !== undefined && input.lng !== undefined) {
      const [distance, storeId, extra] = input.cursor?.split(':') ?? [];
      if (
        input.cursor &&
        (!distance ||
          !/^\d{1,8}$/.test(distance) ||
          !uuid.safeParse(storeId).success ||
          extra !== undefined)
      )
        fail('VALIDATION_ERROR', 'Trang cửa hàng gần bạn không hợp lệ.', 400);

      // Great-circle distance in whole meters, with ID as the tie-breaker for pagination.
      const items = await rows(
        this.db.pool,
        `WITH nearby AS (
          SELECT ${publicStoreFields}, round(6371000 * acos(least(1.0, greatest(-1.0,
            sin(radians($4::float8)) * sin(radians(latitude)) +
            cos(radians($4::float8)) * cos(radians(latitude)) * cos(radians(longitude - $5::float8))
          ))))::int AS distance_meters
          FROM stores WHERE status='ACTIVE' AND latitude IS NOT NULL AND longitude IS NOT NULL
          AND ${storeSearch}
        )
        SELECT * FROM nearby
        WHERE $6::int IS NULL OR (distance_meters,id)>($6::int,$7::uuid)
        ORDER BY distance_meters,id LIMIT $8`,
        [...search, input.lat, input.lng, distance ?? null, storeId ?? null, input.limit + 1],
      );
      const page = paginate(items, input.limit);
      const last = page.items.at(-1);
      return {
        items: page.items,
        nextCursor: page.nextCursor ? `${last.distance_meters}:${last.id}` : null,
      };
    }

    if (input.cursor && !uuid.safeParse(input.cursor).success)
      fail('VALIDATION_ERROR', 'Trang danh sách cửa hàng không hợp lệ.', 400);
    const items = await rows(
      this.db.pool,
      `SELECT ${publicStoreFields} FROM stores WHERE status='ACTIVE' AND ${storeSearch}
      AND ($4::uuid IS NULL OR id>$4) ORDER BY id LIMIT $5`,
      [...search, input.cursor ?? null, input.limit + 1],
    );
    return paginate(items, input.limit);
  }
  async store(storeId: string) {
    return must(
      await one(
        this.db.pool,
        `SELECT ${publicStoreFields} FROM stores WHERE id=$1 AND status='ACTIVE'`,
        [storeId],
      ),
      'STORE_NOT_FOUND',
      'Cửa hàng không còn hoạt động hoặc không tồn tại.',
    );
  }
  async discoverProducts(input: DiscoveryInput) {
    const cursor = parseDiscoveryCursor(input.cursor);
    const items = await rows(
      this.db.pool,
      `SELECT s.id,s.code,s.barcode,s.name,s.unit,p.description,p.category_id,${storePriceFields},
      to_char(ss.expires_on,'YYYY-MM-DD') AS expires_on,ss.version,
      CASE WHEN pi.storage_key IS NULL THEN NULL ELSE '/api/v1/media/products/'||pi.storage_key END AS image_url,
      b.on_hand-b.reserved AS available,b.updated_at,
      jsonb_build_object('id',st.id,'code',st.code,'name',st.name,'address',st.address,
        'latitude',st.latitude,'longitude',st.longitude) AS store
      FROM store_skus ss
      JOIN stores st ON st.id=ss.store_id AND st.status='ACTIVE'
      JOIN skus s ON s.id=ss.sku_id
      JOIN products p ON p.id=s.product_id
      LEFT JOIN categories c ON c.id=p.category_id
      LEFT JOIN product_images pi ON pi.product_id=p.id
      JOIN inventory_balances b ON b.store_id=ss.store_id AND b.sku_id=s.id
      WHERE ss.active AND s.active
      AND (ss.expires_on IS NULL OR ss.expires_on >= (clock_timestamp() AT TIME ZONE st.timezone)::date)
      AND ($1::text IS NULL OR
      translate(lower(concat_ws(' ',s.name,s.code,s.barcode,p.description,c.name,st.name)),$7,$8)
        LIKE '%'||translate(lower($1),$7,$8)||'%')
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
    input: DiscoveryInput & { discountedOnly?: boolean },
    skuId?: string,
  ) {
    must(
      await one(this.db.pool, "SELECT id FROM stores WHERE id=$1 AND status='ACTIVE'", [storeId]),
    );
    const items = await rows(
      this.db.pool,
      `SELECT s.id,s.code,s.barcode,s.name,s.unit,p.description,p.category_id,${storePriceFields},
      to_char(ss.expires_on,'YYYY-MM-DD') AS expires_on,ss.version,
      CASE WHEN pi.storage_key IS NULL THEN NULL ELSE '/api/v1/media/products/'||pi.storage_key END AS image_url,
      b.on_hand-b.reserved AS available,b.updated_at FROM store_skus ss
      JOIN stores st ON st.id=ss.store_id AND st.status='ACTIVE'
      JOIN skus s ON s.id=ss.sku_id JOIN products p ON p.id=s.product_id
      LEFT JOIN categories c ON c.id=p.category_id
      LEFT JOIN product_images pi ON pi.product_id=p.id
      JOIN inventory_balances b ON b.store_id=ss.store_id AND b.sku_id=s.id
      WHERE ss.store_id=$1 AND ss.active AND s.active
      AND (ss.expires_on IS NULL OR ss.expires_on >= (clock_timestamp() AT TIME ZONE st.timezone)::date)
      AND ($2::text IS NULL OR
      translate(lower(concat_ws(' ',s.name,s.code,s.barcode,p.description,c.name)),$8,$9)
        LIKE '%'||translate(lower($2),$8,$9)||'%')
      AND ($3::uuid IS NULL OR p.category_id=$3) AND (NOT $4::boolean OR b.on_hand>b.reserved)
      AND (NOT $10::boolean OR (${storePrice}) < ss.price)
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
        input.discountedOnly ?? false,
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
       JOIN stores st ON st.id=ss.store_id AND st.status='ACTIVE'
       WHERE ss.store_id=$1 AND ss.active AND s.active
       AND (ss.expires_on IS NULL OR ss.expires_on >= (clock_timestamp() AT TIME ZONE st.timezone)::date)
       ORDER BY c.name,c.id`,
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
