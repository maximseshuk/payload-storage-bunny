import { fileURLToPath } from 'node:url'

import { vitestBase } from '@seshuk/payload-plugin-tooling/vitest'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  ...vitestBase,
  esbuild: { jsx: 'automatic' },
  test: {
    coverage: {
      exclude: ['src/**/*.d.ts', 'src/shared/translations/locales/**', 'src/shared/types/**'],
      include: ['src/**/*.{ts,tsx}'],
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportOnFailure: true,
    },
    environment: 'node',
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          exclude: [...configDefaults.exclude, 'tests/unit/**/*.dom.spec.ts'],
          include: ['tests/unit/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          environment: 'happy-dom',
          environmentOptions: { happyDOM: { settings: { disableIframePageLoading: true } } },
          name: 'unit-dom',
          include: ['tests/unit/**/*.dom.spec.ts'],
        },
      },
      { extends: true, test: { name: 'int', include: ['tests/integration/**/*.int.spec.ts'] } },
    ],
    root: fileURLToPath(new URL('..', import.meta.url)),
    testTimeout: 30000,
  },
})
