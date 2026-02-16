import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  globalSetup: './e2e/global-setup.ts',
  testDir: './e2e',
  testIgnore: [/production-smoke/],
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
