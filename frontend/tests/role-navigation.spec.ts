import { expect, test, type Page } from '@playwright/test';

const store = {
  id: 'a1000000-0000-4000-a000-000000000001',
  code: 'ROLE-STORE',
  name: 'Cửa hàng phân quyền',
  address: '10 Lê Lợi, Quận 1, TP.HCM',
  latitude: 10.7731,
  longitude: 106.6983,
};

type StoreRole = 'PICKER' | 'COUNTER' | 'MANAGER';

interface TestUser {
  id: string;
  displayName: string;
  phoneNormalized: string | null;
  emailNormalized: string;
  accountType: 'USER' | 'SELLER' | 'STAFF';
  isAdmin: boolean;
  canRefund: boolean;
  memberships: { storeId: string; role: StoreRole }[];
  ownedStores: (typeof store)[];
}

async function mockApp(page: Page, user?: TestUser) {
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();
    const fulfill = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });

    if (path === '/stores' && method === 'GET') {
      return fulfill({ items: [store], nextCursor: null });
    }
    if (path === `/stores/${store.id}` && method === 'GET') return fulfill(store);
    if (path === '/products' && method === 'GET') {
      return fulfill({ items: [], nextCursor: null });
    }
    if (path === '/categories' && method === 'GET') return fulfill([]);
    if (path === '/auth/login' && method === 'POST') {
      return fulfill({ accessToken: `${user?.id ?? 'anonymous'}-token` });
    }
    if (path === '/me' && method === 'GET' && user) return fulfill(user);
    if (path === '/seller/store' && method === 'GET') {
      return fulfill({
        ...store,
        ownerUserId: user?.id,
        locationSource: 'MAP',
        locationConfirmedAt: '2026-11-14T08:00:00.000Z',
        locationVersion: 1,
      });
    }
    if (path === `/stores/${store.id}/categories` && method === 'GET') return fulfill([]);
    if (path === `/stores/${store.id}/products` && method === 'GET') {
      return fulfill({ items: [], nextCursor: null });
    }
    if (path === `/stores/${store.id}/catalog/categories` && method === 'GET') return fulfill([]);
    if (path === `/stores/${store.id}/catalog/products` && method === 'GET') {
      return fulfill({ items: [], nextCursor: null });
    }
    if (path === `/stores/${store.id}/inventory` && method === 'GET') {
      return fulfill({ items: [], nextCursor: null });
    }
    if (path === `/stores/${store.id}/orders` && method === 'GET') {
      return fulfill({ items: [], nextCursor: null });
    }
    if (path === `/stores/${store.id}/reports/summary` && method === 'GET') {
      return fulfill({
        completedOrders: 0,
        completedOrderValue: 0,
        onlineCollected: 0,
        cashCollected: 0,
        refunded: 0,
      });
    }
    if (path === `/stores/${store.id}/slots` && method === 'GET') return fulfill([]);
    if (path === `/stores/${store.id}/staff` && method === 'GET') return fulfill([]);
    if (path === '/cart' && method === 'GET') {
      return fulfill({
        id: 'a2000000-0000-4000-a000-000000000001',
        storeId: store.id,
        version: 1,
        items: [],
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_MOCKED', message: `${method} ${path}` } },
    });
  });
}

async function login(page: Page, user: TestUser, landing: string) {
  await page.goto('/login');
  await page.getByLabel('Số điện thoại hoặc email', { exact: true }).fill(user.emailNormalized);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Role-navigation-passphrase!');
  await page.getByRole('button', { name: 'Đăng nhập tài khoản', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${landing.replace('/', '\\/')}$`));
}

async function expectMainNavigation(page: Page, labels: string[]) {
  const navigation = page.getByRole('navigation', { name: 'Điều hướng chính' });
  await expect(navigation).toBeVisible();
  await expect(navigation.getByRole('link')).toHaveText(labels);
  await expect(
    navigation.getByRole('link', { name: 'Hướng dẫn trải nghiệm', exact: true }),
  ).toHaveCount(0);
}

const customer: TestUser = {
  id: 'a3000000-0000-4000-a000-000000000001',
  displayName: 'Khách hàng',
  phoneNormalized: '+84901111111',
  emailNormalized: 'customer-nav@example.test',
  accountType: 'USER',
  isAdmin: false,
  canRefund: false,
  memberships: [],
  ownedStores: [],
};

test('anonymous and customer accounts only see customer navigation', async ({ page }) => {
  await mockApp(page, customer);
  await page.goto('/');
  await expectMainNavigation(page, ['Cửa hàng', 'Đơn của tôi']);
  await expect(page.getByRole('link', { name: /Giỏ hàng/ })).toBeVisible();

  await login(page, customer, '/');
  await expectMainNavigation(page, ['Cửa hàng', 'Đơn của tôi']);
  await expect(page.getByRole('link', { name: /Giỏ hàng/ })).toBeVisible();
});

for (const [label, user, landing, links] of [
  [
    'seller manager',
    {
      id: 'a3000000-0000-4000-a000-000000000002',
      displayName: 'Chủ cửa hàng',
      phoneNormalized: '+84902222222',
      emailNormalized: 'seller-nav@example.test',
      accountType: 'SELLER',
      isAdmin: false,
      canRefund: false,
      memberships: [{ storeId: store.id, role: 'MANAGER' }],
      ownedStores: [store],
    },
    '/quan-ly',
    ['Soạn hàng', 'Quầy nhận', 'Quản lý cửa hàng'],
  ],
  [
    'picker',
    {
      id: 'a3000000-0000-4000-a000-000000000003',
      displayName: 'Nhân viên soạn hàng',
      phoneNormalized: '+84903333333',
      emailNormalized: 'picker-nav@example.test',
      accountType: 'STAFF',
      isAdmin: false,
      canRefund: false,
      memberships: [{ storeId: store.id, role: 'PICKER' }],
      ownedStores: [],
    },
    '/soan-hang',
    ['Soạn hàng'],
  ],
  [
    'counter',
    {
      id: 'a3000000-0000-4000-a000-000000000004',
      displayName: 'Nhân viên quầy nhận',
      phoneNormalized: '+84904444444',
      emailNormalized: 'counter-nav@example.test',
      accountType: 'STAFF',
      isAdmin: false,
      canRefund: false,
      memberships: [{ storeId: store.id, role: 'COUNTER' }],
      ownedStores: [],
    },
    '/nhan-hang',
    ['Quầy nhận'],
  ],
  [
    'admin',
    {
      id: 'a3000000-0000-4000-a000-000000000005',
      displayName: 'Admin hệ thống',
      phoneNormalized: '+84905555555',
      emailNormalized: 'admin-nav@example.test',
      accountType: 'USER',
      isAdmin: true,
      canRefund: true,
      memberships: [],
      ownedStores: [],
    },
    '/he-thong',
    ['Soạn hàng', 'Quầy nhận', 'Quản lý cửa hàng', 'Quản trị'],
  ],
] satisfies [string, TestUser, string, string[]][]) {
  test(`${label} sees only authorized operational navigation`, async ({ page }) => {
    await mockApp(page, user);
    await login(page, user, landing);
    if (label === 'admin') {
      await expectMainNavigation(page, ['Quản trị']);
      await page
        .getByLabel('Chọn cửa hàng quản trị', { exact: true })
        .selectOption({ value: store.id });
    }
    await expectMainNavigation(page, links);
    await expect(page.getByRole('link', { name: /Giỏ hàng/ })).toHaveCount(0);
  });
}
