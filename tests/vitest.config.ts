import path from 'node:path'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    alias: {
      '@': path.resolve(__dirname, '../src'),
    },
    coverage: {
      exclude: ['src/**/*.d.ts', 'src/shared/translations/locales/**', 'src/shared/types/**'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
    },
    environment: 'node',
    globals: true,
    globalSetup: path.resolve(__dirname, './helpers/int/vitestGlobalSetup.ts'),
    include: ['tests/unit/**/*.spec.ts', 'tests/integration/**/*.int.spec.ts'],
    root: path.resolve(__dirname, '..'),
    testTimeout: 30000,
  },
})
