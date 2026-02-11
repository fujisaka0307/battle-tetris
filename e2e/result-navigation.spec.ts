import { test, expect, startBattle, playToGameOver } from './fixtures/setup';

test.describe('Result — 画面遷移', () => {
  test('トップへ戻るボタンでトップページへ遷移すること', async ({ playerAPage, playerBPage }) => {
    await startBattle(playerAPage, playerBPage);
    await playToGameOver(playerAPage);

    await playerAPage.getByTestId('go-top-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });
    await expect(playerAPage.getByTestId('nickname-input')).toBeVisible();
  });

  test('再戦ボタンで相手にリマッチ通知が表示されること', async ({ playerAPage, playerBPage }) => {
    await startBattle(playerAPage, playerBPage);
    await playToGameOver(playerAPage);

    // Wait for Player B to also reach result
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });

    // Player A requests rematch
    await playerAPage.getByTestId('rematch-btn').click();

    // Player B should see opponent rematch notification
    await expect(playerBPage.getByTestId('opponent-rematch')).toBeVisible({ timeout: 10000 });
  });
});
