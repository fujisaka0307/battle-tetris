import { test, expect } from '@playwright/test';

test('top page displays game title', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Battle Tetris')).toBeVisible();
});

test('health check returns ok', async ({ request }) => {
  const response = await request.get('http://localhost:4000/health');
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.status).toBe('ok');
});
