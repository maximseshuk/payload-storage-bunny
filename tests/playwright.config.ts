import { defineConfig, devices } from '@playwright/test'
import 'dotenv/config'

const suiteName = process.env.E2E_SUITE_NAME || 'default'

export default defineConfig({
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
  maxFailures: process.env.CI ? undefined : undefined,
  outputDir: `./playwright/results/${suiteName}`,
  preserveOutput: 'always',
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chromium' },
    },
  ],
  reporter: process.env.CI
    ? [
        ['list', { printSteps: true }],
        ['json', { outputFile: `./playwright/reports/${suiteName}.json` }],
      ]
    : [['list', { printSteps: true }]],
  retries: process.env.CI ? 3 : undefined,
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  timeout: 60 * 1000, // 1 minute
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  workers: 16,
})
