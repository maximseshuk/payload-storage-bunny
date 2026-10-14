import { defineConfig } from '@playwright/test'

import base from './playwright.config.js'

const port = 3100

export default defineConfig({
  ...base,
  fullyParallel: false,
  outputDir: './playwright/results/screenshots',
  retries: 0,
  testDir: './screenshots',
  testMatch: '**/*.screenshots.ts',
  timeout: 5 * 60 * 1000,
  use: { ...base.use, baseURL: `http://localhost:${port}`, screenshot: 'off', trace: 'off', video: 'off' },
  webServer: {
    command: 'pnpm runts tests/dev.ts screenshots --start-memory-db',
    cwd: '..',
    env: { PORT: String(port) },
    reuseExistingServer: false,
    timeout: 180 * 1000,
    url: `http://localhost:${port}/api/access`,
  },
  workers: 1,
})
