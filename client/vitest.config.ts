import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts', 'allure-vitest/setup', './src/__tests__/allure-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    reporters: [
      'default',
      ['allure-vitest/reporter', { resultsDir: '../allure-results/client' }],
    ],
  },
});
