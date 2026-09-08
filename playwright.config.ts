import { defineConfig } from '@playwright/test'

const baseURL = (process.env.E2E_BASE_URL || 'http://localhost:6001').replace(/\/+$/, '')
const apiOrigin = (process.env.E2E_API_ORIGIN || 'http://localhost:6001').replace(/\/+$/, '')
const webServers = [
  ...(process.env.E2E_BASE_URL
    ? []
    : [{
        command: 'npm run dev -- --port 6001',
        url: 'http://127.0.0.1:6001',
        reuseExistingServer: true,
        timeout: 120_000,
      }]),
  ...(process.env.E2E_API_ORIGIN
    ? []
    : [{
        command: 'npm --prefix server run start',
        url: `${baseURL}/v1/health`,
        reuseExistingServer: true,
        timeout: 120_000,
      }]),
]

export default defineConfig({
  testDir: './tests/e2e',
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
