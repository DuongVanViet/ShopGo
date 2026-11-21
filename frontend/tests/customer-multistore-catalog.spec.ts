import { expect, test, type Page } from '@playwright/test';
import { pickupStoreButton } from './store-picker';

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
const relatedProducts = stores.map((store, index) => ({
  id: `92000000-0000-4000-a000-00000000000${index + 2}`,
  code: `SUA-CHUA-${index + 1}`,
  name: `Sữa chua nhà làm ${store.name}`,
  barcode: null,
  unit: 'box',
  description: `Sản phẩm khác của ${store.name}.`,
  categoryId: null,
  price: 32000 + index * 1000,
  available: 7,
  version: 1,
  imageUrl: null,
  store,
}));

async function mockCatalog(page: Page) {
  let globalRequests = 0;
  let storeBRequests = 0;
  let lastGlobalQuery = '';
  let lastStoreBQuery = '';
  let storeBLookups = 0;
  let addedQuantity = 0;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();
    const fulfill = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });

    if (path === '/stores' && method === 'GET') {
      return fulfill({ items: [stores[0]], nextCursor: null });
    }
    if (path === '/products' && method === 'GET') {
      globalRequests += 1;
      lastGlobalQuery = url.searchParams.get('q') ?? '';
      const query = lastGlobalQuery.toLocaleLowerCase('vi');
      return fulfill({
        items: offers.filter((item) => item.name.toLocaleLowerCase('vi').includes(query)),
        nextCursor: null,
      });
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
      if (path === `/stores/${store.id}` && method === 'GET') {
        if (store.id === stores[1].id) storeBLookups += 1;
        return fulfill(store);
      }
      if (path === `/stores/${store.id}/categories` && method === 'GET') return fulfill([]);
      if (path === `/stores/${store.id}/reviews` && method === 'GET') {
        return fulfill({ items: [], nextCursor: null, summary: { average: null, count: 0 } });
      }
      if (path === `/stores/${store.id}/products` && method === 'GET') {
        if (url.searchParams.get('discountedOnly') === 'true')
          return fulfill({ items: [], nextCursor: null });
        if (store.id === stores[1].id) {
          storeBRequests += 1;
          lastStoreBQuery = url.searchParams.get('q') ?? '';
        }
        const query = (url.searchParams.get('q') ?? '').toLocaleLowerCase('vi');
        const items = [{ ...offers[index], store }, relatedProducts[index]].filter((item) =>
          item.name.toLocaleLowerCase('vi').includes(query),
        );
        return fulfill({ items, nextCursor: null });
      }
    }
    if (path === `/cart/items/${sharedSkuId}` && method === 'PUT') {
      const body = request.postDataJSON();
      expect(body.storeId).toBe(stores[1].id);
      addedQuantity = body.quantity;
      return fulfill({});
    }
    if (path === '/cart' && method === 'GET') {
      const storeId = url.searchParams.get('storeId');
      return fulfill({
        id: '94000000-0000-4000-a000-000000000001',
        storeId,
        version: 1,
        items:
          addedQuantity && storeId === stores[1].id
            ? [{ ...offers[1], skuId: sharedSkuId, quantity: addedQuantity }]
            : [],
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
    lastGlobalQuery: () => lastGlobalQuery,
    lastStoreBQuery: () => lastStoreBQuery,
    storeBLookups: () => storeBLookups,
  };
}

test('shopping cards open store selection, focus their sections and link to customer pages', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockCatalog(page);
  await page.goto('/');
  const offers = page.getByRole('button', { name: 'Ưu đãi từ cửa hàng', exact: true });
  await offers.click({ position: { x: 12, y: 12 } });
  await expect(page).toHaveURL(/\/login$/);
  await page
    .getByLabel('Số điện thoại hoặc email', { exact: true })
    .fill('multistore@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Multistore-customer-passphrase!');
  await page.getByRole('button', { name: 'Đăng nhập tài khoản', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await offers.click({ position: { x: 12, y: 12 } });
  const picker = page.getByRole('dialog', { name: 'Chọn cửa hàng', exact: true });
  await expect(picker).toBeVisible();
  await picker.getByRole('button', { name: stores[0].name, exact: false }).click();
  await expect(picker).not.toBeVisible();
  await expect(page.getByRole('region', { name: 'Ưu đãi của cửa hàng' })).toContainText(
    'Cửa hàng chưa có sản phẩm đang giảm giá.',
  );
  await expect(page.locator('#uu-dai')).toBeFocused();
  await page
    .getByRole('button', { name: 'Mua sắm thông minh', exact: true })
    .click({ position: { x: 12, y: 12 } });
  await expect(page.locator('#san-pham')).toBeFocused();
  await page.getByRole('button', { name: 'Hàng hóa theo cửa hàng', exact: true }).press('Enter');
  await expect(page.locator('#san-pham')).toBeFocused();
  await expect(page.getByRole('link', { name: /Chủ động thời gian nhận/ })).toHaveAttribute(
    'href',
    '/thanh-toan',
  );
  await page.getByRole('link', { name: /Nhận hàng an toàn/ }).click();
  await expect(page).toHaveURL(/\/don-hang$/);
  await page
    .getByRole('navigation', { name: 'Điều hướng chính' })
    .getByRole('link', { name: 'Cửa hàng', exact: true })
    .click();
  await page
    .getByRole('link', { name: /Nhận hàng tiện lợi/ })
    .click({ position: { x: 12, y: 12 } });
  await expect(page).toHaveURL(/\/huong-dan$/);
});

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
  const storeSelect = pickupStoreButton(page);
  await expect(storeSelect).toHaveAccessibleName('Chọn cửa hàng');

  const allStoreCards = page.locator('.product-card');
  await expect(allStoreCards).toHaveCount(2);
  await expect(allStoreCards.filter({ hasText: stores[0].name })).toHaveCount(1);
  const storeBCard = allStoreCards.filter({ hasText: stores[1].name });
  await expect(storeBCard).toHaveCount(1);
  await expect(page.getByRole('button', { name: `Thêm ${productName}`, exact: true })).toHaveCount(
    0,
  );
  expect(requests.globalRequests()).toBeGreaterThan(0);

  const scope = page.getByRole('group', { name: 'Phạm vi tìm kiếm', exact: true });
  await expect(scope.getByRole('button', { name: /Toàn ShopGo/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(scope.getByRole('button', { name: /Trong cửa hàng/ })).toBeDisabled();
  const mainSearch = page.locator('.shopgo-retail-main-search');
  await mainSearch.getByLabel('Tìm sản phẩm', { exact: true }).fill('Táo hữu cơ');
  await mainSearch.locator('button[type="submit"]').click();
  await expect(page.getByText('Kết quả cho “Táo hữu cơ”', { exact: true })).toBeVisible();
  expect(requests.lastGlobalQuery()).toBe('Táo hữu cơ');

  await storeBCard
    .getByRole('button', { name: `Xem ${productName}`, exact: true })
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('button', {
      name: `Vào ${stores[1].name} và xem sản phẩm khác`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Thêm vào giỏ', exact: true })).toHaveCount(0);
  await dialog
    .getByRole('button', {
      name: `Vào ${stores[1].name} và xem sản phẩm khác`,
      exact: true,
    })
    .click();

  await expect(storeSelect).toContainText(stores[1].name);
  expect(requests.storeBLookups()).toBe(1);
  await expect(page.locator('.product-card')).toHaveCount(2);
  await expect(page.locator('.product-card').filter({ hasText: stores[1].name })).toHaveCount(2);
  await expect(
    page.getByRole('button', { name: relatedProducts[1].name, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: `Thêm ${productName}`, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: `Thêm ${productName}`, exact: true }).click();
  await expect(page.getByTestId('cart-count')).toHaveText('1');
  expect(requests.storeBRequests()).toBeGreaterThan(0);
  await expect(scope.getByRole('button', { name: /Trong cửa hàng/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  await mainSearch.getByLabel('Tìm sản phẩm', { exact: true }).fill('Sữa chua');
  await mainSearch.locator('button[type="submit"]').click();
  await expect(page.locator('.product-card')).toHaveCount(1);
  await expect(page.locator('.product-card')).toContainText(relatedProducts[1].name);
  expect(requests.lastStoreBQuery()).toBe('Sữa chua');

  await scope.getByRole('button', { name: /Toàn ShopGo/ }).click();
  await mainSearch.getByLabel('Tìm sản phẩm', { exact: true }).fill('Táo hữu cơ');
  await mainSearch.locator('button[type="submit"]').click();
  await expect(storeSelect).toContainText(stores[1].name);
  await expect(page.locator('.product-card')).toHaveCount(2);
  expect(requests.lastGlobalQuery()).toBe('Táo hữu cơ');

  await storeSelect.click();
  const picker = page.getByRole('dialog', { name: 'Đổi cửa hàng' });
  await picker.getByRole('button', { name: 'Xem tất cả cửa hàng', exact: true }).click();
  await expect(storeSelect).toHaveAccessibleName('Chọn cửa hàng');
  await expect(page.locator('.product-card')).toHaveCount(2);
  expect(requests.globalRequests()).toBeGreaterThan(1);
  await storeSelect.click();
  await page.getByRole('button', { name: `Chọn lại ${stores[1].name}`, exact: true }).click();
  await expect(storeSelect).toContainText(stores[1].name);
  await page.reload();
  await expect.poll(requests.storeBLookups).toBeGreaterThan(1);
  await expect(page.locator('.product-card').filter({ hasText: stores[1].name })).toHaveCount(2);

  const viewport = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }));
  expect(viewport.documentWidth).toBeLessThanOrEqual(viewport.viewportWidth + 1);
});
