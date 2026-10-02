import { existsSync } from 'node:fs'

import { defineConfig, devices } from '@playwright/test'

if (existsSync('.env')) process.loadEnvFile()

const suiteName = process.env.E2E_SUITE_NAME || 'default'

export default defineConfig({
  forbidOnly: !!process.env.CI,
  fullyParallel: false,
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
  retries: process.env.CI ? 1 : undefined,
  testDir: '.',
  testMatch: '**/*.e2e.ts',
  timeout: 60 * 1000,
  use: {
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
  },
  workers: 16,
})
