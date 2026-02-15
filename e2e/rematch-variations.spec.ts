import {
  test,
  expect,
  enterNickname,
  startBattleAndFinish,
  playToGameOver,
} from './fixtures/setup';

test.describe('Rematch Variations — リマッチバリエーション', () => {
  test('F-2: 連続2回リマッチ → 3戦目で状態が正しくリセットされる', async ({
    playerAPage,
    playerBPage,
  }) => {
    // === Game 1 ===
    await startBattleAndFinish(playerAPage, playerBPage);

    // Both click rematch
    await playerAPage.getByTestId('rematch-btn').click();
    await playerBPage.getByTestId('rematch-btn').click();

    // Wait for lobby
    await playerAPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    // === Game 2 ===
    await expect(playerAPage.getByTestId('ready-btn')).toBeVisible({ timeout: 5000 });
    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/battle\//, { timeout: 10000 });

    // Verify scores reset to 0 for game 2
    await expect(playerAPage.getByTestId('score')).toHaveText('0');
    await expect(playerBPage.getByTestId('score')).toHaveText('0');

    // Player A loses again
    await playToGameOver(playerAPage);
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });

    // === Rematch again (game 3) ===
    await playerAPage.getByTestId('rematch-btn').click();
    await playerBPage.getByTestId('rematch-btn').click();

    await playerAPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    await expect(playerAPage.getByTestId('ready-btn')).toBeVisible({ timeout: 5000 });
    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/battle\//, { timeout: 10000 });

    // Verify scores reset to 0 for game 3
    await expect(playerAPage.getByTestId('score')).toHaveText('0');
    await expect(playerBPage.getByTestId('score')).toHaveText('0');

    // Canvases should be visible
    await expect(playerAPage.getByTestId('game-canvas')).toBeVisible();
    await expect(playerBPage.getByTestId('game-canvas')).toBeVisible();
  });

  test('F-3: 片方リマッチ要求、片方トップへ戻る → リマッチ側もトップに遷移', async ({
    playerAPage,
    playerBPage,
  }) => {
    await startBattleAndFinish(playerAPage, playerBPage);

    // Player A requests rematch
    await playerAPage.getByTestId('rematch-btn').click();

    // Player B goes to top instead
    await playerBPage.getByTestId('go-top-btn').click();
    await playerBPage.waitForURL('/', { timeout: 5000 });

    // Player A should be redirected to top (opponent left)
    await playerAPage.waitForURL('/', { timeout: 10000 });
    await expect(playerAPage.getByTestId('nickname-input')).toBeVisible();
  });

  test('F-4: リマッチ拒否後にルーム作成で別の相手と対戦', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    await startBattleAndFinish(playerAPage, playerBPage);

    // Player B goes to top (rejects rematch)
    await playerBPage.getByTestId('go-top-btn').click();
    await playerBPage.waitForURL('/', { timeout: 5000 });

    // Player A is auto-redirected to top when opponent leaves
    await playerAPage.waitForURL('/', { timeout: 10000 });

    // Player B creates a room and plays with Player C
    const contextC = await browser.newContext();
    const playerCPage = await contextC.newPage();

    await enterNickname(playerBPage, 'Bob2');
    await playerBPage.getByTestId('create-room-btn').click();
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    const newRoomId = playerBPage.url().split('/lobby/')[1];

    await enterNickname(playerCPage, 'Charlie');
    await playerCPage.getByTestId('room-id-input').fill(newRoomId);
    await playerCPage.getByTestId('join-room-btn').click();
    await playerCPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    // B and C should see each other
    await expect(playerBPage.getByTestId('opponent-name')).toHaveText('Charlie', { timeout: 5000 });
    await expect(playerCPage.getByTestId('opponent-name')).toHaveText('Bob2', { timeout: 5000 });

    await contextC.close();
  });
});
