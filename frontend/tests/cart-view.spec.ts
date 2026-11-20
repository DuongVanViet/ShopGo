import { expect, test } from '@playwright/test';
import { choosePickupStore } from './store-picker';

test('cart uses the catalog product image and keeps the checkout layout responsive', async ({
  page,
}) => {
  const store = {
    id: '71000000-0000-4000-a000-000000000001',
    code: 'CART-STORE',
    name: 'ShopGo Nguyễn Huệ',
    address: '25 Nguyễn Huệ, Phường Bến Nghé, TP.HCM',
    latitude: 10.7769,
    longitude: 106.7009,
  };
  const product = {
    skuId: '72000000-0000-4000-a000-000000000001',
    name: 'Táo Gala nhập khẩu',
    code: 'TAO-GALA-1KG',
    unit: 'pack',
    price: 89000,
    quantity: 2,
    available: 8,
    imageUrl: '/api/v1/media/products/73000000-0000-4000-a000-000000000001.png',
  };
  const productImage = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();
    const fulfill = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });

    if (path === '/stores' && method === 'GET')
      return fulfill({ items: [store], nextCursor: null });
    if (path === '/products' && method === 'GET') return fulfill({ items: [], nextCursor: null });
    if (path === '/categories' && method === 'GET') return fulfill([]);
    if (path === `/stores/${store.id}/products` && method === 'GET')
      return fulfill({ items: [], nextCursor: null });
    if (path === `/stores/${store.id}/categories` && method === 'GET') return fulfill([]);
    if (path === '/auth/login' && method === 'POST')
      return fulfill({ accessToken: 'cart-customer-token' });
    if (path === '/me' && method === 'GET')
      return fulfill({
        id: '74000000-0000-4000-a000-000000000001',
        displayName: 'Khách kiểm tra giỏ',
        phoneNormalized: '+84901234567',
        emailNormalized: 'cart@example.test',
        accountType: 'USER',
        isAdmin: false,
        canRefund: false,
        memberships: [],
        ownedStores: [],
      });
    if (path === '/cart' && method === 'GET')
      return fulfill({
        id: '75000000-0000-4000-a000-000000000001',
        storeId: store.id,
        version: 1,
        items: [product],
      });
    if (path === product.imageUrl.replace('/api/v1', '') && method === 'GET')
      return route.fulfill({ status: 200, contentType: 'image/png', body: productImage });
    return route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_MOCKED', message: `${method} ${path}` } },
    });
  });

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await page.getByLabel('Số điện thoại hoặc email', { exact: true }).fill('cart@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Cart-customer-passphrase!');
  await page.getByRole('button', { name: 'Đăng nhập tài khoản', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await choosePickupStore(page, store.name);
  await page.locator('a.cart-button').click();
  await expect(page).toHaveURL(/\/gio-hang$/);

  const cartImage = page.getByRole('img', { name: `Ảnh ${product.name}`, exact: true });
  await expect(cartImage).toBeVisible();
  await expect(cartImage).toHaveAttribute('src', product.imageUrl);
  await expect(page.locator('.retail-cart-art .product-art')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Giỏ hàng của bạn', exact: true })).toBeVisible();
  await expect(page.getByText('178.000 ₫', { exact: true })).toHaveCount(3);
  await expect(
    page.locator('#main-content').getByText(store.address, { exact: true }),
  ).toBeVisible();
  const columns = await page
    .locator('.retail-cart-grid')
    .evaluate((element) =>
      getComputedStyle(element).gridTemplateColumns.split(' ').filter(Boolean),
    );
  expect(columns.length).toBe(2);
  const desktop = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
    scrollX,
  }));
  expect(desktop.document).toBeLessThanOrEqual(desktop.viewport + 1);
  expect(desktop.scrollX).toBe(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(cartImage).toBeVisible();
  const mobile = await page.evaluate(() => ({
    viewport: innerWidth,
    document: document.documentElement.scrollWidth,
  }));
  expect(mobile.document).toBeLessThanOrEqual(mobile.viewport + 1);

  await page.route(`**/api/v1/cart/items/${product.skuId}`, (route) =>
    route.fulfill({
      status: 409,
      json: { error: { code: 'VERSION_CONFLICT', message: 'Giỏ hàng đã thay đổi.' } },
    }),
  );
  await page.getByRole('button', { name: `Tăng ${product.name}` }).click();
  const alert = page.getByRole('alert').filter({ hasText: 'Giỏ hàng đã thay đổi.' });
  await expect(alert).toBeVisible();
  await alert.getByRole('button', { name: 'Thử lại' }).click();
  await expect(alert).toHaveCount(0);
  await expect(cartImage).toBeVisible();
});
