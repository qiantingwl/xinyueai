import { defineConfig } from '@playwright/test'

const baseURL = (process.env.E2E_BASE_URL || 'http://localhost:5173').replace(/\/+$/, '')
const apiOrigin = (process.env.E2E_API_ORIGIN || 'http://localhost:3100').replace(/\/+$/, '')
const webServers = [
  ...(process.env.E2E_BASE_URL
    ? []
    : [{
        command: 'npm run dev -- --port 5173',
        url: 'http://127.0.0.1:5173',
        reuseExistingServer: true,
        timeout: 120_000,
      }]),
  ...(process.env.E2E_API_ORIGIN
    ? []
    : [{
        command: 'npm --prefix server run start',
        url: `${apiOrigin}/v1/health`,
        reuseExistingServer: true,
        timeout: 120_000,
      }]),
]

export default defineConfig({
  testDir: './tests/e2e',
  globalTeardown: './tests/e2e/global-teardown.ts',
  outputDir: './test-results/artifacts',
  timeout: 45_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  webServer: webServers.length ? webServers : undefined,
})
