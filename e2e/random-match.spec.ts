import { test, expect, enterNickname } from './fixtures/setup';

test.describe('Random Match — ランダムマッチ', () => {
  test('2人がランダムマッチでマッチングされること', async ({ playerAPage, playerBPage }) => {
    // Player A requests random match
    await enterNickname(playerAPage, 'Alice');
    await playerAPage.getByTestId('random-match-btn').click();

    // Player B requests random match
    await enterNickname(playerBPage, 'Bob');
    await playerBPage.getByTestId('random-match-btn').click();

    // Both should be navigated to lobby
    await playerAPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    // Both should see each other's names
    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });
    await expect(playerBPage.getByTestId('opponent-name')).toHaveText('Alice', { timeout: 5000 });
  });
});
