import {
  test,
  expect,
  randomMatchToBattle,
  playToGameOver,
} from './fixtures/setup';

// ランダムマッチはキュー共有のためシリアル実行
test.describe.configure({ mode: 'serial' });

test.describe('Random Match Lifecycle — ランダムマッチ ライフサイクル', () => {
  test('BL-1: ランダムマッチ → ロビー → Ready → 対戦 → ゲームオーバー → 結果表示', async ({
    playerAPage,
    playerBPage,
  }) => {
    await randomMatchToBattle(playerAPage, playerBPage);

    // Player A loses by hard-dropping
    await playToGameOver(playerAPage);

    // Both should be on result screen
    await playerAPage.waitForURL(/\/result/, { timeout: 30000 });
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });

    // Player A (loser) should see LOSE, Player B (winner) should see WIN
    await expect(playerAPage.getByTestId('result-text')).toHaveText('LOSE');
    await expect(playerBPage.getByTestId('result-text')).toHaveText('WIN');
  });

  test('BL-2: ランダムマッチ → 対戦 → 結果 → リマッチ要求 → 相手に通知表示', async ({
    playerAPage,
    playerBPage,
  }) => {
    await randomMatchToBattle(playerAPage, playerBPage);

    // Player A loses
    await playToGameOver(playerAPage);
    await playerAPage.waitForURL(/\/result/, { timeout: 30000 });
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });

    // Winner (B) requests rematch
    await playerBPage.getByTestId('rematch-btn').click();

    // Loser (A) should see opponent rematch notification
    await expect(playerAPage.getByTestId('opponent-rematch')).toBeVisible({ timeout: 10000 });
  });

  test('BL-3: ランダムマッチ → 対戦 → 結果 → 両者リマッチ → ロビーに戻る', async ({
    playerAPage,
    playerBPage,
  }) => {
    await randomMatchToBattle(playerAPage, playerBPage);

    // Player A loses
    await playToGameOver(playerAPage);
    await playerAPage.waitForURL(/\/result/, { timeout: 30000 });
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });

    // Both click rematch
    await playerAPage.getByTestId('rematch-btn').click();
    await playerBPage.getByTestId('rematch-btn').click();

    // Both should navigate back to lobby
    await playerAPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    // Both should see each other's names
    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
    await expect(playerBPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
  });

  test('BL-4: ランダムマッチ → 対戦 → 結果 → リマッチ → Ready → 再対戦 → スコア0リセット', async ({
    playerAPage,
    playerBPage,
  }) => {
    await randomMatchToBattle(playerAPage, playerBPage);

    // Player A loses
    await playToGameOver(playerAPage);
    await playerAPage.waitForURL(/\/result/, { timeout: 30000 });
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });

    // Both click rematch
    await playerAPage.getByTestId('rematch-btn').click();
    await playerBPage.getByTestId('rematch-btn').click();

    // Wait for lobby
    await playerAPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    // Both click Ready
    await expect(playerAPage.getByTestId('ready-btn')).toBeVisible({ timeout: 5000 });
    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    // Should navigate to battle again
    await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/battle\//, { timeout: 10000 });

    // Scores should be reset to 0
    await expect(playerAPage.getByTestId('score')).toHaveText('0');
    await expect(playerBPage.getByTestId('score')).toHaveText('0');
  });

  test('BL-5: ランダムマッチ → 対戦 → 結果 → 片方退出 → 相手がトップに遷移', async ({
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
