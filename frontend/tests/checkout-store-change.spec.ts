import { expect, test } from '@playwright/test';
import { choosePickupStore } from './store-picker';

test('a late quote cannot place an order at the previous store, and slow order chat opens', async ({
  page,
  request,
  baseURL,
}) => {
  test.skip(process.env.E2E_ALLOW_MUTATIONS !== '1', 'Requires a disposable local database.');
  expect(['localhost', '127.0.0.1']).toContain(new URL(baseURL!).hostname);
  const email = `checkout-${crypto.randomUUID()}@example.test`;
  const password = 'Checkout-store-test-2026!';
  const registration = await request.post('/api/v1/auth/register', {
    data: { accountType: 'USER', name: 'Khách thử đổi cửa hàng', email, password },
  });
  expect(registration.status()).toBe(201);
  const headers = { Authorization: `Bearer ${(await registration.json()).data.accessToken}` };
  const list = await request.get('/api/v1/stores?q=ShopGo%20Demo');
  const stores: { id: string; name: string }[] = (await list.json()).data.items;
  const a = stores.find((s) => s.name === 'ShopGo Demo 1')!;
  const b = stores.find((s) => s.name === 'ShopGo Demo 2')!;
  for (const store of [a, b]) {
    const products = await request.get(`/api/v1/stores/${store.id}/products?inStock=true&limit=1`);
    const sku = (await products.json()).data.items[0];
    const cart = (await (await request.get(`/api/v1/cart?storeId=${store.id}`, { headers })).json())
      .data;
    const changed = await request.put(`/api/v1/cart/items/${sku.id}`, {
      headers,
      data: { storeId: store.id, expectedVersion: cart.version, quantity: 1 },
    });
    expect(changed.ok()).toBeTruthy();
  }
  await page.goto('/login');
  await page.getByLabel('Số điện thoại hoặc email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập tài khoản' }).click();
  await expect(page).toHaveURL(/\/$/);
  await choosePickupStore(page, a.name);
  await page.getByRole('link', { name: /Giỏ hàng/ }).click();
  await page.getByRole('link', { name: 'Tiếp tục đặt hàng' }).click();
  await page.locator('input[name=slot]').first().check();
  const hold = Promise.withResolvers<void>();
  const ready = Promise.withResolvers<void>();
  await page.route(
    '**/api/v1/checkout/quotes',
    async (route) => {
      const response = await route.fetch();
      ready.resolve();
      await hold.promise;
      await route.fulfill({ response });
    },
    { times: 1 },
  );
  await page.getByRole('button', { name: 'Xem tổng thanh toán' }).click();
  await ready.promise;
  try {
    await choosePickupStore(page, b.name);
    await expect(page.locator('.retail-store-choice strong')).toHaveText(b.name);
    await expect(page.locator('input[name=slot]').first()).toBeEnabled();
  } finally {
    hold.resolve();
  }
  const submit = page.getByRole('button', { name: /Đặt đơn & tiếp tục/ });
  await expect(submit).toHaveCount(0);
  await page.locator('input[name=slot]').first().check();
  await page.getByRole('button', { name: 'Xem tổng thanh toán' }).click();
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/v1/orders') && r.request().method() === 'POST',
  );
  await submit.click();
  const response = await created;
  expect(response.status()).toBe(201);
  const order = (await response.json()).data;
  expect(order.storeId).toBe(b.id);
  await expect(page).toHaveURL(new RegExp(`/don-hang/${order.id}$`));
  const history = `**/api/v1/chat/orders/${order.id}/messages?**`;
  await page.route(history, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 4500));
    await route.continue();
  });
  await page.getByRole('link', { name: 'Chat với cửa hàng' }).click();
  await expect(page.getByRole('textbox', { name: 'Nội dung tin nhắn' })).toBeVisible({
    timeout: 12000,
  });
});
