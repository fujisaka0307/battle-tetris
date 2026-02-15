import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
    setupFiles: ['allure-vitest/setup', './src/__tests__/allure-setup.ts'],
    reporters: [
      'default',
      ['allure-vitest/reporter', { resultsDir: '../allure-results/server' }],
    ],
  },
});
