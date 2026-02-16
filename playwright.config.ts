import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  testIgnore: ['**/production-smoke*'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['allure-playwright', { resultsDir: 'allure-results/e2e' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    screenshot: 'on',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [
        '**/random-match*.spec.ts',
        '**/cross-match*.spec.ts',
        '**/disconnect-battle*.spec.ts',
        /production-smoke/,
      ],
    },
    // disconnect-battle は切断タイムアウト依存のため独立実行（チェーンをブロックしない）
    {
      name: 'disconnect-battle',
      use: { ...devices['Desktop Chrome'] },
      testMatch: 'disconnect-battle.spec.ts',
    },
    // ランダムマッチテストはキュー共有のためファイル単位で直列実行
    ...([
      'random-match.spec.ts',
      'random-match-multi.spec.ts',
      'random-match-lifecycle.spec.ts',
      'random-match-disconnect.spec.ts',
      'random-match-edge.spec.ts',
      'cross-match.spec.ts',
    ] as const).map((file, i) => ({
      name: `random-match-${i + 1}`,
      use: { ...devices['Desktop Chrome'] },
      testMatch: file,
      fullyParallel: false,
      dependencies: [i === 0 ? 'chromium' : `random-match-${i}`],
    })),
  ],
  webServer: [
    {
      command: 'npm run dev -w server',
      port: 4000,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -w client',
      port: 3000,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
