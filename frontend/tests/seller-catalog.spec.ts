import { expect, test } from '@playwright/test';

test('seller creates a category and a detailed product without an admin account', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const store = {
    id: '10000000-0000-4000-a000-000000000001',
    code: 'SELLER-1',
    name: 'Cửa hàng của An',
    address: '25 Nguyễn Huệ, Phường Bến Nghé, TP.HCM',
    latitude: 10.7769,
    longitude: 106.7009,
  };
  const category = {
    id: '20000000-0000-4000-a000-000000000001',
    name: 'Trái cây tươi',
    slug: 'trai-cay-tuoi',
    ownerStoreId: store.id,
  };
  const categories: (typeof category)[] = [];
  const products: Record<string, unknown>[] = [];
  const productImageUrl = '/api/v1/media/products/50000000-0000-4000-a000-000000000001.png';
  const productImage = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  );
  let categoryRequest: { body: any; authorization?: string; idempotency?: string } | null = null;
  let productRequest: { body: any; authorization?: string; idempotency?: string } | null = null;
  let editRequest: { body: any; authorization?: string; idempotency?: string } | null = null;
  let writeOffRequest: { body: any; authorization?: string; idempotency?: string } | null = null;
  let imageRequest: { contentType?: string; body: string } | null = null;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname.replace('/api/v1', ''),
      method = request.method();
    const fulfill = (data: unknown, status = 200) => route.fulfill({ status, json: { data } });
    if (path === '/stores' && method === 'GET')
      return fulfill({ items: [store], nextCursor: null });
    if (path === '/auth/login' && method === 'POST')
      return fulfill({ accessToken: 'seller-test-token' });
    if (path === '/me' && method === 'GET')
      return fulfill({
        id: '30000000-0000-4000-a000-000000000001',
        displayName: store.name,
        phoneNormalized: '+84901234567',
        emailNormalized: 'seller@example.test',
        accountType: 'SELLER',
        isAdmin: false,
        canRefund: false,
        memberships: [{ storeId: store.id, role: 'MANAGER' }],
        ownedStores: [store],
      });
    if (path === `/stores/${store.id}/catalog/categories` && method === 'GET')
      return fulfill(categories);
    if (path === `/stores/${store.id}/catalog/categories` && method === 'POST') {
      categoryRequest = {
        body: request.postDataJSON(),
        authorization: request.headers().authorization,
        idempotency: request.headers()['idempotency-key'],
      };
      categories.push(category);
      return fulfill(category, 201);
    }
    if (path === `/stores/${store.id}/catalog/products` && method === 'GET') {
      const cursor = url.searchParams.get('cursor');
      const start = cursor ? products.findIndex((p) => p.id === cursor) + 1 : 0;
      const limit = Number(url.searchParams.get('limit'));
      const items = products.slice(start, start + limit);
      return fulfill({
        items,
        nextCursor: start + limit < products.length ? items.at(-1)?.id : null,
      });
    }
    if (path === `/stores/${store.id}/catalog/products` && method === 'POST') {
      const body = request.postDataJSON();
      productRequest = {
        body,
        authorization: request.headers().authorization,
        idempotency: request.headers()['idempotency-key'],
      };
      const product = {
        id: '40000000-0000-4000-a000-000000000001',
        productId: '50000000-0000-4000-a000-000000000001',
        skuId: '40000000-0000-4000-a000-000000000001',
        name: body.name,
        description: body.description,
        categoryId: body.categoryId,
        categoryName: category.name,
        code: body.sku.code,
        barcode: body.sku.barcode,
        unit: body.sku.unit,
        price: body.price,
        onHand: body.initialStock,
        reserved: 0,
        available: body.initialStock,
        active: true,
        expiresOn: body.expiresOn,
        version: 1,
        imageUrl: null,
      };
      products.push(product);
      return fulfill(product, 201);
    }
    if (
      path === `/stores/${store.id}/catalog/products/40000000-0000-4000-a000-000000000001` &&
      method === 'PATCH'
    ) {
      const body = request.postDataJSON();
      editRequest = {
        body,
        authorization: request.headers().authorization,
        idempotency: request.headers()['idempotency-key'],
      };
      Object.assign(products[0], {
        name: body.name,
        description: body.description,
        categoryId: body.categoryId,
        categoryName: category.name,
        code: body.sku.code,
        barcode: body.sku.barcode,
        unit: body.sku.unit,
        price: body.price,
        active: body.active,
        expiresOn: body.expiresOn,
        version: 2,
      });
      return fulfill(products[0]);
    }
    if (
      path === `/stores/${store.id}/inventory/40000000-0000-4000-a000-000000000001/write-offs` &&
      method === 'POST'
    ) {
      const body = request.postDataJSON();
      writeOffRequest = {
        body,
        authorization: request.headers().authorization,
        idempotency: request.headers()['idempotency-key'],
      };
      const product = products[0] as any;
      product.onHand -= body.quantity;
      product.available -= body.quantity;
      return fulfill(
        {
          storeId: store.id,
          skuId: product.skuId,
          onHand: product.onHand,
          reserved: product.reserved,
          available: product.available,
          version: 2,
        },
        201,
      );
    }
    if (
      path === `/stores/${store.id}/catalog/products/50000000-0000-4000-a000-000000000001/image` &&
      method === 'POST'
    ) {
      imageRequest = {
        contentType: request.headers()['content-type'],
        body: request.postDataBuffer()?.toString('latin1') ?? '',
      };
      products[0].imageUrl = productImageUrl;
      return fulfill({ imageUrl: productImageUrl }, 201);
    }
    if (path === productImageUrl.replace('/api/v1', '') && method === 'GET')
      return route.fulfill({ status: 200, contentType: 'image/png', body: productImage });
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
    if (path === '/cart' && method === 'GET')
      return fulfill({
        id: '60000000-0000-4000-a000-000000000001',
        storeId: store.id,
        version: 1,
        items: [],
      });
    return route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_MOCKED', message: `${method} ${path}` } },
    });
  });

  await page.goto('/login');
  await page.getByLabel('Số điện thoại hoặc email', { exact: true }).fill('seller@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('seller-password-value');
  await page.getByRole('button', { name: 'Đăng nhập tài khoản', exact: true }).click();
  await expect(page).toHaveURL(/\/quan-ly$/);
  await expect(
    page.getByRole('heading', { name: 'Danh mục & sản phẩm', exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel('Tên danh mục', { exact: true })).toHaveCount(0);
  await expect(page.getByLabel('Tên sản phẩm', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Quét QR', exact: true }).click();
  const qrDialog = page.getByRole('dialog', { name: 'Quét QR để tạo sản phẩm' });
  await expect(qrDialog.getByRole('button', { name: 'Quét bằng camera' })).toBeDisabled();
  await qrDialog
    .getByLabel('Chọn ảnh mã QR')
    .setInputFiles({ name: 'ma-qr.png', mimeType: 'image/png', buffer: productImage });
  await expect(qrDialog.getByRole('img', { name: 'Xem trước ảnh mã QR' })).toBeVisible();
  expect(productRequest).toBeNull();
  await page.screenshot({ path: 'test-results/seller-qr-mobile.png' });
  await qrDialog.getByRole('button', { name: 'Nhập thông tin thủ công' }).click();
  await expect(page.getByRole('dialog', { name: 'Tạo sản phẩm', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();

  await page.getByRole('button', { name: 'Tạo danh mục', exact: true }).click();
  await page.getByLabel('Tên danh mục', { exact: true }).fill(category.name);
  await page.getByRole('button', { name: 'Lưu danh mục', exact: true }).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await page.getByRole('button', { name: 'Tạo sản phẩm', exact: true }).click();
  await expect(page.getByRole('option', { name: category.name })).toHaveCount(1);
  await expect(page.getByLabel('Danh mục sản phẩm', { exact: true })).toHaveValue(category.id);
  expect(categoryRequest).toMatchObject({
    body: { name: category.name },
    authorization: 'Bearer seller-test-token',
  });
  expect(categoryRequest!.idempotency).toBeTruthy();

  await page.getByLabel('Tên sản phẩm', { exact: true }).fill('Táo xanh túi 500g');
  await page.getByLabel('Mã SKU', { exact: true }).fill('TAO-XANH-500');
  await page.getByLabel('Mã vạch (nếu có)', { exact: true }).fill('8930000000001');
  await page.getByLabel('Giá bán (VND)', { exact: true }).fill('45000');
  await page.getByLabel('Tồn ban đầu', { exact: true }).fill('12');
  const unit = page.getByRole('combobox', { name: 'Đơn vị bán' });
  await expect(unit).toBeVisible();
  await expect(unit.getByRole('option', { name: 'Thùng', exact: true })).toHaveCount(1);
  await expect(unit.getByRole('option', { name: 'Lốc', exact: true })).toHaveCount(1);
  await unit.selectOption({ label: 'Gói' });
  await page
    .getByLabel('Mô tả chi tiết', { exact: true })
    .fill('Táo giòn, đóng túi 500g và bảo quản mát.');
  await page.getByLabel('Ảnh sản phẩm', { exact: true }).setInputFiles({
    name: 'tao-xanh.png',
    mimeType: 'image/png',
    buffer: productImage,
  });
  await expect(
    page.getByRole('img', { name: 'Xem trước ảnh sản phẩm', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Thêm sản phẩm vào cửa hàng', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Táo xanh túi 500g' })).toBeVisible();
  const savedImage = page.getByRole('img', { name: 'Ảnh Táo xanh túi 500g', exact: true });
  await expect(savedImage).toBeVisible();
  await expect(savedImage).toHaveAttribute('src', productImageUrl);
  await expect(page.getByText('45.000 ₫', { exact: true })).toBeVisible();
  await expect(page.getByText('Tồn: 12', { exact: true })).toBeVisible();
  expect(productRequest).toMatchObject({
    authorization: 'Bearer seller-test-token',
    body: {
      name: 'Táo xanh túi 500g',
      categoryId: category.id,
      sku: {
        code: 'TAO-XANH-500',
        barcode: '8930000000001',
        name: 'Táo xanh túi 500g',
        unit: 'pack',
      },
      price: 45000,
      initialStock: 12,
    },
  });
  expect(productRequest!.idempotency).toBeTruthy();
  expect(imageRequest).toBeTruthy();
  expect(imageRequest!.contentType).toContain('multipart/form-data; boundary=');
  expect(imageRequest!.body).toContain('name="image"');
  expect(imageRequest!.body).toContain('filename="tao-xanh.png"');

  await page.getByRole('button', { name: 'Chỉnh sửa thuộc tính', exact: true }).click();
  const editDialog = page.getByRole('dialog', { name: 'Chỉnh sửa sản phẩm' });
  await expect(editDialog).toBeVisible();
  await editDialog.getByLabel('Tên sản phẩm', { exact: true }).fill('Táo xanh premium 500g');
  await editDialog.getByLabel('Mã SKU', { exact: true }).fill('TAO-XANH-500-MOI');
  await editDialog.getByLabel('Mã vạch', { exact: true }).fill('8930000000009');
  await editDialog.getByLabel('Giá bán mới (VND)', { exact: true }).fill('49000');
  await editDialog.locator('select[name="unit"]').selectOption('case');
  await editDialog.getByLabel('Hạn sử dụng gần nhất', { exact: true }).fill('2099-12-31');
  await editDialog
    .locator('textarea[name="description"]')
    .fill('Thông tin sản phẩm đã được manager cập nhật.');
  await editDialog.locator('input[name="active"]').uncheck();
  await editDialog.getByRole('button', { name: 'Lưu thay đổi', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Táo xanh premium 500g' })).toBeVisible();
  await expect(page.getByText('49.000 ₫', { exact: true })).toBeVisible();
  await expect(page.getByText('Đã tạm ngừng', { exact: true })).toBeVisible();
  await expect(page.getByText('Hạn 31/12/2099', { exact: true })).toBeVisible();
  expect(editRequest).toMatchObject({
    authorization: 'Bearer seller-test-token',
    body: {
      name: 'Táo xanh premium 500g',
      description: 'Thông tin sản phẩm đã được manager cập nhật.',
      categoryId: category.id,
      sku: {
        code: 'TAO-XANH-500-MOI',
        barcode: '8930000000009',
        name: 'Táo xanh premium 500g',
        unit: 'case',
      },
      price: 49000,
      active: false,
      expiresOn: '2099-12-31',
      expectedVersion: 1,
    },
  });
  expect(editRequest!.idempotency).toBeTruthy();

  await page.getByRole('button', { name: 'Loại hàng hỏng / hết hạn', exact: true }).click();
  const writeOffDialog = page.getByRole('dialog', { name: 'Loại hàng khỏi tồn kho' });
  await expect(writeOffDialog).toBeVisible();
  await expect(writeOffDialog.getByText('Có thể loại: 12', { exact: false })).toBeVisible();
  await writeOffDialog.locator('select[name="reason"]').selectOption('DAMAGED');
  await writeOffDialog.locator('input[name="quantity"]').fill('3');
  await writeOffDialog
    .locator('textarea[name="note"]')
    .fill('Ba thùng bị móp và rách khi vận chuyển.');
  await writeOffDialog.getByRole('button', { name: 'Xác nhận loại khỏi kho', exact: true }).click();
  await expect(writeOffDialog).toBeHidden();
  await expect(page.getByText('Tồn: 9', { exact: true })).toBeVisible();
  await expect(page.getByText('Có thể bán: 9', { exact: true })).toBeVisible();
  expect(writeOffRequest).toMatchObject({
    authorization: 'Bearer seller-test-token',
    body: {
      quantity: 3,
      reason: 'DAMAGED',
      note: 'Ba thùng bị móp và rách khi vận chuyển.',
    },
  });
  expect(writeOffRequest!.idempotency).toBeTruthy();
  const mobileLayout = await page.evaluate(() => ({
    viewportWidth: innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    overflowing: Array.from(document.querySelectorAll<HTMLElement>('body *'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: element.className,
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter(({ left, right }) => left < -1 || right > innerWidth + 1)
      .slice(0, 12),
  }));
  expect(
    mobileLayout.documentWidth,
    `Elements overflowing mobile viewport: ${JSON.stringify(mobileLayout.overflowing)}`,
  ).toBeLessThanOrEqual(mobileLayout.viewportWidth + 1);
  for (let index = 2; index <= 101; index++) {
    const id = crypto.randomUUID();
    products.push({ ...products[0], id, skuId: id, productId: id, name: `Mặt hàng số ${index}` });
  }
  await page.getByRole('button', { name: 'Tồn kho', exact: true }).click();
  await page.getByRole('button', { name: 'Danh mục & sản phẩm', exact: true }).click();
  await expect(page.locator('.seller-product-card')).toHaveCount(100);
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mặt hàng số 101' })).toBeVisible();
  await page.getByRole('button', { name: 'Trang trước', exact: true }).click();
  await expect(page.locator('.seller-product-card')).toHaveCount(100);
});
