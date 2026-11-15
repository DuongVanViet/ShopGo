import { expect, test, type Page } from '@playwright/test';

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

async function mockSession(page: Page, user?: TestUser) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();
    const fulfill = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });

    if (path === '/stores' && method === 'GET')
      return fulfill({ items: [store], nextCursor: null });
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

test('store picker is hidden before login and visible for a logged-in customer', async ({
  page,
}) => {
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
  await mockSession(page, customer);
  await page.goto('/');
  await expectStorePickerHidden(page);

  await login(page, customer);
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.store-select')).toBeVisible();
  await expect(page.getByText('Nhận hàng tại', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Chọn cửa hàng', { exact: true })).toHaveValue('');
  await expect(page.getByRole('button', { name: `Xem vị trí ${store.name}` })).toHaveCount(0);
  await page.getByLabel('Chọn cửa hàng', { exact: true }).selectOption(store.id);
  await expect(page.getByRole('button', { name: `Xem vị trí ${store.name}` })).toBeVisible();
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
