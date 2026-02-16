import { test, expect, createRoom, joinRoom } from './fixtures/setup';

test.describe('ロビー — 拡張テスト', () => {
  test('ルームIDが6桁英数字形式であること', async ({ playerAPage }) => {
    const roomId = await createRoom(playerAPage);
    expect(roomId).toMatch(/^[A-Za-z0-9]{6}$/);
  });

  test('退出すると相手にwaiting-textが再表示されること', async ({ playerAPage, playerBPage }) => {
    const roomId = await createRoom(playerAPage);
    await joinRoom(playerBPage, roomId);

    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });

    // Player B leaves
    await playerBPage.getByTestId('leave-btn').click();

    // Player A should see waiting text again
    await expect(playerAPage.getByTestId('waiting-text')).toBeVisible({ timeout: 10000 });
  });

  test('認証なしでロビーURL直接アクセスするとログインページへリダイレクトされること', async ({
    page,
  }) => {
    await page.goto('/lobby/ABC123');
    // In SKIP_AUTH mode, unauthenticated users are redirected to login page
    const testLoginBtn = page.getByTestId('test-login-btn');
    const loginBtn = page.getByTestId('login-btn');
    const hasTestLogin = await testLoginBtn.isVisible({ timeout: 5000 }).catch(() => false);
    const hasLogin = await loginBtn.isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasTestLogin || hasLogin).toBeTruthy();
  });

  test('片方のみReadyではカウントダウンが始まらないこと', async ({ playerAPage, playerBPage }) => {
    const roomId = await createRoom(playerAPage);
    await joinRoom(playerBPage, roomId);

    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });

    // Only Player A clicks Ready
    await playerAPage.getByTestId('ready-btn').click();

    // Wait 5 seconds and confirm no countdown
    await playerAPage.waitForTimeout(5000);
    await expect(playerAPage.getByTestId('countdown')).not.toBeVisible();
  });
});
