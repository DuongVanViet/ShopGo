import { expect, test, type Page } from '@playwright/test';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
);

const store = {
  id: 'b1000000-0000-4000-a000-000000000001',
  code: 'PROFILE-STORE',
  name: 'Cửa hàng hồ sơ',
  address: '20 Nguyễn Trãi, Hà Nội',
};

async function mockProfileApp(page: Page) {
  let user = {
    id: 'b2000000-0000-4000-a000-000000000001',
    displayName: 'Nguyễn Minh Anh',
    phoneNormalized: '+84901122334',
    emailNormalized: 'minhanh@example.test',
    avatarUrl: null as string | null,
    accountType: 'USER' as const,
    isAdmin: false,
    canRefund: false,
    memberships: [],
    ownedStores: [],
  };
  let profileBody: Record<string, unknown> | null = null;
  let avatarAuthorization = '';

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
    if (path === '/auth/login' && method === 'POST')
      return fulfill({ accessToken: 'profile-token' });
    if (path === '/me' && method === 'GET') return fulfill(user);
    if (path === '/me' && method === 'PATCH') {
      profileBody = request.postDataJSON();
      user = {
        ...user,
        displayName: String(profileBody?.displayName),
        phoneNormalized: String(profileBody?.phone ?? ''),
        emailNormalized: String(profileBody?.email ?? '').toLowerCase(),
      };
      return fulfill(user);
    }
    if (path === '/me/avatar' && method === 'POST') {
      avatarAuthorization = request.headers().authorization ?? '';
      user = { ...user, avatarUrl: '/api/v1/media/avatars/profile-test.png' };
      return fulfill(user);
    }
    if (path === '/me/avatar' && method === 'DELETE') {
      user = { ...user, avatarUrl: null };
      return fulfill(user);
    }
    if (path === '/media/avatars/profile-test.png' && method === 'GET')
      return route.fulfill({ status: 200, contentType: 'image/png', body: png });
    if (path === '/auth/logout' && method === 'POST') return fulfill({ loggedOut: true });
    return route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_MOCKED', message: `${method} ${path}` } },
    });
  });

  return {
    profileBody: () => profileBody,
    avatarAuthorization: () => avatarAuthorization,
  };
}

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Số điện thoại hoặc email', { exact: true }).fill('minhanh@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Profile-passphrase!');
  await page.getByRole('button', { name: 'Đăng nhập tài khoản', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
}

test('customer updates profile, avatar and persistent light/dark appearance', async ({ page }) => {
  const mock = await mockProfileApp(page);
  await login(page);
  await page.getByRole('link', { name: 'Hồ sơ của Nguyễn Minh Anh', exact: true }).click();
  await expect(page).toHaveURL(/\/tai-khoan$/);
  await expect(page.getByRole('heading', { name: 'Hồ sơ cá nhân', exact: true })).toBeVisible();
  await expect(page.getByLabel('Họ và tên', { exact: true })).toHaveValue('Nguyễn Minh Anh');

  await page.getByLabel('Họ và tên', { exact: true }).fill('Nguyễn Minh Ánh');
  await page.getByLabel('Email', { exact: true }).fill('anh-moi@example.test');
  await page.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
  await expect(page.getByRole('link', { name: 'Hồ sơ của Nguyễn Minh Ánh' })).toBeVisible();
  expect(mock.profileBody()).toEqual({
    displayName: 'Nguyễn Minh Ánh',
    phone: '+84901122334',
    email: 'anh-moi@example.test',
  });

  await page.locator('input[name="avatar"]').setInputFiles({
    name: 'avatar.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await expect(page.locator('.account-avatar-large img')).toBeVisible();
  expect(mock.avatarAuthorization()).toBe('Bearer profile-token');
  await page.getByRole('button', { name: 'Xóa ảnh', exact: true }).click();
  await expect(page.locator('.account-avatar-large img')).toHaveCount(0);

  await page.getByRole('radio', { name: /Tối/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('shopgo-theme'))).toBe('dark');
  await page.getByRole('radio', { name: /Sáng/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: /Tối/ }).click();
  await page.screenshot({ path: 'test-results/profile-dark-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/profile-dark-mobile.png', fullPage: true });
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});

test('anonymous visitor cannot open account settings', async ({ page }) => {
  await mockProfileApp(page);
  await page.goto('/tai-khoan');
  await expect(page.getByText('Đăng nhập để tiếp tục', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible();
});
