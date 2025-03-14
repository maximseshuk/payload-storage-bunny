import payloadEsLintConfig from '@payloadcms/eslint-config'
import pluginStylistic from '@stylistic/eslint-plugin'

const GLOB_ALL_JS_TS = ['**/*.js', '**/*.jsx', '**/*.ts', '**/*.tsx', '**/*.mjs', '**/*.cjs']

const stylisticConfig = {
  files: GLOB_ALL_JS_TS,
  plugins: {
    '@stylistic': pluginStylistic,
  },
  rules: {
    '@stylistic/block-spacing': ['error', 'always'],
    '@stylistic/brace-style': ['error', '1tbs'],
    '@stylistic/comma-dangle': ['error', 'always-multiline'],
    '@stylistic/comma-spacing': ['error', { after: true, before: false }],
    '@stylistic/func-call-spacing': ['error', 'never'],
    '@stylistic/indent': ['error', 2],
    '@stylistic/key-spacing': ['error', {
      afterColon: true,
      beforeColon: false,
      mode: 'strict',
    }],
    '@stylistic/keyword-spacing': ['error', {
      after: true,
      before: true,
    }],
    '@stylistic/lines-between-class-members': ['error', 'always', {
      exceptAfterSingleLine: true,
    }],
    '@stylistic/max-len': ['error', { code: 120, ignoreStrings: true, ignoreTemplateLiterals: true }],
    '@stylistic/member-delimiter-style': ['error', {
      multiline: {
        delimiter: 'none',
        requireLast: false,
      },
      singleline: {
        delimiter: 'semi',
        requireLast: false,
      },
    }],
    '@stylistic/no-multiple-empty-lines': ['error', { max: 1 }],
    '@stylistic/no-trailing-spaces': ['error', {
      ignoreComments: false,
      skipBlankLines: false,
    }],
    '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
    '@stylistic/semi': ['error', 'never'],
    '@stylistic/space-before-blocks': ['error', 'always'],
    '@stylistic/space-before-function-paren': ['error', {
      anonymous: 'always',
      asyncArrow: 'always',
      named: 'never',
    }],
    '@stylistic/space-infix-ops': 'error',
    '@stylistic/type-annotation-spacing': ['error', {
      after: true,
      before: false,
      overrides: { arrow: { after: true, before: true } },
    }],
    'eol-last': ['error', 'never'],
    'no-multi-spaces': 'error',
    'no-trailing-spaces': 'error',
    'object-curly-newline': ['error', {
      consistent: true,
      multiline: true,
    }],
    'object-curly-spacing': ['error', 'always'],
  },
}

export const defaultESLintIgnores = [
  '**/.temp',
  '**/.*',
  '**/.git',
  '**/.hg',
  '**/.pnp.*',
  '**/.svn',
  '**/playwright.config.ts',
  '**/jest.config.js',
  '**/tsconfig.tsbuildinfo',
  '**/README.md',
  '**/eslint.config.js',
  '**/payload-types.ts',
  '**/dist/',
  '**/.yarn/',
  '**/build/',
  '**/node_modules/',
  '**/temp/',
]

export default [
  ...payloadEsLintConfig,
  stylisticConfig,
  {
    rules: {
      'no-restricted-exports': 'off',
    },
  },
  {
    languageOptions: {
      parserOptions: {
        sourceType: 'module',
        ecmaVersion: 'latest',
        projectService: {
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 40,
          allowDefaultProject: ['scripts/*.ts', '*.js', '*.mjs', '*.spec.ts', '*.d.ts'],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
]
