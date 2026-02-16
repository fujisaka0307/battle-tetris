import { test, expect, createRoom } from './fixtures/setup';

test.describe('ロビーUI詳細', () => {
  test('ルームIDの横にCopyボタンが表示されること', async ({ playerAPage }) => {
    await createRoom(playerAPage);

    await expect(playerAPage.getByTestId('copy-btn')).toBeVisible();
  });

  test('退出ボタンでトップページに戻ること', async ({ playerAPage }) => {
    await createRoom(playerAPage);

    await playerAPage.getByTestId('leave-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });
    await expect(playerAPage.getByTestId('create-room-btn')).toBeVisible();
  });

});
