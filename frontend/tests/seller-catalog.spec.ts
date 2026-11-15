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
    if (path === `/stores/${store.id}/catalog/products` && method === 'GET')
      return fulfill({ items: products, nextCursor: null });
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
        version: 1,
        imageUrl: null,
      };
      products.push(product);
      return fulfill(product, 201);
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
    page.getByRole('heading', { name: 'Đưa sản phẩm đầu tiên lên ShopGo.' }),
  ).toBeVisible();

  await page.getByLabel('Tên danh mục', { exact: true }).fill(category.name);
  await page.getByRole('button', { name: 'Tạo danh mục', exact: true }).click();
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
});
