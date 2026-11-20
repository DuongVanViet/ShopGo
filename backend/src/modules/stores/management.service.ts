import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Db, one, rows, Tx } from '../../database/db';
import { Actor } from '../../common/context';
import { admin, expected, storeAccess } from '../../common/access';
import { fail, must } from '../../common/errors';
import { audit } from '../../common/events';
import { idempotent } from '../../common/idempotency';
import { paginate } from '../catalog/catalog.service';
import { ENV, Env } from '../../config/env';
import { hashPassword } from '../auth/password';

export const MAX_PRODUCT_IMAGE_BYTES = 5 * 1024 * 1024;
const PRODUCT_IMAGE_URL_PREFIX = '/api/v1/media/products/';
export interface ProductImageUpload {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}
interface StaffAccountInput {
  displayName: string;
  phone?: string;
  email?: string;
  password: string;
  role: 'PICKER' | 'COUNTER' | 'MANAGER';
}
interface StaffPasswordTarget {
  id: string;
  account_type: string;
  is_admin: boolean;
  roles: Array<'PICKER' | 'COUNTER' | 'MANAGER'>;
}

function validateStaffPasswordTarget(
  actor: Actor,
  userId: string,
  target: StaffPasswordTarget | undefined,
): asserts target is StaffPasswordTarget {
  if (!target)
    fail('STAFF_ACCOUNT_NOT_FOUND', 'Không tìm thấy tài khoản nhân viên tại cửa hàng này.', 404);
  if (actor.id === userId)
    fail(
      'STAFF_PASSWORD_SELF_RESET_DENIED',
      'Hãy dùng chức năng đổi mật khẩu cá nhân để thay đổi mật khẩu của chính bạn.',
      403,
    );
  if (target.account_type !== 'STAFF' || target.is_admin)
    fail(
      'STAFF_PASSWORD_TARGET_DENIED',
      'Chỉ có thể đặt lại mật khẩu cho tài khoản nhân viên của cửa hàng.',
      403,
    );
  if (target.roles.includes('MANAGER') && !actor.is_admin)
    fail(
      'ADMIN_REQUIRED_FOR_MANAGER_PASSWORD',
      'Chỉ quản trị viên hệ thống được đặt lại mật khẩu của tài khoản quản lý.',
      403,
    );
}

function productImageType(file: ProductImageUpload): {
  extension: 'jpg' | 'png' | 'webp';
  mime: string;
} {
  const mime = file.mimetype.toLowerCase();
  const bytes = file.buffer;
  const jpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp =
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP';
  if (mime === 'image/jpeg' && jpeg) return { extension: 'jpg', mime };
  if (mime === 'image/png' && png) return { extension: 'png', mime };
  if (mime === 'image/webp' && webp) return { extension: 'webp', mime };
  fail('INVALID_PRODUCT_IMAGE', 'Ảnh sản phẩm phải là tệp JPEG, PNG hoặc WebP hợp lệ.', 422);
}

function categorySlug(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
  return slug || 'danh-muc';
}

@Injectable()
export class ManagementService {
  private readonly productImageDirectory: string;
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(ENV) env: Env,
  ) {
    this.productImageDirectory = resolve(env.UPLOAD_DIR, 'products');
  }
  adminCreate(actor: Actor, kind: string, input: any, key: string | undefined, requestId: string) {
    admin(actor);
    return this.db.tx((tx) =>
      idempotent(tx, actor.id, `admin.${kind}`, key, input, async () => {
        let result: any;
        if (kind === 'store')
          result = await one(
            tx,
            'INSERT INTO stores(code,name,address) VALUES($1,$2,$3) RETURNING *',
            [input.code, input.name, input.address],
          );
        else if (kind === 'category')
          result = await one(tx, 'INSERT INTO categories(name,slug) VALUES($1,$2) RETURNING *', [
            input.name,
            input.slug,
          ]);
        else if (kind === 'membership') {
          result = await one(
            tx,
            'INSERT INTO store_memberships(user_id,store_id,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING *',
            [input.userId, input.storeId, input.role],
          );
          result ??= { user_id: input.userId, store_id: input.storeId, role: input.role };
        } else if (kind === 'product') {
          const created = await this.insertProduct(tx, actor, input.storeId, input);
          result = { ...created.product, sku: created.sku };
        } else if (kind === 'voucher') {
          if (
            new Date(input.validFrom) >= new Date(input.validUntil) ||
            (input.discountType === 'PERCENT' && input.value > 100)
          )
            fail('VALIDATION_ERROR', 'Thời hạn hoặc giá trị voucher không hợp lệ.', 400);
          result = await one(
            tx,
            `INSERT INTO vouchers(code,store_id,discount_type,value,max_discount,min_total,quota,valid_from,valid_until)
          VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
            [
              input.code.toUpperCase(),
              input.storeId ?? null,
              input.discountType,
              input.value,
              input.maxDiscount ?? null,
              input.minTotal,
              input.quota,
              input.validFrom,
              input.validUntil,
            ],
          );
        } else fail('UNKNOWN_ACTION', 'Không hỗ trợ thao tác.', 400);
        const entityId = result.id ?? input.userId;
        await audit(tx, actor.id, `admin.${kind}.create`, kind, entityId, requestId, {
          storeId: input.storeId,
        });
        return result;
      }),
    );
  }
  async catalogCategories(actor: Actor, storeId: string) {
    await storeAccess(this.db.pool, actor, storeId, ['MANAGER']);
    return rows(
      this.db.pool,
      `SELECT id,name,slug,owner_store_id FROM categories
       WHERE owner_store_id IS NULL OR owner_store_id=$1 ORDER BY name,id LIMIT 500`,
      [storeId],
    );
  }
  createCatalogCategory(
    actor: Actor,
    storeId: string,
    input: { name: string; slug?: string },
    key: string | undefined,
    requestId: string,
  ) {
    return this.db.tx(async (tx) => {
      await storeAccess(tx, actor, storeId, ['MANAGER']);
      return idempotent(
        tx,
        actor.id,
        `catalog.category.create:${storeId}`,
        key,
        input,
        async () => {
          const slug = input.slug ?? categorySlug(input.name);
          await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
            `category:${storeId}:${slug}`,
          ]);
          if (
            await one(
              tx,
              'SELECT id FROM categories WHERE owner_store_id=$1 AND (slug=$2 OR lower(name)=lower($3))',
              [storeId, slug, input.name],
            )
          )
            fail('CATEGORY_EXISTS', 'Danh mục này đã tồn tại trong cửa hàng.', 409);
          const result = must(
            await one(
              tx,
              'INSERT INTO categories(name,slug,owner_store_id) VALUES($1,$2,$3) RETURNING *',
              [input.name, slug, storeId],
            ),
          );
          await audit(tx, actor.id, 'catalog.category.create', 'category', result.id, requestId, {
            storeId,
            name: input.name,
          });
          return result;
        },
      );
    });
  }
  async catalogProducts(actor: Actor, storeId: string, input: { limit: number; cursor?: string }) {
    await storeAccess(this.db.pool, actor, storeId, ['MANAGER']);
    const items = await rows(
      this.db.pool,
      `SELECT s.id,p.id AS product_id,s.id AS sku_id,p.name,p.description,p.category_id,c.name AS category_name,
       s.code,s.barcode,s.unit,ss.price,ss.active,to_char(ss.expires_on,'YYYY-MM-DD') AS expires_on,
       ss.version,ss.sale_price,ss.sale_starts_at,ss.sale_ends_at,b.on_hand,b.reserved,
       CASE WHEN pi.storage_key IS NULL THEN NULL ELSE '${PRODUCT_IMAGE_URL_PREFIX}'||pi.storage_key END AS image_url,
       b.on_hand-b.reserved AS available
       FROM store_skus ss JOIN skus s ON s.id=ss.sku_id JOIN products p ON p.id=s.product_id
       LEFT JOIN categories c ON c.id=p.category_id
       LEFT JOIN product_images pi ON pi.product_id=p.id
       JOIN inventory_balances b ON b.store_id=ss.store_id AND b.sku_id=ss.sku_id
       WHERE ss.store_id=$1 AND ($2::uuid IS NULL OR s.id>$2) ORDER BY s.id LIMIT $3`,
      [storeId, input.cursor ?? null, input.limit + 1],
    );
    return paginate(items, input.limit);
  }
  createCatalogProduct(
    actor: Actor,
    storeId: string,
    input: any,
    key: string | undefined,
    requestId: string,
  ) {
    return this.db.tx(async (tx) => {
      await storeAccess(tx, actor, storeId, ['MANAGER']);
      return idempotent(tx, actor.id, `catalog.product.create:${storeId}`, key, input, async () => {
        const created = await this.insertProduct(tx, actor, storeId, input);
        await audit(
          tx,
          actor.id,
          'catalog.product.create',
          'product',
          created.product.id,
          requestId,
          { storeId, skuId: created.sku.id, price: input.price },
        );
        return {
          id: created.sku.id,
          productId: created.product.id,
          skuId: created.sku.id,
          name: created.product.name,
          description: created.product.description,
          categoryId: created.product.category_id,
          categoryName: created.category!.name,
          code: created.sku.code,
          barcode: created.sku.barcode,
          unit: created.sku.unit,
          price: input.price,
          onHand: input.initialStock,
          reserved: 0,
          available: input.initialStock,
          active: true,
          expiresOn: input.expiresOn ?? null,
          version: 1,
          imageUrl: null,
        };
      });
    });
  }
  updateCatalogProduct(
    actor: Actor,
    storeId: string,
    skuId: string,
    input: any,
    key: string | undefined,
    requestId: string,
  ) {
    return this.db.tx(async (tx) => {
      await storeAccess(tx, actor, storeId, ['MANAGER']);
      return idempotent(
        tx,
        actor.id,
        `catalog.product.update:${storeId}:${skuId}`,
        key,
        input,
        async () => {
          const old = must(
            await one(
              tx,
              `SELECT ss.*,s.product_id,s.code,s.barcode,s.name AS sku_name,s.unit,
               p.name,p.description,p.category_id
               FROM store_skus ss JOIN skus s ON s.id=ss.sku_id
               JOIN products p ON p.id=s.product_id
               WHERE ss.store_id=$1 AND ss.sku_id=$2
               FOR UPDATE OF ss,s,p`,
              [storeId, skuId],
            ),
            'PRODUCT_NOT_IN_STORE',
            'Sản phẩm không thuộc cửa hàng này.',
            404,
          );
          expected(old, input.expectedVersion);
          const discount =
            input.discount === undefined
              ? old.sale_price === null
                ? null
                : {
                    price: old.sale_price,
                    startsAt: old.sale_starts_at,
                    endsAt: old.sale_ends_at,
                  }
              : input.discount;
          if (
            discount &&
            (discount.price >= input.price ||
              new Date(discount.startsAt) >= new Date(discount.endsAt))
          )
            fail(
              'INVALID_DISCOUNT',
              'Giá giảm phải thấp hơn giá gốc và thời gian kết thúc phải sau thời gian bắt đầu.',
              422,
            );
          const category = must(
            await one(
              tx,
              'SELECT id,name FROM categories WHERE id=$1 AND (owner_store_id IS NULL OR owner_store_id=$2)',
              [input.categoryId, storeId],
            ),
            'CATEGORY_NOT_AVAILABLE',
            'Danh mục không thuộc cửa hàng này.',
            422,
          );
          const code = input.sku.code.trim().toUpperCase();
          const barcode = input.sku.barcode?.trim() || null;
          const sharedWithAnotherStore = await one(
            tx,
            'SELECT 1 AS shared FROM store_skus WHERE sku_id=$1 AND store_id<>$2 LIMIT 1',
            [skuId, storeId],
          );
          const changesSharedMetadata =
            input.name !== old.name ||
            input.description !== old.description ||
            input.categoryId !== old.category_id ||
            code !== old.code ||
            barcode !== old.barcode ||
            input.sku.name !== old.sku_name ||
            input.sku.unit !== old.unit;
          if (sharedWithAnotherStore && changesSharedMetadata && !actor.is_admin)
            fail(
              'SHARED_PRODUCT_METADATA_LOCKED',
              'Sản phẩm đang được nhiều cửa hàng sử dụng. Manager chỉ có thể đổi giá, trạng thái bán và hạn tại cửa hàng của mình.',
              409,
            );
          await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
            `sku:${code}:${barcode ?? ''}`,
          ]);
          if (
            await one(
              tx,
              'SELECT id FROM skus WHERE id<>$1 AND (code=$2 OR ($3::text IS NOT NULL AND barcode=$3))',
              [skuId, code, barcode],
            )
          )
            fail('SKU_EXISTS', 'Mã SKU hoặc mã vạch đã được sản phẩm khác sử dụng.', 409);

          await tx.query('UPDATE products SET name=$2,description=$3,category_id=$4 WHERE id=$1', [
            old.product_id,
            input.name,
            input.description,
            input.categoryId,
          ]);
          await tx.query('UPDATE skus SET code=$2,barcode=$3,name=$4,unit=$5 WHERE id=$1', [
            skuId,
            code,
            barcode,
            input.sku.name,
            input.sku.unit,
          ]);
          await tx.query(
            `UPDATE store_skus SET price=$3,active=$4,expires_on=$5,sale_price=$6,sale_starts_at=$7,sale_ends_at=$8,
             version=version+1,updated_at=now() WHERE store_id=$1 AND sku_id=$2`,
            [
              storeId,
              skuId,
              input.price,
              input.active,
              input.expiresOn,
              discount?.price ?? null,
              discount?.startsAt ?? null,
              discount?.endsAt ?? null,
            ],
          );
          await audit(tx, actor.id, 'catalog.product.update', 'sku', skuId, requestId, {
            storeId,
            before: {
              name: old.name,
              categoryId: old.category_id,
              code: old.code,
              barcode: old.barcode,
              unit: old.unit,
              price: old.price,
              active: old.active,
              expiresOn: old.expires_on,
              discount: {
                price: old.sale_price,
                startsAt: old.sale_starts_at,
                endsAt: old.sale_ends_at,
              },
            },
            after: {
              name: input.name,
              categoryId: input.categoryId,
              code,
              barcode,
              unit: input.sku.unit,
              price: input.price,
              active: input.active,
              expiresOn: input.expiresOn,
              discount,
            },
          });
          return must(
            await one(
              tx,
              `SELECT s.id,p.id AS product_id,s.id AS sku_id,p.name,p.description,p.category_id,
               c.name AS category_name,s.code,s.barcode,s.unit,ss.price,ss.active,
               to_char(ss.expires_on,'YYYY-MM-DD') AS expires_on,
               ss.version,ss.sale_price,ss.sale_starts_at,ss.sale_ends_at,b.on_hand,b.reserved,b.on_hand-b.reserved AS available,
               CASE WHEN pi.storage_key IS NULL THEN NULL ELSE '${PRODUCT_IMAGE_URL_PREFIX}'||pi.storage_key END AS image_url
               FROM store_skus ss JOIN skus s ON s.id=ss.sku_id
               JOIN products p ON p.id=s.product_id LEFT JOIN categories c ON c.id=p.category_id
               LEFT JOIN product_images pi ON pi.product_id=p.id
               JOIN inventory_balances b ON b.store_id=ss.store_id AND b.sku_id=ss.sku_id
               WHERE ss.store_id=$1 AND ss.sku_id=$2`,
              [storeId, skuId],
            ),
          );
        },
      );
    });
  }
  async uploadCatalogProductImage(
    actor: Actor,
    storeId: string,
    productId: string,
    file: ProductImageUpload | undefined,
    requestId: string,
  ) {
    await storeAccess(this.db.pool, actor, storeId, ['MANAGER']);
    if (!file?.buffer?.length)
      fail('PRODUCT_IMAGE_REQUIRED', 'Vui lòng chọn một ảnh sản phẩm.', 400);
    if (file.size !== file.buffer.length || file.size > MAX_PRODUCT_IMAGE_BYTES)
      fail('PRODUCT_IMAGE_TOO_LARGE', 'Ảnh sản phẩm không được vượt quá 5 MB.', 413);
    const type = productImageType(file);
    const storageKey = `${randomUUID()}.${type.extension}`;
    const temporaryPath = join(this.productImageDirectory, `.${storageKey}.tmp`);
    const finalPath = join(this.productImageDirectory, storageKey);
    const originalName = (file.originalname || 'product-image')
      .replace(/^.*[\\/]/, '')
      .slice(0, 255);
    let previousStorageKey: string | undefined;
    await mkdir(this.productImageDirectory, { recursive: true });
    try {
      await writeFile(temporaryPath, file.buffer, { flag: 'wx' });
      await rename(temporaryPath, finalPath);
      const result = await this.db.tx(async (tx) => {
        await storeAccess(tx, actor, storeId, ['MANAGER']);
        must(
          await one(
            tx,
            `SELECT p.id FROM products p
             JOIN skus s ON s.product_id=p.id JOIN store_skus ss ON ss.sku_id=s.id
             WHERE p.id=$1 AND ss.store_id=$2 FOR UPDATE OF p`,
            [productId, storeId],
          ),
          'PRODUCT_NOT_IN_STORE',
          'Sản phẩm không thuộc cửa hàng này.',
          404,
        );
        const previous = await one<{ storage_key: string }>(
          tx,
          'SELECT storage_key FROM product_images WHERE product_id=$1',
          [productId],
        );
        previousStorageKey = previous?.storage_key;
        await tx.query(
          `INSERT INTO product_images(product_id,storage_key,mime_type,byte_size,original_name)
           VALUES($1,$2,$3,$4,$5)
           ON CONFLICT(product_id) DO UPDATE SET storage_key=EXCLUDED.storage_key,
             mime_type=EXCLUDED.mime_type,byte_size=EXCLUDED.byte_size,
             original_name=EXCLUDED.original_name,updated_at=now()`,
          [productId, storageKey, type.mime, file.size, originalName],
        );
        await audit(tx, actor.id, 'catalog.product.image.upload', 'product', productId, requestId, {
          storeId,
          mimeType: type.mime,
          byteSize: file.size,
        });
        return {
          productId,
          imageUrl: `${PRODUCT_IMAGE_URL_PREFIX}${storageKey}`,
          mimeType: type.mime,
          byteSize: file.size,
        };
      });
      if (previousStorageKey && previousStorageKey !== storageKey)
        await unlink(join(this.productImageDirectory, previousStorageKey)).catch(() => undefined);
      return result;
    } catch (error) {
      await unlink(temporaryPath).catch(() => undefined);
      await unlink(finalPath).catch(() => undefined);
      throw error;
    }
  }
  async staffAccounts(actor: Actor, storeId: string) {
    await storeAccess(this.db.pool, actor, storeId, ['MANAGER']);
    must(
      await one(this.db.pool, 'SELECT id FROM stores WHERE id=$1', [storeId]),
      'STORE_NOT_FOUND',
      'Không tìm thấy cửa hàng.',
      404,
    );
    return rows(
      this.db.pool,
      `SELECT u.id,u.display_name,u.phone_normalized,u.email_normalized,u.account_type,u.status,
       m.role,u.created_at
       FROM store_memberships m JOIN users u ON u.id=m.user_id
       WHERE m.store_id=$1 ORDER BY u.created_at DESC,u.id,m.role`,
      [storeId],
    );
  }
  async createStaffAccount(
    actor: Actor,
    storeId: string,
    input: StaffAccountInput,
    key: string | undefined,
    requestId: string,
  ) {
    await storeAccess(this.db.pool, actor, storeId, ['MANAGER']);
    if (input.role === 'MANAGER' && !actor.is_admin)
      fail(
        'ADMIN_REQUIRED_FOR_MANAGER',
        'Chỉ quản trị viên hệ thống được cấp thêm tài khoản quản lý cửa hàng.',
        403,
      );
    const passwordHash = await hashPassword(input.password);
    return this.db.tx(async (tx) => {
      await storeAccess(tx, actor, storeId, ['MANAGER']);
      must(
        await one(tx, 'SELECT id FROM stores WHERE id=$1 FOR SHARE', [storeId]),
        'STORE_NOT_FOUND',
        'Không tìm thấy cửa hàng.',
        404,
      );
      return idempotent(tx, actor.id, `staff.account.create:${storeId}`, key, input, async () => {
        await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
          `staff:${input.phone ?? ''}:${input.email ?? ''}`,
        ]);
        if (
          await one(
            tx,
            `SELECT id FROM users WHERE
               ($1::text IS NOT NULL AND phone_normalized=$1) OR
               ($2::text IS NOT NULL AND email_normalized=$2)`,
            [input.phone ?? null, input.email ?? null],
          )
        )
          fail('ACCOUNT_EXISTS', 'Số điện thoại hoặc email này đã được sử dụng.', 409);
        const user = must(
          await one(
            tx,
            `INSERT INTO users(display_name,phone_normalized,email_normalized,password_hash,account_type,created_by_user_id)
               VALUES($1,$2,$3,$4,'STAFF',$5)
               RETURNING id,display_name,phone_normalized,email_normalized,account_type,status,created_at`,
            [input.displayName, input.phone ?? null, input.email ?? null, passwordHash, actor.id],
          ),
        );
        await tx.query('INSERT INTO store_memberships(user_id,store_id,role) VALUES($1,$2,$3)', [
          user.id,
          storeId,
          input.role,
        ]);
        await audit(tx, actor.id, 'staff.account.create', 'user', user.id, requestId, {
          storeId,
          role: input.role,
        });
        return { ...user, role: input.role };
      });
    });
  }
  async resetStaffPassword(
    actor: Actor,
    storeId: string,
    userId: string,
    password: string,
    requestId: string,
  ) {
    await storeAccess(this.db.pool, actor, storeId, ['MANAGER']);
    validateStaffPasswordTarget(
      actor,
      userId,
      await this.staffPasswordTarget(this.db.pool, storeId, userId),
    );
    const passwordHash = await hashPassword(password);
    return this.db.tx(async (tx) => {
      await storeAccess(tx, actor, storeId, ['MANAGER']);
      const target = await this.staffPasswordTarget(tx, storeId, userId, true);
      validateStaffPasswordTarget(actor, userId, target);
      await tx.query('UPDATE users SET password_hash=$2,updated_at=clock_timestamp() WHERE id=$1', [
        userId,
        passwordHash,
      ]);
      const revoked = await tx.query(
        'UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL',
        [userId],
      );
      const sessionsRevoked = revoked.rowCount ?? 0;
      await audit(tx, actor.id, 'staff.password.reset', 'user', userId, requestId, {
        storeId,
        roles: target.roles,
        sessionsRevoked,
      });
      return { userId, passwordReset: true, sessionsRevoked };
    });
  }
  private staffPasswordTarget(
    tx: Pick<Tx, 'query'>,
    storeId: string,
    userId: string,
    lock = false,
  ) {
    return one<StaffPasswordTarget>(
      tx,
      `SELECT u.id,u.account_type,u.is_admin,
       ARRAY(SELECT membership.role FROM store_memberships membership
             WHERE membership.store_id=$1 AND membership.user_id=u.id
             ORDER BY membership.role) AS roles
       FROM users u
       WHERE u.id=$2 AND EXISTS(
         SELECT 1 FROM store_memberships membership
         WHERE membership.store_id=$1 AND membership.user_id=u.id
       ) ${lock ? 'FOR UPDATE OF u' : ''}`,
      [storeId, userId],
    );
  }
  private async insertProduct(tx: Tx, actor: Actor, storeId: string, input: any) {
    const category = input.categoryId
      ? must(
          await one(
            tx,
            'SELECT * FROM categories WHERE id=$1 AND (owner_store_id IS NULL OR owner_store_id=$2)',
            [input.categoryId, storeId],
          ),
          'CATEGORY_NOT_AVAILABLE',
          'Danh mục không thuộc cửa hàng này.',
          422,
        )
      : null;
    const code = input.sku.code.trim().toUpperCase();
    const barcode = input.sku.barcode?.trim() || null;
    await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
      `sku:${code}:${barcode ?? ''}`,
    ]);
    if (
      await one(tx, 'SELECT id FROM skus WHERE code=$1 OR ($2::text IS NOT NULL AND barcode=$2)', [
        code,
        barcode,
      ])
    )
      fail('SKU_EXISTS', 'Mã SKU hoặc mã vạch đã tồn tại.', 409);
    const product = must(
      await one(
        tx,
        'INSERT INTO products(name,description,category_id) VALUES($1,$2,$3) RETURNING *',
        [input.name, input.description ?? '', input.categoryId ?? null],
      ),
    );
    const sku = must(
      await one(
        tx,
        'INSERT INTO skus(product_id,code,barcode,name,unit) VALUES($1,$2,$3,$4,$5) RETURNING *',
        [product.id, code, barcode, input.sku.name, input.sku.unit],
      ),
    );
    await tx.query('INSERT INTO store_skus(store_id,sku_id,price,expires_on) VALUES($1,$2,$3,$4)', [
      storeId,
      sku.id,
      input.price,
      input.expiresOn ?? null,
    ]);
    await tx.query('INSERT INTO inventory_balances(store_id,sku_id,on_hand) VALUES($1,$2,$3)', [
      storeId,
      sku.id,
      input.initialStock,
    ]);
    await tx.query(
      "INSERT INTO stock_movements(store_id,sku_id,delta_on_hand,delta_reserved,reason,reference_id,actor_id) VALUES($1,$2,$3,0,'RECEIPT',$4,$5)",
      [storeId, sku.id, input.initialStock, `initial:${sku.id}`, actor.id],
    );
    return { product, sku, category };
  }
  updateProduct(
    actor: Actor,
    storeId: string,
    skuId: string,
    input: any,
    key: string | undefined,
    requestId: string,
  ) {
    return this.db.tx(async (tx) => {
      await storeAccess(tx, actor, storeId, ['MANAGER']);
      return idempotent(
        tx,
        actor.id,
        `catalog.update:${storeId}:${skuId}`,
        key,
        input,
        async () => {
          const old = must(
            await one(tx, 'SELECT * FROM store_skus WHERE store_id=$1 AND sku_id=$2 FOR UPDATE', [
              storeId,
              skuId,
            ]),
          );
          expected(old, input.expectedVersion);
          if (old.sale_price !== null && input.price <= old.sale_price)
            fail('INVALID_DISCOUNT', 'Hãy tắt hoặc cập nhật giá giảm trước khi đổi giá gốc.', 422);
          const updated = await one(
            tx,
            'UPDATE store_skus SET price=$3,active=$4,version=version+1,updated_at=now() WHERE store_id=$1 AND sku_id=$2 RETURNING *',
            [storeId, skuId, input.price, input.active],
          );
          await audit(tx, actor.id, 'catalog.price.update', 'sku', skuId, requestId, {
            storeId,
            price: input.price,
            active: input.active,
          });
          return updated;
        },
      );
    });
  }
  slot(
    actor: Actor,
    storeId: string,
    input: any,
    key: string | undefined,
    requestId: string,
    slotId?: string,
  ) {
    return this.db.tx(async (tx) => {
      await storeAccess(tx, actor, storeId, ['MANAGER']);
      return idempotent(
        tx,
        actor.id,
        `slot.${slotId ?? 'create'}:${storeId}`,
        key,
        input,
        async () => {
          let result;
          if (slotId) {
            const old = must(
              await one(
                tx,
                'SELECT * FROM fulfillment_slots WHERE id=$1 AND store_id=$2 FOR UPDATE',
                [slotId, storeId],
              ),
            );
            expected(old, input.expectedVersion);
            if (input.capacity < old.allocated_count)
              fail('SLOT_CAPACITY_TOO_LOW', 'Sức chứa thấp hơn lượng đã cấp.', 422);
            result = await one(
              tx,
              'UPDATE fulfillment_slots SET capacity=$2,version=version+1 WHERE id=$1 RETURNING *',
              [slotId, input.capacity],
            );
          } else {
            if (
              new Date(input.startsAt) >= new Date(input.endsAt) ||
              new Date(input.startsAt) <= new Date()
            )
              fail('INVALID_SLOT', 'Thời gian không hợp lệ.', 422);
            await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [
              `slots:${storeId}`,
            ]);
            const overlap = await one(
              tx,
              'SELECT id FROM fulfillment_slots WHERE store_id=$1 AND starts_at<$3 AND ends_at>$2',
              [storeId, input.startsAt, input.endsAt],
            );
            if (overlap) fail('SLOT_OVERLAP', 'Khung giờ bị trùng.', 422);
            result = await one(
              tx,
              'INSERT INTO fulfillment_slots(store_id,starts_at,ends_at,capacity) VALUES($1,$2,$3,$4) RETURNING *',
              [storeId, input.startsAt, input.endsAt, input.capacity],
            );
          }
          await audit(tx, actor.id, 'slot.configure', 'slot', result!.id, requestId, {
            capacity: input.capacity,
          });
          return result;
        },
      );
    });
  }
  async report(actor: Actor, storeId: string | undefined, from: string, to: string) {
    if (new Date(from) >= new Date(to))
      fail('INVALID_RANGE', 'Khoảng thời gian không hợp lệ.', 400);
    if (storeId) await storeAccess(this.db.pool, actor, storeId, ['MANAGER']);
    else admin(actor);
    return one(
      this.db.pool,
      `SELECT
      (SELECT count(*)::int FROM orders WHERE status='COMPLETED' AND completed_at >= $2 AND completed_at < $3 AND ($1::uuid IS NULL OR store_id=$1)) AS completed_orders,
      (SELECT COALESCE(sum(total),0)::bigint FROM orders WHERE status='COMPLETED' AND completed_at >= $2 AND completed_at < $3 AND ($1::uuid IS NULL OR store_id=$1)) AS completed_order_value,
      (SELECT COALESCE(sum(p.amount),0)::bigint FROM payment_attempts p JOIN orders o ON o.id=p.order_id WHERE p.status='PAID' AND p.paid_at >= $2 AND p.paid_at < $3 AND ($1::uuid IS NULL OR o.store_id=$1)) AS online_collected,
      (SELECT COALESCE(sum(c.amount),0)::bigint FROM counter_collections c JOIN orders o ON o.id=c.order_id WHERE c.collected_at >= $2 AND c.collected_at < $3 AND ($1::uuid IS NULL OR o.store_id=$1)) AS cash_collected,
      (SELECT COALESCE(sum(r.amount),0)::bigint FROM refunds r JOIN payment_attempts p ON p.id=r.payment_attempt_id JOIN orders o ON o.id=p.order_id WHERE r.status='SUCCEEDED' AND r.succeeded_at >= $2 AND r.succeeded_at < $3 AND ($1::uuid IS NULL OR o.store_id=$1)) AS refunded`,
      [storeId ?? null, from, to],
    );
  }
  categories() {
    return rows(
      this.db.pool,
      'SELECT id,name,slug FROM categories WHERE owner_store_id IS NULL ORDER BY name LIMIT 100',
    );
  }
}
