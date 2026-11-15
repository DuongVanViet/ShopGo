import { test, expect } from '@playwright/test';

test('login and registration pages work on mobile without exposing map by default', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Đăng nhập', exact: true })).toBeVisible();
  await expect(page.getByLabel('Số điện thoại hoặc email', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: 'Đăng ký ngay', exact: true }).click();
  await expect(page.getByLabel('Họ và tên', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Bản đồ chọn vị trí cửa hàng' })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
  await page.screenshot({ path: 'test-results/register-mobile.png', fullPage: true });
});

test('user can register by email then log in with password', async ({ page }) => {
  test.skip(process.env.E2E_ALLOW_MUTATIONS !== '1', 'Requires local test data permission.');
  expect(['localhost', '127.0.0.1']).toContain(
    new URL(process.env.E2E_BASE_URL || 'http://localhost:3000').hostname,
  );
  const stamp = Date.now(),
    email = `ui-user-${stamp}@example.test`,
    password = 'Register-user-passphrase!';
  await page.goto('/register');
  await page.getByLabel('Họ và tên', { exact: true }).fill(`Khách mới ${stamp}`);
  await page.getByRole('button', { name: 'Dùng email', exact: true }).click();
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng ký tài khoản', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('link', { name: `Hồ sơ của Khách mới ${stamp}`, exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await page.getByRole('link', { name: 'Đăng nhập', exact: true }).click();
  await page.getByLabel('Số điện thoại hoặc email', { exact: true }).fill(email.toUpperCase());
  await page.getByLabel('Mật khẩu', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Đăng nhập tài khoản', exact: true }).click();
  await expect(page.locator('.error-box')).toContainText('mật khẩu không đúng');
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập tài khoản', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole('link', { name: `Hồ sơ của Khách mới ${stamp}`, exact: true }),
  ).toBeVisible();
});

test('seller registers with a confirmed real-coordinate pin, then reads saved location after login', async ({
  page,
  context,
}) => {
  test.skip(process.env.E2E_ALLOW_MUTATIONS !== '1', 'Requires local test data permission.');
  const base = process.env.E2E_BASE_URL || 'http://localhost:3000';
  expect(['localhost', '127.0.0.1']).toContain(new URL(base).hostname);
  // Avoid automated fetching/panning of public OSM tiles. Test coordinate math and storage,
  // not ground truth or live basemap quality. Normal app use loads the actual OSM map.
  await page.route('https://tile.openstreetmap.org/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
        'base64',
      ),
    }),
  );
  await context.grantPermissions(['geolocation'], { origin: base });
  await context.setGeolocation({ latitude: 10.7769, longitude: 106.7009, accuracy: 12 });
  const stamp = Date.now(),
    phone = `09${String(stamp).slice(-8)}`,
    email = `seller-${stamp}@example.test`,
    password = 'Seller-register-passphrase!',
    name = `Quán mới ${stamp}`;
  await page.goto('/register');
  await page.getByRole('button', { name: 'Người bán / cửa hàng', exact: false }).click();
  await page.getByLabel('Tên cửa hàng', { exact: true }).fill(name);
  await page.getByLabel('Số điện thoại', { exact: true }).fill(phone);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Tiếp tục: địa chỉ & bản đồ', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Cửa hàng của bạn ở đâu?', exact: true }),
  ).toBeVisible();
  await page.getByLabel('Số nhà, tên đường', { exact: true }).fill('25 Nguyễn Huệ');
  await page.getByLabel('Phường / xã', { exact: true }).fill('Phường Bến Nghé');
  await page.getByLabel('Tỉnh / thành phố', { exact: true }).fill('Thành phố Hồ Chí Minh');
  const submit = page.getByRole('button', { name: 'Tạo tài khoản cửa hàng', exact: true });
  await expect(submit).toBeDisabled();
  await page.getByRole('button', { name: 'Dùng vị trí hiện tại', exact: true }).click();
  await expect(page.locator('.location-result')).toContainText('10.776900, 106.700900');
  await expect(page.locator('.location-result')).toContainText('12 m');
  const confirm = page.getByRole('checkbox', {
    name: 'Tôi đã kiểm tra ghim nằm đúng vị trí cửa hàng thực tế.',
    exact: true,
  });
  await confirm.check();
  await expect(submit).toBeEnabled();
  const map = page.getByRole('region', { name: 'Bản đồ chọn vị trí cửa hàng', exact: true });
  await expect(map.locator('.shop-map-pin')).toBeVisible();
  const bounds = await map.boundingBox();
  await map.click({ position: { x: bounds!.width * 0.7, y: bounds!.height * 0.5 } });
  await expect(confirm).not.toBeChecked();
  await expect(submit).toBeDisabled();
  const coordinates = await page.locator('.location-result strong').textContent();
  await confirm.check();
  await page.screenshot({ path: 'test-results/seller-location-form.png', fullPage: true });
  const response = page.waitForResponse(
    (response) =>
      response.url().endsWith('/auth/register') && response.request().method() === 'POST',
  );
  await submit.click();
  const result = await (await response).json();
  await expect(page).toHaveURL(/\/quan-ly$/);
  await expect(page.getByRole('link', { name: 'Xem / sửa vị trí', exact: true })).toBeVisible();
  const stored = await page.request.get('/api/v1/seller/store', {
    headers: { Authorization: `Bearer ${result.data.accessToken}` },
  });
  expect(stored.ok()).toBe(true);
  const data = (await stored.json()).data;
  expect(data.locationSource).toBe('MAP');
  expect(`${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}`).toBe(coordinates);
  expect(data.addressDetails.street).toBe('25 Nguyễn Huệ');
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await page.getByRole('link', { name: 'Đăng nhập', exact: true }).click();
  await page.getByLabel('Số điện thoại hoặc email', { exact: true }).fill(phone);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập tài khoản', exact: true }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
  await page.getByRole('link', { name: 'Xem / sửa vị trí', exact: true }).click();
  await expect(page.locator('.location-result strong')).toHaveText(coordinates!);
});
