import { expect, test, type Page, type Route } from '@playwright/test';
import { choosePickupStore } from './store-picker';

const store = {
  id: '91000000-0000-4000-a000-000000000001',
  code: 'DEPOSIT-STORE',
  name: 'Cửa hàng đặt cọc ShopGo',
  address: '15 Nguyễn Trãi, Hà Nội',
  latitude: 21.0285,
  longitude: 105.8542,
};
const customerId = '92000000-0000-4000-a000-000000000001';
const counterId = '92000000-0000-4000-a000-000000000002';
const cartId = '93000000-0000-4000-a000-000000000001';
const skuId = '94000000-0000-4000-a000-000000000001';
const slotId = '95000000-0000-4000-a000-000000000001';
const quoteId = '96000000-0000-4000-a000-000000000001';
const orderId = '97000000-0000-4000-a000-000000000001';
const attemptId = '98000000-0000-4000-a000-000000000001';
const pickupToken = 'pickup-token-that-is-at-least-thirty-two-characters-long';
const total = 10_001;
const deposit = 1_501;
const remaining = 8_500;
const startsAt = '2026-11-16T02:00:00.000Z';
const endsAt = '2026-11-16T03:00:00.000Z';

const customer = {
  id: customerId,
  displayName: 'Khách đặt cọc',
  phoneNormalized: '+84901111111',
  emailNormalized: 'deposit-customer@example.test',
  accountType: 'USER' as const,
  isAdmin: false,
  canRefund: false,
  memberships: [],
  ownedStores: [],
};

const counter = {
  id: counterId,
  displayName: 'Nhân viên quầy',
  phoneNormalized: '+84902222222',
  emailNormalized: 'deposit-counter@example.test',
  accountType: 'STAFF' as const,
  isAdmin: false,
  canRefund: false,
  memberships: [{ storeId: store.id, role: 'COUNTER' as const }],
  ownedStores: [],
};

const slot = {
  id: slotId,
  startsAt,
  endsAt,
  capacity: 20,
  allocatedCount: 1,
  available: 19,
  version: 1,
};

const quote = {
  id: quoteId,
  cartVersion: 4,
  expiresAt: '2099-11-16T02:00:00.000Z',
  totals: { subtotal: total, discount: 0, fee: 0, total },
  paymentPlan: 'DEPOSIT_15',
  depositPercent: 15,
  depositAmount: deposit,
  amountDueNow: deposit,
  remainingAmount: remaining,
  paymentOptions: [
    {
      paymentMethod: 'ONLINE',
      paymentPlan: 'FULL_ONLINE',
      depositPercent: 0,
      depositAmount: 0,
      amountDueNow: total,
      remainingAmount: 0,
    },
    {
      paymentMethod: 'PAY_AT_PICKUP',
      paymentPlan: 'DEPOSIT_15',
      depositPercent: 15,
      depositAmount: deposit,
      amountDueNow: deposit,
      remainingAmount: remaining,
    },
  ],
};

function depositOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    code: 'SG-DEPOSIT-0001',
    storeId: store.id,
    userId: customerId,
    status: 'PENDING_PAYMENT',
    paymentStatus: 'PENDING',
    paymentMethod: 'PAY_AT_PICKUP',
    paymentPlan: 'DEPOSIT_15',
    depositPercent: 15,
    depositAmount: deposit,
    amountDueNow: deposit,
    remainingAmount: remaining,
    amountPaid: 0,
    amountRemaining: total,
    total,
    subtotal: total,
    discount: 0,
    fee: 0,
    version: 1,
    createdAt: '2026-11-15T02:00:00.000Z',
    expiresAt: '2099-11-16T02:00:00.000Z',
    items: [
      {
        id: '99000000-0000-4000-a000-000000000001',
        skuId,
        skuCode: 'SKU-DEPOSIT',
        name: 'Sản phẩm kiểm thử đặt cọc',
        quantity: 1,
        pickedQuantity: 0,
        unitPrice: total,
        lineTotal: total,
        barcode: '8930000000001',
      },
    ],
    slot,
    store,
    timeline: [],
    refunds: [],
    ...overrides,
  };
}

function fulfill(route: Route, data: unknown, status = 200) {
  return route.fulfill({ status, json: { data } });
}

async function login(page: Page, identifier: string) {
  await page.goto('/login');
  await page.getByLabel('Số điện thoại hoặc email', { exact: true }).fill(identifier);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('Deposit-flow-passphrase!');
  await page.getByRole('button', { name: 'Đăng nhập tài khoản', exact: true }).click();
}

test('customer defaults to the rounded 15% deposit, can choose full online, and confirms sandbox payment', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  let currentOrder = depositOrder();
  let quoteRequests = 0;
  let orderRequest:
    | { body: Record<string, unknown>; authorization?: string; idempotency?: string }
    | undefined;
  let attemptRequest:
    | { body: Record<string, unknown>; authorization?: string; idempotency?: string }
    | undefined;
  let confirmRequest:
    | { body: Record<string, unknown>; authorization?: string; idempotency?: string; path: string }
    | undefined;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();

    if (path === '/stores' && method === 'GET')
      return fulfill(route, { items: [store], nextCursor: null });
    if (path === '/products' && method === 'GET')
      return fulfill(route, { items: [], nextCursor: null });
    if (path === '/categories' && method === 'GET') return fulfill(route, []);
    if (path === '/auth/login' && method === 'POST')
      return fulfill(route, { accessToken: `${customerId}-token` });
    if (path === '/me' && method === 'GET') return fulfill(route, customer);
    if (path === '/cart' && method === 'GET')
      return fulfill(route, {
        id: cartId,
        storeId: store.id,
        version: 4,
        items: [
          {
            skuId,
            name: 'Sản phẩm kiểm thử đặt cọc',
            code: 'SKU-DEPOSIT',
            price: total,
            quantity: 1,
            available: 10,
          },
        ],
      });
    if (path === `/stores/${store.id}/slots` && method === 'GET') return fulfill(route, [slot]);
    if (path === '/checkout/quotes' && method === 'POST') {
      quoteRequests++;
      return fulfill(
        route,
        quoteRequests === 1 ? { ...quote, expiresAt: new Date(0).toISOString() } : quote,
        201,
      );
    }
    if (path === '/orders' && method === 'POST') {
      orderRequest = {
        body: request.postDataJSON(),
        authorization: request.headers().authorization,
        idempotency: request.headers()['idempotency-key'],
      };
      return fulfill(route, currentOrder, 201);
    }
    if (path === `/orders/${orderId}` && method === 'GET') return fulfill(route, currentOrder);
    if (path === `/orders/${orderId}/payment-attempts` && method === 'POST') {
      attemptRequest = {
        body: request.postDataJSON(),
        authorization: request.headers().authorization,
        idempotency: request.headers()['idempotency-key'],
      };
      return fulfill(
        route,
        {
          id: attemptId,
          provider: 'sandbox',
          providerReference: 'sandbox-deposit-reference',
          amount: deposit,
          status: 'PENDING',
          sandbox: true,
          instructions: 'Mô phỏng thanh toán local, không thu tiền thật.',
        },
        201,
      );
    }
    if (
      path === `/orders/${orderId}/payment-attempts/${attemptId}/confirm-sandbox` &&
      method === 'POST'
    ) {
      confirmRequest = {
        body: request.postDataJSON(),
        authorization: request.headers().authorization,
        idempotency: request.headers()['idempotency-key'],
        path,
      };
      currentOrder = depositOrder({
        status: 'CONFIRMED',
        paymentStatus: 'PARTIALLY_PAID',
        amountPaid: deposit,
        amountRemaining: remaining,
        version: 2,
        timeline: [
          {
            fromStatus: 'PENDING_PAYMENT',
            toStatus: 'CONFIRMED',
            reason: 'Thanh toán cọc thành công',
            createdAt: '2026-11-15T02:01:00.000Z',
          },
        ],
      });
      return fulfill(route, currentOrder);
    }
    return route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_MOCKED', message: `${method} ${path}` } },
    });
  });

  await login(page, customer.emailNormalized);
  await expect(page).toHaveURL(/\/$/);
  await choosePickupStore(page, store.name);
  await page.getByRole('link', { name: /Giỏ hàng/ }).click();
  await page.getByRole('link', { name: 'Tiếp tục đặt hàng', exact: true }).click();
  await expect(page.getByText('Sản phẩm kiểm thử đặt cọc', { exact: true })).toBeVisible();

  await page.getByRole('radio', { name: /Còn 19 suất/ }).check();
  await expect(page.locator('.retail-slot-option small')).toHaveText(/16[\/-]11[\/-]2026/);
  await expect(page.getByRole('radio', { name: /Đặt cọc 15% online/ })).toBeChecked();
  await page.getByRole('button', { name: /Xem tổng thanh toán/ }).click();
  await expect(
    page.getByRole('button', { name: /Đặt đơn & tiếp tục thanh toán cọc/ }),
  ).toBeDisabled();
  await page.getByRole('button', { name: 'Cập nhật báo giá' }).click();
  await expect(
    page.getByRole('button', { name: /Đặt đơn & tiếp tục thanh toán cọc/ }),
  ).toBeEnabled();

  const breakdown = page.getByLabel('Chi tiết thanh toán');
  await expect(breakdown.getByText('Thanh toán cọc online (15%)', { exact: true })).toBeVisible();
  await expect(breakdown.getByText(/1\.501/)).toBeVisible();
  await expect(breakdown.getByText('Còn lại tại quầy', { exact: true })).toBeVisible();
  await expect(breakdown.getByText(/8\.500/)).toBeVisible();

  await page.getByRole('radio', { name: /Thanh toán toàn bộ online/ }).check();
  await expect(breakdown.getByText('Thanh toán online ngay', { exact: true })).toBeVisible();
  await expect(breakdown.getByText(/10\.001/)).toBeVisible();
  await expect(breakdown.getByText(/^0/)).toBeVisible();

  await page.getByRole('radio', { name: /Đặt cọc 15% online/ }).check();
  await page.getByRole('button', { name: /Đặt đơn & tiếp tục thanh toán cọc/ }).click();
  await expect(page).toHaveURL(new RegExp(`/don-hang/${orderId}$`));
  expect(orderRequest).toMatchObject({
    body: { quoteId, paymentMethod: 'PAY_AT_PICKUP', expectedCartVersion: 4 },
    authorization: `Bearer ${customerId}-token`,
  });
  expect(orderRequest?.idempotency).toBeTruthy();
  expect(orderRequest?.body).not.toHaveProperty('depositAmount');
  expect(orderRequest?.body).not.toHaveProperty('amountDueNow');

  await expect(page.getByText('Cần thanh toán ngay', { exact: true })).toBeVisible();
  await expect(page.getByText(/1\.501/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Tiếp tục thanh toán', exact: true }).click();
  expect(attemptRequest).toMatchObject({
    body: { expectedVersion: 1 },
    authorization: `Bearer ${customerId}-token`,
  });
  expect(attemptRequest?.idempotency).toBeTruthy();
  await expect(page.getByText(/chỉ mô phỏng thanh toán, không thu tiền thật/i)).toBeVisible();

  await page.getByRole('button', { name: 'Thanh toán mô phỏng', exact: true }).click();
  expect(confirmRequest).toMatchObject({
    body: { expectedVersion: 1 },
    authorization: `Bearer ${customerId}-token`,
    path: `/orders/${orderId}/payment-attempts/${attemptId}/confirm-sandbox`,
  });
  expect(confirmRequest?.idempotency).toBeTruthy();
  await expect(page.getByText('Đã thanh toán cọc', { exact: true })).toBeVisible();
  const fulfillment = page.locator('.retail-order-fulfillment-card');
  await expect(fulfillment).toBeVisible();
  await expect(fulfillment.getByRole('radio', { name: /Đến cửa hàng lấy/ })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(fulfillment.getByRole('button', { name: /Đặt ship giao tận nơi/ })).toBeDisabled();
  await expect(fulfillment.getByText('Sắp ra mắt', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Tiếp tục thanh toán', exact: true })).toHaveCount(
    0,
  );

  currentOrder = depositOrder({
    status: 'READY',
    paymentStatus: 'PAID',
    amountPaid: total,
    amountRemaining: 0,
  });
  await page.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).click();
  await expect(page.getByLabel('Chi tiết tiền cọc').getByText(/^0\s*₫$/)).toBeVisible();
  await expect(fulfillment).toContainText('Bạn không cần thanh toán thêm tại quầy.');
  currentOrder = depositOrder({
    status: 'CONFIRMED',
    paymentStatus: 'PAID',
    paymentMethod: 'ONLINE',
    paymentPlan: 'FULL_ONLINE',
    depositPercent: 0,
    depositAmount: 0,
    amountDueNow: 0,
    remainingAmount: 0,
    amountPaid: total,
    amountRemaining: 0,
    version: 3,
  });
  await page.getByRole('button', { name: 'Cập nhật trạng thái', exact: true }).click();
  const fullPaymentFulfillment = page.locator('.retail-order-fulfillment-card');
  await expect(fullPaymentFulfillment).toBeVisible();
  await expect(fullPaymentFulfillment).toContainText('Bạn không cần thanh toán thêm tại quầy.');
  await expect(
    fullPaymentFulfillment.getByRole('button', { name: /Đặt ship giao tận nơi/ }),
  ).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  );
});

test('counter collects only the exact remaining balance after the 15% deposit', async ({
  page,
}) => {
  let currentOrder = depositOrder({
    status: 'READY',
    paymentStatus: 'PARTIALLY_PAID',
    amountPaid: deposit,
    amountRemaining: remaining,
    version: 7,
    items: [
      {
        id: '99000000-0000-4000-a000-000000000001',
        skuId,
        skuCode: 'SKU-DEPOSIT',
        name: 'Sản phẩm kiểm thử đặt cọc',
        quantity: 1,
        pickedQuantity: 1,
        unitPrice: total,
        lineTotal: total,
        barcode: '8930000000001',
      },
    ],
  });
  let collectionRequest:
    | { body: Record<string, unknown>; authorization?: string; idempotency?: string }
    | undefined;

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const method = request.method();

    if (path === '/stores' && method === 'GET')
      return fulfill(route, { items: [store], nextCursor: null });
    if (path === '/products' && method === 'GET')
      return fulfill(route, { items: [], nextCursor: null });
    if (path === '/categories' && method === 'GET') return fulfill(route, []);
    if (path === '/auth/login' && method === 'POST')
      return fulfill(route, { accessToken: `${counterId}-token` });
    if (path === '/me' && method === 'GET') return fulfill(route, counter);
    if (path === `/stores/${store.id}` && method === 'GET') return fulfill(route, store);
    if (path === '/cart' && method === 'GET')
      return fulfill(route, { id: cartId, storeId: store.id, version: 1, items: [] });
    if (path === `/stores/${store.id}/pickup/lookup` && method === 'POST')
      return fulfill(route, currentOrder, 201);
    if (path === `/stores/${store.id}/orders/${orderId}/collections` && method === 'POST') {
      collectionRequest = {
        body: request.postDataJSON(),
        authorization: request.headers().authorization,
        idempotency: request.headers()['idempotency-key'],
      };
      currentOrder = depositOrder({
        status: 'READY',
        paymentStatus: 'PAID',
        amountPaid: total,
        amountRemaining: 0,
        version: 8,
      });
      return fulfill(route, currentOrder, 201);
    }
    return route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_MOCKED', message: `${method} ${path}` } },
    });
  });

  await login(page, counter.emailNormalized);
  await expect(page).toHaveURL(/\/nhan-hang$/);
  await page.getByLabel('Mã nhận hàng', { exact: true }).fill(pickupToken);
  await page.getByRole('button', { name: 'Kiểm tra đơn hàng', exact: true }).click();

  await expect(page.getByLabel('Đối soát tiền cọc')).toContainText('Đã đặt cọc online (15%)');
  await expect(page.getByLabel('Đối soát tiền cọc')).toContainText(/1\.501/);
  await expect(page.getByLabel('Đối soát tiền cọc')).toContainText(/8\.500/);
  const collect = page.getByRole('button', { name: /Xác nhận đã thu 8\.500/ });
  await expect(collect).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Xác nhận bàn giao hàng', exact: true }),
  ).toBeDisabled();
  await collect.click();

  expect(collectionRequest).toMatchObject({
    body: {
      expectedVersion: 7,
      amount: remaining,
      method: 'CASH',
    },
    authorization: `Bearer ${counterId}-token`,
  });
  expect(collectionRequest?.body.shiftReference).toBeTruthy();
  expect(collectionRequest?.idempotency).toBeTruthy();
  await expect(page.getByText('Đã ghi nhận đủ tiền cho đơn này.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Xác nhận đã thu/ })).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Xác nhận bàn giao hàng', exact: true }),
  ).toBeEnabled();
});
