import { test, expect, createRoom, joinRoom } from './fixtures/setup';

test.describe('切断テスト（拡張）', () => {
  test('対戦中にブラウザを閉じると相手がWINになること', async ({
    playerAPage,
    browser,
  }) => {
    test.setTimeout(240_000); // DISCONNECT_TIMEOUT_MS(30s) + CI処理遅延マージン

    // Create a separate context for playerB so we can close it cleanly
    const playerBContext = await browser.newContext();
    const playerBPage = await playerBContext.newPage();

    const roomId = await createRoom(playerAPage);
    await joinRoom(playerBPage, roomId);

    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });

    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/battle\//, { timeout: 10000 });

    await playerAPage.waitForTimeout(1000);

    // Explicitly stop SignalR connection before closing the browser context.
    // Direct context.close() does not reliably send WebSocket close frames
    // through the Vite dev proxy, leaving the server unaware of the disconnect.
    await playerBPage.evaluate(async () => {
      const mod = await import('/src/network/SignalRClient');
      await (mod as any).signalRClient.disconnect();
    });
    await playerBContext.close();

    // Server needs DISCONNECT_TIMEOUT_MS (30s) to detect disconnect and send GameResult
    await playerAPage.waitForURL(/\/result/, { timeout: 200_000 });
    await expect(playerAPage.getByTestId('result-text')).toHaveText('WIN');
  });

  test('ロビーで相手がブラウザを閉じると待機状態に戻ること', async ({
    playerAPage,
    browser,
  }) => {
    // Create a separate context for playerB
    const playerBContext = await browser.newContext();
    const playerBPage = await playerBContext.newPage();

    const roomId = await createRoom(playerAPage);
    await joinRoom(playerBPage, roomId);

    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });

    // Close playerB's entire browser context
    await playerBContext.close();

    // Player A should see waiting text again
    await expect(playerAPage.getByTestId('waiting-text')).toBeVisible({ timeout: 15000 });
  });
});
