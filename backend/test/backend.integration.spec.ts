import 'reflect-metadata';
import { after as afterAll, before as beforeAll, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import type { INestApplication } from '@nestjs/common';
import { migrate } from '../src/database/migrate';
import { Db, one } from '../src/database/db';
import { hash, hmac } from '../src/common/crypto';
import { JobsService } from '../src/jobs/jobs.service';
import { ENV, Env } from '../src/config/env';
import { createServer } from 'node:http';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const schema = `shopgo_test_${randomUUID().replaceAll('-', '')}`;
const base =
  process.env.TEST_DATABASE_URL ?? 'postgresql://shopgo:shopgo_local_only@localhost:5433/shopgo';
const url = new URL(base);
url.searchParams.set('options', `-c search_path=${schema},public`);
let app: INestApplication, db: Db, root: Pool, uploadRoot: string;
const ids = {
  customer: randomUUID(),
  other: randomUUID(),
  picker: randomUUID(),
  counter: randomUUID(),
  manager: randomUUID(),
  admin: randomUUID(),
  store: randomUUID(),
  otherStore: randomUUID(),
  sku: randomUUID(),
  product: randomUUID(),
  slot: randomUUID(),
};
const tokens = {
  customer: 'test-customer-token',
  other: 'test-other-token',
  picker: 'test-picker-token',
  counter: 'test-counter-token',
  manager: 'test-manager-token',
  admin: 'test-admin-token',
};
type Role = keyof typeof tokens;
function api(role: Role = 'customer') {
  return {
    get: (p: string) =>
      request(app.getHttpServer()).get(`/api/v1${p}`).auth(tokens[role], { type: 'bearer' }),
    post: (p: string) =>
      request(app.getHttpServer()).post(`/api/v1${p}`).auth(tokens[role], { type: 'bearer' }),
    put: (p: string) =>
      request(app.getHttpServer()).put(`/api/v1${p}`).auth(tokens[role], { type: 'bearer' }),
    patch: (p: string) =>
      request(app.getHttpServer()).patch(`/api/v1${p}`).auth(tokens[role], { type: 'bearer' }),
  };
}
const key = () => randomUUID();
async function quote(role: Role = 'customer', voucherCode?: string) {
  const cart = (await api(role).get(`/cart?storeId=${ids.store}`).expect(200)).body.data;
  const changed = (
    await api(role)
      .put(`/cart/items/${ids.sku}`)
      .send({ storeId: ids.store, quantity: 1, expectedVersion: cart.version })
      .expect(200)
  ).body.data;
  const response = await api(role)
    .post('/checkout/quotes')
    .send({
      cartId: cart.id,
      cartVersion: changed.version,
      slotId: ids.slot,
      ...(voucherCode ? { voucherCode } : {}),
    })
    .expect(201);
  return {
    quoteId: response.body.data.id,
    paymentMethod: 'PAY_AT_PICKUP',
    expectedCartVersion: changed.version,
  };
}
async function order(role: Role = 'customer', online = false) {
  const payload = await quote(role);
  payload.paymentMethod = online ? 'ONLINE' : 'PAY_AT_PICKUP';
  const created = (
    await api(role).post('/orders').set('Idempotency-Key', key()).send(payload).expect(201)
  ).body.data;
  if (online || created.amountDueNow === 0) return created;
  const attempt = (
    await api(role)
      .post(`/orders/${created.id}/payment-attempts`)
      .set('Idempotency-Key', key())
      .send({ expectedVersion: created.version })
      .expect(201)
  ).body.data;
  return (
    await api(role)
      .post(`/orders/${created.id}/payment-attempts/${attempt.id}/confirm-sandbox`)
      .set('Idempotency-Key', key())
      .send({ expectedVersion: created.version })
      .expect(200)
  ).body.data;
}
async function ready() {
  let o = await order();
  o = (
    await api('picker')
      .post(`/stores/${ids.store}/orders/${o.id}/claim`)
      .set('Idempotency-Key', key())
      .send({ expectedVersion: o.version })
      .expect(201)
  ).body.data;
  o = (
    await api('picker')
      .put(`/stores/${ids.store}/orders/${o.id}/picking-items/${o.items[0].id}`)
      .set('Idempotency-Key', key())
      .send({ expectedVersion: o.version, barcode: 'BAR-TEST', pickedQuantity: 1 })
      .expect(200)
  ).body.data;
  return (
    await api('picker')
      .post(`/stores/${ids.store}/orders/${o.id}/ready`)
      .set('Idempotency-Key', key())
      .send({ expectedVersion: o.version })
      .expect(201)
  ).body.data;
}
async function sandbox(o: any, status: 'PAID' | 'FAILED' = 'PAID', eventId = randomUUID()) {
  const attempt = (
    await api()
      .post(`/orders/${o.id}/payment-attempts`)
      .set('Idempotency-Key', key())
      .send({ expectedVersion: o.version })
      .expect(201)
  ).body.data;
  const body = JSON.stringify({
    eventId,
    reference: attempt.providerReference,
    merchant: 'shopgo-local',
    amount: attempt.amount,
    currency: 'VND',
    status,
  });
  return { body, timestamp: String(Math.floor(Date.now() / 1000)), attempt };
}
function webhook(body: string, timestamp: string, signature?: string) {
  return request(app.getHttpServer())
    .post('/api/v1/webhooks/payments/sandbox')
    .set('Content-Type', 'application/json')
    .set('X-Webhook-Timestamp', timestamp)
    .set(
      'X-Webhook-Signature',
      signature ?? hmac(process.env.PAYMENT_WEBHOOK_SECRET!, `${timestamp}.${body}`),
    )
    .send(body);
}
describe('ShopGo PostgreSQL integration', () => {
  const registrationPassword = 'ShopGo-passphrase-2026!';
  const sellerRegistration = () => ({
    accountType: 'SELLER',
    storeName: 'Cửa hàng đăng ký thử',
    phone: '0901234567',
    email: 'seller@example.test',
    password: registrationPassword,
    address: { street: '25 Nguyễn Huệ', ward: 'Phường Bến Nghé', city: 'Thành phố Hồ Chí Minh' },
    location: {
      latitude: 10.7769,
      longitude: 106.7009,
      source: 'GPS',
      accuracyMeters: 8,
      confirmed: true,
    },
  });
  beforeAll(async () => {
    root = new Pool({ connectionString: base });
    await root.query(`CREATE SCHEMA ${schema}`);
    process.env.NODE_ENV = 'test';
    process.env.DATABASE_URL = url.toString();
    process.env.AUTH_SECRET = 'integration-secret-at-least-32-characters';
    process.env.OTP_MODE = 'local';
    process.env.PAYMENT_MODE = 'sandbox';
    process.env.PAYMENT_WEBHOOK_SECRET = 'integration-payment-secret-at-least-32';
    uploadRoot = await mkdtemp(join(tmpdir(), 'shopgo-product-images-'));
    process.env.UPLOAD_DIR = uploadRoot;
    await migrate(url.toString());
    await migrate(url.toString());
    const { createApp } = await import('../src/bootstrap');
    app = await createApp();
    await app.listen(0, '127.0.0.1');
    db = app.get(Db);
  });
  afterAll(async () => {
    if (app) await app.close();
    if (root) {
      if (!/^shopgo_test_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe test schema');
      await root.query(`DROP SCHEMA ${schema} CASCADE`);
      await root.end();
    }
    if (uploadRoot) await rm(uploadRoot, { recursive: true, force: true });
  });
  beforeEach(async () => {
    const tables = await root.query(
      "SELECT tablename FROM pg_tables WHERE schemaname=$1 AND tablename<>'schema_migrations'",
      [schema],
    );
    await root.query(
      `TRUNCATE ${tables.rows.map((r: any) => `"${schema}"."${r.tablename}"`).join(',')} CASCADE`,
    );
    await db.tx(async (tx) => {
      for (const role of Object.keys(tokens) as Role[]) {
        await tx.query(
          'INSERT INTO users(id,display_name,phone_normalized,is_admin,can_refund) VALUES($1,$2,$3,$4,$5)',
          [
            ids[role],
            role,
            `+8491111111${Object.keys(tokens).indexOf(role)}`,
            role === 'admin',
            role === 'manager',
          ],
        );
        await tx.query(
          "INSERT INTO auth_sessions(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '1 hour')",
          [ids[role], hash(tokens[role])],
        );
      }
      for (const [id, code] of [
        [ids.store, 'TEST'],
        [ids.otherStore, 'OTHER'],
      ])
        await tx.query("INSERT INTO stores(id,code,name,address) VALUES($1,$2,$2,'Fake address')", [
          id,
          code,
        ]);
      for (const role of ['picker', 'counter', 'manager'] as const)
        await tx.query('INSERT INTO store_memberships(user_id,store_id,role) VALUES($1,$2,$3)', [
          ids[role],
          ids.store,
          role.toUpperCase(),
        ]);
      await tx.query("INSERT INTO products(id,name) VALUES($1,'Cà rốt')", [ids.product]);
      await tx.query(
        "INSERT INTO skus(id,product_id,code,barcode,name) VALUES($1,$2,'SKU-TEST','BAR-TEST','Cà rốt')",
        [ids.sku, ids.product],
      );
      await tx.query('INSERT INTO store_skus(store_id,sku_id,price) VALUES($1,$2,10000)', [
        ids.store,
        ids.sku,
      ]);
      await tx.query('INSERT INTO inventory_balances(store_id,sku_id,on_hand) VALUES($1,$2,10)', [
        ids.store,
        ids.sku,
      ]);
      await tx.query(
        "INSERT INTO fulfillment_slots(id,store_id,starts_at,ends_at,capacity) VALUES($1,$2,now()+interval '1 day',now()+interval '25 hours',10)",
        [ids.slot, ids.store],
      );
    });
  });
  it('health, envelope, request ID and schema readiness', async () => {
    const r = await request(app.getHttpServer()).get('/api/v1/health/ready').expect(200);
    assert.strictEqual(r.body.data.status, 'ready');
    assert.strictEqual(r.headers['x-request-id'], r.body.meta.requestId);
  });
  it('requires authentication and rejects invalid DTO fields', async () => {
    await request(app.getHttpServer()).get('/api/v1/orders').expect(401);
    await api().post('/orders').send({ quoteId: 'bad', total: 1 }).expect(400);
  });
  it('updates the authenticated profile while preserving roles and contact uniqueness', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/me')
      .send({ displayName: 'Anonymous' })
      .expect(401);
    const updated = (
      await request(app.getHttpServer())
        .patch('/api/v1/me')
        .auth(tokens.customer, { type: 'bearer' })
        .send({
          displayName: 'Nguyễn An',
          phone: '0901234567',
          email: 'AN@example.test',
        })
        .expect(200)
    ).body.data;
    assert.strictEqual(updated.displayName, 'Nguyễn An');
    assert.strictEqual(updated.phoneNormalized, '+84901234567');
    assert.strictEqual(updated.emailNormalized, 'an@example.test');
    assert.strictEqual(updated.accountType, 'USER');
    assert.deepStrictEqual(updated.memberships, []);
    assert.deepStrictEqual(updated.ownedStores, []);
    assert.strictEqual(updated.avatarUrl, null);

    const duplicate = await request(app.getHttpServer())
      .patch('/api/v1/me')
      .auth(tokens.customer, { type: 'bearer' })
      .send({ phone: '+84911111111' })
      .expect(409);
    assert.strictEqual(duplicate.body.error.code, 'PROFILE_CONTACT_EXISTS');
    await request(app.getHttpServer())
      .patch('/api/v1/me')
      .auth(tokens.customer, { type: 'bearer' })
      .send({ phone: null, email: null })
      .expect(400);
    await request(app.getHttpServer())
      .patch('/api/v1/me')
      .auth(tokens.customer, { type: 'bearer' })
      .send({ displayName: 'Still An', isAdmin: true })
      .expect(400);
    const stored = await one(
      db.pool,
      'SELECT display_name,phone_normalized,email_normalized,is_admin FROM users WHERE id=$1',
      [ids.customer],
    );
    assert.deepStrictEqual(stored, {
      display_name: 'Nguyễn An',
      phone_normalized: '+84901234567',
      email_normalized: 'an@example.test',
      is_admin: false,
    });
  });
  it('uploads, replaces and removes the authenticated avatar', async () => {
    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ]);
    const first = (
      await request(app.getHttpServer())
        .post('/api/v1/me/avatar')
        .auth(tokens.customer, { type: 'bearer' })
        .attach('avatar', png, { filename: 'avatar.png', contentType: 'image/png' })
        .expect(201)
    ).body.data;
    assert.match(first.avatarUrl, /^\/api\/v1\/media\/avatars\/[0-9a-f-]+\.png$/);
    assert.strictEqual(first.accountType, 'USER');
    await request(app.getHttpServer())
      .get(first.avatarUrl)
      .expect('Content-Type', /image\/png/)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/v1/me/avatar')
      .auth(tokens.customer, { type: 'bearer' })
      .attach('avatar', Buffer.from('not-an-image'), {
        filename: 'spoofed.png',
        contentType: 'image/png',
      })
      .expect(422);
    await request(app.getHttpServer())
      .post('/api/v1/me/avatar')
      .auth(tokens.customer, { type: 'bearer' })
      .expect(400);

    const webp = Buffer.from('RIFF\u0004\u0000\u0000\u0000WEBP', 'binary');
    const replacement = (
      await request(app.getHttpServer())
        .post('/api/v1/me/avatar')
        .auth(tokens.customer, { type: 'bearer' })
        .attach('avatar', webp, { filename: 'avatar.webp', contentType: 'image/webp' })
        .expect(201)
    ).body.data;
    assert.match(replacement.avatarUrl, /\.webp$/);
    await request(app.getHttpServer()).get(first.avatarUrl).expect(404);
    await request(app.getHttpServer()).get(replacement.avatarUrl).expect(200);
    assert.strictEqual((await readdir(join(uploadRoot, 'avatars'))).length, 1);

    const removed = (
      await request(app.getHttpServer())
        .delete('/api/v1/me/avatar')
        .auth(tokens.customer, { type: 'bearer' })
        .expect(200)
    ).body.data;
    assert.strictEqual(removed.avatarUrl, null);
    await request(app.getHttpServer()).get(replacement.avatarUrl).expect(404);
    assert.strictEqual((await readdir(join(uploadRoot, 'avatars'))).length, 0);
    await request(app.getHttpServer())
      .delete('/api/v1/me/avatar')
      .auth(tokens.customer, { type: 'bearer' })
      .expect(200);
    const actions = (
      await db.pool.query(
        "SELECT action FROM audit_logs WHERE actor_id=$1 AND action LIKE 'profile.%' ORDER BY action",
        [ids.customer],
      )
    ).rows.map((row) => row.action);
    assert.deepStrictEqual(actions, [
      'profile.avatar.remove',
      'profile.avatar.upload',
      'profile.avatar.upload',
    ]);
  });
  it('OTP is one-time, attempts persist and session can be revoked', async () => {
    const challenge = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone: '+84999999999' })
        .expect(202)
    ).body.data;
    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ challengeId: challenge.challengeId, code: '000000' })
      .expect(401);
    assert.strictEqual(
      (await one(db.pool, 'SELECT attempts FROM otp_challenges WHERE id=$1', [
        challenge.challengeId,
      ]))!.attempts,
      1,
    );
    const session = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/verify')
        .send({ challengeId: challenge.challengeId, code: challenge.localCode })
        .expect(200)
    ).body.data;
    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/verify')
      .send({ challengeId: challenge.challengeId, code: challenge.localCode })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .auth(session.accessToken, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .auth(session.accessToken, { type: 'bearer' })
      .expect(401);
  });
  it('rate limits local OTP persistently', async () => {
    for (let i = 0; i < 3; i++)
      await request(app.getHttpServer())
        .post('/api/v1/auth/otp/request')
        .send({ phone: '+84988888888' })
        .expect(202);
    await request(app.getHttpServer())
      .post('/api/v1/auth/otp/request')
      .send({ phone: '+84988888888' })
      .expect(429);
  });
  it('returns store-scoped products and accent-insensitive search', async () => {
    const r = await request(app.getHttpServer())
      .get(`/api/v1/stores/${ids.store}/products?q=ca%20rot`)
      .expect(200);
    assert.strictEqual(r.body.data.items.length, 1);
    const other = await request(app.getHttpServer())
      .get(`/api/v1/stores/${ids.otherStore}/products`)
      .expect(200);
    assert.strictEqual(other.body.data.items.length, 0);
  });
  it('discovers store offers globally with metadata and lossless composite pagination', async () => {
    await db.tx(async (tx) => {
      await tx.query(`UPDATE stores SET name=$2,address=$3,latitude=$4,longitude=$5 WHERE id=$1`, [
        ids.store,
        'ShopGo Trung tâm',
        '10 Đường A',
        10.7769,
        106.7009,
      ]);
      await tx.query(`UPDATE stores SET name=$2,address=$3,latitude=$4,longitude=$5 WHERE id=$1`, [
        ids.otherStore,
        'ShopGo Ven sông',
        '20 Đường B',
        10.8,
        106.71,
      ]);
      await tx.query('INSERT INTO store_skus(store_id,sku_id,price) VALUES($1,$2,12500)', [
        ids.otherStore,
        ids.sku,
      ]);
      await tx.query('INSERT INTO inventory_balances(store_id,sku_id,on_hand) VALUES($1,$2,4)', [
        ids.otherStore,
        ids.sku,
      ]);
    });

    const offers: any[] = [];
    let cursor: string | null = null;
    do {
      const response: any = await request(app.getHttpServer())
        .get(`/api/v1/products?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
        .expect(200);
      offers.push(...response.body.data.items);
      cursor = response.body.data.nextCursor;
    } while (cursor);

    assert.strictEqual(offers.length, 2);
    assert.strictEqual(new Set(offers.map((offer) => `${offer.store.id}:${offer.id}`)).size, 2);
    assert.ok(offers.every((offer) => offer.id === ids.sku));
    const byStore = new Map(offers.map((offer) => [offer.store.id, offer]));
    assert.strictEqual(byStore.get(ids.store).price, 10000);
    assert.strictEqual(byStore.get(ids.store).available, 10);
    assert.deepStrictEqual(byStore.get(ids.store).store, {
      id: ids.store,
      code: 'TEST',
      name: 'ShopGo Trung tâm',
      address: '10 Đường A',
      latitude: 10.7769,
      longitude: 106.7009,
    });
    assert.strictEqual(byStore.get(ids.otherStore).price, 12500);
    assert.strictEqual(byStore.get(ids.otherStore).available, 4);
    assert.deepStrictEqual(byStore.get(ids.otherStore).store, {
      id: ids.otherStore,
      code: 'OTHER',
      name: 'ShopGo Ven sông',
      address: '20 Đường B',
      latitude: 10.8,
      longitude: 106.71,
    });
  });
  it('checkout reserves, snapshots and consumes quote once', async () => {
    const payload = await quote(),
      k = key();
    const first = await api().post('/orders').set('Idempotency-Key', k).send(payload).expect(201);
    const retry = await api().post('/orders').set('Idempotency-Key', k).send(payload).expect(201);
    assert.strictEqual(retry.body.data.id, first.body.data.id);
    assert.strictEqual(
      (await one(db.pool, 'SELECT reserved FROM inventory_balances'))!.reserved,
      1,
    );
    await api().post('/orders').set('Idempotency-Key', key()).send(payload).expect(409);
    await api()
      .post('/orders')
      .set('Idempotency-Key', k)
      .send({ ...payload, paymentMethod: 'ONLINE' })
      .expect(409);
  });
  it('snapshots a rounded 15% pickup deposit and confirms it only through sandbox payment', async () => {
    await db.pool.query('UPDATE store_skus SET price=10001,version=version+1');
    const cart = (await api().get(`/cart?storeId=${ids.store}`).expect(200)).body.data;
    const changed = (
      await api()
        .put(`/cart/items/${ids.sku}`)
        .send({ storeId: ids.store, quantity: 1, expectedVersion: cart.version })
        .expect(200)
    ).body.data;
    const quoteResponse = await api()
      .post('/checkout/quotes')
      .send({ cartId: cart.id, cartVersion: changed.version, slotId: ids.slot })
      .expect(201);
    const quoted = quoteResponse.body.data;
    assert.deepStrictEqual(
      {
        paymentPlan: quoted.paymentPlan,
        depositPercent: quoted.depositPercent,
        depositAmount: quoted.depositAmount,
        amountDueNow: quoted.amountDueNow,
        remainingAmount: quoted.remainingAmount,
      },
      {
        paymentPlan: 'DEPOSIT_15',
        depositPercent: 15,
        depositAmount: 1501,
        amountDueNow: 1501,
        remainingAmount: 8500,
      },
    );
    assert.deepStrictEqual(
      quoted.paymentOptions.map((option: any) => option.paymentMethod),
      ['ONLINE', 'PAY_AT_PICKUP'],
    );
    assert.strictEqual(quoted.paymentOptions[0].amountDueNow, 10001);
    assert.strictEqual(quoted.paymentOptions[1].depositAmount, 1501);
    const payload = {
      quoteId: quoted.id,
      paymentMethod: 'PAY_AT_PICKUP',
      expectedCartVersion: changed.version,
    };
    await api()
      .post('/orders')
      .set('Idempotency-Key', key())
      .send({ ...payload, depositAmount: 1 })
      .expect(400);
    const created = (
      await api().post('/orders').set('Idempotency-Key', key()).send(payload).expect(201)
    ).body.data;
    assert.strictEqual(created.status, 'PENDING_PAYMENT');
    assert.strictEqual(created.paymentPlan, 'DEPOSIT_15');
    assert.strictEqual(created.depositPercent, 15);
    assert.strictEqual(created.depositAmount, 1501);
    assert.strictEqual(created.amountDueNow, 1501);
    assert.strictEqual(created.remainingAmount, 8500);
    const attempt = (
      await api()
        .post(`/orders/${created.id}/payment-attempts`)
        .set('Idempotency-Key', key())
        .send({ expectedVersion: created.version })
        .expect(201)
    ).body.data;
    assert.strictEqual(attempt.amount, 1501);
    assert.strictEqual(attempt.sandbox, true);
    await db.pool.query('UPDATE payment_attempts SET amount=1500 WHERE id=$1', [attempt.id]);
    const mismatched = await api()
      .post(`/orders/${created.id}/payment-attempts/${attempt.id}/confirm-sandbox`)
      .set('Idempotency-Key', key())
      .send({ expectedVersion: created.version })
      .expect(422);
    assert.strictEqual(mismatched.body.error.code, 'PAYMENT_AMOUNT_MISMATCH');
    assert.strictEqual(
      (await one(db.pool, 'SELECT status FROM orders'))!.status,
      'PENDING_PAYMENT',
    );
    await db.pool.query('UPDATE payment_attempts SET amount=1501 WHERE id=$1', [attempt.id]);
    await api('other')
      .post(`/orders/${created.id}/payment-attempts/${attempt.id}/confirm-sandbox`)
      .set('Idempotency-Key', key())
      .send({ expectedVersion: created.version })
      .expect(404);
    const confirmed = (
      await api()
        .post(`/orders/${created.id}/payment-attempts/${attempt.id}/confirm-sandbox`)
        .set('Idempotency-Key', key())
        .send({ expectedVersion: created.version })
        .expect(200)
    ).body.data;
    assert.strictEqual(confirmed.status, 'CONFIRMED');
    assert.strictEqual(confirmed.paymentStatus, 'PARTIALLY_PAID');
    assert.strictEqual(confirmed.amountPaid, 1501);
    assert.strictEqual(confirmed.amountRemaining, 8500);
    assert.strictEqual(
      (await one(db.pool, 'SELECT status FROM inventory_reservations'))!.status,
      'COMMITTED',
    );
  });
  it('confirms a zero-total pickup order without creating a payment attempt', async () => {
    await db.pool.query(
      "INSERT INTO vouchers(code,discount_type,value,quota,valid_from,valid_until) VALUES('FREE','PERCENT',100,1,now()-interval '1 day',now()+interval '1 day')",
    );
    const payload = await quote('customer', 'FREE');
    const created = (
      await api().post('/orders').set('Idempotency-Key', key()).send(payload).expect(201)
    ).body.data;
    assert.strictEqual(created.total, 0);
    assert.strictEqual(created.status, 'CONFIRMED');
    assert.strictEqual(created.depositAmount, 0);
    assert.strictEqual(created.amountDueNow, 0);
    assert.strictEqual(created.remainingAmount, 0);
    assert.strictEqual(created.paymentStatus, 'PAID');
    assert.strictEqual(
      (await one(db.pool, 'SELECT count(*)::int AS n FROM payment_attempts'))!.n,
      0,
    );
  });
  it('rejects changed prices and expired quote before reserving', async () => {
    const payload = await quote();
    await db.pool.query('UPDATE store_skus SET price=12000,version=version+1');
    const r = await api().post('/orders').set('Idempotency-Key', key()).send(payload).expect(409);
    assert.strictEqual(r.body.error.code, 'PRICE_CHANGED');
    await db.pool.query("UPDATE checkout_quotes SET expires_at=now()-interval '1 second'");
    await api().post('/orders').set('Idempotency-Key', key()).send(payload).expect(410);
    assert.strictEqual(
      (await one(db.pool, 'SELECT reserved FROM inventory_balances'))!.reserved,
      0,
    );
  });
  it('serializes concurrent checkout for the last SKU', async () => {
    await db.pool.query('UPDATE inventory_balances SET on_hand=1');
    const [a, b] = await Promise.all([quote(), quote('other')]);
    const results = await Promise.all([
      api().post('/orders').set('Idempotency-Key', key()).send(a),
      api('other').post('/orders').set('Idempotency-Key', key()).send(b),
    ]);
    assert.deepStrictEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.strictEqual(
      (await one(db.pool, 'SELECT reserved FROM inventory_balances'))!.reserved,
      1,
    );
    assert.strictEqual((await one(db.pool, 'SELECT count(*)::int AS n FROM orders'))!.n, 1);
  });
  it('serializes concurrent checkout for the last slot', async () => {
    await db.pool.query('UPDATE fulfillment_slots SET capacity=1');
    const [a, b] = await Promise.all([quote(), quote('other')]);
    const results = await Promise.all([
      api().post('/orders').set('Idempotency-Key', key()).send(a),
      api('other').post('/orders').set('Idempotency-Key', key()).send(b),
    ]);
    assert.deepStrictEqual(results.map((r) => r.status).sort(), [201, 409]);
    assert.strictEqual(
      (await one(db.pool, 'SELECT allocated_count FROM fulfillment_slots'))!.allocated_count,
      1,
    );
  });
  it('enforces voucher quota and releases it exactly once on cancellation', async () => {
    await db.pool.query(
      "INSERT INTO vouchers(code,discount_type,value,quota,valid_from,valid_until) VALUES('LAST','FIXED',1000,1,now()-interval '1 day',now()+interval '1 day')",
    );
    const [a, b] = await Promise.all([quote('customer', 'LAST'), quote('other', 'LAST')]);
    const results = await Promise.all([
      api().post('/orders').set('Idempotency-Key', key()).send(a),
      api('other').post('/orders').set('Idempotency-Key', key()).send(b),
    ]);
    assert.strictEqual(results.filter((r) => r.status === 201).length, 1);
    const winner = results.findIndex((r) => r.status === 201),
      role: Role = winner === 0 ? 'customer' : 'other',
      o = results[winner].body.data,
      k = key();
    assert.strictEqual(o.total, 9000);
    await api(role)
      .post(`/orders/${o.id}/cancel`)
      .set('Idempotency-Key', k)
      .send({ expectedVersion: o.version, reason: 'Không cần nữa' })
      .expect(201);
    await api(role)
      .post(`/orders/${o.id}/cancel`)
      .set('Idempotency-Key', k)
      .send({ expectedVersion: o.version, reason: 'Không cần nữa' })
      .expect(201);
    assert.strictEqual(
      (await one(db.pool, 'SELECT allocated_count FROM vouchers'))!.allocated_count,
      0,
    );
  });
  it('denies cross-user and cross-store access while managers inherit picker access', async () => {
    const o = await order();
    await api('other').get(`/orders/${o.id}`).expect(404);
    await api('picker')
      .post(`/stores/${ids.otherStore}/orders/${o.id}/claim`)
      .set('Idempotency-Key', key())
      .send({ expectedVersion: 1 })
      .expect(403);
    await api('manager')
      .post(`/stores/${ids.store}/orders/${o.id}/claim`)
      .set('Idempotency-Key', key())
      .send({ expectedVersion: 1 })
      .expect(201);
  });
  it('blocks READY for incomplete picking and wrong barcode', async () => {
    const o = await order();
    const picking = (
      await api('picker')
        .post(`/stores/${ids.store}/orders/${o.id}/claim`)
        .set('Idempotency-Key', key())
        .send({ expectedVersion: 1 })
        .expect(201)
    ).body.data;
    await api('picker')
      .post(`/stores/${ids.store}/orders/${o.id}/ready`)
      .set('Idempotency-Key', key())
      .send({ expectedVersion: picking.version })
      .expect(409);
    await api('picker')
      .put(`/stores/${ids.store}/orders/${o.id}/picking-items/${o.items[0].id}`)
      .set('Idempotency-Key', key())
      .send({ expectedVersion: picking.version, barcode: 'WRONG', pickedQuantity: 1 })
      .expect(422);
  });
  it('fails closed when a deposit order reaches READY without a paid deposit', async () => {
    const payload = await quote();
    const created = (
      await api().post('/orders').set('Idempotency-Key', key()).send(payload).expect(201)
    ).body.data;
    assert.strictEqual(created.status, 'PENDING_PAYMENT');
    await db.pool.query("UPDATE orders SET status='READY' WHERE id=$1", [created.id]);
    const response = await api('counter')
      .post(`/stores/${ids.store}/orders/${created.id}/collections`)
      .set('Idempotency-Key', key())
      .send({
        amount: created.remainingAmount,
        method: 'CASH',
        shiftReference: 'UNPAID-DEPOSIT',
        expectedVersion: created.version,
      })
      .expect(422);
    assert.strictEqual(response.body.error.code, 'DEPOSIT_REQUIRED');
    assert.strictEqual(
      (await one(db.pool, 'SELECT count(*)::int AS n FROM counter_collections'))!.n,
      0,
    );
  });
  it('completes cash collection and handover exactly once', async () => {
    let o = await ready();
    const token = (await api().get(`/orders/${o.id}/pickup-token`).expect(200)).body.data.token;
    await api('counter')
      .post(`/stores/${ids.store}/orders/${o.id}/handover`)
      .set('Idempotency-Key', key())
      .send({ token, expectedVersion: o.version })
      .expect(422);
    await api('counter')
      .post(`/stores/${ids.store}/orders/${o.id}/collections`)
      .set('Idempotency-Key', key())
      .send({
        amount: o.total,
        method: 'CASH',
        shiftReference: 'SHIFT-WRONG',
        expectedVersion: o.version,
      })
      .expect(422);
    o = (
      await api('counter')
        .post(`/stores/${ids.store}/orders/${o.id}/collections`)
        .set('Idempotency-Key', key())
        .send({
          amount: o.remainingAmount,
          method: 'CASH',
          shiftReference: 'SHIFT-1',
          expectedVersion: o.version,
        })
        .expect(201)
    ).body.data;
    const duplicate = await api('counter')
      .post(`/stores/${ids.store}/orders/${o.id}/collections`)
      .set('Idempotency-Key', key())
      .send({
        amount: o.remainingAmount,
        method: 'CASH',
        shiftReference: 'SHIFT-2',
        expectedVersion: o.version,
      })
      .expect(409);
    assert.strictEqual(duplicate.body.error.code, 'CASH_ALREADY_COLLECTED');
    assert.strictEqual(
      (await one(db.pool, 'SELECT count(*)::int AS n FROM counter_collections'))!.n,
      1,
    );
    const k = key(),
      payload = { token, expectedVersion: o.version };
    const first = await api('counter')
      .post(`/stores/${ids.store}/orders/${o.id}/handover`)
      .set('Idempotency-Key', k)
      .send(payload)
      .expect(201);
    assert.strictEqual(first.body.data.status, 'COMPLETED');
    await api('counter')
      .post(`/stores/${ids.store}/orders/${o.id}/handover`)
      .set('Idempotency-Key', k)
      .send(payload)
      .expect(201);
    await api('counter')
      .post(`/stores/${ids.store}/orders/${o.id}/handover`)
      .set('Idempotency-Key', key())
      .send({ token, expectedVersion: first.body.data.version })
      .expect(409);
    const balance = await one(db.pool, 'SELECT * FROM inventory_balances');
    assert.strictEqual(balance!.on_hand, 9);
    assert.strictEqual(balance!.reserved, 0);
    assert.strictEqual(
      (await one(db.pool, 'SELECT allocated_count FROM fulfillment_slots'))!.allocated_count,
      1,
    );
  });
  it('rotates tokens and revokes old QR', async () => {
    const o = await ready();
    const token = (await api().get(`/orders/${o.id}/pickup-token`).expect(200)).body.data.token;
    await api()
      .post(`/orders/${o.id}/pickup-token/rotate`)
      .set('Idempotency-Key', key())
      .send({ expectedVersion: o.version })
      .expect(201);
    await api('counter').post(`/stores/${ids.store}/pickup/lookup`).send({ token }).expect(410);
    const next = (await api().get(`/orders/${o.id}/pickup-token`).expect(200)).body.data.token;
    assert.notStrictEqual(next, token);
    await api('counter')
      .post(`/stores/${ids.store}/pickup/lookup`)
      .send({ token: next })
      .expect(201);
  });
  it('protects reserved stock from negative adjustment and immutable history', async () => {
    await order();
    const balance = await one(db.pool, 'SELECT version FROM inventory_balances');
    await api('manager')
      .post(`/stores/${ids.store}/inventory/adjustments`)
      .set('Idempotency-Key', key())
      .send({ skuId: ids.sku, delta: -10, reason: 'Kiểm kê', expectedVersion: balance!.version })
      .expect(422);
    await assert.rejects(db.pool.query('UPDATE stock_movements SET delta_on_hand=999'), {
      code: '23514',
    });
    await assert.rejects(db.pool.query('UPDATE inventory_balances SET on_hand=-1'), {
      code: '23514',
    });
  });
  it('validates signed webhook and deduplicates payment', async () => {
    const o = await order('customer', true),
      w = await sandbox(o);
    assert.strictEqual(o.paymentPlan, 'FULL_ONLINE');
    assert.strictEqual(o.amountDueNow, o.total);
    assert.strictEqual(o.remainingAmount, 0);
    assert.strictEqual(w.attempt.amount, o.total);
    await webhook(w.body, w.timestamp, 'invalid').expect(401);
    await webhook(w.body, w.timestamp).expect(200);
    await webhook(w.body, w.timestamp).expect(200);
    const updated = (await api().get(`/orders/${o.id}`).expect(200)).body.data;
    assert.strictEqual(updated.status, 'CONFIRMED');
    assert.strictEqual(updated.paymentStatus, 'PAID');
    assert.strictEqual(
      (await one(db.pool, 'SELECT count(*)::int AS n FROM payment_webhook_inbox'))!.n,
      1,
    );
    assert.strictEqual(
      (await one(db.pool, 'SELECT status FROM inventory_reservations'))!.status,
      'COMMITTED',
    );
  });
  it('rejects webhook amount mismatch without recording a payment', async () => {
    const o = await order('customer', true),
      w = await sandbox(o),
      payload = JSON.parse(w.body);
    payload.amount++;
    await webhook(JSON.stringify(payload), w.timestamp).expect(422);
    assert.strictEqual(
      (await one(db.pool, 'SELECT status FROM orders'))!.status,
      'PENDING_PAYMENT',
    );
  });
  it('late payment expires order and creates a tracked refund, never revives', async () => {
    const o = await order('customer', true),
      w = await sandbox(o);
    await db.pool.query("UPDATE orders SET expires_at=now()-interval '1 second' WHERE id=$1", [
      o.id,
    ]);
    await webhook(w.body, w.timestamp).expect(200);
    const updated = (await api().get(`/orders/${o.id}`).expect(200)).body.data;
    assert.strictEqual(updated.status, 'EXPIRED');
    assert.strictEqual(updated.paymentStatus, 'REFUND_PENDING');
    assert.strictEqual(updated.refunds[0].amount, o.total);
    assert.strictEqual(
      (await one(db.pool, 'SELECT reserved FROM inventory_balances'))!.reserved,
      0,
    );
    await api('manager')
      .post(`/stores/${ids.store}/refunds/${updated.refunds[0].id}/confirm-sandbox`)
      .set('Idempotency-Key', key())
      .expect(201);
    assert.strictEqual((await api().get(`/orders/${o.id}`)).body.data.paymentStatus, 'REFUNDED');
  });
  it('expiry workers release ACTIVE only; outbox delivery is idempotent', async () => {
    const online = await order('customer', true);
    await order('other');
    await db.pool.query("UPDATE orders SET expires_at=now()-interval '1 second' WHERE id=$1", [
      online.id,
    ]);
    const jobs = app.get(JobsService);
    await Promise.all([jobs.expire(), jobs.expire()]);
    assert.strictEqual(
      (await one(db.pool, 'SELECT reserved FROM inventory_balances'))!.reserved,
      1,
    );
    await jobs.dispatch();
    await jobs.dispatch();
    assert.strictEqual(
      (await one(db.pool, 'SELECT count(*)::int AS n FROM notification_deliveries'))!.n,
      1,
    );
  });
  it('fails closed when AI is unavailable and returns an honest baseline', async () => {
    const conversation = (
      await api().post('/assistant/conversations').send({ storeId: ids.store }).expect(201)
    ).body.data;
    await api('other')
      .post(`/assistant/conversations/${conversation.id}/messages`)
      .send({ message: 'hello' })
      .expect(404);
    await api()
      .post(`/assistant/conversations/${conversation.id}/messages`)
      .send({ message: 'hello' })
      .expect(503);
    const recommendations = await api().get(`/recommendations?storeId=${ids.store}`).expect(200);
    assert.strictEqual(recommendations.body.data.personalized, false);
  });
  it('replays concurrent identical checkout without creating another order', async () => {
    const payload = await quote(),
      k = key();
    const result = await Promise.all([
      api().post('/orders').set('Idempotency-Key', k).send(payload),
      api().post('/orders').set('Idempotency-Key', k).send(payload),
    ]);
    assert.deepStrictEqual(
      result.map((r) => r.status),
      [201, 201],
    );
    assert.strictEqual(result[0].body.data.id, result[1].body.data.id);
    assert.strictEqual((await one(db.pool, 'SELECT count(*)::int AS n FROM orders'))!.n, 1);
  });
  it('rolls back all stock and order changes when checkout loses its slot', async () => {
    const payload = await quote();
    await db.pool.query('UPDATE fulfillment_slots SET capacity=0');
    await api().post('/orders').set('Idempotency-Key', key()).send(payload).expect(409);
    assert.strictEqual((await one(db.pool, 'SELECT count(*)::int AS n FROM orders'))!.n, 0);
    assert.strictEqual(
      (await one(db.pool, 'SELECT reserved FROM inventory_balances'))!.reserved,
      0,
    );
    assert.strictEqual((await one(db.pool, 'SELECT count(*)::int AS n FROM outbox_events'))!.n, 0);
  });
  it('only one of two pickers can claim an order', async () => {
    await db.pool.query(
      "INSERT INTO store_memberships(user_id,store_id,role) VALUES($1,$2,'PICKER')",
      [ids.other, ids.store],
    );
    const o = await order();
    const payload = { expectedVersion: o.version };
    const result = await Promise.all([
      api('picker')
        .post(`/stores/${ids.store}/orders/${o.id}/claim`)
        .set('Idempotency-Key', key())
        .send(payload),
      api('other')
        .post(`/stores/${ids.store}/orders/${o.id}/claim`)
        .set('Idempotency-Key', key())
        .send(payload),
    ]);
    assert.deepStrictEqual(result.map((r) => r.status).sort(), [201, 409]);
    assert.strictEqual(
      (await one(
        db.pool,
        "SELECT count(*)::int AS n FROM picking_assignments WHERE status='ACTIVE'",
      ))!.n,
      1,
    );
  });
  it('requires restocking confirmation after picking and blocks silent cash refund', async () => {
    let o = await ready();
    await api('manager')
      .post(`/stores/${ids.store}/orders/${o.id}/cancel`)
      .set('Idempotency-Key', key())
      .send({ expectedVersion: o.version, reason: 'Khách không đến' })
      .expect(422);
    o = (
      await api('counter')
        .post(`/stores/${ids.store}/orders/${o.id}/collections`)
        .set('Idempotency-Key', key())
        .send({
          amount: o.remainingAmount,
          method: 'CASH',
          shiftReference: 'TEST',
          expectedVersion: o.version,
        })
        .expect(201)
    ).body.data;
    const r = await api('manager')
      .post(`/stores/${ids.store}/orders/${o.id}/cancel`)
      .set('Idempotency-Key', key())
      .send({ expectedVersion: o.version, reason: 'Khách đổi ý', restockConfirmed: true })
      .expect(422);
    assert.strictEqual(r.body.error.code, 'CASH_REFUND_REVIEW_REQUIRED');
  });
  it('rotates a bearer session and invalidates its previous credential', async () => {
    const next = await api().post('/auth/refresh').expect(200);
    await api().get('/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .auth(next.body.data.accessToken, { type: 'bearer' })
      .expect(200);
  });
  it('handles payment and expiry workers concurrently without leaking stock', async () => {
    const o = await order('customer', true),
      w = await sandbox(o);
    await db.pool.query("UPDATE orders SET expires_at=now()-interval '1 second' WHERE id=$1", [
      o.id,
    ]);
    const [response] = await Promise.all([
      webhook(w.body, w.timestamp),
      app.get(JobsService).expire(),
    ]);
    assert.strictEqual(response.status, 200);
    const result = (await api().get(`/orders/${o.id}`)).body.data;
    assert.strictEqual(result.status, 'EXPIRED');
    assert.strictEqual(result.refunds.length, 1);
    assert.strictEqual(
      (await one(db.pool, 'SELECT reserved FROM inventory_balances'))!.reserved,
      0,
    );
    assert.strictEqual(
      (await one(db.pool, 'SELECT allocated_count FROM fulfillment_slots'))!.allocated_count,
      0,
    );
  });
  it('prevents refund requests that exceed the paid amount', async () => {
    const o = await order('customer', true),
      w = await sandbox(o);
    await webhook(w.body, w.timestamp).expect(200);
    const payload = { paymentId: w.attempt.id, amount: o.total, reason: 'Hỗ trợ khách' };
    await api('manager')
      .post(`/stores/${ids.store}/refunds`)
      .set('Idempotency-Key', key())
      .send(payload)
      .expect(201);
    await api('manager')
      .post(`/stores/${ids.store}/refunds`)
      .set('Idempotency-Key', key())
      .send({ ...payload, amount: 1 })
      .expect(422);
    await api('customer')
      .post(`/stores/${ids.store}/refunds`)
      .set('Idempotency-Key', key())
      .send(payload)
      .expect(403);
  });
  it('admin creates a product with atomic initial stock and manager cannot grant roles', async () => {
    const payload = {
      name: 'Demo',
      sku: { code: 'ADMIN-NEW', name: 'Demo', unit: 'piece' },
      storeId: ids.store,
      price: 15000,
      initialStock: 3,
    };
    const product = (
      await api('admin')
        .post('/admin/products')
        .set('Idempotency-Key', key())
        .send(payload)
        .expect(201)
    ).body.data;
    assert.strictEqual(
      (await one(db.pool, 'SELECT on_hand FROM inventory_balances WHERE sku_id=$1', [
        product.sku.id,
      ]))!.on_hand,
      3,
    );
    await api('manager')
      .post('/admin/memberships')
      .set('Idempotency-Key', key())
      .send({ userId: ids.manager, storeId: ids.otherStore, role: 'MANAGER' })
      .expect(403);
  });
  it('lets managers provision staff while keeping account creation and elevation restricted', async () => {
    const password = 'Staff-password-2026!';
    const payload = {
      displayName: 'Nhân viên soạn hàng An',
      phone: '0902222333',
      email: 'picker.an@example.test',
      password,
      role: 'PICKER',
    };
    const requestKey = key();
    const created = (
      await api('manager')
        .post(`/stores/${ids.store}/staff`)
        .set('Idempotency-Key', requestKey)
        .send(payload)
        .expect(201)
    ).body.data;
    assert.strictEqual(created.accountType, 'STAFF');
    assert.strictEqual(created.role, 'PICKER');
    assert.strictEqual(created.emailNormalized, payload.email);
    assert.strictEqual(created.phoneNormalized, '+84902222333');
    assert.strictEqual('password' in created, false);
    assert.strictEqual('passwordHash' in created, false);
    assert.strictEqual(
      (
        await api('manager')
          .post(`/stores/${ids.store}/staff`)
          .set('Idempotency-Key', requestKey)
          .send(payload)
          .expect(201)
      ).body.data.id,
      created.id,
    );
    const stored = await one(
      db.pool,
      'SELECT account_type,created_by_user_id,password_hash FROM users WHERE id=$1',
      [created.id],
    );
    assert.strictEqual(stored!.account_type, 'STAFF');
    assert.strictEqual(stored!.created_by_user_id, ids.manager);
    assert.notStrictEqual(stored!.password_hash, password);
    const staff = (await api('manager').get(`/stores/${ids.store}/staff`).expect(200)).body.data;
    assert.strictEqual(
      staff.some((item: any) => item.id === created.id && item.role === 'PICKER'),
      true,
    );

    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: payload.email, password })
      .expect(200);
    const employeeToken = login.body.data.accessToken;
    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .auth(employeeToken, { type: 'bearer' })
      .expect(200);
    assert.strictEqual(me.body.data.accountType, 'STAFF');
    assert.deepStrictEqual(me.body.data.memberships, [{ storeId: ids.store, role: 'PICKER' }]);
    await request(app.getHttpServer())
      .post(`/api/v1/stores/${ids.store}/staff`)
      .auth(employeeToken, { type: 'bearer' })
      .set('Idempotency-Key', key())
      .send({ ...payload, email: 'forbidden@example.test', phone: '0902222444' })
      .expect(403);
    await api('manager')
      .post(`/stores/${ids.otherStore}/staff`)
      .set('Idempotency-Key', key())
      .send({ ...payload, email: 'cross-store@example.test', phone: '0902222555' })
      .expect(403);
    await api('manager')
      .post(`/stores/${ids.store}/staff`)
      .set('Idempotency-Key', key())
      .send({ ...payload, email: 'manager@example.test', phone: '0902222666', role: 'MANAGER' })
      .expect(403);
    await api('manager')
      .post(`/stores/${ids.store}/staff`)
      .set('Idempotency-Key', key())
      .send(payload)
      .expect(409);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        accountType: 'STAFF',
        name: 'Self-created staff',
        email: 'self@example.test',
        password,
      })
      .expect(400);

    const delegatedManager = (
      await api('admin')
        .post(`/stores/${ids.otherStore}/staff`)
        .set('Idempotency-Key', key())
        .send({
          displayName: 'Quản lý do Admin cấp',
          email: 'delegated.manager@example.test',
          password,
          role: 'MANAGER',
        })
        .expect(201)
    ).body.data;
    assert.strictEqual(delegatedManager.role, 'MANAGER');
    await api('admin').get(`/stores/${ids.otherStore}/staff`).expect(200);
    await api('admin').get(`/stores/${ids.otherStore}/catalog/categories`).expect(200);
    await api('admin').get(`/stores/${ids.otherStore}/orders?limit=20`).expect(200);

    const createdOrder = await order();
    const claimed = (
      await api('manager')
        .post(`/stores/${ids.store}/orders/${createdOrder.id}/claim`)
        .set('Idempotency-Key', key())
        .send({ expectedVersion: createdOrder.version })
        .expect(201)
    ).body.data;
    assert.strictEqual(claimed.status, 'PICKING');
    await api('admin').get(`/orders/${createdOrder.id}`).expect(200);
  });
  it('lets store managers reset employee passwords and revokes every active employee session', async () => {
    const oldPassword = 'Staff-old-password-2026!';
    const newPassword = 'Staff-new-password-2026!';
    const employee = (
      await api('manager')
        .post(`/stores/${ids.store}/staff`)
        .set('Idempotency-Key', key())
        .send({
          displayName: 'Nhân viên cần đặt lại mật khẩu',
          email: 'password-reset.staff@example.test',
          password: oldPassword,
          role: 'PICKER',
        })
        .expect(201)
    ).body.data;
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: employee.emailNormalized, password: oldPassword })
      .expect(200);
    const employeeToken = login.body.data.accessToken;
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .auth(employeeToken, { type: 'bearer' })
      .expect(200);

    await api('manager')
      .patch(`/stores/${ids.store}/staff/${employee.id}/password`)
      .send({ password: 'short' })
      .expect(400);
    await api('manager')
      .patch(`/stores/${ids.store}/staff/${employee.id}/password`)
      .send({ password: newPassword, isAdmin: true })
      .expect(400);
    await api('picker')
      .patch(`/stores/${ids.store}/staff/${employee.id}/password`)
      .send({ password: newPassword })
      .expect(403);
    await api('manager')
      .patch(`/stores/${ids.otherStore}/staff/${employee.id}/password`)
      .send({ password: newPassword })
      .expect(403);
    const nonStaff = await api('manager')
      .patch(`/stores/${ids.store}/staff/${ids.picker}/password`)
      .send({ password: newPassword })
      .expect(403);
    assert.strictEqual(nonStaff.body.error.code, 'STAFF_PASSWORD_TARGET_DENIED');

    const delegatedManager = (
      await api('admin')
        .post(`/stores/${ids.store}/staff`)
        .set('Idempotency-Key', key())
        .send({
          displayName: 'Quản lý cần bảo vệ',
          email: 'protected.manager@example.test',
          password: oldPassword,
          role: 'MANAGER',
        })
        .expect(201)
    ).body.data;
    const managerDenied = await api('manager')
      .patch(`/stores/${ids.store}/staff/${delegatedManager.id}/password`)
      .send({ password: newPassword })
      .expect(403);
    assert.strictEqual(managerDenied.body.error.code, 'ADMIN_REQUIRED_FOR_MANAGER_PASSWORD');
    await api('admin')
      .patch(`/stores/${ids.store}/staff/${delegatedManager.id}/password`)
      .send({ password: newPassword })
      .expect(200);

    const reset = (
      await api('manager')
        .patch(`/stores/${ids.store}/staff/${employee.id}/password`)
        .send({ password: newPassword })
        .expect(200)
    ).body.data;
    assert.deepStrictEqual(reset, {
      userId: employee.id,
      passwordReset: true,
      sessionsRevoked: 1,
    });
    await request(app.getHttpServer())
      .get('/api/v1/me')
      .auth(employeeToken, { type: 'bearer' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: employee.emailNormalized, password: oldPassword })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: employee.emailNormalized, password: newPassword })
      .expect(200);
    const auditLog = await one<{ details: Record<string, unknown> }>(
      db.pool,
      "SELECT details FROM audit_logs WHERE actor_id=$1 AND action='staff.password.reset' AND entity_id=$2",
      [ids.manager, employee.id],
    );
    assert.deepStrictEqual(auditLog!.details, {
      storeId: ids.store,
      roles: ['PICKER'],
      sessionsRevoked: 1,
    });
    assert.strictEqual(JSON.stringify(auditLog!.details).includes(newPassword), false);
  });
  it('lets a manager create store-scoped categories and complete products without admin', async () => {
    const categoryKey = key();
    const category = (
      await api('manager')
        .post(`/stores/${ids.store}/catalog/categories`)
        .set('Idempotency-Key', categoryKey)
        .send({ name: 'Trái cây tươi' })
        .expect(201)
    ).body.data;
    assert.strictEqual(category.slug, 'trai-cay-tuoi');
    assert.strictEqual(category.ownerStoreId, ids.store);
    const replay = (
      await api('manager')
        .post(`/stores/${ids.store}/catalog/categories`)
        .set('Idempotency-Key', categoryKey)
        .send({ name: 'Trái cây tươi' })
        .expect(201)
    ).body.data;
    assert.strictEqual(replay.id, category.id);
    await api('manager')
      .post(`/stores/${ids.otherStore}/catalog/categories`)
      .set('Idempotency-Key', key())
      .send({ name: 'Không được tạo' })
      .expect(403);
    await api()
      .post(`/stores/${ids.store}/catalog/categories`)
      .set('Idempotency-Key', key())
      .send({ name: 'Khách không được tạo' })
      .expect(403);

    const payload = {
      name: 'Táo xanh 500g',
      description: 'Táo giòn, đóng gói 500 gram.',
      categoryId: category.id,
      sku: { code: 'tao-xanh-500', barcode: '8930000000001', name: 'Táo xanh 500g', unit: 'pack' },
      price: 45000,
      initialStock: 12,
    };
    const productKey = key();
    const product = (
      await api('manager')
        .post(`/stores/${ids.store}/catalog/products`)
        .set('Idempotency-Key', productKey)
        .send(payload)
        .expect(201)
    ).body.data;
    assert.strictEqual(product.code, 'TAO-XANH-500');
    assert.strictEqual(product.categoryId, category.id);
    assert.strictEqual(product.onHand, 12);
    assert.strictEqual(
      (
        await api('manager')
          .post(`/stores/${ids.store}/catalog/products`)
          .set('Idempotency-Key', productKey)
          .send(payload)
          .expect(201)
      ).body.data.skuId,
      product.skuId,
    );
    const stored = await one(
      db.pool,
      `SELECT ss.price,b.on_hand,m.actor_id FROM store_skus ss
       JOIN inventory_balances b USING(store_id,sku_id)
       JOIN stock_movements m USING(store_id,sku_id) WHERE ss.store_id=$1 AND ss.sku_id=$2`,
      [ids.store, product.skuId],
    );
    assert.deepStrictEqual(stored, { price: 45000, on_hand: 12, actor_id: ids.manager });
    const managed = (
      await api('manager').get(`/stores/${ids.store}/catalog/products?limit=100`).expect(200)
    ).body.data.items;
    assert.strictEqual(
      managed.find((item: any) => item.skuId === product.skuId).categoryName,
      'Trái cây tươi',
    );
    assert.strictEqual(managed.find((item: any) => item.skuId === product.skuId).imageUrl, null);

    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
    ]);
    const firstImage = (
      await api('manager')
        .post(`/stores/${ids.store}/catalog/products/${product.productId}/image`)
        .attach('image', png, { filename: 'tao-xanh.png', contentType: 'image/png' })
        .expect(201)
    ).body.data;
    assert.match(firstImage.imageUrl, /^\/api\/v1\/media\/products\/[0-9a-f-]+\.png$/);
    await request(app.getHttpServer())
      .get(firstImage.imageUrl)
      .expect('Content-Type', /image\/png/)
      .expect(200);
    await api('manager')
      .post(`/stores/${ids.otherStore}/catalog/products/${product.productId}/image`)
      .attach('image', png, { filename: 'forbidden.png', contentType: 'image/png' })
      .expect(403);
    await api()
      .post(`/stores/${ids.store}/catalog/products/${product.productId}/image`)
      .attach('image', png, { filename: 'customer.png', contentType: 'image/png' })
      .expect(403);
    await api('manager')
      .post(`/stores/${ids.store}/catalog/products/${product.productId}/image`)
      .attach('image', Buffer.from('not-an-image'), {
        filename: 'spoofed.png',
        contentType: 'image/png',
      })
      .expect(422);
    await api('manager')
      .post(`/stores/${ids.store}/catalog/products/${product.productId}/image`)
      .expect(400);
    await api('manager')
      .post(`/stores/${ids.store}/catalog/products/${product.productId}/image`)
      .attach('image', Buffer.alloc(5 * 1024 * 1024 + 1), {
        filename: 'too-large.png',
        contentType: 'image/png',
      })
      .expect(413);

    const webp = Buffer.from('RIFF\u0004\u0000\u0000\u0000WEBP', 'binary');
    const replacement = (
      await api('manager')
        .post(`/stores/${ids.store}/catalog/products/${product.productId}/image`)
        .attach('image', webp, { filename: 'tao-xanh.webp', contentType: 'image/webp' })
        .expect(201)
    ).body.data;
    await request(app.getHttpServer()).get(firstImage.imageUrl).expect(404);
    await request(app.getHttpServer())
      .get(replacement.imageUrl)
      .expect('Content-Type', /image\/webp/)
      .expect(200);
    assert.strictEqual(
      (await one(db.pool, 'SELECT count(*)::int AS n FROM product_images WHERE product_id=$1', [
        product.productId,
      ]))!.n,
      1,
    );
    assert.strictEqual((await readdir(join(uploadRoot, 'products'))).length, 1);

    const publicCategories = (
      await request(app.getHttpServer()).get(`/api/v1/stores/${ids.store}/categories`).expect(200)
    ).body.data;
    assert.deepStrictEqual(
      publicCategories.map((item: any) => item.id),
      [category.id],
    );
    assert.strictEqual(
      (await request(app.getHttpServer()).get('/api/v1/categories').expect(200)).body.data.some(
        (item: any) => item.id === category.id,
      ),
      false,
    );
    const publicProducts = (
      await request(app.getHttpServer())
        .get(`/api/v1/stores/${ids.store}/products?limit=100`)
        .expect(200)
    ).body.data.items;
    assert.strictEqual(publicProducts.find((item: any) => item.id === product.skuId).price, 45000);
    assert.strictEqual(
      publicProducts.find((item: any) => item.id === product.skuId).imageUrl,
      replacement.imageUrl,
    );

    await api('manager')
      .post(`/stores/${ids.store}/catalog/products`)
      .set('Idempotency-Key', key())
      .send({ ...payload, name: 'Sản phẩm trùng mã' })
      .expect(409);
    assert.strictEqual(
      (await one(
        db.pool,
        "SELECT count(*)::int AS n FROM products WHERE name='Sản phẩm trùng mã'",
      ))!.n,
      0,
    );
    const otherCategory = randomUUID();
    await db.pool.query(
      "INSERT INTO categories(id,name,slug,owner_store_id) VALUES($1,'Riêng cửa hàng khác','rieng-cua-hang-khac',$2)",
      [otherCategory, ids.otherStore],
    );
    await api('manager')
      .post(`/stores/${ids.store}/catalog/products`)
      .set('Idempotency-Key', key())
      .send({
        ...payload,
        name: 'Sai phạm vi',
        categoryId: otherCategory,
        sku: { ...payload.sku, code: 'WRONG-SCOPE', barcode: '8930000000002' },
      })
      .expect(422);
    assert.strictEqual(
      (await one(db.pool, "SELECT count(*)::int AS n FROM products WHERE name='Sai phạm vi'"))!.n,
      0,
    );
  });
  it('separates completed order value from online money collected', async () => {
    const o = await order('customer', true),
      w = await sandbox(o);
    await webhook(w.body, w.timestamp).expect(200);
    const from = new Date(Date.now() - 3600000).toISOString(),
      to = new Date(Date.now() + 3600000).toISOString();
    const report = (
      await api('manager')
        .get(
          `/stores/${ids.store}/reports/summary?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        )
        .expect(200)
    ).body.data;
    assert.strictEqual(report.onlineCollected, o.total);
    assert.strictEqual(report.completedOrders, 0);
    assert.strictEqual(report.completedOrderValue, 0);
  });
  it('proposal needs owner confirmation and applies only once without reserving stock', async () => {
    const proposal = (
      await api()
        .post('/assistant/proposals')
        .send({ storeId: ids.store, items: [{ skuId: ids.sku, quantity: 2 }], budget: 20000 })
        .expect(201)
    ).body.data;
    const cart = (await api().get(`/cart?storeId=${ids.store}`).expect(200)).body.data;
    assert.strictEqual(cart.items.length, 0);
    await api('other').get(`/assistant/proposals/${proposal.id}`).expect(404);
    await api()
      .post(`/assistant/proposals/${proposal.id}/apply`)
      .set('Idempotency-Key', key())
      .send({
        confirmationToken: 'invalid-confirmation-token-at-least-32',
        expectedCartVersion: proposal.expectedCartVersion,
      })
      .expect(403);
    const payload = {
        confirmationToken: proposal.confirmationToken,
        expectedCartVersion: proposal.expectedCartVersion,
      },
      k = key();
    const applied = (
      await api()
        .post(`/assistant/proposals/${proposal.id}/apply`)
        .set('Idempotency-Key', k)
        .send(payload)
        .expect(201)
    ).body.data;
    assert.strictEqual(applied.items[0].quantity, 2);
    await api()
      .post(`/assistant/proposals/${proposal.id}/apply`)
      .set('Idempotency-Key', k)
      .send(payload)
      .expect(201);
    await api()
      .post(`/assistant/proposals/${proposal.id}/apply`)
      .set('Idempotency-Key', key())
      .send(payload)
      .expect(410);
    assert.strictEqual(
      (await one(db.pool, 'SELECT reserved FROM inventory_balances'))!.reserved,
      0,
    );
  });
  it('proposal enforces budget, current prices, ownership and expiry', async () => {
    const input = { storeId: ids.store, items: [{ skuId: ids.sku, quantity: 2 }], budget: 10000 };
    await api().post('/assistant/proposals').send(input).expect(422);
    const proposal = (
      await api()
        .post('/assistant/proposals')
        .send({ ...input, budget: 30000 })
        .expect(201)
    ).body.data;
    await db.pool.query('UPDATE store_skus SET price=11000,version=version+1');
    const payload = {
      confirmationToken: proposal.confirmationToken,
      expectedCartVersion: proposal.expectedCartVersion,
    };
    await api()
      .post(`/assistant/proposals/${proposal.id}/apply`)
      .set('Idempotency-Key', key())
      .send(payload)
      .expect(409);
    await db.pool.query("UPDATE cart_proposals SET expires_at=now()-interval '1 second'");
    await api()
      .post(`/assistant/proposals/${proposal.id}/apply`)
      .set('Idempotency-Key', key())
      .send(payload)
      .expect(410);
    assert.strictEqual((await one(db.pool, 'SELECT count(*)::int AS n FROM cart_items'))!.n, 0);
  });
  it('configured AI adapter validates upstream response and creates only a proposal', async () => {
    const env = app.get<Env>(ENV);
    const previousUrl = env.AI_SERVICE_URL,
      previousToken = env.AI_SERVICE_TOKEN;
    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        const input = JSON.parse(body);
        assert.strictEqual(req.url, '/chat');
        assert.strictEqual(req.headers.authorization, `Bearer ${env.AI_SERVICE_TOKEN}`);
        assert.strictEqual(input.contractVersion, 1);
        assert.strictEqual(input.context.storeId, ids.store);
        assert.strictEqual(input.context.userId, undefined);
        res.setHeader('Content-Type', 'application/json');
        res.end(
          JSON.stringify({
            answer: 'Đề xuất từ danh mục đã kiểm tra.',
            items: [{ skuId: input.message === 'invalid' ? randomUUID() : ids.sku, quantity: 1 }],
            documentIds: [],
            modelVersion: 'test-adapter',
          }),
        );
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Missing test server address');
      env.AI_SERVICE_URL = `http://127.0.0.1:${address.port}`;
      env.AI_SERVICE_TOKEN = 'test-ai-service-token-at-least-32-characters';
      const conversation = (
        await api().post('/assistant/conversations').send({ storeId: ids.store }).expect(201)
      ).body.data;
      const reply = (
        await api()
          .post(`/assistant/conversations/${conversation.id}/messages`)
          .send({ message: 'Gợi ý một món', budget: 10000 })
          .expect(201)
      ).body.data;
      assert.strictEqual(reply.proposal.addedTotal, 10000);
      assert.strictEqual((await one(db.pool, 'SELECT count(*)::int AS n FROM cart_items'))!.n, 0);
      await api()
        .post(`/assistant/conversations/${conversation.id}/messages`)
        .send({ message: 'invalid' })
        .expect(503);
      assert.strictEqual(
        (await one(db.pool, 'SELECT count(*)::int AS n FROM cart_proposals'))!.n,
        1,
      );
    } finally {
      env.AI_SERVICE_URL = previousUrl;
      env.AI_SERVICE_TOKEN = previousToken;
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('registers email users, hashes passwords and supports normalized email login', async () => {
    const registration = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        accountType: 'USER',
        name: 'Khách đăng ký',
        email: '  Customer@Example.Test  ',
        password: registrationPassword,
      })
      .expect(201);
    assert.strictEqual(registration.body.data.accountType, 'USER');
    assert.strictEqual(registration.body.data.passwordHash, undefined);
    const stored = (await one(
      db.pool,
      "SELECT * FROM users WHERE email_normalized='customer@example.test'",
    ))!;
    assert.match(stored.password_hash, /^scrypt\$1\$/);
    assert.notStrictEqual(stored.password_hash, registrationPassword);
    assert.strictEqual(stored.phone_normalized, null);
    const login = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'CUSTOMER@EXAMPLE.TEST', password: registrationPassword })
      .expect(200);
    const me = await request(app.getHttpServer())
      .get('/api/v1/me')
      .auth(login.body.data.accessToken, { type: 'bearer' })
      .expect(200);
    assert.strictEqual(me.body.data.emailNormalized, 'customer@example.test');
    assert.strictEqual(me.body.data.isAdmin, false);
    assert.strictEqual(me.body.data.canRefund, false);
    assert.deepStrictEqual(me.body.data.memberships, []);
    assert.strictEqual(me.body.data.passwordHash, undefined);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'customer@example.test', password: 'wrong-password' })
      .expect(401);
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'absent@example.test', password: 'wrong-password' })
      .expect(401);
  });
  it('normalizes Vietnamese phone registration and rejects duplicate identities', async () => {
    const input = {
      accountType: 'USER',
      name: 'Khách số điện thoại',
      phone: '0901 234 567',
      password: registrationPassword,
    };
    await request(app.getHttpServer()).post('/api/v1/auth/register').send(input).expect(201);
    assert.strictEqual(
      (await one(
        db.pool,
        "SELECT phone_normalized FROM users WHERE phone_normalized='+84901234567'",
      ))!.phone_normalized,
      '+84901234567',
    );
    await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: '0901234567', password: registrationPassword })
      .expect(200);
    const duplicate = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ ...input, phone: '+84901234567' })
      .expect(409);
    assert.strictEqual(duplicate.body.error.code, 'ACCOUNT_EXISTS');
  });
  it('atomically registers seller, private coordinates and only own-store manager scope', async () => {
    const result = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send(sellerRegistration())
      .expect(201);
    const token = result.body.data.accessToken,
      storeId = result.body.data.storeId;
    const own = (
      await request(app.getHttpServer())
        .get('/api/v1/seller/store')
        .auth(token, { type: 'bearer' })
        .expect(200)
    ).body.data;
    assert.strictEqual(own.id, storeId);
    assert.strictEqual(own.latitude, 10.7769);
    assert.strictEqual(own.longitude, 106.7009);
    assert.strictEqual(own.locationAccuracyMeters, 8);
    assert.strictEqual(own.contactEmail, 'seller@example.test');
    const me = (
      await request(app.getHttpServer()).get('/api/v1/me').auth(token, { type: 'bearer' })
    ).body.data;
    assert.strictEqual(me.accountType, 'SELLER');
    assert.deepStrictEqual(me.memberships, [{ storeId, role: 'MANAGER' }]);
    const publicStores = (
      await request(app.getHttpServer()).get('/api/v1/stores?limit=100').expect(200)
    ).body.data.items;
    const listing = publicStores.find((store: any) => store.id === storeId);
    assert.strictEqual(listing.address, '25 Nguyễn Huệ, Phường Bến Nghé, Thành phố Hồ Chí Minh');
    assert.strictEqual(listing.latitude, 10.7769);
    assert.strictEqual(listing.longitude, 106.7009);
    assert.strictEqual(listing.contactEmail, undefined);
    assert.strictEqual(listing.ownerUserId, undefined);
    await request(app.getHttpServer())
      .get(`/api/v1/stores/${storeId}/inventory`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    await request(app.getHttpServer())
      .get(`/api/v1/stores/${ids.store}/inventory`)
      .auth(token, { type: 'bearer' })
      .expect(403);
    await request(app.getHttpServer())
      .post('/api/v1/admin/stores')
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', key())
      .send({ code: 'ESCALATE', name: 'Unauthorized', address: 'Fake' })
      .expect(403);
  });
  it('requires seller address, confirmed pin and valid ranges before creating account', async () => {
    const input = sellerRegistration();
    for (const invalid of [
      { ...input, location: undefined },
      { ...input, location: { ...input.location, latitude: 91 } },
      { ...input, location: { ...input.location, confirmed: false } },
      { ...input, address: { ...input.address, street: '' } },
    ]) {
      await request(app.getHttpServer()).post('/api/v1/auth/register').send(invalid).expect(400);
    }
    assert.strictEqual(
      (await one(
        db.pool,
        "SELECT count(*)::int AS n FROM users WHERE email_normalized='seller@example.test'",
      ))!.n,
      0,
    );
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ accountType: 'USER', name: 'No identity', password: registrationPassword })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        accountType: 'USER',
        name: 'Admin injection',
        email: 'elevate@example.test',
        password: registrationPassword,
        isAdmin: true,
      })
      .expect(400);
  });
  it('allows only owner to update location, verifies version and deduplicates update', async () => {
    const session = (
      await request(app.getHttpServer())
        .post('/api/v1/auth/register')
        .send(sellerRegistration())
        .expect(201)
    ).body.data;
    await api('other').get('/seller/store').expect(404);
    const input = {
      expectedVersion: 1,
      address: { street: '12 Lê Lợi', ward: 'Phường Bến Thành', city: 'Thành phố Hồ Chí Minh' },
      location: { latitude: 10.7721, longitude: 106.6993, source: 'MAP', confirmed: true },
    };
    await request(app.getHttpServer())
      .patch('/api/v1/seller/store/location')
      .auth(tokens.other, { type: 'bearer' })
      .set('Idempotency-Key', key())
      .send(input)
      .expect(404);
    const k = key();
    const updated = await request(app.getHttpServer())
      .patch('/api/v1/seller/store/location')
      .auth(session.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', k)
      .send(input)
      .expect(200);
    assert.strictEqual(updated.body.data.locationVersion, 2);
    assert.strictEqual(updated.body.data.locationAccuracyMeters, null);
    await request(app.getHttpServer())
      .patch('/api/v1/seller/store/location')
      .auth(session.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', k)
      .send(input)
      .expect(200);
    await request(app.getHttpServer())
      .patch('/api/v1/seller/store/location')
      .auth(session.accessToken, { type: 'bearer' })
      .set('Idempotency-Key', key())
      .send(input)
      .expect(409);
  });
  it('handles concurrent seller duplicate registration without orphan stores', async () => {
    const results = await Promise.all([
      request(app.getHttpServer()).post('/api/v1/auth/register').send(sellerRegistration()),
      request(app.getHttpServer()).post('/api/v1/auth/register').send(sellerRegistration()),
    ]);
    assert.deepStrictEqual(results.map((result) => result.status).sort(), [201, 409]);
    assert.strictEqual(
      (await one(db.pool, 'SELECT count(*)::int AS n FROM stores WHERE owner_user_id IS NOT NULL'))!
        .n,
      1,
    );
  });
  it('persists password login rate limit even when credentials are invalid', async () => {
    for (let i = 0; i < 12; i++)
      await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ identifier: 'rate@example.test', password: 'invalid-password' })
        .expect(401);
    const response = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ identifier: 'rate@example.test', password: 'invalid-password' })
      .expect(429);
    assert.strictEqual(response.body.error.code, 'RATE_LIMITED');
  });
});
