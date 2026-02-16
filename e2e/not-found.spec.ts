import { test, expect } from './fixtures/setup';

test.describe('404 — ページ未検出', () => {
  test('存在しないURLで404が表示されること', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByText('ページが見つかりません')).toBeVisible();
  });

  test('トップへ戻るボタンでトップページへ遷移すること', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await page.getByTestId('go-home-btn').click();
    await page.waitForURL('/', { timeout: 5000 });
    await expect(page.getByTestId('create-room-btn')).toBeVisible();
  });
});
