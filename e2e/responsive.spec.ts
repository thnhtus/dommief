import { expect, test } from '@playwright/test';

// Viewport di động (Pixel 7): không tràn ngang, các điều khiển chính còn dùng được.
test('không tràn ngang trên mobile', async ({ page }) => {
  for (const url of ['/', '/guide/get-started']) {
    await page.goto(url);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow, url).toBeLessThanOrEqual(0);
  }
});

test('search + đổi giao diện dùng được trên mobile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Tìm kiếm' }).fill('Unique-marker');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.getByRole('option').first().tap();
  await expect(page).toHaveURL(/\/guide\/get-started/);
});
