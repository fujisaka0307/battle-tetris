import {
  test,
  expect,
  createRoom,
  joinRoom,
  enterNickname,
  playToGameOver,
} from './fixtures/setup';

test.describe('Cross Match — ルーム↔ランダムマッチ横断', () => {
  test('E-1: ルーム対戦後 → ランダムマッチで次の対戦', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    // Game 1: Room-based match
    const roomId = await createRoom(playerAPage, 'Alice');
    await joinRoom(playerBPage, 'Bob', roomId);

    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });

    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/battle\//, { timeout: 10000 });

    // Player A loses
    await playToGameOver(playerAPage);
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });

    // Both go to top
    await playerAPage.getByTestId('go-top-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });
    await playerBPage.waitForURL('/', { timeout: 10000 });

    // Game 2: Random match with Player C
    const contextC = await browser.newContext();
    const playerCPage = await contextC.newPage();

    await enterNickname(playerAPage, 'Alice2');
    await playerAPage.getByTestId('random-match-btn').click();

    await enterNickname(playerCPage, 'Charlie');
    await playerCPage.getByTestId('random-match-btn').click();

    // Should be matched
    await playerAPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await playerCPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Charlie', { timeout: 5000 });
    await expect(playerCPage.getByTestId('opponent-name')).toHaveText('Alice2', { timeout: 5000 });

    await contextC.close();
  });

  test('E-2: ランダムマッチ対戦後 → ルーム作成で次の対戦', async ({
    playerAPage,
    playerBPage,
    browser,
  }) => {
    // Game 1: Random match
    await enterNickname(playerAPage, 'Alice');
    await playerAPage.getByTestId('random-match-btn').click();

    await enterNickname(playerBPage, 'Bob');
    await playerBPage.getByTestId('random-match-btn').click();

    await playerAPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });

    await playerAPage.getByTestId('ready-btn').click();
    await playerBPage.getByTestId('ready-btn').click();

    await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/battle\//, { timeout: 10000 });

    // Player A loses
    await playToGameOver(playerAPage);
    await playerBPage.waitForURL(/\/result/, { timeout: 30000 });

    // Both go to top
    await playerAPage.getByTestId('go-top-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });
    await playerBPage.waitForURL('/', { timeout: 10000 });

    // Game 2: Room-based match with Player D
    const contextD = await browser.newContext();
    const playerDPage = await contextD.newPage();

    const newRoomId = await createRoom(playerAPage, 'Alice3');
    await joinRoom(playerDPage, 'Diana', newRoomId);

    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Diana', { timeout: 5000 });
    await expect(playerDPage.getByTestId('opponent-name')).toHaveText('Alice3', { timeout: 5000 });

    await contextD.close();
  });

  test('E-3: ルーム待機中にトップへ戻り → ランダムマッチ → 正常にマッチ', async ({
    playerAPage,
    playerBPage,
  }) => {
    // A creates room and waits
    await createRoom(playerAPage, 'Alice');

    // A decides to leave and try random match instead
    await playerAPage.getByTestId('leave-btn').click();
    await playerAPage.waitForURL('/', { timeout: 5000 });

    // A and B do random match
    await enterNickname(playerAPage, 'Alice');
    await playerAPage.getByTestId('random-match-btn').click();

    await enterNickname(playerBPage, 'Bob');
    await playerBPage.getByTestId('random-match-btn').click();

    // Should match successfully
    await playerAPage.waitForURL(/\/lobby\//, { timeout: 10000 });
    await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });

    await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });
    await expect(playerBPage.getByTestId('opponent-name')).toHaveText('Alice', { timeout: 5000 });
  });
});
