import { expect, test, type Page } from '@playwright/test';

const stores = [
  {
    id: '91000000-0000-4000-a000-000000000001',
    code: 'STORE-A',
    name: 'Store A',
    address: '12 Nguyễn Huệ, Quận 1, TP.HCM',
    latitude: 10.7769,
    longitude: 106.7009,
  },
  {
    id: '91000000-0000-4000-a000-000000000002',
    code: 'STORE-B',
    name: 'Store B',
    address: '88 Trần Hưng Đạo, Quận 5, TP.HCM',
    latitude: 10.7546,
    longitude: 106.6637,
  },
] as const;

const sharedSkuId = '92000000-0000-4000-a000-000000000001';
const productName = 'Táo hữu cơ túi 500g';
const offers = stores.map((store, index) => ({
  id: sharedSkuId,
  code: 'TAO-HUU-CO-500',
  name: productName,
  barcode: '8930000000101',
  unit: 'pack',
  description: `Táo giòn đang bán tại ${store.name}.`,
  categoryId: null,
  price: index === 0 ? 45000 : 47000,
  available: index === 0 ? 8 : 5,
  version: 1,
  imageUrl: null,
  store,
}));

async function mockCatalog(page: Page) {
  let globalRequests = 0;
  let storeBRequests = 0;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();
    const fulfill = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });

    if (path === '/stores' && method === 'GET') {
      return fulfill({ items: stores, nextCursor: null });
    }
    if (path === '/products' && method === 'GET') {
      globalRequests += 1;
      return fulfill({ items: offers, nextCursor: null });
    }
    if (path === '/categories' && method === 'GET') return fulfill([]);
    if (path === '/auth/login' && method === 'POST') {
      return fulfill({ accessToken: 'multistore-customer-token' });
    }
    if (path === '/me' && method === 'GET') {
      return fulfill({
        id: '93000000-0000-4000-a000-000000000001',
        displayName: 'Khách hàng đa cửa hàng',
        phoneNormalized: '+84901112223',
        emailNormalized: 'multistore@example.test',
        accountType: 'USER',
        isAdmin: false,
        canRefund: false,
        memberships: [],
        ownedStores: [],
      });
    }
    for (const [index, store] of stores.entries()) {
      if (path === `/stores/${store.id}/categories` && method === 'GET') return fulfill([]);
      if (path === `/stores/${store.id}/products` && method === 'GET') {
        if (store.id === stores[1].id) storeBRequests += 1;
        return fulfill({ items: [{ ...offers[index], store }], nextCursor: null });
      }
    }
    if (path === '/cart' && method === 'GET') {
      return fulfill({
        id: '94000000-0000-4000-a000-000000000001',
        storeId: url.searchParams.get('storeId'),
        version: 1,
        items: [],
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_MOCKED', message: `${method} ${path}` } },
    });
  });

  return {
    globalRequests: () => globalRequests,
    storeBRequests: () => storeBRequests,
  };
}

test('customer browses every store and enters the store that owns a selected product', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const requests = await mockCatalog(page);

  await page.goto('/login');
  await page
    .getByLabel('Số điện thoại hoặc email', { exact: true })
    .fill('multistore@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Multistore-customer-passphrase!');
  await page.getByRole('button', { name: 'Đăng nhập tài khoản', exact: true }).click();

  await expect(page).toHaveURL(/\/$/);
  const storeSelect = page.getByLabel('Chọn cửa hàng', { exact: true });
  await expect(storeSelect).toHaveValue('');
  await expect(storeSelect.getByRole('option', { name: 'Tất cả cửa hàng' })).toHaveCount(1);

  const allStoreCards = page.locator('.product-card');
  await expect(allStoreCards).toHaveCount(2);
  await expect(allStoreCards.filter({ hasText: stores[0].name })).toHaveCount(1);
  const storeBCard = allStoreCards.filter({ hasText: stores[1].name });
  await expect(storeBCard).toHaveCount(1);
  await expect(page.getByRole('button', { name: `Thêm ${productName}`, exact: true })).toHaveCount(
    0,
  );
  expect(requests.globalRequests()).toBeGreaterThan(0);

  await storeBCard
    .getByRole('button', { name: `Xem ${productName}`, exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('button', { name: `Xem cửa hàng ${stores[1].name}` }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Thêm vào giỏ', exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: `Xem cửa hàng ${stores[1].name}` }).click();

  await expect(storeSelect).toHaveValue(stores[1].id);
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card')).toContainText(stores[1].name);
  await expect(
    page.getByRole('button', { name: `Thêm ${productName}`, exact: true }),
  ).toBeVisible();
  expect(requests.storeBRequests()).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Xem tất cả cửa hàng', exact: true }).click();
  await expect(storeSelect).toHaveValue('');
  await expect(page.locator('.product-card')).toHaveCount(2);
  expect(requests.globalRequests()).toBeGreaterThan(1);

  const viewport = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(viewport.documentWidth).toBeLessThanOrEqual(viewport.viewportWidth + 1);
});
