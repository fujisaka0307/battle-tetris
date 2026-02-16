import {
  test,
  expect,
  enterNickname,
  randomMatchToLobby,
  randomMatchToBattle,
  playToGameOver,
} from './fixtures/setup';

test.describe('ランダムマッチ 切断テスト', () => {
  test('BD-1: ランダムマッチ → ロビーで相手がブラウザを閉じる → 待機状態に戻る', async ({
    playerAPage,
    browser,
  }) => {
    // Create a separate context for playerB so we can close it cleanly
    const playerBContext = await browser.newContext();
    const playerBPage = await playerBContext.newPage();

    await randomMatchToLobby(playerAPage, playerBPage);

    // Close playerB's entire browser context
    await playerBContext.close();

    // Player A should see waiting text again
    await expect(playerAPage.getByTestId('waiting-text')).toBeVisible({ timeout: 15000 });
  });

  test('BD-2: ランダムマッチ → 対戦中に相手がブラウザを閉じる → WIN表示', async ({
    playerAPage,
    browser,
  }) => {
    test.setTimeout(240_000); // DISCONNECT_TIMEOUT_MS(30s) + CI処理遅延マージン

    // Create a separate context for playerB so we can close it cleanly
    const playerBContext = await browser.newContext();
    const playerBPage = await playerBContext.newPage();

    await enterNickname(playerAPage, 'Alice');
    await playerAPage.getByTestId('random-match-btn').click();

    await enterNickname(playerBPage, 'Bob');
    await playerBPage.getByTestId('random-match-btn').click();

    await playerAPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });

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

  test('BD-3: ランダムマッチ → ロビーで退出ボタン → 相手が待機状態に戻る', async ({
    playerAPage,
    playerBPage,
  }) => {
    await randomMatchToLobby(playerAPage, playerBPage);

    // Player B clicks leave button
    await playerBPage.getByTestId('leave-btn').click();
    await playerBPage.waitForURL('/', { timeout: 5000 });

    // Player A should see waiting text again
    await expect(playerAPage.getByTestId('waiting-text')).toBeVisible({ timeout: 15000 });
  });

  test('BD-4: ランダムマッチ → リマッチ要求後に相手が退出 → トップに遷移', async ({
    playerAPage,
    playerBPage,
  }) => {
    await randomMatchToBattle(playerAPage, playerBPage);

    // Player A loses
    await playToGameOver(playerAPage);
    await playerAPage.waitForURL(/\/result/, { timeout: 30000 });
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });

    // Player A requests rematch
    await playerAPage.getByTestId('rematch-btn').click();

    // Player B clicks "go top" (leaves)
    await playerBPage.getByTestId('go-top-btn').click();
    await playerBPage.waitForURL('/', { timeout: 5000 });

    // Player A should be redirected to top (opponent disconnected handler)
    await playerAPage.waitForURL('/', { timeout: 10000 });
    await expect(playerAPage.getByTestId('nickname-input')).toBeVisible();
  });
});
