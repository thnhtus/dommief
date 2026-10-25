import { expect, test } from '@playwright/test';

// DM-802/803 trên trình duyệt thật: Web Worker lazy, MiniSearch, combobox a11y, bàn phím.
test('chưa gõ thì không tải worker/index; gõ lần đầu mới lazy-load', async ({ page }) => {
  const reqs: string[] = [];
  page.on('request', (r) => reqs.push(r.url()));
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  expect(reqs.filter((u) => /search-index/.test(u))).toEqual([]);
  await page.getByRole('combobox', { name: 'Tìm kiếm' }).fill('unique');
  await expect(page.getByRole('listbox')).toBeVisible();
  expect(reqs.some((u) => /search-index/.test(u))).toBe(true);
});

test('tìm "marker" ra kết quả ở trang Get started, bấm vào điều hướng đúng', async ({ page }) => {
  await page.goto('/');
  const box = page.getByRole('combobox', { name: 'Tìm kiếm' });
  await box.fill('Unique-marker');
  const option = page.getByRole('option').first();
  await expect(option).toBeVisible();
  await expect(page.getByRole('group')).toContainText('Get started');
  await expect(box).toHaveAttribute('aria-expanded', 'true');
  await expect(box).toHaveAttribute('aria-controls', /.+/);
  await option.click();
  await expect(page).toHaveURL(/\/guide\/get-started/);
  await expect(box).toHaveValue('');
  await expect(page.getByRole('listbox')).toHaveCount(0);
});

test('bàn phím: ArrowDown chọn, Enter điều hướng, Escape đóng', async ({ page }) => {
  await page.goto('/');
  const box = page.getByRole('combobox', { name: 'Tìm kiếm' });
  await box.fill('Unique-marker');
  await expect(page.getByRole('listbox')).toBeVisible();
  await box.press('ArrowDown');
  const active = await box.getAttribute('aria-activedescendant');
  expect(active).toBeTruthy();
  await expect(page.locator(`#${active}`)).toHaveAttribute('aria-selected', 'true');
  await box.press('Escape');
  await expect(page.getByRole('listbox')).toHaveCount(0);
  await expect(box).toBeFocused();
  await box.press('ArrowDown');
  await expect(page.getByRole('listbox')).toBeVisible();
  await box.press('Enter');
  await expect(page).toHaveURL(/\/guide\/get-started/);
});

test('không có kết quả: thông báo aria-live, không có listbox', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Tìm kiếm' }).fill('zzzzqqqqxxxx');
  await expect(page.getByText('Không tìm thấy kết quả')).toBeVisible();
  await expect(page.getByRole('listbox')).toHaveCount(0);
});
