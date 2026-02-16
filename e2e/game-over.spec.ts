import { test, expect, startBattle, playToGameOver } from './fixtures/setup';

test.describe('ゲームオーバー — リザルト画面', () => {
  test('ゲームオーバーでResult画面に遷移すること', async ({ playerAPage, playerBPage }) => {
    await startBattle(playerAPage, playerBPage);
    await playToGameOver(playerAPage);

    expect(playerAPage.url()).toContain('/result');
  });

  test('敗者にLOSEが表示されること', async ({ playerAPage, playerBPage }) => {
    await startBattle(playerAPage, playerBPage);
    await playToGameOver(playerAPage);

    await expect(playerAPage.getByTestId('result-text')).toHaveText('LOSE');
  });

  test('勝者にWINが表示されること', async ({ playerAPage, playerBPage }) => {
    await startBattle(playerAPage, playerBPage);

    // Player A loses by spamming hard drops
    await playToGameOver(playerAPage);

    // Player B should be navigated to result with WIN
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });
    await expect(playerBPage.getByTestId('result-text')).toHaveText('WIN');
  });

  test('Result画面にスコア・ライン・レベルが表示されること', async ({
    playerAPage,
    playerBPage,
  }) => {
    await startBattle(playerAPage, playerBPage);
    await playToGameOver(playerAPage);

    await expect(playerAPage.getByTestId('result-score')).toBeVisible();
    await expect(playerAPage.getByTestId('result-lines')).toBeVisible();
    await expect(playerAPage.getByTestId('result-level')).toBeVisible();
  });
});
