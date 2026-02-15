import { test as base, expect, type Page } from '@playwright/test';
import { parentSuite } from 'allure-js-commons';

// すべてのE2Eテストに parentSuite ラベルを付与
base.beforeEach(() => {
  parentSuite('E2Eテスト');
});

/**
 * E2Eテスト用のセットアップヘルパー。
 * 2プレイヤーのブラウザコンテキストを提供する。
 */
export const test = base.extend<{
  playerAPage: Page;
  playerBPage: Page;
}>({
  playerAPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
  playerBPage: async ({ browser }, use) => {
    const context = await browser.newContext();
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

/**
 * ニックネームを入力してページの準備を行うヘルパー。
 */
export async function enterNickname(page: Page, nickname: string): Promise<void> {
  await page.goto('/');
  await page.getByTestId('nickname-input').fill(nickname);
}

/**
 * ルームを作成して roomId を返すヘルパー。
 */
export async function createRoom(page: Page, nickname: string): Promise<string> {
  await enterNickname(page, nickname);
  await page.getByTestId('create-room-btn').click();

  // Wait for navigation to lobby
  await page.waitForURL(/\/lobby\//, { timeout: 10000 });
  const roomId = page.url().split('/lobby/')[1];
  return roomId;
}

/**
 * ルームに参加するヘルパー。
 */
export async function joinRoom(page: Page, nickname: string, roomId: string): Promise<void> {
  await enterNickname(page, nickname);
  await page.getByTestId('room-id-input').fill(roomId);
  await page.getByTestId('join-room-btn').click();

  // Wait for navigation to lobby
  await page.waitForURL(/\/lobby\//, { timeout: 10000 });
}

/**
 * 両プレイヤーを対戦画面まで進めるヘルパー。
 */
export async function startBattle(playerAPage: Page, playerBPage: Page): Promise<void> {
  const roomId = await createRoom(playerAPage, 'Alice');
  await joinRoom(playerBPage, 'Bob', roomId);

  await expect(playerAPage.getByTestId('opponent-name')).toHaveText('Bob', { timeout: 5000 });

  await playerAPage.getByTestId('ready-btn').click();
  await playerBPage.getByTestId('ready-btn').click();

  await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
  await playerBPage.waitForURL(/\/battle\//, { timeout: 10000 });
}

/**
 * Spaceキー連打でゲームオーバーまで進めるヘルパー。
 * /result への遷移を待つ。
 */
export async function playToGameOver(page: Page): Promise<void> {
  await page.waitForTimeout(500);
  // Hard drop repeatedly until game over (navigates to /result)
  for (let i = 0; i < 50; i++) {
    await page.keyboard.press('Space');
    await page.waitForTimeout(100);
    if (page.url().includes('/result')) break;
  }
  await page.waitForURL(/\/result/, { timeout: 30000 });
}

/**
 * 対戦→ゲームオーバー→両者Result画面まで進めるヘルパー。
 * PlayerA が負ける（ハードドロップ連打）。
 */
export async function startBattleAndFinish(
  playerAPage: Page,
  playerBPage: Page,
): Promise<void> {
  await startBattle(playerAPage, playerBPage);
  await playToGameOver(playerAPage);
  await playerAPage.waitForURL(/\/result/, { timeout: 30000 });
  await playerBPage.waitForURL(/\/result/, { timeout: 30000 });
}

/**
 * ランダムマッチでマッチング→ロビーまで進めるヘルパー。
 */
export async function randomMatchToLobby(
  playerAPage: Page,
  playerBPage: Page,
  nicknameA = 'Alice',
  nicknameB = 'Bob',
): Promise<void> {
  await enterNickname(playerAPage, nicknameA);
  await playerAPage.getByTestId('random-match-btn').click();
  await enterNickname(playerBPage, nicknameB);
  await playerBPage.getByTestId('random-match-btn').click();
  await playerAPage.waitForURL(/\/lobby\//, { timeout: 10000 });
  await playerBPage.waitForURL(/\/lobby\//, { timeout: 10000 });
  await expect(playerAPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
  await expect(playerBPage.getByTestId('opponent-name')).toBeVisible({ timeout: 5000 });
}

/**
 * ランダムマッチで対戦画面まで進めるヘルパー。
 */
export async function randomMatchToBattle(
  playerAPage: Page,
  playerBPage: Page,
  nicknameA = 'Alice',
  nicknameB = 'Bob',
): Promise<void> {
  await randomMatchToLobby(playerAPage, playerBPage, nicknameA, nicknameB);
  await playerAPage.getByTestId('ready-btn').click();
  await playerBPage.getByTestId('ready-btn').click();
  await playerAPage.waitForURL(/\/battle\//, { timeout: 10000 });
  await playerBPage.waitForURL(/\/battle\//, { timeout: 10000 });
}

export { expect };
