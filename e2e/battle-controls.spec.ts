import { test, expect, startBattle } from './fixtures/setup';

test.describe('対戦 — 操作テスト', () => {
  test('ソフトドロップでスコアが増加すること', async ({ playerAPage, playerBPage }) => {
    await startBattle(playerAPage, playerBPage);
    await playerAPage.waitForTimeout(500);

    // Hold ArrowDown for soft drop (hold key down to trigger continuous soft drop)
    await playerAPage.keyboard.down('ArrowDown');
    await playerAPage.waitForTimeout(2000);
    await playerAPage.keyboard.up('ArrowDown');
    await playerAPage.waitForTimeout(200);

    const scoreText = await playerAPage.getByTestId('score').textContent();
    const score = parseInt(scoreText || '0', 10);
    expect(score).toBeGreaterThan(0);
  });

  test('左右キーで操作しハードドロップでスコアが増加すること', async ({
    playerAPage,
    playerBPage,
  }) => {
    await startBattle(playerAPage, playerBPage);
    await playerAPage.waitForTimeout(500);

    await playerAPage.keyboard.press('ArrowLeft');
    await playerAPage.waitForTimeout(100);
    await playerAPage.keyboard.press('ArrowRight');
    await playerAPage.waitForTimeout(100);
    await playerAPage.keyboard.press('Space');
    await playerAPage.waitForTimeout(200);

    const scoreText = await playerAPage.getByTestId('score').textContent();
    const score = parseInt(scoreText || '0', 10);
    expect(score).toBeGreaterThan(0);
  });

  test('回転操作後にハードドロップでスコアが増加すること', async ({
    playerAPage,
    playerBPage,
  }) => {
    await startBattle(playerAPage, playerBPage);
    await playerAPage.waitForTimeout(500);

    await playerAPage.keyboard.press('ArrowUp');
    await playerAPage.waitForTimeout(100);
    await playerAPage.keyboard.press('Space');
    await playerAPage.waitForTimeout(200);

    const scoreText = await playerAPage.getByTestId('score').textContent();
    const score = parseInt(scoreText || '0', 10);
    expect(score).toBeGreaterThan(0);
  });

  test('ホールド操作後にハードドロップでスコアが増加すること', async ({
    playerAPage,
    playerBPage,
  }) => {
    await startBattle(playerAPage, playerBPage);
    await playerAPage.waitForTimeout(500);

    await playerAPage.keyboard.press('Shift');
    await playerAPage.waitForTimeout(100);
    await playerAPage.keyboard.press('Space');
    await playerAPage.waitForTimeout(200);

    const scoreText = await playerAPage.getByTestId('score').textContent();
    const score = parseInt(scoreText || '0', 10);
    expect(score).toBeGreaterThan(0);
  });

  test('複数回ハードドロップでスコアが累積すること', async ({ playerAPage, playerBPage }) => {
    await startBattle(playerAPage, playerBPage);
    await playerAPage.waitForTimeout(500);

    // First hard drop
    await playerAPage.keyboard.press('Space');
    await playerAPage.waitForTimeout(300);
    const score1Text = await playerAPage.getByTestId('score').textContent();
    const score1 = parseInt(score1Text || '0', 10);

    // Second hard drop
    await playerAPage.keyboard.press('Space');
    await playerAPage.waitForTimeout(300);

    // Third hard drop
    await playerAPage.keyboard.press('Space');
    await playerAPage.waitForTimeout(300);
    const score3Text = await playerAPage.getByTestId('score').textContent();
    const score3 = parseInt(score3Text || '0', 10);

    expect(score3).toBeGreaterThan(score1);
  });
});
