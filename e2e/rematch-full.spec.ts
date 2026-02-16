import { test, expect, startBattle, playToGameOver } from './fixtures/setup';

test.describe('リマッチフロー完全検証', () => {
  test('敗者からのリマッチ要求が勝者に通知されること', async ({ playerAPage, playerBPage }) => {
    await startBattle(playerAPage, playerBPage);

    // Player A loses (hard drops to game over)
    await playToGameOver(playerAPage);

    // Wait for Player B (winner) to reach result
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });

    // Loser (A) requests rematch
    await playerAPage.getByTestId('rematch-btn').click();

    // Winner (B) should see opponent rematch notification
    await expect(playerBPage.getByTestId('opponent-rematch')).toBeVisible({ timeout: 10000 });
  });

  test('Result画面にリマッチボタンが両者に表示されること', async ({ playerAPage, playerBPage }) => {
    await startBattle(playerAPage, playerBPage);
    await playToGameOver(playerAPage);

    // Wait for Player B to reach result
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });

    await expect(playerAPage.getByTestId('rematch-btn')).toBeVisible();
    await expect(playerBPage.getByTestId('rematch-btn')).toBeVisible();
  });

  test('Result画面にスコア値が表示されること', async ({ playerAPage, playerBPage }) => {
    await startBattle(playerAPage, playerBPage);
    await playToGameOver(playerAPage);

    const scoreText = await playerAPage.getByTestId('result-score').textContent();
    expect(scoreText).toMatch(/\d+/);
  });
});
