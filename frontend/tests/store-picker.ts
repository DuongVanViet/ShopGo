import type { Page } from '@playwright/test';

export function pickupStoreButton(page: Page) {
  return page
    .getByTestId('customer-store-select')
    .getByRole('button', { name: /^(Chọn|Đổi) cửa hàng$/ });
}

export async function choosePickupStore(page: Page, name: string) {
  await pickupStoreButton(page).click();
  const dialog = page.getByRole('dialog', { name: /^(Chọn|Đổi) cửa hàng$/ });
  await dialog.getByRole('searchbox', { name: 'Tìm theo tên hoặc địa chỉ' }).fill(name);
  await dialog
    .getByRole('list', { name: 'Kết quả tìm cửa hàng' })
    .getByRole('button')
    .filter({ has: page.getByText(name, { exact: true }) })
    .click();
}
