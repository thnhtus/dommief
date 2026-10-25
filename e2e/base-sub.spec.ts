import { expect, test } from '@playwright/test';

// Cùng nguồn build với `--base /sub/`: mọi asset/link/worker phải nằm dưới base (DM-403).
test('trang chủ dưới /sub/: asset, link, điều hướng đều có base', async ({ page }) => {
  const bad: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`); });
  await page.goto('/sub/');
  await expect(page.getByRole('heading', { level: 1, name: 'Hello Dommief' })).toBeVisible();
  const link = page.getByRole('main').getByRole('link', { name: 'get started' });
  await expect(link).toHaveAttribute('href', '/sub/guide/get-started');
  await link.click();
  await expect(page).toHaveURL(/\/sub\/guide\/get-started$/);
  const img = page.getByRole('img', { name: 'logo' });
  expect(await img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  expect(bad).toEqual([]);
});

test('search dưới /sub/ tải index đúng base', async ({ page }) => {
  await page.goto('/sub/');
  await page.getByRole('combobox', { name: 'Tìm kiếm' }).fill('Unique-marker');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.getByRole('option').first().click();
  await expect(page).toHaveURL(/\/sub\/guide\/get-started/);
});

test('ngoài base trả 404, không phục vụ shell', async ({ request }) => {
  const res = await request.get('/guide/get-started');
  expect(res.status()).toBe(404);
});
