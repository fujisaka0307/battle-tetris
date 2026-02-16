import { test, expect, setupPlayer } from './fixtures/setup';

test.describe('トップページ — バリデーション', () => {
  test('トップページにEnterprise IDが表示されてボタンが有効であること', async ({ page }) => {
    await setupPlayer(page);
    await expect(page.getByTestId('create-room-btn')).toBeEnabled();
  });

  test('ルームID未入力で参加ボタンが無効であること', async ({ page }) => {
    await setupPlayer(page);
    await expect(page.getByTestId('join-room-btn')).toBeDisabled();
  });

  test('ルームID不正形式で参加ボタンが無効であること', async ({ page }) => {
    await setupPlayer(page);

    // 3桁 — 短すぎる
    await page.getByTestId('room-id-input').fill('ABC');
    await expect(page.getByTestId('join-room-btn')).toBeDisabled();

    // 記号含み
    await page.getByTestId('room-id-input').fill('ABC!@#');
    await expect(page.getByTestId('join-room-btn')).toBeDisabled();
  });

  test('ルームID6桁英数字で参加ボタンが有効であること', async ({ page }) => {
    await setupPlayer(page);
    await page.getByTestId('room-id-input').fill('ABC123');
    await expect(page.getByTestId('join-room-btn')).toBeEnabled();
  });
});
