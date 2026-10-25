import { expect, test } from '@playwright/test';

// Chạy trên build thật của examples/docs (base `/`). Mọi test đều fail nếu có lỗi console/hydrate.
test.beforeEach(({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // Document 404 thật (status 404) luôn sinh dòng "Failed to load resource" — hợp lệ, chỉ loại dòng đó.
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource.*404/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  // Gắn vào page để afterEach đọc.
  (page as unknown as { __errors: string[] }).__errors = errors;
});
test.afterEach(({ page }) => {
  expect((page as unknown as { __errors: string[] }).__errors, 'không có lỗi console/hydration').toEqual([]);
});

test('trang chủ prerender + hydrate: heading, bảng, code block', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1, name: 'Hello Dommief' })).toBeVisible();
  await expect(page.getByRole('table')).toBeVisible();
  await expect(page.locator('.dommief-code[data-lang="js"]')).toBeVisible();
  await expect(page).toHaveTitle(/Dommief Docs|Home/);
});

test('điều hướng client-side từ link markdown, không reload trang', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => { (window as unknown as { __marker: number }).__marker = 1; });
  await page.getByRole('main').getByRole('link', { name: 'get started' }).click();
  await expect(page).toHaveURL(/\/guide\/get-started$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Get started' })).toBeVisible();
  // window còn nguyên => SPA navigation, không full reload.
  expect(await page.evaluate(() => (window as unknown as { __marker?: number }).__marker)).toBe(1);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Hello Dommief' })).toBeVisible();
});

test('URL không dấu / cuối và có dấu / đều ra đúng trang (static-host parity)', async ({ page }) => {
  for (const url of ['/guide/get-started', '/guide/get-started/']) {
    await page.goto(url);
    await expect(page.getByRole('heading', { level: 1, name: 'Get started' })).toBeVisible();
  }
});

test('navbar + sidebar: aria-current đúng trang', async ({ page }) => {
  await page.goto('/guide/get-started');
  await expect(page.getByRole('navigation', { name: 'Main' }).locator('[aria-current="page"]')).toHaveText('Get started');
  await expect(page.getByRole('navigation', { name: 'Sidebar' }).locator('[aria-current="page"]')).toHaveText('Get started');
});

test('trang Get started: container, ảnh, demo, code thường', async ({ page }) => {
  await page.goto('/guide/get-started');
  await expect(page.getByText('Đây là container')).toBeVisible();
  await expect(page.getByText('plain code, not a demo')).toBeVisible();
  await expect(page.locator('.dommief-demo')).toBeVisible();
  // v1: demo hiển thị mã nguồn + thanh công cụ (chưa chạy live — Phase 6 cắt live-edit).
  await expect(page.locator('.dommief-demo__preview')).toContainText('demo-btn');
  await expect(page.getByRole('button', { name: 'View code' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible();
  const img = page.getByRole('img', { name: 'logo' });
  await expect(img).toBeVisible();
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
});

test('TOC: link anchor cuộn tới heading', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'On this page' }).getByRole('link', { name: 'Hello Dommief' }).click();
  await expect(page).toHaveURL(/#hello-dommief$/);
});

test('skip-link là phần tử focus đầu tiên và trỏ tới #main', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  const skip = page.locator('a.dm-skip');
  await expect(skip).toBeFocused();
  await expect(skip).toHaveAttribute('href', '#main');
  await expect(page.locator('main#main')).toHaveCount(1);
});

test('đổi giao diện sáng/tối: set attribute, lưu localStorage, giữ sau reload (không flash)', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await page.goto('/');
  const html = page.locator('html');
  await page.getByRole('button', { name: /giao diện/ }).click();
  await expect(html).toHaveAttribute('data-prefers-color', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('dommief:prefers-color'))).toBe('dark');
  await page.reload();
  // Boot script chạy trước React mount => attribute có ngay khi DOM parse xong.
  await expect(html).toHaveAttribute('data-prefers-color', 'dark');
  await expect(page.getByRole('button', { name: 'Chuyển sang giao diện sáng' })).toBeVisible();
  await page.getByRole('button', { name: 'Chuyển sang giao diện sáng' }).click();
  await expect(html).toHaveAttribute('data-prefers-color', 'light');
});

test('404: URL không tồn tại hiện trang 404 có link Home', async ({ page }) => {
  const res = await page.goto('/khong-ton-tai');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: '404' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText('/khong-ton-tai');
  await page.getByRole('main').getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Hello Dommief' })).toBeVisible();
});
