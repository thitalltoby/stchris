import { defineConfig, devices } from '@playwright/test';

const PORT = 3100;
const TEST_DB = process.env.TEST_DATABASE_URL ?? 'postgresql://stchris:stchris_dev@localhost:5432/stchris_test';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${PORT}`, trace: 'retain-on-failure', launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' } },
  projects: [
    { name: 'desktop', testIgnore: /mobile\.spec\.ts/, use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'mobile', testMatch: /mobile\.spec\.ts/, use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    port: PORT,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      DATABASE_URL: TEST_DB,
      APP_SECRET: 'e2e-secret-e2e-secret-e2e-secret-123456',
      APP_URL: `http://localhost:${PORT}`,
      STORAGE_DIR: '/tmp/stchris-e2e-storage',
      AUTH_REQUIRE_EMAIL_VERIFICATION: 'false',
      CRON_SECRET: 'e2e-cron-secret',
      NODE_ENV: 'production',
    },
  },
});
