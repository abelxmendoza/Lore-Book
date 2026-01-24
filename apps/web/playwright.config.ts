import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  timeout: 60000, // Increase global test timeout to 60s
  use: {
    baseURL: process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    actionTimeout: 30000, // Increase action timeout to 30s
    navigationTimeout: 30000, // Increase navigation timeout to 30s
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 12'] },
    },
  ],

  // When E2E_EXTERNAL_SERVER=1, an external process (e.g. start-server-and-test) starts
  // the dev/preview server; we skip starting webServer to avoid "Process from config.webServer
  // was not able to start. Exit code: 1" when the built-in spawn fails.
  ...(process.env.E2E_EXTERNAL_SERVER
    ? {}
    : {
        webServer: {
          command: process.env.CI ? 'npm run preview' : 'npm run dev',
          url: process.env.CI ? 'http://localhost:4173' : 'http://localhost:5173',
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
          env: {
            VITE_SHOW_DEV_NOTICE: 'false',
          },
        },
      }),
});

