import { defineConfig } from 'oxlint'

export default defineConfig({
  categories: {
    correctness: 'error',
    suspicious: 'warn',
  },
  env: {
    browser: true,
    es2024: true,
    node: true,
  },
  ignorePatterns: ['dist', 'tests/app', '**/payload-types.ts', '**/importMap.js'],
  plugins: ['eslint', 'typescript', 'unicorn', 'oxc', 'react', 'import', 'jsx-a11y', 'promise'],
  rules: {
    'import/no-unassigned-import': 'off',
    'no-console': 'warn',
    'no-underscore-dangle': 'off',
    'react/react-in-jsx-scope': 'off',
    'unicorn/no-useless-fallback-in-spread': 'off',
  },
  overrides: [
    {
      files: ['tests/**', '**/*.spec.ts', '**/*.e2e.ts'],
      plugins: ['vitest'],
      rules: {
        'no-console': 'off',
        'vitest/no-conditional-expect': 'off',
        'vitest/require-mock-type-parameters': 'off',
      },
    },
  ],
})
