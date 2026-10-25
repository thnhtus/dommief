import { expect, test } from '@playwright/test';

// Viewport di động (Pixel 7): không tràn ngang, các điều khiển chính còn dùng được.
// Đo cả 320px (iPhone SE/màn nhỏ nhất còn phổ biến), không chỉ viewport của device: font khác
// nhau giữa macOS và Linux CI làm biên tràn khác nhau, test chỉ ở 412px là mong manh.
for (const width of [320, 412]) {
  test(`không tràn ngang ở ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const url of ['/', '/guide/get-started']) {
      await page.goto(url);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, url).toBeLessThanOrEqual(0);
      await expect(page.getByRole('button', { name: /giao diện/ })).toBeInViewport({ ratio: 1 });
    }
  });
}

test('search + đổi giao diện dùng được trên mobile', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('combobox', { name: 'Tìm kiếm' }).fill('Unique-marker');
  await expect(page.getByRole('option').first()).toBeVisible();
  await page.getByRole('option').first().tap();
  await expect(page).toHaveURL(/\/guide\/get-started/);
});
