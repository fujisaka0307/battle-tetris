import { test, expect, setupPlayer } from './fixtures/setup';

test.describe('Leaderboard & Match History', () => {
  test('TopPage にランキング・対戦履歴セクションが表示されること', async ({ page }) => {
    await setupPlayer(page);

    // ランキングセクションが存在（スクロールして表示）
    const rankingList = page.getByTestId('ranking-list');
    await rankingList.scrollIntoViewIfNeeded();
    await expect(rankingList).toBeVisible({ timeout: 10000 });

    // 対戦履歴セクションが存在
    const matchHistory = page.getByTestId('match-history');
    await matchHistory.scrollIntoViewIfNeeded();
    await expect(matchHistory).toBeVisible();

    // データありの場合はアイテム、なしの場合は空メッセージが表示される
    const hasRankingData = await page.getByTestId('ranking-item').first().isVisible().catch(() => false);
    if (!hasRankingData) {
      await expect(page.getByTestId('ranking-empty')).toBeVisible();
    }

    const hasHistoryData = await page.getByTestId('history-item').first().isVisible().catch(() => false);
    if (!hasHistoryData) {
      await expect(page.getByTestId('history-empty')).toBeVisible();
    }
  });

  test('REST API /api/rankings が JSON を返すこと', async ({ request }) => {
    const response = await request.get('http://localhost:4000/api/rankings');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('rankings');
    expect(Array.isArray(data.rankings)).toBeTruthy();
  });

  test('REST API /api/matches が JSON を返すこと', async ({ request }) => {
    const response = await request.get('http://localhost:4000/api/matches');
    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    expect(data).toHaveProperty('matches');
    expect(Array.isArray(data.matches)).toBeTruthy();
  });
});
