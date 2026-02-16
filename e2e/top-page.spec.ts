import { test, expect } from './fixtures/setup';

test.describe('トップページ', () => {
  test('タイトルが表示されること', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Battle Tetris')).toBeVisible();
  });

  test('ニックネーム入力フォームが表示されること', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('nickname-input')).toBeVisible();
  });

  test('ニックネーム未入力でボタンが無効化されること', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('create-room-btn')).toBeDisabled();
    await expect(page.getByTestId('random-match-btn')).toBeDisabled();
  });

  test('ニックネーム入力でボタンが有効化されること', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nickname-input').fill('Alice');
    await expect(page.getByTestId('create-room-btn')).toBeEnabled();
    await expect(page.getByTestId('random-match-btn')).toBeEnabled();
  });
});
