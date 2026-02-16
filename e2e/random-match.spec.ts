import { test, expect, setupPlayer } from './fixtures/setup';

test.describe('ランダムマッチ', () => {
  test('2人がランダムマッチでマッチングされること', async ({ playerAPage, playerBPage }) => {
    // Player A requests random match
    await setupPlayer(playerAPage);
    await playerAPage.getByTestId('random-match-btn').click();

    // Player B requests random match
    await setupPlayer(playerBPage);
    await playerBPage.getByTestId('random-match-btn').click();

    // Both should be navigated to lobby
    await playerAPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    // Both should see each other's names
    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
    await expect(playerBPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
  });
});
