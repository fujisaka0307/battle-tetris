import { test, expect, createRoom, joinRoom } from './fixtures/setup';

test.describe('Lobby — ルーム作成→参加→Ready フロー', () => {
  test('ルーム作成後にルームIDが表示されること', async ({ playerAPage }) => {
    const roomId = await createRoom(playerAPage, 'Alice');

    await expect(playerAPage.getByTestId('room-id')).toHaveText(roomId);
    await expect(playerAPage.getByTestId('waiting-text')).toBeVisible();
  });

  test('相手が参加するとOpponentJoinedが表示されること', async ({ playerAPage, playerBPage }) => {
    const roomId = await createRoom(playerAPage, 'Alice');
    await joinRoom(playerBPage, 'Bob', roomId);

    // Player A should see Bob's name
    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });
    // Player B should see Alice's name
    await expect(playerBPage.getByTestId('opponent-name')).toHaveText('Alice', { timeout: 5000 });
  });

  test('両者Readyでカウントダウンが開始されること', async ({ playerAPage, playerBPage }) => {
    const roomId = await createRoom(playerAPage, 'Alice');
    await joinRoom(playerBPage, 'Bob', roomId);

    // Wait for opponent joined
    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });

    // Both players click Ready
    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    // Countdown should appear for both
    await expect(playerAPage.getByTestId('countdown')).toBeVisible({ timeout: 5000 });
    await expect(playerBPage.getByTestId('countdown')).toBeVisible({ timeout: 5000 });
  });

  test('カウントダウン終了で対戦画面へ遷移すること', async ({ playerAPage, playerBPage }) => {
    const roomId = await createRoom(playerAPage, 'Alice');
    await joinRoom(playerBPage, 'Bob', roomId);

    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });

    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    // Wait for navigation to battle page
    await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/battle\//, { timeout: 10000 });

    // Canvas should be visible
    await expect(playerAPage.getByTestId('game-canvas')).toBeVisible();
    await expect(playerBPage.getByTestId('game-canvas')).toBeVisible();
  });
});
