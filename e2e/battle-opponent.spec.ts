import { test, expect, startBattle } from './fixtures/setup';

test.describe('Battle — 対戦相手表示', () => {
  test('両プレイヤーに相手フィールドCanvasが表示されること', async ({
    playerAPage,
    playerBPage,
  }) => {
    await startBattle(playerAPage, playerBPage);

    await expect(playerAPage.getByTestId('opponent-canvas')).toBeVisible();
    await expect(playerBPage.getByTestId('opponent-canvas')).toBeVisible();
  });

  test('ハードドロップ後に相手のスコアが更新されること', async ({ playerAPage, playerBPage }) => {
    await startBattle(playerAPage, playerBPage);
    await playerAPage.waitForTimeout(500);

    // Player A does a hard drop
    await playerAPage.keyboard.press('Space');
    await playerAPage.waitForTimeout(1000);

    // Player B should see opponent score updated
    const opponentScoreText = await playerBPage.getByTestId('opponent-score').textContent();
    // The text is "Score: N"
    const match = opponentScoreText?.match(/\d+/);
    const opponentScore = match ? parseInt(match[0], 10) : 0;
    expect(opponentScore).toBeGreaterThan(0);
  });
});
