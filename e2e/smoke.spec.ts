import { test, expect } from './fixtures/setup';

test('トップページにゲームタイトルが表示されること', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Battle Tetris')).toBeVisible();
});

test('ヘルスチェックがOKを返すこと', async ({ request }) => {
  const response = await request.get('http://localhost:4000/health');
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.status).toBe('ok');
});
