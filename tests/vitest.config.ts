import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL('../src/', import.meta.url)) }],
  },
  test: {
    coverage: {
      exclude: ['src/**/*.d.ts', 'src/shared/translations/locales/**', 'src/shared/types/**'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
    },
    environment: 'node',
    globals: true,
    projects: [
      { extends: true, test: { name: 'unit', include: ['tests/unit/**/*.spec.ts'] } },
      { extends: true, test: { name: 'int', include: ['tests/integration/**/*.int.spec.ts'] } },
    ],
    root: fileURLToPath(new URL('..', import.meta.url)),
    testTimeout: 30000,
  },
})
