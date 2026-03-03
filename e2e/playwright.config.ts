import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 45_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: 'http://localhost:8080',
    trace: 'on-first-retry'
  },
  reporter: [['list']]
});
