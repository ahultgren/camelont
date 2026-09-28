import { defineConfig, devices } from '@playwright/test'

// Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to reuse a pre-installed Chromium
// (e.g. in a cloud session) instead of `playwright install`.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/camelont/',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        ...(executablePath ? { launchOptions: { executablePath } } : {}),
      },
    },
  ],
  webServer: {
    command: 'pnpm preview',
    url: 'http://127.0.0.1:4173/camelont/',
    reuseExistingServer: !process.env.CI,
  },
})
