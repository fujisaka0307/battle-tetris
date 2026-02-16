import { test, expect, createRoom, joinRoom } from './fixtures/setup';

test.describe('ルーム参加 — エラー系', () => {
  test('存在しないルームIDでエラーが表示されること', async ({ playerAPage }) => {
    await playerAPage.goto('/');
    await playerAPage.getByTestId('nickname-input').fill('Alice');
    await playerAPage.getByTestId('room-id-input').fill('ZZZZZZ');
    await playerAPage.getByTestId('join-room-btn').click();

    await expect(playerAPage.getByTestId('error-message')).toBeVisible({ timeout: 10000 });
  });

  test('満員ルームに3人目が参加しようとするとエラーが表示されること', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    const roomId = await createRoom(playerAPage, 'Alice');
    await joinRoom(playerBPage, 'Bob', roomId);

    // 3人目
    const context3 = await browser.newContext();
    const playerCPage = await context3.newPage();
    await playerCPage.goto('/');
    await playerCPage.getByTestId('nickname-input').fill('Charlie');
    await playerCPage.getByTestId('room-id-input').fill(roomId);
    await playerCPage.getByTestId('join-room-btn').click();

    await expect(playerCPage.getByTestId('error-message')).toBeVisible({ timeout: 10000 });

    await context3.close();
  });
});
