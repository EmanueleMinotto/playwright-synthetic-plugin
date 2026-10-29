import { defineConfig } from '@playwright/test';
import type { SyntheticOptions } from './src/index.js';

export default defineConfig<SyntheticOptions>({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  use: {
    baseURL: 'http://localhost:3457',
    trace: 'on',
    syntheticConfig: {
      block: [{ url: '/api/orders' }],
    },
  },
  webServer: {
    command: 'node tests/e2e/server.mjs',
    url: 'http://localhost:3457/',
    reuseExistingServer: !process.env.CI,
  },
  reporter: [
    ['list'],
    ['./src/reporter.ts'],
  ],
});
