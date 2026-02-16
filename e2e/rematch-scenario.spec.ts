import { test, expect, startBattleAndFinish } from './fixtures/setup';

test.describe('リマッチシナリオ', () => {
  test.slow();

  test('勝者からのリマッチ要求が敗者に通知されること', async ({ playerAPage, playerBPage }) => {
    await startBattleAndFinish(playerAPage, playerBPage);

    // Winner (B) requests rematch
    await playerBPage.getByTestId('rematch-btn').click();

    // Loser (A) should see opponent rematch notification
    await expect(playerAPage.getByTestId('opponent-rematch')).toBeVisible({ timeout: 10000 });
  });

  test('両者がリマッチ要求するとロビーに戻ること', async ({ playerAPage, playerBPage }) => {
    await startBattleAndFinish(playerAPage, playerBPage);

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

  test('リマッチ後のロビーでReady→再対戦できること', async ({ playerAPage, playerBPage }) => {
    await startBattleAndFinish(playerAPage, playerBPage);

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

  test('リマッチ要求後に相手が退出するとトップに遷移すること', async ({
    playerAPage,
    playerBPage,
  }) => {
    await startBattleAndFinish(playerAPage, playerBPage);

    // Player A requests rematch
    await playerAPage.getByTestId('rematch-btn').click();

    // Player B clicks "go top" (leaves)
    await playerBPage.getByTestId('go-top-btn').click();
    await playerBPage.waitForURL('/', { timeout: 5000 });

    // Player A should be redirected to top (opponent disconnected handler)
    await playerAPage.waitForURL('/', { timeout: 10000 });
    await expect(playerAPage.getByTestId('create-room-btn')).toBeVisible();
  });
});
