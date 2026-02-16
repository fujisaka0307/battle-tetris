import {
  test,
  expect,
  createRoom,
  joinRoom,
  startBattleAndFinish,
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
    const newRoomId = await createRoom(playerAPage);

    // Player B joins the new room
    await joinRoom(playerBPage, newRoomId);

    // Verify both are in lobby
    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
    await expect(playerBPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
  });

  test('対戦後トップに戻りトップページが正常に表示されること', async ({
    playerAPage,
    playerBPage,
  }) => {
    await startBattleAndFinish(playerAPage, playerBPage);

    // Go to top
    await playerAPage.getByTestId('go-top-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });

    // Verify top page is displayed with clean state
    await expect(playerAPage.getByTestId('create-room-btn')).toBeVisible();
  });
});
