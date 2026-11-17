import { expect, test } from '@playwright/test';

// DM-917: i18n trên trình duyệt thật — site dogfood dùng suffix mode (`.vi-VN`).
test('LangSwitch: en → vi giữ đúng trang, <html lang> + chuỗi theme đổi theo', async ({ page }) => {
  await page.goto('/guide/get-started');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-US');
  await expect(page.getByRole('combobox', { name: 'Search' })).toBeVisible();
  const lang = page.getByRole('navigation', { name: 'Language' });
  await lang.getByRole('link', { name: 'Tiếng Việt' }).click();
  await expect(page).toHaveURL(/\/guide\/get-started\.vi-VN$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Bắt đầu' })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Tìm kiếm' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Ngôn ngữ' }).getByRole('link', { name: 'Tiếng Việt' })).toHaveAttribute('aria-current', 'true');
});

test('link .md trong trang vi trỏ bản vi', async ({ page }) => {
  await page.goto('/.vi-VN');
  await page.locator('main a[href$="get-started.vi-VN"], main a[href$="getStarted.md"]').first().click();
  await expect(page).toHaveURL(/\/guide\/get-started\.vi-VN$/);
});

test('search trên trang vi chỉ trả kết quả vi', async ({ page }) => {
  await page.goto('/guide/get-started.vi-VN');
  // Tìm theo từ có trong bản vi (không có trong en) để chứng minh index vi tách biệt.
  await page.getByRole('combobox', { name: 'Tìm kiếm' }).fill('Unique-marker');
  await expect(page.getByRole('option').first()).toBeVisible();
  await expect(page.getByRole('group').first()).toContainText('Bắt đầu');
});

test.describe('không JS', () => {
  test.use({ javaScriptEnabled: false });
  test('LangSwitch là link thật, chạy được khi tắt JS', async ({ page }) => {
    await page.goto('/guide/get-started');
    await page.getByRole('navigation', { name: 'Language' }).getByRole('link', { name: 'Tiếng Việt' }).click();
    await expect(page).toHaveURL(/\/guide\/get-started\.vi-VN$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'vi-VN');
  });
});
