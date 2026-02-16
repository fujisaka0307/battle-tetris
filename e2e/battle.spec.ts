import { test, expect, startBattle } from './fixtures/setup';

test.describe('対戦画面', () => {
  test('対戦画面にCanvas要素とスコアボードが表示されること', async ({
    playerAPage,
    playerBPage,
  }) => {
    await startBattle(playerAPage, playerBPage);

    // Main canvas
    await expect(playerAPage.getByTestId('game-canvas')).toBeVisible();
    // Opponent canvas
    await expect(playerAPage.getByTestId('opponent-canvas')).toBeVisible();
    // Scoreboard
    await expect(playerAPage.getByTestId('score')).toHaveText('0');
    await expect(playerAPage.getByTestId('level')).toHaveText('0');
    await expect(playerAPage.getByTestId('lines')).toHaveText('0');
  });

  test('キー入力でスコアボードに変化が起きること（ハードドロップ）', async ({
    playerAPage,
    playerBPage,
  }) => {
    await startBattle(playerAPage, playerBPage);

    // Wait a moment for game engine to start
    await playerAPage.waitForTimeout(500);

    // Press Space for hard drop
    await playerAPage.keyboard.press('Space');
    await playerAPage.waitForTimeout(200);

    // Score should increase from hard drop
    const scoreText = await playerAPage.getByTestId('score').textContent();
    const score = parseInt(scoreText || '0', 10);
    expect(score).toBeGreaterThan(0);
  });
});
