import { test, expect, createRoom, joinRoom } from './fixtures/setup';

test.describe('カウントダウン詳細', () => {
  test('カウントダウンが3から始まること', async ({ playerAPage, playerBPage }) => {
    const roomId = await createRoom(playerAPage);
    await joinRoom(playerBPage, roomId);
    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });

    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    await expect(playerAPage.getByTestId('countdown')).toHaveText('3', { timeout: 5000 });
  });

  test('カウントダウン後にGO!が表示されること', async ({ playerAPage, playerBPage }) => {
    const roomId = await createRoom(playerAPage);
    await joinRoom(playerBPage, roomId);
    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });

    // GO! element appears very briefly (navigate() is called in the same tick as countdown=0),
    // so use a MutationObserver to capture it before React unmounts the component.
    await playerAPage.evaluate(() => {
      (window as any).__goText = null;
      const observer = new MutationObserver(() => {
        const el = document.querySelector('[data-testid="countdown-go"]');
        if (el) {
          (window as any).__goText = el.textContent;
          observer.disconnect();
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
    });

    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    // Wait for battle page (countdown completed)
    await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });

    const goText = await playerAPage.evaluate(() => (window as any).__goText);
    expect(goText).toBe('GO!');
  });

  test('カウントダウン中にReadyボタンが非表示', async ({ playerAPage, playerBPage }) => {
    const roomId = await createRoom(playerAPage);
    await joinRoom(playerBPage, roomId);
    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });

    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    // Wait for countdown to start
    await expect(playerAPage.getByTestId('countdown')).toBeVisible({ timeout: 5000 });

    // Ready button should not be visible during countdown
    await expect(playerAPage.getByTestId('ready-btn')).not.toBeVisible();
    await expect(playerBPage.getByTestId('ready-btn')).not.toBeVisible();
  });
});
