import { test, expect } from '@playwright/test';

/**
 * 本番環境スモークテスト。
 * デプロイ後の動作確認として最低限のチェックを行う。
 */
test.describe('Production Smoke Tests', () => {
  test('フロントエンドが表示されること', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Battle Tetris')).toBeVisible({ timeout: 10000 });
  });

  test('ニックネーム入力UIが動作すること', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('nickname-input')).toBeVisible();
    await page.getByTestId('nickname-input').fill('SmokeTest');
    await expect(page.getByTestId('create-room-btn')).toBeEnabled();
  });

  test('バックエンドAPIのヘルスチェック', async ({ request }) => {
    const apiBaseUrl = process.env.API_BASE_URL || 'https://app-battle-tetris-prod.azurewebsites.net';
    const response = await request.get(`${apiBaseUrl}/health`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body).toHaveProperty('status', 'ok');
  });
});
