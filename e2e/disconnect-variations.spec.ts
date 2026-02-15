import { test, expect, createRoom, joinRoom, startBattle } from './fixtures/setup';

test.describe('Disconnect Variations — 切断バリエーション', () => {
  test('D-2: 対戦中にネットワーク切断→30秒以内に復帰→ゲーム継続', async ({
    playerAPage,
    playerBPage,
  }) => {
    test.setTimeout(120_000);

    await startBattle(playerAPage, playerBPage);
    await playerAPage.waitForTimeout(1000);

    // Simulate network disconnection for Player A
    await playerAPage.context().setOffline(true);

    // Wait 10 seconds (within the 30s timeout)
    await playerBPage.waitForTimeout(10000);

    // Reconnect Player A
    await playerAPage.context().setOffline(false);

    // Wait for reconnection
    await playerAPage.waitForTimeout(5000);

    // Both should still be in battle (not redirected to result)
    expect(playerAPage.url()).toContain('/battle/');
    expect(playerBPage.url()).toContain('/battle/');

    // Game should still be functional — Player A can do hard drop
    await playerAPage.keyboard.press('Space');
    await playerAPage.waitForTimeout(500);
    const scoreA = await playerAPage.getByTestId('score').textContent();
    expect(Number(scoreA)).toBeGreaterThan(0);
  });

  test('D-3: 両者同時切断 → サーバーがルームをクリーンアップ', async ({
    browser,
  }) => {
    const contextA = await browser.newContext();
    const playerAPage = await contextA.newPage();
    const contextB = await browser.newContext();
    const playerBPage = await contextB.newPage();

    await startBattle(playerAPage, playerBPage);
    await playerAPage.waitForTimeout(1000);

    // Both close their browsers simultaneously
    await Promise.all([contextA.close(), contextB.close()]);

    // Wait for server to detect disconnections
    // Verify server is still healthy by creating a new room
    const contextNew = await browser.newContext();
    const newPage = await contextNew.newPage();

    await newPage.goto('/');
    await newPage.waitForTimeout(3000);
    await newPage.getByTestId('nickname-input').fill('NewPlayer');
    await newPage.getByTestId('create-room-btn').click();

    // Server should still work — new room created
    await newPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await expect(newPage.getByTestId('room-id')).toBeVisible();

    await contextNew.close();
  });

  test('D-4: カウントダウン中に片方が切断 → 相手がロビー/トップに戻る', async ({
    playerAPage,
    browser,
  }) => {
    test.setTimeout(60_000);

    const contextB = await browser.newContext();
    const playerBPage = await contextB.newPage();

    const roomId = await createRoom(playerAPage, 'Alice');
    await joinRoom(playerBPage, 'Bob', roomId);

    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });

    // Both click Ready
    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    // Wait for countdown to start
    await expect(playerAPage.getByTestId('countdown')).toBeVisible({ timeout: 5000 });

    // Player B disconnects during countdown
    await contextB.close();

    // Player A should eventually go back to waiting or top
    // (either waiting-text reappears or redirected to top)
    await playerAPage.waitForTimeout(10000);
    const isWaiting = await playerAPage.getByTestId('waiting-text').isVisible().catch(() => false);
    const isTop = playerAPage.url() === '/' || playerAPage.url().endsWith(':3000/');

    expect(isWaiting || isTop).toBeTruthy();
  });
});
