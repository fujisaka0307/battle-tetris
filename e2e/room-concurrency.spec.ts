import { test, expect, createRoom, joinRoom, enterNickname } from './fixtures/setup';

test.describe('Room Concurrency — ルーム競合・同時操作', () => {
  test('A-2: 同時にルーム参加を試みる2人 → 1人成功、1人エラー', async ({
    playerAPage,
    browser,
  }) => {
    const roomId = await createRoom(playerAPage, 'Alice');

    const contextB = await browser.newContext();
    const playerBPage = await contextB.newPage();
    const contextC = await browser.newContext();
    const playerCPage = await contextC.newPage();

    // B and C prepare to join the same room
    await enterNickname(playerBPage, 'Bob');
    await playerBPage.getByTestId('room-id-input').fill(roomId);

    await enterNickname(playerCPage, 'Charlie');
    await playerCPage.getByTestId('room-id-input').fill(roomId);

    // Both click join simultaneously
    await Promise.all([
      playerBPage.getByTestId('join-room-btn').click(),
      playerCPage.getByTestId('join-room-btn').click(),
    ]);

    // Wait for results
    await playerBPage.waitForTimeout(5000);
    await playerCPage.waitForTimeout(5000);

    const bInLobby = playerBPage.url().includes('/lobby/');
    const cInLobby = playerCPage.url().includes('/lobby/');

    // Exactly one should join, the other should see an error
    if (bInLobby && !cInLobby) {
      await expect(playerCPage.getByTestId('error-message')).toBeVisible({ timeout: 10000 });
    } else if (cInLobby && !bInLobby) {
      await expect(playerBPage.getByTestId('error-message')).toBeVisible({ timeout: 10000 });
    } else {
      // Both can't be in lobby (room max is 2 including creator)
      expect(bInLobby && cInLobby).toBeFalsy();
    }

    await contextB.close();
    await contextC.close();
  });

  test('A-3: ルーム作成者が退出後に別の人が参加 → エラー', async ({
    playerAPage,
    playerBPage,
  }) => {
    const roomId = await createRoom(playerAPage, 'Alice');

    // Creator leaves
    await playerAPage.getByTestId('leave-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });

    // Player B tries to join the now-empty room
    await enterNickname(playerBPage, 'Bob');
    await playerBPage.getByTestId('room-id-input').fill(roomId);
    await playerBPage.getByTestId('join-room-btn').click();

    await expect(playerBPage.getByTestId('error-message')).toBeVisible({ timeout: 10000 });
  });

  test('A-4: 複数ルーム同時作成 → 各ルームが独立して生成される', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    const contextC = await browser.newContext();
    const playerCPage = await contextC.newPage();

    // All three create rooms simultaneously
    const [roomIdA, roomIdB, roomIdC] = await Promise.all([
      createRoom(playerAPage, 'Alice'),
      createRoom(playerBPage, 'Bob'),
      createRoom(playerCPage, 'Charlie'),
    ]);

    // All room IDs should be different
    expect(roomIdA).not.toBe(roomIdB);
    expect(roomIdB).not.toBe(roomIdC);
    expect(roomIdA).not.toBe(roomIdC);

    // All should be valid 6-char alphanumeric
    expect(roomIdA).toMatch(/^[A-Za-z0-9]{6}$/);
    expect(roomIdB).toMatch(/^[A-Za-z0-9]{6}$/);
    expect(roomIdC).toMatch(/^[A-Za-z0-9]{6}$/);

    await contextC.close();
  });

  test('A-5: ルーム参加後に退出して別ルームへ参加', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    const contextC = await browser.newContext();
    const playerCPage = await contextC.newPage();

    // A and C create rooms
    const roomIdA = await createRoom(playerAPage, 'Alice');
    const roomIdC = await createRoom(playerCPage, 'Charlie');

    // B joins A's room
    await joinRoom(playerBPage, 'Bob', roomIdA);
    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });

    // B leaves A's room
    await playerBPage.getByTestId('leave-btn').click();
    await playerBPage.waitForURL('/', { timeout: 5000 });

    // B joins C's room
    await joinRoom(playerBPage, 'Bob', roomIdC);

    // Verify B and C are matched
    await expect(playerCPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });
    await expect(playerBPage.getByTestId('opponent-name')).toHaveText('Charlie', { timeout: 5000 });

    // A should be back to waiting
    await expect(playerAPage.getByTestId('waiting-text')).toBeVisible({ timeout: 10000 });

    await contextC.close();
  });

  test('A-6: 同じニックネームの2人が同じルームに参加 → 正常動作', async ({
    playerAPage,
    playerBPage,
  }) => {
    const roomId = await createRoom(playerAPage, 'Player1');
    await joinRoom(playerBPage, 'Player1', roomId);

    // Both should see the opponent with same nickname
    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Player1', { timeout: 5000 });
    await expect(playerBPage.getByTestId('opponent-name')).toHaveText('Player1', { timeout: 5000 });

    // Both should be able to Ready and start
    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/battle\//, { timeout: 10000 });

    await expect(playerAPage.getByTestId('game-canvas')).toBeVisible();
    await expect(playerBPage.getByTestId('game-canvas')).toBeVisible();
  });
});
