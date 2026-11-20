import { test, expect, type Page } from '@playwright/test';
import { choosePickupStore } from './store-picker';

test('store manager creates and pauses a voucher; customer pays discounted deposit and counter hands over', async ({
  browser,
  request,
}) => {
  test.skip(process.env.E2E_ALLOW_MUTATIONS !== '1', 'Requires local test data.');
  const base = process.env.E2E_BASE_URL || 'http://localhost:3000';
  expect(['localhost', '127.0.0.1']).toContain(new URL(base).hostname);
  const stamp = Date.now();
  const email = `promo-seller-${stamp}@example.test`,
    password = 'Promotion-test-passphrase!';
  const storeName = `Cửa hàng ưu đãi ${stamp}`,
    productName = `Sản phẩm ưu đãi ${stamp}`,
    code = `SALE${stamp}PROMOTION2026`;
  const response = await request.post('/api/v1/auth/register', {
    data: {
      accountType: 'SELLER',
      storeName,
      phone: `+849${String(stamp).slice(-8)}`,
      email,
      password,
      address: { street: '25 Nguyễn Huệ', ward: 'Phường Bến Nghé', city: 'Thành phố Hồ Chí Minh' },
      location: { latitude: 10.7769, longitude: 106.7009, source: 'COORDINATES', confirmed: true },
    },
  });
  expect(response.ok()).toBeTruthy();
  const sellerAuth = (await response.json()).data;
  const headers = { Authorization: `Bearer ${sellerAuth.accessToken}` };
  const me = (await (await request.get('/api/v1/me', { headers })).json()).data;
  const store = me.ownedStores[0];
  const categoryResponse = await request.post(`/api/v1/stores/${store.id}/catalog/categories`, {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: { name: 'Thực phẩm', slug: `food-${stamp}` },
  });
  expect(categoryResponse.ok()).toBeTruthy();
  const category = (await categoryResponse.json()).data;
  const productResponse = await request.post(`/api/v1/stores/${store.id}/catalog/products`, {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: {
      name: productName,
      categoryId: category.id,
      sku: { code: `PROMO-${stamp}`, name: productName, barcode: `BAR-${stamp}`, unit: 'box' },
      price: 300000,
      initialStock: 10,
    },
  });
  expect(productResponse.ok()).toBeTruthy();
  const start = new Date(Date.now() + 86400000),
    end = new Date(Date.now() + 90000000);
  const slot = await request.post(`/api/v1/stores/${store.id}/slots`, {
    headers: { ...headers, 'Idempotency-Key': crypto.randomUUID() },
    data: { startsAt: start.toISOString(), endsAt: end.toISOString(), capacity: 10 },
  });
  expect(slot.ok()).toBeTruthy();
  const managerContext = await browser.newContext({ baseURL: base });
  const customerContext = await browser.newContext({
    baseURL: base,
    viewport: { width: 390, height: 844 },
  });
  async function login(page: Page, identifier: string) {
    await page.goto('/login');
    await page.getByLabel('Số điện thoại hoặc email', { exact: true }).fill(identifier);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Đăng nhập tài khoản', exact: true }).click();
  }
  try {
    const manager = await managerContext.newPage();
    await login(manager, email);
    await expect(manager).toHaveURL(/\/quan-ly$/);
    await manager.getByRole('button', { name: 'Khuyến mãi', exact: true }).click();
    await manager.getByRole('button', { name: 'Tạo mã giảm giá', exact: true }).click();
    const dialog = manager.getByRole('dialog', { name: 'Tạo mã giảm giá' });
    await dialog.getByLabel('Mã giảm giá', { exact: true }).fill(code);
    await dialog.getByLabel('Giá trị giảm (%)', { exact: true }).fill('10');
    await dialog.getByLabel('Đơn tối thiểu (₫)', { exact: true }).fill('200000');
    await dialog.getByLabel('Giảm tối đa (₫)', { exact: true }).fill('30000');
    function localDate(value: number) {
      return new Date(value + 7 * 3600000).toISOString().slice(0, 16);
    }
    await dialog.getByLabel('Bắt đầu (giờ Việt Nam)').fill(localDate(Date.now() - 3600000));
    await dialog.getByLabel('Kết thúc (giờ Việt Nam)').fill(localDate(Date.now() + 172800000));
    await dialog.getByRole('button', { name: 'Tạo ưu đãi', exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const promotion = manager.locator('.promotion-list article').filter({ hasText: code });
    await expect(promotion).toContainText('Đang áp dụng');
    await promotion.getByRole('button', { name: `Tạm dừng ${code}`, exact: true }).click();
    await expect(promotion).toContainText('Tạm dừng');
    await promotion.getByRole('button', { name: `Bật lại ${code}`, exact: true }).click();
    await expect(promotion).toContainText('Đang áp dụng');
    const customer = await customerContext.newPage();
    await manager.getByRole('button', { name: 'Danh mục & sản phẩm', exact: true }).click();
    await manager.getByRole('button', { name: 'Chỉnh sửa thuộc tính', exact: true }).click();
    const edit = manager.getByRole('dialog', { name: 'Chỉnh sửa sản phẩm' });
    await edit
      .getByRole('checkbox', { name: 'Áp dụng giá giảm cho sản phẩm tại cửa hàng' })
      .check();
    await edit.getByLabel('Giá sau giảm (VND)', { exact: true }).fill('250000');
    await edit.getByLabel('Bắt đầu giảm giá (giờ Việt Nam)').fill(localDate(Date.now() - 3600000));
    await edit
      .getByLabel('Kết thúc giảm giá (giờ Việt Nam)')
      .fill(localDate(Date.now() + 172800000));
    await edit.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();
    await expect(edit).not.toBeVisible();
    await customer.goto('/register');
    await customer.getByLabel('Họ và tên', { exact: true }).fill('Khách mua ưu đãi');
    await customer.getByRole('button', { name: 'Dùng email', exact: true }).click();
    await customer
      .getByLabel('Email', { exact: true })
      .fill(`promo-customer-${stamp}@example.test`);
    await customer.getByLabel('Mật khẩu', { exact: true }).fill(password);
    await customer.getByRole('button', { name: 'Đăng ký tài khoản', exact: true }).click();
    await expect(customer).toHaveURL(/\/$/);
    await choosePickupStore(customer, storeName);
    await expect(customer.locator('.product-card del')).toHaveText('300.000 ₫');
    await expect(customer.locator('.product-card .product-prices strong')).toHaveText('250.000 ₫');
    await customer.screenshot({ path: 'test-results/product-discount-mobile.png', fullPage: true });
    await expect(customer.getByRole('region', { name: 'Ưu đãi của cửa hàng' })).toContainText(code);
    await customer.getByRole('button', { name: `Thêm ${productName}`, exact: true }).click();
    await expect(customer.getByTestId('cart-count')).toHaveText('1');
    await customer.locator('a.cart-button').click();
    await expect(customer.locator('.retail-cart-copy del')).toHaveText('300.000 ₫');
    await customer.getByRole('button', { name: /Chọn mã giảm giá/ }).click();
    const picker = customer.getByRole('dialog', { name: 'Chọn mã giảm giá' });
    await expect(picker).toContainText('Có lợi nhất cho giỏ hàng');
    await picker.getByLabel('Nhập mã giảm giá').fill(code.toLowerCase());
    await picker.getByRole('button', { name: 'Tìm mã', exact: true }).click();
    await expect(picker.locator('.voucher-ticket')).toHaveCount(1);
    await customer.screenshot({ path: 'test-results/promotion-vouchers-mobile.png' });
    await picker.getByRole('button', { name: `Dùng mã ${code}`, exact: true }).click();
    await expect(customer.getByText('Đã giảm 25.000 ₫', { exact: true })).toBeVisible();
    await customer.getByRole('button', { name: `Giảm ${productName}`, exact: true }).click();
    await expect(customer.getByTestId('cart-count')).toHaveText('0');
    await customer.getByRole('link', { name: 'Khám phá cửa hàng', exact: true }).click();
    await customer.getByRole('button', { name: `Thêm ${productName}`, exact: true }).click();
    await expect(customer.getByTestId('cart-count')).toHaveText('1');
    await customer.locator('a.cart-button').click();
    await customer.getByRole('link', { name: 'Tiếp tục đặt hàng', exact: true }).click();
    await expect(customer.locator('.voucher-control')).toContainText(code);
    await customer.locator('input[name="slot"]').first().check();
    await customer.getByRole('button', { name: /Xem tổng thanh toán/ }).click();
    await expect(customer.getByLabel('Chi tiết thanh toán')).toContainText('33.750');
    await expect(customer.getByLabel('Chi tiết thanh toán')).toContainText('191.250');
    await customer.getByRole('button', { name: /Đặt đơn & tiếp tục thanh toán cọc/ }).click();
    await expect(customer.locator('.summary-line').filter({ hasText: code })).toContainText(
      '25.000',
    );
    const id = new URL(customer.url()).pathname.split('/').pop()!;
    await customer.getByRole('button', { name: 'Tiếp tục thanh toán', exact: true }).click();
    await customer.getByRole('button', { name: 'Thanh toán mô phỏng', exact: true }).click();
    await manager.getByRole('link', { name: 'Soạn hàng', exact: true }).click();
    await manager
      .locator('.ops-card')
      .filter({ hasText: id.slice(0, 8).toUpperCase() })
      .getByRole('button', { name: 'Nhận soạn đơn này', exact: true })
      .click();
    await expect(manager.getByText(`Mã ${code} · Giảm 25.000 ₫`, { exact: true })).toBeVisible();
    await manager.getByLabel(`Mã hàng ${productName}`, { exact: true }).fill(`BAR-${stamp}`);
    await manager.getByRole('button', { name: 'Xác nhận món', exact: true }).click();
    await manager.getByRole('button', { name: 'Đã kiểm tra, sẵn sàng nhận', exact: true }).click();
    await expect(customer.getByTestId('pickup-token')).toHaveText(/.{32,}/);
    const token = await customer.getByTestId('pickup-token').textContent();
    await manager.getByRole('link', { name: 'Quầy nhận', exact: true }).click();
    await manager.getByLabel('Mã nhận hàng', { exact: true }).fill(token!);
    await manager.getByRole('button', { name: 'Kiểm tra đơn hàng', exact: true }).click();
    await expect(manager.locator('.summary-line').filter({ hasText: code })).toContainText(
      '25.000',
    );
    await manager.getByRole('button', { name: /Xác nhận đã thu 191\.250/ }).click();
    await manager.getByRole('button', { name: 'Xác nhận bàn giao hàng', exact: true }).click();
    await expect(
      manager.getByRole('heading', { name: 'Đã bàn giao thành công!', exact: true }),
    ).toBeVisible();
    await expect(
      customer.getByRole('heading', { name: 'Túi hàng đã đến tay bạn.', exact: true }),
    ).toBeVisible();
    await manager.getByRole('link', { name: 'Quản lý cửa hàng', exact: true }).click();
    await manager.getByRole('button', { name: 'Khuyến mãi', exact: true }).click();
    await expect(
      manager.locator('.promotion-list article').filter({ hasText: code }),
    ).toContainText('Đã dùng 1 · Đang giữ 0');
    expect(
      await customer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
    ).toBe(true);
    await customer.screenshot({ path: 'test-results/promotion-order-mobile.png', fullPage: true });
  } finally {
    await managerContext.close();
    await customerContext.close();
  }
});
