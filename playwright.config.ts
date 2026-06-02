import { defineConfig, devices } from '@playwright/test'

const PORT = process.env.E2E_PORT ?? '3100'
const BASE_URL = `http://127.0.0.1:${PORT}`

/**
 * Each test run gets its own SQLite file so CI and local runs don't fight over
 * state. Global setup nukes + pushes schema before the dev server boots.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false, // share a single app instance; tests share state via global-setup resets
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 5_000 },
  reporter: process.env.CI ? 'github' : 'list',
  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  webServer: {
    command: `npm run build && npm run start -- -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: 'file:./data/e2e.db',
      SESSION_PASSWORD: 'e2e_session_password_32_chars_minimum_length_test_ok',
      NEXT_PUBLIC_APP_URL: BASE_URL,
      // Run like production, but let session cookies work over plain http.
      NODE_ENV: 'production',
      SESSION_COOKIE_SECURE: 'false',
    },
  },
})
