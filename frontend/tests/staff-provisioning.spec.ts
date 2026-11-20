import { expect, test, type Page, type Route } from '@playwright/test';

const store = {
  id: '71000000-0000-4000-a000-000000000001',
  code: 'STORE-STAFF-1',
  name: 'Cửa hàng Minh An',
  address: '25 Nguyễn Huệ, TP.HCM',
  latitude: 10.7769,
  longitude: 106.7009,
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

async function mockApp(
  page: Page,
  user: TestUser,
  onStaffPost?: (route: Route) => Promise<void>,
  onPasswordPatch?: (route: Route) => Promise<void>,
) {
  const staff: Record<string, unknown>[] = [];
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();
    const fulfill = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });

    if (path === '/stores' && method === 'GET')
      return fulfill({ items: [store], nextCursor: null });
    if (path === '/auth/login' && method === 'POST')
      return fulfill({ accessToken: `${user.id}-token` });
    if (path === '/me' && method === 'GET') return fulfill(user);
    if (path === '/seller/store' && method === 'GET')
      return fulfill({
        ...store,
        ownerUserId: user.id,
        locationSource: 'MAP',
        locationConfirmedAt: '2026-11-13T08:00:00.000Z',
        locationVersion: 1,
      });
    if (path === '/categories' && method === 'GET') return fulfill([]);
    if (path === `/stores/${store.id}/catalog/categories` && method === 'GET') return fulfill([]);
    if (path === `/stores/${store.id}` && method === 'GET') return fulfill(store);
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
    if (path === `/stores/${store.id}/staff` && method === 'GET') return fulfill(staff);
    if (path === `/stores/${store.id}/staff` && method === 'POST') {
      if (onStaffPost) await onStaffPost(route);
      const body = request.postDataJSON();
      const created = {
        id: '72000000-0000-4000-a000-000000000001',
        displayName: body.displayName,
        phoneNormalized: '+84901234567',
        emailNormalized: body.email,
        accountType: 'STAFF',
        status: 'ACTIVE',
        role: body.role,
        createdAt: '2026-11-13T08:00:00.000Z',
      };
      staff.push(created);
      return fulfill(created, 201);
    }
    if (
      path === `/stores/${store.id}/staff/72000000-0000-4000-a000-000000000001/password` &&
      method === 'PATCH'
    ) {
      if (onPasswordPatch) await onPasswordPatch(route);
      return fulfill({ updated: true, sessionsRevoked: 1 });
    }
    if (path === '/cart' && method === 'GET')
      return fulfill({
        id: '73000000-0000-4000-a000-000000000001',
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

async function login(page: Page, identifier: string) {
  await page.goto('/login');
  await page.getByLabel('Số điện thoại hoặc email', { exact: true }).fill(identifier);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Staff-account-passphrase!');
  await page.getByRole('button', { name: 'Đăng nhập tài khoản', exact: true }).click();
}

test('store manager provisions staff; employees are not a public registration type', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let staffRequest:
    | { body: Record<string, unknown>; authorization?: string; idempotency?: string }
    | undefined;
  let passwordRequest:
    | { body: Record<string, unknown>; authorization?: string; target?: string }
    | undefined;
  await mockApp(
    page,
    {
      id: '74000000-0000-4000-a000-000000000001',
      displayName: 'Chủ cửa hàng Minh An',
      phoneNormalized: '+84901111111',
      emailNormalized: 'owner@example.test',
      accountType: 'SELLER',
      isAdmin: false,
      canRefund: false,
      memberships: [{ storeId: store.id, role: 'MANAGER' }],
      ownedStores: [store],
    },
    async (route) => {
      const request = route.request();
      staffRequest = {
        body: request.postDataJSON(),
        authorization: request.headers().authorization,
        idempotency: request.headers()['idempotency-key'],
      };
    },
    async (route) => {
      const request = route.request();
      passwordRequest = {
        body: request.postDataJSON(),
        authorization: request.headers().authorization,
        target: new URL(request.url()).pathname,
      };
    },
  );

  await page.goto('/register');
  await expect(page.getByRole('button', { name: /nhân viên/i })).toHaveCount(0);
  await login(page, 'owner@example.test');
  await expect(page).toHaveURL(/\/quan-ly$/);
  await page.getByRole('button', { name: 'Nhân viên', exact: true }).click();

  await expect(page.getByRole('option', { name: 'Quản lý cửa hàng', exact: true })).toHaveCount(0);
  await page.getByLabel('Tên nhân viên', { exact: true }).fill('Nguyễn Thanh Bình');
  await page.getByLabel('Số điện thoại', { exact: true }).fill('0901234567');
  await page.getByLabel('Email', { exact: true }).fill('binh.staff@example.test');
  await page.getByLabel('Mật khẩu ban đầu', { exact: true }).fill('Initial-staff-passphrase!');
  await page
    .getByRole('combobox', { name: 'Vai trò', exact: true })
    .selectOption({ value: 'PICKER' });
  await page.getByRole('button', { name: 'Cấp tài khoản nhân viên', exact: true }).click();

  await expect(page.getByText('Nguyễn Thanh Bình', { exact: true })).toBeVisible();
  expect(staffRequest).toMatchObject({
    body: {
      displayName: 'Nguyễn Thanh Bình',
      phone: '0901234567',
      email: 'binh.staff@example.test',
      password: 'Initial-staff-passphrase!',
      role: 'PICKER',
    },
    authorization: 'Bearer 74000000-0000-4000-a000-000000000001-token',
  });
  expect(staffRequest?.idempotency).toBeTruthy();

  await page
    .getByRole('button', { name: 'Đặt lại mật khẩu cho Nguyễn Thanh Bình', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Đặt lại mật khẩu cho Nguyễn Thanh Bình', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Mật khẩu mới', { exact: true }).fill('New-staff-passphrase!');
  await page.getByLabel('Xác nhận mật khẩu mới', { exact: true }).fill('Different-passphrase!');
  await page.getByRole('button', { name: 'Xác nhận đổi mật khẩu', exact: true }).click();
  await expect(page.locator('.modal .error-box')).toBeVisible();
  expect(passwordRequest).toBeUndefined();
  await page.screenshot({ path: 'test-results/staff-password-reset-mobile.png', fullPage: true });

  await page.getByLabel('Xác nhận mật khẩu mới', { exact: true }).fill('New-staff-passphrase!');
  await page.getByRole('button', { name: 'Xác nhận đổi mật khẩu', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Đặt lại mật khẩu cho Nguyễn Thanh Bình', exact: true }),
  ).toHaveCount(0);
  expect(passwordRequest).toEqual({
    body: { password: 'New-staff-passphrase!' },
    authorization: 'Bearer 74000000-0000-4000-a000-000000000001-token',
    target:
      '/api/v1/stores/71000000-0000-4000-a000-000000000001/staff/72000000-0000-4000-a000-000000000001/password',
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('system admin can open seller operations and provision a manager', async ({ page }) => {
  await mockApp(page, {
    id: '75000000-0000-4000-a000-000000000001',
    displayName: 'Admin hệ thống',
    phoneNormalized: '+84902222222',
    emailNormalized: 'admin@example.test',
    accountType: 'USER',
    isAdmin: true,
    canRefund: true,
    memberships: [],
    ownedStores: [],
  });
  await login(page, 'admin@example.test');
  await expect(page).toHaveURL(/\/he-thong$/);
  await page
    .getByLabel('Chọn cửa hàng quản trị', { exact: true })
    .selectOption({ value: store.id });
  await page.getByRole('link', { name: 'Quản lý cửa hàng', exact: true }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
  await expect(
    page.getByRole('heading', { name: 'Một cửa hàng, luôn trong tầm tay.', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Nhân viên', exact: true }).click();
  await expect(page.getByRole('option', { name: 'Quản lý cửa hàng', exact: true })).toHaveCount(1);
});

test('provisioned picker signs in and is routed to the picking workspace', async ({ page }) => {
  await mockApp(page, {
    id: '76000000-0000-4000-a000-000000000001',
    displayName: 'Nhân viên soạn hàng',
    phoneNormalized: '+84903333333',
    emailNormalized: 'picker@example.test',
    accountType: 'STAFF',
    isAdmin: false,
    canRefund: false,
    memberships: [{ storeId: store.id, role: 'PICKER' }],
    ownedStores: [],
  });
  await login(page, 'picker@example.test');
  await expect(page).toHaveURL(/\/soan-hang$/);
  await expect(
    page.getByRole('heading', { name: 'Soạn từng túi, trọn từng món.', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: 'Nhân viên', exact: true })).toHaveCount(0);
});
