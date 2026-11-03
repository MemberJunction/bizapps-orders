/**
 * Playwright configuration for the bizapps-orders Explorer GUI harness.
 *
 * Two projects:
 *
 *   1. `auth-setup` — runs ONCE, headed, when `.auth/user.json` does not exist yet (or when
 *      `PW_FORCE_LOGIN=1`). Opens Explorer and waits for a human to complete the identity-provider
 *      login, then saves the browser storage state (`cookies` + `localStorage`).
 *
 *   2. `orders` — the verification specs. Reuses `.auth/user.json`, runs headless by default
 *      (`PW_HEADLESS=0` for headed), single worker so form interactions do not race each other.
 */
import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';
import { EXPLORER_BASE_URL, STORAGE_STATE_PATH } from './lib/env';

const hasSavedSession = existsSync(STORAGE_STATE_PATH) && process.env.PW_FORCE_LOGIN !== '1';
const headless = process.env.PW_HEADLESS !== '0';

export default defineConfig({
  testDir: '.',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 240_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  outputDir: 'test-results',
  globalSetup: './lib/global-setup.ts',

  use: {
    baseURL: EXPLORER_BASE_URL,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 15_000,
    navigationTimeout: 45_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'auth-setup',
      testMatch: /auth\.setup\.ts/,
      timeout: 360_000,
      use: {
        ...devices['Desktop Chrome'],
        headless: hasSavedSession && process.env.PW_AUTH_ASSIST_PICK_ACCOUNT !== '1',
        storageState: hasSavedSession ? STORAGE_STATE_PATH : undefined,
      },
    },
    {
      name: 'orders',
      testDir: './specs',
      dependencies: ['auth-setup'],
      use: {
        ...devices['Desktop Chrome'],
        headless,
        storageState: STORAGE_STATE_PATH,
      },
    },
  ],
});
