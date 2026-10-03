import { oxlintBase } from '@seshuk/payload-plugin-tooling/oxlint'
import { defineConfig } from 'oxlint'

export default defineConfig({
  ...oxlintBase,
  overrides: [
    ...oxlintBase.overrides,
    {
      files: ['src/client/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@/server',
                  '@/server/**',
                  '@/cli',
                  '@/cli/**',
                  '@/edge/**',
                  'node:*',
                  'fs',
                  'fs/promises',
                  'path',
                  'crypto',
                  'os',
                  'child_process',
                ],
                message: 'client bundle: import only @/shared + npm — no server/cli/edge/node.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/shared/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@/server',
                  '@/server/**',
                  '@/client',
                  '@/client/**',
                  '@/cli',
                  '@/cli/**',
                  '@/edge/**',
                  'node:*',
                  'fs',
                  'fs/promises',
                  'path',
                  'crypto',
                  'os',
                  'child_process',
                ],
                message: 'shared is an isomorphic leaf: no bucket imports, no node builtins.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/server/http/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: [
                  '@/server/bunny',
                  '@/server/bunny/**',
                  '@/server/payload',
                  '@/server/payload/**',
                  '@/server/telemetry',
                  '@/server/telemetry/**',
                  '@/client',
                  '@/client/**',
                  '@/cli',
                  '@/cli/**',
                  '@/edge/**',
                ],
                message: 'http is the lowest server leaf: import only @/shared + npm (ky), never other buckets.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/server/bunny/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@/server/payload', '@/server/payload/**', '@/client/**', '@/cli/**', '@/edge/**'],
                message: 'bunny is a lower layer: import only @/shared + npm, never payload/client/cli.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/server/payload/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@/client', '@/client/**', '@/cli', '@/cli/**', '@/edge/**'],
                message: 'server code must not import the client/cli/edge buckets.',
              },
            ],
          },
        ],
      },
    },
    {
      files: ['src/server/telemetry/**'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@/client', '@/client/**', '@/cli', '@/cli/**', '@/edge/**'],
                message: 'telemetry is server code: import only @/shared + npm, never client/cli/edge.',
              },
            ],
          },
        ],
      },
    },
  ],
})
