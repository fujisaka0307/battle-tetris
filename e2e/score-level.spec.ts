import { test, expect, startBattle } from './fixtures/setup';

test.describe('Score/Level — 初期値検証', () => {
  test('対戦開始時にスコアが0であること', async ({ playerAPage, playerBPage }) => {
    await startBattle(playerAPage, playerBPage);

    await expect(playerAPage.getByTestId('score')).toHaveText('0');
    await expect(playerBPage.getByTestId('score')).toHaveText('0');
  });

  test('対戦開始時にLinesが0であること', async ({ playerAPage, playerBPage }) => {
    await startBattle(playerAPage, playerBPage);

    await expect(playerAPage.getByTestId('lines')).toHaveText('0');
    await expect(playerBPage.getByTestId('lines')).toHaveText('0');
  });

  test('対戦開始時にLevelが0であること', async ({ playerAPage, playerBPage }) => {
    await startBattle(playerAPage, playerBPage);

    await expect(playerAPage.getByTestId('level')).toHaveText('0');
    await expect(playerBPage.getByTestId('level')).toHaveText('0');
  });
});
