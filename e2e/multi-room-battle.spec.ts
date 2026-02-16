import {
  test,
  expect,
  createRoom,
  joinRoom,
  playToGameOver,
} from './fixtures/setup';

test.describe('複数ルーム同時対戦', () => {
  test('C-1: 2ルーム同時対戦 → スコア・フィールドが互いに干渉しない', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    const contextC = await browser.newContext();
    const playerCPage = await contextC.newPage();
    const contextD = await browser.newContext();
    const playerDPage = await contextD.newPage();

    // Create two rooms
    const roomId1 = await createRoom(playerAPage, 'Alice');
    const roomId2 = await createRoom(playerCPage, 'Charlie');

    // Join both rooms
    await joinRoom(playerBPage, 'Bob', roomId1);
    await joinRoom(playerDPage, 'Diana', roomId2);

    // Verify pairings
    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });
    await expect(playerCPage.getByTestId('opponent-name')).toHaveText('Diana', { timeout: 5000 });

    // Both rooms: Ready
    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();
    await playerCPage.getByTestId('ready-btn').click();
    await playerDPage.getByTestId('ready-btn').click();

    // Both rooms should navigate to battle
    await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerCPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerDPage.waitForURL(/\/battle\//, { timeout: 10000 });

    // All should have independent canvases
    await expect(playerAPage.getByTestId('game-canvas')).toBeVisible();
    await expect(playerBPage.getByTestId('game-canvas')).toBeVisible();
    await expect(playerCPage.getByTestId('game-canvas')).toBeVisible();
    await expect(playerDPage.getByTestId('game-canvas')).toBeVisible();

    // Room 1: Player A does hard drops, accumulating score
    await playerAPage.waitForTimeout(500);
    for (let i = 0; i < 3; i++) {
      await playerAPage.keyboard.press('Space');
      await playerAPage.waitForTimeout(200);
    }

    // Room 2: Player C and D scores should remain 0 (no interference)
    await expect(playerCPage.getByTestId('score')).toHaveText('0');
    await expect(playerDPage.getByTestId('score')).toHaveText('0');

    // Room 1: Player A's score should have changed
    const scoreA = await playerAPage.getByTestId('score').textContent();
    expect(Number(scoreA)).toBeGreaterThan(0);

    await contextC.close();
    await contextD.close();
  });

  test('C-2: 1ルーム終了、もう1ルーム継続', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    const contextC = await browser.newContext();
    const playerCPage = await contextC.newPage();
    const contextD = await browser.newContext();
    const playerDPage = await contextD.newPage();

    // Create and start two rooms
    const roomId1 = await createRoom(playerAPage, 'Alice');
    const roomId2 = await createRoom(playerCPage, 'Charlie');
    await joinRoom(playerBPage, 'Bob', roomId1);
    await joinRoom(playerDPage, 'Diana', roomId2);

    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });
    await expect(playerCPage.getByTestId('opponent-name')).toHaveText('Diana', { timeout: 5000 });

    // Both rooms: Ready and Battle
    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();
    await playerCPage.getByTestId('ready-btn').click();
    await playerDPage.getByTestId('ready-btn').click();

    await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerCPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerDPage.waitForURL(/\/battle\//, { timeout: 10000 });

    // Room 1: Player A loses
    await playToGameOver(playerAPage);
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });

    // Room 1 is finished — verify result
    await expect(playerAPage.getByTestId('result-text')).toHaveText('LOSE');
    await expect(playerBPage.getByTestId('result-text')).toHaveText('WIN');

    // Room 2: Should still be in battle (not affected)
    expect(playerCPage.url()).toContain('/battle/');
    expect(playerDPage.url()).toContain('/battle/');

    // Room 2: Game still works — Player C can do hard drops
    await playerCPage.keyboard.press('Space');
    await playerCPage.waitForTimeout(500);
    const scoreC = await playerCPage.getByTestId('score').textContent();
    expect(Number(scoreC)).toBeGreaterThan(0);

    await contextC.close();
    await contextD.close();
  });

  test('C-3: 2ルーム同時ゲームオーバー → 各ルームで正しいWIN/LOSE', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    const contextC = await browser.newContext();
    const playerCPage = await contextC.newPage();
    const contextD = await browser.newContext();
    const playerDPage = await contextD.newPage();

    // Create and start two rooms
    const roomId1 = await createRoom(playerAPage, 'Alice');
    const roomId2 = await createRoom(playerCPage, 'Charlie');
    await joinRoom(playerBPage, 'Bob', roomId1);
    await joinRoom(playerDPage, 'Diana', roomId2);

    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });
    await expect(playerCPage.getByTestId('opponent-name')).toHaveText('Diana', { timeout: 5000 });

    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();
    await playerCPage.getByTestId('ready-btn').click();
    await playerDPage.getByTestId('ready-btn').click();

    await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerCPage.waitForURL(/\/battle\//, { timeout: 10000 });

    // Both rooms: losers spam hard drops simultaneously
    await Promise.all([playToGameOver(playerAPage), playToGameOver(playerCPage)]);

    // Wait for winners to reach result
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });
    await playerDPage.waitForURL(/\/result/, { timeout: 30000 });

    // Verify correct results for each room
    await expect(playerAPage.getByTestId('result-text')).toHaveText('LOSE');
    await expect(playerBPage.getByTestId('result-text')).toHaveText('WIN');
    await expect(playerCPage.getByTestId('result-text')).toHaveText('LOSE');
    await expect(playerDPage.getByTestId('result-text')).toHaveText('WIN');

    await contextC.close();
    await contextD.close();
  });
});
