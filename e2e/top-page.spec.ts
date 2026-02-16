import { test, expect, setupPlayer } from './fixtures/setup';

test.describe('トップページ', () => {
  test('タイトルが表示されること', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Battle Tetris')).toBeVisible();
  });

  test('トップページが表示されボタンが有効であること', async ({ page }) => {
    await setupPlayer(page);
    await expect(page.getByTestId('create-room-btn')).toBeEnabled();
    await expect(page.getByTestId('random-match-btn')).toBeEnabled();
  });
});
