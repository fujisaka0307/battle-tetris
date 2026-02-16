import {
  test,
  expect,
  createRoom,
  joinRoom,
  enterNickname,
  startBattleAndFinish,
  playToGameOver,
} from './fixtures/setup';

test.describe('完全ゲームサイクル', () => {
  test('ルーム作成→対戦→結果→トップ→再ルーム作成の完全フロー', async ({
    playerAPage,
    playerBPage,
  }) => {
    // Game 1: play to result
    await startBattleAndFinish(playerAPage, playerBPage);

    // Player A goes back to top
    await playerAPage.getByTestId('go-top-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });

    // Player B should also be navigated to top (opponent left)
    await playerBPage.waitForURL('/', { timeout: 10000 });

    // Player A creates a new room
    const newRoomId = await createRoom(playerAPage, 'Alice2');

    // Player B joins the new room
    await joinRoom(playerBPage, 'Bob2', newRoomId);

    // Verify both are in lobby
    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob2', { timeout: 5000 });
    await expect(playerBPage.getByTestId('opponent-name')).toHaveText('Alice2', { timeout: 5000 });
  });

  test('ランダムマッチ→対戦→結果→トップの完全フロー', async ({ playerAPage, playerBPage }) => {
    // Random match
    await enterNickname(playerAPage, 'Alice');
    await playerAPage.getByTestId('random-match-btn').click();

    await enterNickname(playerBPage, 'Bob');
    await playerBPage.getByTestId('random-match-btn').click();

    // Both should be in lobby
    await playerAPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    // Both ready
    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    // Battle
    await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/battle\//, { timeout: 10000 });

    // Game over
    await playToGameOver(playerAPage);
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });

    // Go top
    await playerAPage.getByTestId('go-top-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });
    await expect(playerAPage.getByTestId('nickname-input')).toBeVisible();
  });

  test('対戦後トップに戻りニックネーム入力が空であること', async ({
    playerAPage,
    playerBPage,
  }) => {
    await startBattleAndFinish(playerAPage, playerBPage);

    // Go to top
    await playerAPage.getByTestId('go-top-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });

    // Verify nickname input is empty (store was reset)
    await expect(playerAPage.getByTestId('nickname-input')).toHaveValue('');
  });
});
