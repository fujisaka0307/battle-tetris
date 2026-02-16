import { test, expect, createRoom, joinRoom } from './fixtures/setup';

test.describe('切断テスト', () => {
  test('退出ボタンでトップページへ戻ること', async ({ playerAPage, playerBPage }) => {
    const roomId = await createRoom(playerAPage);
    await joinRoom(playerBPage, roomId);

    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });

    // Player B leaves
    await playerBPage.getByTestId('leave-btn').click();

    // Player B should be on top page
    await playerBPage.waitForURL('/', { timeout: 5000 });
  });
});
