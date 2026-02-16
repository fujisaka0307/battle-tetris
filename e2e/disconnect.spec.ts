import { test, expect, createRoom, joinRoom } from './fixtures/setup';

test.describe('切断テスト', () => {
  test('退出ボタンでトップページへ戻ること', async ({ playerAPage, playerBPage }) => {
    const roomId = await createRoom(playerAPage, 'Alice');
    await joinRoom(playerBPage, 'Bob', roomId);

    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });

    // Player B leaves
    await playerBPage.getByTestId('leave-btn').click();

    // Player B should be on top page
    await playerBPage.waitForURL('/', { timeout: 5000 });
  });
});
