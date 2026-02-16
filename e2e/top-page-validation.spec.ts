import { test, expect } from './fixtures/setup';

test.describe('トップページ — ニックネームバリデーション', () => {
  test('ニックネーム1文字でボタンが有効になること', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nickname-input').fill('A');
    await expect(page.getByTestId('create-room-btn')).toBeEnabled();
    await expect(page.getByTestId('random-match-btn')).toBeEnabled();
  });

  test('ニックネーム16文字でボタンが有効になること', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nickname-input').fill('A'.repeat(16));
    await expect(page.getByTestId('create-room-btn')).toBeEnabled();
    await expect(page.getByTestId('random-match-btn')).toBeEnabled();
  });

  test('ニックネーム17文字でエラーが表示されること', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nickname-input').fill('A'.repeat(17));
    await expect(page.getByTestId('nickname-error')).toBeVisible();
    await expect(page.getByTestId('create-room-btn')).toBeDisabled();
  });

  test('空白のみでボタンが無効であること', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nickname-input').fill('   ');
    await expect(page.getByTestId('create-room-btn')).toBeDisabled();
    await expect(page.getByTestId('random-match-btn')).toBeDisabled();
  });
});

test.describe('トップページ — ルームID参加バリデーション', () => {
  test('ルームID未入力で参加ボタンが無効であること', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nickname-input').fill('Alice');
    await expect(page.getByTestId('join-room-btn')).toBeDisabled();
  });

  test('ルームID不正形式で参加ボタンが無効であること', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nickname-input').fill('Alice');

    // 3桁 — 短すぎる
    await page.getByTestId('room-id-input').fill('ABC');
    await expect(page.getByTestId('join-room-btn')).toBeDisabled();

    // 記号含み
    await page.getByTestId('room-id-input').fill('ABC!@#');
    await expect(page.getByTestId('join-room-btn')).toBeDisabled();
  });

  test('ルームID6桁英数字で参加ボタンが有効であること', async ({ page }) => {
    await page.goto('/');
    await page.getByTestId('nickname-input').fill('Alice');
    await page.getByTestId('room-id-input').fill('ABC123');
    await expect(page.getByTestId('join-room-btn')).toBeEnabled();
  });
});
