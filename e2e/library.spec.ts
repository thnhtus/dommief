import { expect, test } from '@playwright/test';

test('library /button render demo và source', async ({ page }) => {
  await page.goto('/button');
  await expect(page.getByText('Hello acme-ui')).toBeVisible();

  const viewCode = page.getByRole('button', { name: 'View code' }).first();
  await viewCode.click();
  await expect(page.getByText("import { Button } from 'acme-ui'")).toBeVisible();
});

test('library /button có bảng props với label', async ({ page }) => {
  await page.goto('/button');
  await expect(page.getByText('label')).toBeVisible();
});

test('library sidebar group button/card', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('link', { name: /button/i }).first()).toBeVisible();
  await expect(page.getByRole('link', { name: /card/i }).first()).toBeVisible();
});

test('library /card render bình thường', async ({ page }) => {
  await page.goto('/card');
  await expect(page.getByText('Hello')).toBeVisible();
});

test('library /guide render bình thường', async ({ page }) => {
  await page.goto('/guide');
  await expect(page.getByRole('heading', { level: 1, name: 'Getting Started' })).toBeVisible();
});
