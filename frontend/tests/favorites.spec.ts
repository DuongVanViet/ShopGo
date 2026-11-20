import { expect, test } from '@playwright/test';

test('customers save a specific store offer, return to it, and remove it', async ({ page }) => {
  const stores = [
    {
      id: '72000000-0000-4000-a000-000000000001',
      name: 'ShopGo Trung tâm',
      address: '12 Nguyễn Huệ',
    },
    { id: '72000000-0000-4000-a000-000000000002', name: 'ShopGo Ven sông', address: '20 Lê Lợi' },
  ];
  const product = {
    id: '73000000-0000-4000-a000-000000000001',
    name: 'Cà rốt hữu cơ',
    code: 'CAROT-500',
    unit: 'pack',
    price: 20000,
    available: 5,
    sellable: true,
  };
  const offers = stores.map((store) => ({ ...product, store }));
  const saved = new Map<string, (typeof offers)[number]>();
  let signedInReads = 0;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const fulfill = (data: unknown) => route.fulfill({ json: { data } });
    if (path === '/categories' || path.endsWith('/categories')) return fulfill([]);
    if (path === '/products') return fulfill({ items: offers, nextCursor: null });
    if (path === '/auth/login') return fulfill({ accessToken: 'favorites-test' });
    if (path === '/me') {
      return fulfill({
        id: '74000000-0000-4000-a000-000000000001',
        displayName: 'Khách ShopGo',
        accountType: 'USER',
        memberships: [],
        ownedStores: [],
        isAdmin: false,
        canRefund: false,
      });
    }
    if (path === '/me/favorites') {
      expect(request.headers().authorization).toBe('Bearer favorites-test');
      signedInReads++;
      return fulfill([...saved.values()].reverse());
    }
    for (const offer of offers) {
      if (path === `/me/favorites/${offer.store.id}/${offer.id}`) {
        expect(request.headers().authorization).toBe('Bearer favorites-test');
        if (request.method() === 'PUT') saved.set(offer.store.id, offer);
        if (request.method() === 'DELETE') saved.delete(offer.store.id);
        return fulfill({ saved: saved.has(offer.store.id) });
      }
      if (path === `/stores/${offer.store.id}`) return fulfill(offer.store);
      if (path === `/stores/${offer.store.id}/products`)
        return fulfill({ items: [offer], nextCursor: null });
    }
    if (path === '/cart') {
      return fulfill({ storeId: url.searchParams.get('storeId'), version: 1, items: [] });
    }
    return route.fulfill({ status: 404, json: { error: { message: path } } });
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const headerLink = page.getByRole('banner').getByRole('link', { name: 'Yêu thích', exact: true });
  await expect(headerLink).toBeVisible();
  const cards = page.locator('.product-card');
  const first = cards.filter({ hasText: stores[0].name });
  const second = cards.filter({ hasText: stores[1].name });
  await first.getByRole('button', { name: 'Thêm vào yêu thích Cà rốt hữu cơ' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(signedInReads).toBe(0);

  await page.getByLabel('Số điện thoại hoặc email', { exact: true }).fill('favorites@example.test');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Favorites-passphrase!');
  await page.getByRole('button', { name: 'Đăng nhập tài khoản' }).click();
  await expect(page).toHaveURL(/\/$/);
  await second.getByRole('button', { name: 'Thêm vào yêu thích Cà rốt hữu cơ' }).click();
  await expect(second.getByRole('button', { name: 'Bỏ yêu thích Cà rốt hữu cơ' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(
    first.getByRole('button', { name: 'Thêm vào yêu thích Cà rốt hữu cơ' }),
  ).toHaveAttribute('aria-pressed', 'false');

  await headerLink.click();
  await expect(page).toHaveURL(/\/yeu-thich$/);
  await expect(page.getByRole('heading', { name: 'Sản phẩm yêu thích' })).toBeVisible();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText(stores[1].name);
  await page.getByRole('button', { name: 'Xem tại cửa hàng' }).click();
  await expect(page).toHaveURL(/q=CAROT-500&scope=store#san-pham$/);
  await expect(second.getByRole('button', { name: 'Bỏ yêu thích Cà rốt hữu cơ' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thêm Cà rốt hữu cơ', exact: true })).toBeVisible();
  await headerLink.click();
  await expect(cards).toHaveCount(1);
  await page.getByRole('button', { name: 'Bỏ yêu thích Cà rốt hữu cơ' }).click();
  await expect(page.getByRole('heading', { name: 'Bạn chưa lưu sản phẩm nào' })).toBeVisible();
  expect(saved.size).toBe(0);
});
