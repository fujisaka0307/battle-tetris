import { test, expect } from '@playwright/test';

/**
 * 本番環境スモークテスト。
 * デプロイ後の動作確認として最低限のチェックを行う。
 */
test.describe('本番スモークテスト', () => {
  test('フロントエンドが表示されること', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Battle Tetris')).toBeVisible({ timeout: 10000 });
  });

  test('トップページUIが動作すること', async ({ page }) => {
    await page.goto('/');
    // Handle test login if shown (SKIP_AUTH mode)
    const testLoginBtn = page.getByTestId('test-login-btn');
    if (await testLoginBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await testLoginBtn.click();
    }
    await expect(page.getByTestId('create-room-btn')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('create-room-btn')).toBeEnabled();
  });

  test('バックエンドAPIのヘルスチェック', async ({ request }) => {
    const apiBaseUrl = process.env.API_BASE_URL || 'https://app-battle-tetris-dev.azurewebsites.net';
    const response = await request.get(`${apiBaseUrl}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
  });
});
