import {
  test,
  expect,
  randomMatchToLobby,
  randomMatchToBattle,
  playToGameOver,
} from './fixtures/setup';

test.describe.configure({ mode: 'serial' });

test.describe('ランダムマッチ エッジケース', () => {
  test('BE-1: ランダムマッチ → ロビーで退出 → すぐに再度ランダムマッチ → 正常にマッチ', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    // First: A and B match via random
    await randomMatchToLobby(playerAPage, playerBPage);

    // A leaves lobby
    await playerAPage.getByTestId('leave-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });

    // B should return to waiting state, then also leave
    await expect(playerBPage.getByTestId('waiting-text')).toBeVisible({ timeout: 15000 });
    await playerBPage.getByTestId('leave-btn').click();
    await playerBPage.waitForURL('/', { timeout: 5000 });

    // Create player C for new match
    const contextC = await browser.newContext();
    const playerCPage = await contextC.newPage();

    // A immediately re-queues with player C
    await randomMatchToLobby(playerAPage, playerCPage);

    // Verify they see each other
    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
    await expect(playerCPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });

    await contextC.close();
  });

  test('BE-2: ランダムマッチ → 対戦 → 結果 → トップ → すぐにランダムマッチ → 別の相手とマッチ', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    await randomMatchToBattle(playerAPage, playerBPage);

    // Player A loses
    await playToGameOver(playerAPage);
    await playerAPage.waitForURL(/\/result/, { timeout: 30000 });
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });

    // Both go to top
    await playerAPage.getByTestId('go-top-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });
    await playerBPage.waitForURL('/', { timeout: 10000 });

    // Create player C
    const contextC = await browser.newContext();
    const playerCPage = await contextC.newPage();

    // A immediately random matches with C
    await randomMatchToLobby(playerAPage, playerCPage, 'Alice2', 'Charlie');

    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Charlie', { timeout: 5000 });
    await expect(playerCPage.getByTestId('opponent-name')).toHaveText('Alice2', { timeout: 5000 });

    await contextC.close();
  });

  test('BE-3: 同じニックネームの2人がランダムマッチ → 正常にマッチ', async ({
    playerAPage,
    playerBPage,
  }) => {
    // Both use the same nickname
    await randomMatchToLobby(playerAPage, playerBPage, 'SameName', 'SameName');

    // Both should see opponent name (same name)
    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('SameName', { timeout: 5000 });
    await expect(playerBPage.getByTestId('opponent-name')).toHaveText('SameName', { timeout: 5000 });
  });

  test('BE-4: ランダムマッチ → ロビーで両者の roomId が一致すること', async ({
    playerAPage,
    playerBPage,
  }) => {
    await randomMatchToLobby(playerAPage, playerBPage);

    // Extract roomId from both players' URLs
    const roomIdA = playerAPage.url().split('/lobby/')[1];
    const roomIdB = playerBPage.url().split('/lobby/')[1];

    // Both should be in the same room
    expect(roomIdA).toBeTruthy();
    expect(roomIdB).toBeTruthy();
    expect(roomIdA).toBe(roomIdB);
  });
});
