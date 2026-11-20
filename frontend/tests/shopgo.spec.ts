import { test, expect, type Browser, type Page } from '@playwright/test';
import { choosePickupStore, pickupStoreButton } from './store-picker';

async function login(page: Page, role: string) {
  await page.getByRole('link', { name: 'Đăng nhập', exact: true }).click();
  await page.getByRole('button', { name: 'Dùng tài khoản mẫu', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: role, exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  const landing =
    role === 'Admin'
      ? '/he-thong'
      : role === 'Quản lý'
        ? '/quan-ly'
        : role === 'Soạn hàng'
          ? '/soan-hang'
          : role === 'Quầy nhận'
            ? '/nhan-hang'
            : '/';
  await expect(page).toHaveURL(new RegExp(`${landing.replace('/', '\\/')}$`));
}
test('customer sees the exact store address, in-app pin and Google Maps directions', async ({
  page,
}) => {
  const stores = [
    {
      id: '00000000-0000-4000-a000-000000000001',
      code: 'Q1',
      name: 'Chợ Xanh Quận 1',
      address: '25 Nguyễn Huệ, Phường Bến Nghé, Quận 1, TP.HCM',
      latitude: 10.7769,
      longitude: 106.7009,
    },
    {
      id: '00000000-0000-4000-a000-000000000002',
      code: 'NO-PIN',
      name: 'Cửa hàng chưa ghim',
      address: '12 Lê Lợi, Phường Bến Thành, Quận 1, TP.HCM',
      latitude: null,
      longitude: null,
    },
  ];
  await page.route(/\/api\/v1\/stores\?/, (route) =>
    route.fulfill({ json: { data: { items: stores, nextCursor: null } } }),
  );
  await page.route('**/api/v1/auth/login', (route) =>
    route.fulfill({ json: { data: { accessToken: 'customer-location-token' } } }),
  );
  await page.route('**/api/v1/me/favorites', (route) => route.fulfill({ json: { data: [] } }));
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({
      json: {
        data: {
          id: '00000000-0000-4000-a000-000000000099',
          displayName: 'Khách hàng vị trí',
          phoneNormalized: '+84909999999',
          emailNormalized: 'customer.location@example.test',
          accountType: 'USER',
          isAdmin: false,
          canRefund: false,
          memberships: [],
          ownedStores: [],
        },
      },
    }),
  );
  await page.route(/\/api\/v1\/stores\/[^/]+\/categories/, (route) =>
    route.fulfill({ json: { data: [] } }),
  );
  await page.route(/\/api\/v1\/stores\/[^/]+\/products\?/, (route) =>
    route.fulfill({ json: { data: { items: [], nextCursor: null } } }),
  );
  await page.route(/\/api\/v1\/products\?/, (route) =>
    route.fulfill({ json: { data: { items: [], nextCursor: null } } }),
  );
  await page.route('**/api/v1/categories', (route) => route.fulfill({ json: { data: [] } }));
  await page.route(/\/api\/v1\/cart\?/, (route) =>
    route.fulfill({
      json: {
        data: {
          id: '00000000-0000-4000-a000-000000000098',
          storeId: stores[0].id,
          version: 1,
          items: [],
        },
      },
    }),
  );
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

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.store-select')).toHaveCount(0);
  await page.getByRole('link', { name: 'Đăng nhập', exact: true }).click();
  await page
    .getByLabel('Số điện thoại hoặc email', { exact: true })
    .fill('customer.location@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Customer-location-passphrase!');
  await page.getByRole('button', { name: 'Đăng nhập tài khoản', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('.store-select')).toBeVisible();
  await expect(pickupStoreButton(page)).toHaveAccessibleName('Chọn cửa hàng');
  await choosePickupStore(page, stores[0].name);
  await expect(pickupStoreButton(page).locator('small')).toHaveText(stores[0].address);
  await page.getByRole('button', { name: `Xem vị trí ${stores[0].name}` }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText(stores[0].address, { exact: true })).toBeVisible();
  await expect(
    dialog.getByRole('region', { name: `Bản đồ vị trí ${stores[0].name}` }),
  ).toBeVisible();
  await expect(dialog.locator('.shop-map-pin')).toBeVisible();
  const pinLink = dialog.getByRole('link', { name: 'Xem ghim Google Maps' });
  await expect(pinLink).toHaveAttribute(
    'href',
    /maps\/search\/\?api=1&query=10\.776900%2C106\.700900/,
  );
  await expect(pinLink).toHaveAttribute('target', '_blank');
  await expect(dialog.getByRole('link', { name: 'Chỉ đường đến cửa hàng' })).toHaveAttribute(
    'href',
    /maps\/dir\/\?api=1&destination=10\.776900%2C106\.700900&travelmode=driving/,
  );
  await dialog.getByRole('button', { name: 'Đóng' }).click();

  await choosePickupStore(page, stores[1].name);
  await expect(pickupStoreButton(page).locator('small')).toHaveText(stores[1].address);
  await page.getByRole('button', { name: `Xem vị trí ${stores[1].name}` }).click();
  await expect(dialog.getByText('Cửa hàng chưa ghim tọa độ.', { exact: false })).toBeVisible();
  await expect(dialog.getByRole('region')).toHaveCount(0);
  await expect(dialog.getByRole('link', { name: /Google Maps|Chỉ đường/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});
test('catalog uses live products and remains usable on mobile', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const storesResponse = await page.request.get('/api/v1/stores?limit=100');
  const stores = storesResponse.ok() ? await storesResponse.json() : null;
  test.skip(
    !stores?.data?.items?.some((store: { name?: string }) => store.name === 'ShopGo Demo 2'),
    'Cơ sở dữ liệu local không có dữ liệu demo.',
  );
  await page.goto('/');
  await login(page, 'Khách hàng');
  await choosePickupStore(page, 'ShopGo Demo 2');
  await expect(page.getByRole('heading', { name: 'Hôm nay, bạn cần gì?' })).toBeVisible();
  await expect(page.locator('.product-card').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/storefront-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(pickupStoreButton(page)).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1),
  ).toBe(true);
  await page.getByLabel('Tìm sản phẩm').fill('khong-co-san-pham-nay-987654');
  await expect(page.getByText('Chưa tìm thấy món bạn cần', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Xem tất cả sản phẩm', exact: true }).click();
  await expect(page.locator('.product-card').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/storefront-mobile.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('unavailable backend is explicit and does not fabricate products', async ({ page }) => {
  await page.route('**/api/v1/stores?*', (route) => route.abort());
  await page.route('**/api/v1/products?*', (route) => route.abort());
  await page.route('**/api/v1/categories', (route) => route.abort());
  await page.goto('/');
  await expect(page.locator('.error-box[role="alert"]').first()).toBeVisible();
  await expect(page.locator('.product-card')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Thử lại', exact: true }).first()).toBeVisible();
});
test('create data → checkout → picking → cash → QR handover → inventory', async ({ browser }) => {
  test.skip(
    process.env.E2E_ALLOW_MUTATIONS !== '1',
    'Requires explicit E2E_ALLOW_MUTATIONS=1 and a local test database.',
  );
  const base = process.env.E2E_BASE_URL || 'http://localhost:3000';
  expect(['localhost', '127.0.0.1']).toContain(new URL(base).hostname);
  const contexts: Awaited<ReturnType<Browser['newContext']>>[] = [];
  async function account(role: string) {
    const context = await browser.newContext({ baseURL: base });
    contexts.push(context);
    const page = await context.newPage();
    await page.goto('/');
    if (role === 'Khách hàng') {
      await page.getByRole('link', { name: 'Đăng nhập', exact: true }).click();
      await page.getByRole('button', { name: 'Dùng tài khoản mẫu', exact: true }).click();
      await page
        .getByLabel('Số điện thoại', { exact: true })
        .fill(`+849${String(Date.now()).slice(-8)}`);
      await page.getByRole('button', { name: 'Nhận mã xác thực', exact: true }).click();
      const code = await page.getByRole('dialog').locator('.info-note strong').textContent();
      await page.getByLabel('Mã xác thực', { exact: true }).fill(code!);
      await page.getByRole('button', { name: 'Xác nhận đăng nhập', exact: true }).click();
      await expect(page.getByRole('dialog')).not.toBeVisible();
      await expect(page).toHaveURL(/\/$/);
      await choosePickupStore(page, 'ShopGo Demo 2');
      await expect(page.locator('.product-card').first()).toBeVisible();
    } else {
      await login(page, role);
      if (role !== 'Admin') {
        await page.getByLabel('Cửa hàng làm việc').selectOption({ label: 'ShopGo Demo 2' });
      }
    }
    return page;
  }
  const stamp = Date.now(),
    name = `Táo thử nghiệm ${stamp}`,
    barcode = `E2E-${stamp}`;
  try {
    const admin = await account('Admin');
    const adminStoreSelect = admin.getByLabel('Chọn cửa hàng quản trị', { exact: true });
    await adminStoreSelect.selectOption({ label: 'ShopGo Demo 2' });
    await admin.getByLabel('Tên sản phẩm', { exact: true }).fill(name);
    await admin.getByLabel('Mã SKU', { exact: true }).fill(`E2E-${stamp}`);
    await admin.getByLabel('Mã vạch', { exact: true }).fill(barcode);
    await admin.getByLabel('Giá bán (VND)', { exact: true }).fill('25000');
    await admin.getByLabel('Tồn ban đầu', { exact: true }).fill('5');
    await admin.getByRole('button', { name: 'Tạo dữ liệu', exact: true }).click();
    await expect(admin.getByText('Đã lưu dữ liệu thành công.', { exact: false })).toBeVisible();
    const customer = await account('Khách hàng');
    await customer.getByLabel('Tìm sản phẩm').fill(name);
    await expect(customer.getByRole('button', { name: `Thêm ${name}`, exact: true })).toBeVisible();
    await customer.getByRole('button', { name: `Thêm ${name}`, exact: true }).click();
    await expect(customer.getByTestId('cart-count')).toHaveText('1');
    await customer.getByRole('link', { name: /Giỏ hàng/ }).click();
    await customer.getByRole('link', { name: 'Tiếp tục đặt hàng', exact: true }).click();
    await customer.locator('input[name="slot"]').first().check();
    await customer.getByRole('button', { name: 'Xem tổng thanh toán', exact: true }).click();
    await customer.getByRole('button', { name: /Đặt đơn & tiếp tục thanh toán cọc/ }).click();
    await expect(customer).toHaveURL(/\/don-hang\/[a-f0-9-]+$/);
    const orderId = new URL(customer.url()).pathname.split('/').pop()!;
    await customer.getByRole('button', { name: 'Tiếp tục thanh toán', exact: true }).click();
    await customer.getByRole('button', { name: 'Thanh toán mô phỏng', exact: true }).click();
    await expect(customer.locator('.badge').first()).toContainText('Đã xác nhận');
    const picker = await account('Soạn hàng');
    await picker
      .locator('.ops-card')
      .filter({ hasText: orderId.slice(0, 8).toUpperCase() })
      .getByRole('button', { name: 'Nhận soạn đơn này', exact: true })
      .click();
    await picker.getByLabel(`Mã hàng ${name}`, { exact: true }).fill(barcode);
    await picker.getByRole('button', { name: 'Xác nhận món', exact: true }).click();
    await expect(
      picker.getByRole('button', { name: 'Đã kiểm tra, sẵn sàng nhận', exact: true }),
    ).toBeEnabled();
    await picker.getByRole('button', { name: 'Đã kiểm tra, sẵn sàng nhận', exact: true }).click();
    await expect(
      picker.locator('.info-note').filter({ hasText: 'Đơn đã sẵn sàng.' }),
    ).toBeVisible();
    await customer.bringToFront();
    await expect(
      customer.getByRole('heading', { name: 'Mã nhận túi của bạn', exact: true }),
    ).toBeVisible();
    const token = await customer.getByTestId('pickup-token').textContent();
    expect(token?.length).toBeGreaterThan(32);
    const counter = await account('Quầy nhận');
    await counter.getByLabel('Mã nhận hàng', { exact: true }).fill(token!);
    await counter.getByRole('button', { name: 'Kiểm tra đơn hàng', exact: true }).click();
    await expect(
      counter.getByRole('button', { name: 'Xác nhận bàn giao hàng', exact: true }),
    ).toBeDisabled();
    await counter.getByRole('button', { name: /Xác nhận đã thu 21\.250/ }).click();
    await counter.getByRole('button', { name: 'Xác nhận bàn giao hàng', exact: true }).click();
    await expect(
      counter.getByRole('heading', { name: 'Đã bàn giao thành công!', exact: true }),
    ).toBeVisible();
    await customer.bringToFront();
    await expect(customer.getByText('Túi hàng đã đến tay bạn.', { exact: true })).toBeVisible();
    const manager = await account('Quản lý');
    await manager.getByRole('button', { name: 'Tồn kho', exact: true }).click();
    await manager.getByLabel('Tìm tồn kho', { exact: true }).fill(name);
    const row = manager.getByRole('row').filter({ hasText: name });
    await expect(row).toBeVisible();
    await expect(row.getByRole('cell').nth(1)).toHaveText('4');
    await expect(row.getByRole('cell').nth(2)).toHaveText('0');
    await expect(row.getByRole('cell').nth(3)).toHaveText('4');
    await manager.screenshot({ path: 'test-results/manager-inventory.png', fullPage: true });
    await customer.route('**/api/v1/cart?*', (route) => route.abort());
    await customer.bringToFront();
    await customer.getByRole('link', { name: /Giỏ hàng/ }).click();
    await expect(customer.locator('.error-box')).toContainText('Chưa kết nối được cửa hàng');
  } finally {
    for (const context of contexts) await context.close();
  }
});
