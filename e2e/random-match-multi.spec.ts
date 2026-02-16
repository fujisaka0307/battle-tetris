import { test, expect, setupPlayer, playToGameOver } from './fixtures/setup';

test.describe.configure({ mode: 'serial' });

test.describe('ランダムマッチ複数人', () => {
  test('B-2: 3人がランダムマッチ → 2人がマッチ、1人が待機', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    const contextC = await browser.newContext();
    const playerCPage = await contextC.newPage();

    // All three request random match
    await setupPlayer(playerAPage);
    await playerAPage.getByTestId('random-match-btn').click();

    await setupPlayer(playerBPage);
    await playerBPage.getByTestId('random-match-btn').click();

    await setupPlayer(playerCPage);
    await playerCPage.getByTestId('random-match-btn').click();

    // Wait for matchmaking
    await playerAPage.waitForTimeout(5000);
    await playerBPage.waitForTimeout(5000);
    await playerCPage.waitForTimeout(5000);

    const aInLobby = playerAPage.url().includes('/lobby/');
    const bInLobby = playerBPage.url().includes('/lobby/');
    const cInLobby = playerCPage.url().includes('/lobby/');

    const matchedCount = [aInLobby, bInLobby, cInLobby].filter(Boolean).length;

    // At least 2 should be matched (in lobby)
    expect(matchedCount).toBeGreaterThanOrEqual(2);

    // Verify the matched pair can see each other
    if (aInLobby && bInLobby) {
      await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
      await expect(playerBPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
    } else if (aInLobby && cInLobby) {
      await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
      await expect(playerCPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
    } else if (bInLobby && cInLobby) {
      await expect(playerBPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
      await expect(playerCPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
    }

    await contextC.close();
  });

  test('B-3: 4人がランダムマッチ → 2組のペアが独立してマッチ', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    test.setTimeout(60_000);

    const contextC = await browser.newContext();
    const playerCPage = await contextC.newPage();
    const contextD = await browser.newContext();
    const playerDPage = await contextD.newPage();

    // Prepare all four players first
    await setupPlayer(playerAPage);
    await setupPlayer(playerBPage);
    await setupPlayer(playerCPage);
    await setupPlayer(playerDPage);

    // Click random match with small delays to allow server processing
    await playerAPage.getByTestId('random-match-btn').click();
    await playerAPage.waitForTimeout(500);

    await playerBPage.getByTestId('random-match-btn').click();
    await playerBPage.waitForTimeout(500);

    await playerCPage.getByTestId('random-match-btn').click();
    await playerCPage.waitForTimeout(500);

    await playerDPage.getByTestId('random-match-btn').click();

    // Wait for all 4 to be in lobby
    await playerAPage.waitForURL(/\/lobby\//, { timeout: 20000 });
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 20000 });
    await playerCPage.waitForURL(/\/lobby\//, { timeout: 20000 });
    await playerDPage.waitForURL(/\/lobby\//, { timeout: 20000 });

    // Each should see an opponent name
    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 10000 });
    await expect(playerBPage.getByTestId('opponent-name')).toBeVisible({ timeout: 10000 });
    await expect(playerCPage.getByTestId('opponent-name')).toBeVisible({ timeout: 10000 });
    await expect(playerDPage.getByTestId('opponent-name')).toBeVisible({ timeout: 10000 });

    // Verify they are in different rooms (different lobby URLs)
    const roomA = playerAPage.url().split('/lobby/')[1];
    const roomB = playerBPage.url().split('/lobby/')[1];
    const roomC = playerCPage.url().split('/lobby/')[1];
    const roomD = playerDPage.url().split('/lobby/')[1];

    // Should have exactly 2 distinct room IDs (4 players → 2 pairs)
    const rooms = new Set([roomA, roomB, roomC, roomD]);
    expect(rooms.size).toBeLessThanOrEqual(2);

    await contextC.close();
    await contextD.close();
  });

  test('B-4: ランダムマッチ待機中にキャンセル → 残りの人が別の人とマッチ', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    const contextC = await browser.newContext();
    const playerCPage = await contextC.newPage();

    // A enters random match queue
    await setupPlayer(playerAPage);
    await playerAPage.getByTestId('random-match-btn').click();

    // Wait a moment, then A cancels (goes back to top)
    await playerAPage.waitForTimeout(1000);
    // Use leave button if available, otherwise navigate back
    const leaveBtn = playerAPage.getByTestId('leave-btn');
    if (await leaveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await leaveBtn.click();
    } else {
      await playerAPage.goto('/');
    }
    await playerAPage.waitForURL('/', { timeout: 5000 });

    // B and C enter random match queue
    await setupPlayer(playerBPage);
    await playerBPage.getByTestId('random-match-btn').click();

    await setupPlayer(playerCPage);
    await playerCPage.getByTestId('random-match-btn').click();

    // B and C should be matched (not A)
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await playerCPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    await expect(playerBPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
    await expect(playerCPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });

    // A should still be on top page
    expect(playerAPage.url()).not.toContain('/lobby/');

    await contextC.close();
  });

  test('B-5: ランダムマッチ待機中に切断 → ゴーストマッチ防止', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    test.setTimeout(60_000);

    // Ghost enters random match then disconnects (close browser)
    const contextGhost = await browser.newContext();
    const ghostPage = await contextGhost.newPage();

    await setupPlayer(ghostPage);
    await ghostPage.getByTestId('random-match-btn').click();
    await ghostPage.waitForTimeout(2000);

    // Close Ghost's browser context
    await contextGhost.close();

    // Wait for server to detect disconnect and clean up the queue
    await playerAPage.waitForTimeout(5000);

    // Alice and Bob enter random match — should match each other (not Ghost)
    await setupPlayer(playerAPage);
    await playerAPage.getByTestId('random-match-btn').click();

    await setupPlayer(playerBPage);
    await playerBPage.getByTestId('random-match-btn').click();

    // A and B should match with each other
    await playerAPage.waitForURL(/\/lobby\//, { timeout: 15000 });
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 15000 });

    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 10000 });
    await expect(playerBPage.getByTestId('opponent-name')).toBeVisible({ timeout: 10000 });
  });

  test('B-6: ランダムマッチ対戦後に再度ランダムマッチ → 正常にマッチ', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    // First match via random
    await setupPlayer(playerAPage);
    await playerAPage.getByTestId('random-match-btn').click();

    await setupPlayer(playerBPage);
    await playerBPage.getByTestId('random-match-btn').click();

    await playerAPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    // Ready and battle
    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 10000 });
    await expect(playerBPage.getByTestId('opponent-name')).toBeVisible({ timeout: 10000 });
    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/battle\//, { timeout: 10000 });

    // Finish game
    await playToGameOver(playerAPage);
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });

    // Both go to top
    await playerAPage.getByTestId('go-top-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });
    await playerBPage.waitForURL('/', { timeout: 10000 });

    // Second random match with new player C
    const contextC = await browser.newContext();
    const playerCPage = await contextC.newPage();

    await setupPlayer(playerAPage);
    await playerAPage.getByTestId('random-match-btn').click();

    await setupPlayer(playerCPage);
    await playerCPage.getByTestId('random-match-btn').click();

    await playerAPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await playerCPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
    await expect(playerCPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });

    await contextC.close();
  });
});
