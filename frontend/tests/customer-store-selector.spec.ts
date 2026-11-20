import { expect, test, type Page } from '@playwright/test';
import { choosePickupStore, pickupStoreButton } from './store-picker';

const store = {
  id: '81000000-0000-4000-a000-000000000001',
  code: 'CUSTOMER-STORE',
  name: 'Rau xanh Green Mark',
  address: '210 Nguyễn Trãi, Hà Đông, Hà Nội',
  latitude: 20.9591,
  longitude: 105.7654,
};

interface TestUser {
  id: string;
  displayName: string;
  phoneNormalized: string | null;
  emailNormalized: string | null;
  accountType: 'USER' | 'SELLER' | 'STAFF';
  isAdmin: boolean;
  canRefund: boolean;
  memberships: { storeId: string; role: 'PICKER' | 'COUNTER' | 'MANAGER' }[];
  ownedStores: (typeof store)[];
}

async function mockSession(
  page: Page,
  user?: TestUser,
  listStores = (_params: URLSearchParams): { items: unknown[]; nextCursor: string | null } => ({
    items: [store],
    nextCursor: null,
  }),
) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();
    const fulfill = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });

    if (path === '/stores' && method === 'GET') return fulfill(listStores(url.searchParams));
    if (path === `/stores/${store.id}` && method === 'GET') return fulfill(store);
    if (path === '/products' && method === 'GET') return fulfill({ items: [], nextCursor: null });
    if (path === '/auth/login' && method === 'POST')
      return fulfill({ accessToken: `${user?.id ?? 'anonymous'}-token` });
    if (path === '/me' && method === 'GET' && user) return fulfill(user);
    if (path === `/stores/${store.id}/categories` && method === 'GET') return fulfill([]);
    if (path.startsWith(`/stores/${store.id}/products`) && method === 'GET')
      return fulfill({ items: [], nextCursor: null });
    if (path === '/categories' && method === 'GET') return fulfill([]);
    if (path === `/stores/${store.id}/catalog/categories` && method === 'GET') return fulfill([]);
    if (path === `/stores/${store.id}/catalog/products` && method === 'GET')
      return fulfill({ items: [], nextCursor: null });
    if (path === `/stores/${store.id}/inventory` && method === 'GET')
      return fulfill({ items: [], nextCursor: null });
    if (path === `/stores/${store.id}/orders` && method === 'GET')
      return fulfill({ items: [], nextCursor: null });
    if (path === `/stores/${store.id}/reports/summary` && method === 'GET')
      return fulfill({
        completedOrders: 0,
        completedOrderValue: 0,
        onlineCollected: 0,
        cashCollected: 0,
        refunded: 0,
      });
    if (path === `/stores/${store.id}/slots` && method === 'GET') return fulfill([]);
    if (path === `/stores/${store.id}/staff` && method === 'GET') return fulfill([]);
    if (path === '/seller/store' && method === 'GET')
      return fulfill({
        ...store,
        ownerUserId: user?.id,
        locationSource: 'MAP',
        locationConfirmedAt: '2026-11-14T08:00:00.000Z',
        locationVersion: 1,
      });
    if (path === '/cart' && method === 'GET')
      return fulfill({
        id: '82000000-0000-4000-a000-000000000001',
        storeId: store.id,
        version: 1,
        items: [],
      });
    return route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_MOCKED', message: `${method} ${path}` } },
    });
  });
}

async function login(page: Page, user: TestUser) {
  await page.goto('/login');
  await page.getByLabel('Số điện thoại hoặc email', { exact: true }).fill(user.emailNormalized!);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Header-visibility-passphrase!');
  await page.getByRole('button', { name: 'Đăng nhập tài khoản', exact: true }).click();
}

async function expectStorePickerHidden(page: Page) {
  await expect(page.locator('.store-select')).toHaveCount(0);
  await expect(page.getByText('Nhận hàng tại', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Chọn cửa hàng', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Xem vị trí/ })).toHaveCount(0);
}

const customer: TestUser = {
  id: '83000000-0000-4000-a000-000000000001',
  displayName: 'Khách hàng ShopGo',
  phoneNormalized: '+84901111111',
  emailNormalized: 'customer@example.test',
  accountType: 'USER',
  isAdmin: false,
  canRefund: false,
  memberships: [],
  ownedStores: [],
};

test('store picker is hidden before login and visible for a logged-in customer', async ({
  page,
}) => {
  await mockSession(page, customer);
  await page.goto('/');
  await expectStorePickerHidden(page);

  await login(page, customer);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.store-select')).toBeVisible();
  await expect(pickupStoreButton(page)).toHaveAccessibleName('Chọn cửa hàng');
  await expect(page.getByRole('button', { name: `Xem vị trí ${store.name}` })).toHaveCount(0);
  await choosePickupStore(page, store.name);
  await expect(page.getByRole('button', { name: `Xem vị trí ${store.name}` })).toBeVisible();
});

test('customer pages through stores, searches by address and can opt into nearby results', async ({
  page,
  context,
}) => {
  const directory = Array.from({ length: 11 }, (_, index) => ({
    ...store,
    id: String(index + 1),
    name: `Điểm nhận số ${index + 1}`,
  }));
  let requests = 0;
  let geoRequests = 0;
  await mockSession(page, customer, (params) => {
    requests++;
    expect(params.get('limit')).toBe('10');
    if (params.has('lat')) {
      geoRequests++;
      expect(params.get('lat')).toBe('20.959');
      expect(params.get('lng')).toBe('105.765');
      return { items: [{ ...store, distanceMeters: 42 }], nextCursor: null };
    }
    if (params.get('q') === 'Hà Đông') return { items: [store], nextCursor: null };
    if (params.get('cursor') === 'page-two')
      return { items: directory.slice(10), nextCursor: null };
    return { items: directory.slice(0, 10), nextCursor: 'page-two' };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await context.setGeolocation({ latitude: 20.9591, longitude: 105.7654 });
  await context.grantPermissions(['geolocation']);
  await page.addInitScript(() => {
    const realPosition = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    let firstAttempt = true;
    navigator.geolocation.getCurrentPosition = (success, error, options) => {
      if (firstAttempt) {
        firstAttempt = false;
        error?.({
          code: 1,
          message: 'Denied',
          PERMISSION_DENIED: 1,
          POSITION_UNAVAILABLE: 2,
          TIMEOUT: 3,
        });
        return;
      }
      realPosition(success, error, options);
    };
  });
  await login(page, customer);
  await expect(pickupStoreButton(page)).toBeVisible();
  expect(requests).toBe(0);
  await pickupStoreButton(page).click();
  const dialog = page.getByRole('dialog', { name: 'Chọn cửa hàng' });
  const results = dialog.getByRole('list', { name: 'Kết quả tìm cửa hàng' });
  await expect(results.getByRole('listitem')).toHaveCount(10);
  await dialog.getByRole('button', { name: 'Xem thêm' }).click();
  await expect(results.getByRole('listitem')).toHaveCount(11);
  await dialog.getByRole('button', { name: 'Gần tôi' }).click();
  await expect(
    dialog.getByRole('status').filter({ hasText: 'Không lấy được vị trí' }),
  ).toBeVisible();
  await dialog.getByRole('searchbox').fill('Hà Đông');
  await expect(results).toContainText(store.name);
  await expect(results.getByRole('listitem')).toHaveCount(1);
  expect(geoRequests).toBe(0);
  await dialog.getByRole('button', { name: 'Gần tôi' }).click();
  await expect(dialog.getByRole('list', { name: 'Cửa hàng theo khoảng cách' })).toContainText(
    '42 m',
  );
  expect(geoRequests).toBeGreaterThan(0);
  await expect(dialog.getByRole('button', { name: 'Gần tôi' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  const size = await dialog.evaluate((element) => ({
    contentWidth: element.scrollWidth,
    panelWidth: element.clientWidth,
  }));
  expect(size.contentWidth).toBeLessThanOrEqual(size.panelWidth + 1);
});

for (const [label, user, landing] of [
  [
    'seller',
    {
      id: '84000000-0000-4000-a000-000000000001',
      displayName: 'Chủ cửa hàng',
      phoneNormalized: '+84902222222',
      emailNormalized: 'seller@example.test',
      accountType: 'SELLER',
      isAdmin: false,
      canRefund: false,
      memberships: [{ storeId: store.id, role: 'MANAGER' }],
      ownedStores: [store],
    },
    '/quan-ly',
  ],
  [
    'staff',
    {
      id: '85000000-0000-4000-a000-000000000001',
      displayName: 'Nhân viên cửa hàng',
      phoneNormalized: '+84903333333',
      emailNormalized: 'staff@example.test',
      accountType: 'STAFF',
      isAdmin: false,
      canRefund: false,
      memberships: [{ storeId: store.id, role: 'PICKER' }],
      ownedStores: [],
    },
    '/soan-hang',
  ],
  [
    'admin',
    {
      id: '86000000-0000-4000-a000-000000000001',
      displayName: 'Admin hệ thống',
      phoneNormalized: '+84904444444',
      emailNormalized: 'admin@example.test',
      accountType: 'USER',
      isAdmin: true,
      canRefund: true,
      memberships: [],
      ownedStores: [],
    },
    '/he-thong',
  ],
] satisfies [string, TestUser, string][]) {
  test(`store picker is hidden for ${label} accounts`, async ({ page }) => {
    await mockSession(page, user);
    await login(page, user);
    await expect(page).toHaveURL(new RegExp(`${landing.replace('/', '\\/')}$`));
    await expectStorePickerHidden(page);
    if (label === 'admin') {
      await expect(page.getByLabel('Chọn cửa hàng quản trị', { exact: true })).toBeVisible();
    }
  });
}
