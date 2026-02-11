import { test, expect, createRoom, joinRoom } from './fixtures/setup';

test.describe('Lobby — 拡張テスト', () => {
  test('ルームIDが6桁英数字形式であること', async ({ playerAPage }) => {
    const roomId = await createRoom(playerAPage, 'Alice');
    expect(roomId).toMatch(/^[A-Za-z0-9]{6}$/);
  });

  test('退出すると相手にwaiting-textが再表示されること', async ({ playerAPage, playerBPage }) => {
    const roomId = await createRoom(playerAPage, 'Alice');
    await joinRoom(playerBPage, 'Bob', roomId);

    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });

    // Player B leaves
    await playerBPage.getByTestId('leave-btn').click();

    // Player A should see waiting text again
    await expect(playerAPage.getByTestId('waiting-text')).toBeVisible({ timeout: 10000 });
  });

  test('ニックネームなしでロビーURL直接アクセスするとトップへリダイレクトされること', async ({
    page,
  }) => {
    await page.goto('/lobby/ABC123');
    await page.waitForURL('/', { timeout: 5000 });
    await expect(page.getByTestId('nickname-input')).toBeVisible();
  });

  test('片方のみReadyではカウントダウンが始まらないこと', async ({ playerAPage, playerBPage }) => {
    const roomId = await createRoom(playerAPage, 'Alice');
    await joinRoom(playerBPage, 'Bob', roomId);

    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });

    // Only Player A clicks Ready
    await playerAPage.getByTestId('ready-btn').click();

    // Wait 5 seconds and confirm no countdown
    await playerAPage.waitForTimeout(5000);
    await expect(playerAPage.getByTestId('countdown')).not.toBeVisible();
  });
});
