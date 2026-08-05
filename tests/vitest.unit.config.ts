import { defineConfig } from 'vitest/config'

import baseConfig from './vitest.config.js'

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    include: ['tests/unit/**/*.spec.ts'],
  },
})
