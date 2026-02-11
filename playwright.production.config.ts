import { defineConfig, devices } from '@playwright/test';

/**
 * 本番環境向け Playwright 設定。
 * 環境変数 BASE_URL で対象URLを指定する。
 * webServer は起動しない（デプロイ済みの環境をテスト対象とする）。
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: true,
  retries: 2,
  workers: 1,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: process.env.BASE_URL || 'https://stapp-battle-tetris-prod.azurestaticapps.net',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer — tests run against the deployed environment
  timeout: 30000,
  expect: {
    timeout: 10000,
  },
});
