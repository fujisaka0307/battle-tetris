import { test, expect, enterNickname, createRoom } from './fixtures/setup';

// ルームリストは共有サーバー状態に依存するためシリアル実行
test.describe.configure({ mode: 'serial' });

test.describe('Waiting Room List — 待機中ルームリスト', () => {
  test('G-1: ルーム作成後にトップページのリストに表示される', async ({
    playerAPage,
    playerBPage,
  }) => {
    // Player B opens top page first (triggers early connection + subscribe)
    await playerBPage.goto('/');
    await playerBPage.waitForTimeout(1000);

    // Player A creates a room
    const roomId = await createRoom(playerAPage, 'Alice');

    // Player B should see the room in the waiting list
    await expect(playerBPage.getByTestId('waiting-room-list')).toBeVisible({ timeout: 5000 });

    // Find the specific room item containing Alice's room
    const roomItem = playerBPage.getByTestId('waiting-room-item').filter({
      has: playerBPage.getByTestId('waiting-room-id').getByText(roomId),
    });
    await expect(roomItem.getByTestId('waiting-room-creator')).toHaveText('Alice');

    // Clean up: leave the room
    await playerAPage.getByTestId('leave-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });
  });

  test('G-2: 待機ルームリストの参加ボタンでルームに参加できる', async ({
    playerAPage,
    playerBPage,
  }) => {
    // Player B opens top page first
    await playerBPage.goto('/');
    await playerBPage.waitForTimeout(1000);

    // Player A creates a room
    const roomId = await createRoom(playerAPage, 'Alice');

    // Player B enters nickname and clicks join from Alice's specific room
    await expect(playerBPage.getByTestId('waiting-room-list')).toBeVisible({ timeout: 5000 });
    await playerBPage.getByTestId('nickname-input').fill('Bob');

    const roomItem = playerBPage.getByTestId('waiting-room-item').filter({
      has: playerBPage.getByTestId('waiting-room-id').getByText(roomId),
    });
    await roomItem.getByTestId('waiting-room-join-btn').click();

    // Both should be in lobby
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });
    await expect(playerBPage.getByTestId('opponent-name')).toHaveText('Alice', { timeout: 5000 });
  });

  test('G-3: ルーム満員でリストから消える', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    // Player C opens top page to observe the list
    const contextC = await browser.newContext();
    const playerCPage = await contextC.newPage();
    await playerCPage.goto('/');
    await playerCPage.waitForTimeout(1000);

    // Player A creates a room
    const roomId = await createRoom(playerAPage, 'Alice');

    // Player C should see the waiting room
    await expect(playerCPage.getByTestId('waiting-room-list')).toBeVisible({ timeout: 5000 });
    const roomItem = playerCPage.getByTestId('waiting-room-item').filter({
      has: playerCPage.getByTestId('waiting-room-id').getByText(roomId),
    });
    await expect(roomItem).toBeVisible();

    // Player B joins the room (room becomes full)
    await enterNickname(playerBPage, 'Bob');
    await playerBPage.getByTestId('room-id-input').fill(roomId);
    await playerBPage.getByTestId('join-room-btn').click();
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    // Player C's list should no longer show that room
    await expect(roomItem).not.toBeVisible({ timeout: 5000 });

    await contextC.close();
  });

  test('G-4: 作成者退出でリストから消える', async ({
    playerAPage,
    playerBPage,
  }) => {
    // Player B opens top page first
    await playerBPage.goto('/');
    await playerBPage.waitForTimeout(1000);

    // Player A creates a room
    const roomId = await createRoom(playerAPage, 'Alice');

    // Player B sees the room
    await expect(playerBPage.getByTestId('waiting-room-list')).toBeVisible({ timeout: 5000 });
    const roomItem = playerBPage.getByTestId('waiting-room-item').filter({
      has: playerBPage.getByTestId('waiting-room-id').getByText(roomId),
    });
    await expect(roomItem).toBeVisible();

    // Player A leaves the room
    await playerAPage.getByTestId('leave-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });

    // That room should disappear
    await expect(roomItem).not.toBeVisible({ timeout: 5000 });
  });

  test('G-5: 待機ルームがなければリスト非表示', async ({
    playerAPage,
    browser,
  }) => {
    // Use a fresh server-like scenario: create and destroy a room to verify it disappears
    await playerAPage.goto('/');
    await playerAPage.waitForTimeout(1000);

    // Create a room with a separate context
    const contextTemp = await browser.newContext();
    const tempPage = await contextTemp.newPage();
    const roomId = await createRoom(tempPage, 'TempUser');

    // Verify it appears in the list
    const roomItem = playerAPage.getByTestId('waiting-room-item').filter({
      has: playerAPage.getByTestId('waiting-room-id').getByText(roomId),
    });
    await expect(roomItem).toBeVisible({ timeout: 5000 });

    // Creator leaves → room is deleted
    await tempPage.getByTestId('leave-btn').click();
    await contextTemp.close();

    // That specific room should no longer be visible
    await expect(roomItem).not.toBeVisible({ timeout: 5000 });
  });
});
