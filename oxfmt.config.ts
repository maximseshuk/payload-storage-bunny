import { defineConfig } from 'oxfmt'

export default defineConfig({
  arrowParens: 'always',
  printWidth: 120,
  semi: false,
  singleQuote: true,
  sortImports: {
    groups: [
      ['value-builtin', 'type-builtin'],
      ['value-external', 'type-external'],
      ['value-internal', 'type-internal'],
      ['value-parent', 'type-parent', 'value-sibling', 'type-sibling', 'value-index', 'type-index'],
      'unknown',
    ],
    newlinesBetween: true,
  },
  sortPackageJson: {
    sortScripts: true,
  },
  trailingComma: 'all',
  ignorePatterns: ['dist', 'tests/app', '**/payload-types.ts', 'pnpm-lock.yaml'],
})
