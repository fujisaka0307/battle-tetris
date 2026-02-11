import { test, expect, createRoom, enterNickname } from './fixtures/setup';

test.describe('Lobby UI — ロビーUI詳細', () => {
  test('ルームIDの横にCopyボタンが表示されること', async ({ playerAPage }) => {
    await createRoom(playerAPage, 'Alice');

    await expect(playerAPage.getByTestId('copy-btn')).toBeVisible();
  });

  test('退出ボタンでトップページに戻ること', async ({ playerAPage }) => {
    await createRoom(playerAPage, 'Alice');

    await playerAPage.getByTestId('leave-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });
    await expect(playerAPage.getByTestId('nickname-input')).toBeVisible();
  });

  test('ランダムマッチ→Ready→対戦画面の完全フロー', async ({ playerAPage, playerBPage }) => {
    // Player A requests random match
    await enterNickname(playerAPage, 'Alice');
    await playerAPage.getByTestId('random-match-btn').click();

    // Player B requests random match
    await enterNickname(playerBPage, 'Bob');
    await playerBPage.getByTestId('random-match-btn').click();

    // Both should be navigated to lobby
    await playerAPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    // Both should see each other
    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });
    await expect(playerBPage.getByTestId('opponent-name')).toHaveText('Alice', { timeout: 5000 });

    // Both players click Ready
    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    // Should navigate to battle
    await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/battle\//, { timeout: 10000 });

    // Verify battle screen
    await expect(playerAPage.getByTestId('game-canvas')).toBeVisible();
    await expect(playerBPage.getByTestId('game-canvas')).toBeVisible();
  });
});
