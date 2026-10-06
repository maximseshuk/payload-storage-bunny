import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { bunnyGroupField } from '@/server/payload/fields/bunnyGroupField.js'
import {
  bunnyDataFieldOpenApi,
  openApiDocument,
  streamWebhookOperation,
  tusAuthOperation,
} from '@/server/payload/openapi.js'
import { createNormalizedOptions } from '@/server/payload/options/normalizer.js'
import { getStreamEndpoints } from '@/server/payload/stream/endpoints.js'
import type { CollectionContext } from '@/shared/types/index.js'

describe('openapi metadata', () => {
  it('attaches custom.openapi to the stream endpoints', () => {
    const options = createNormalizedOptions({
      collections: { media: { disablePayloadAccessControl: true } },
      stream: {
        apiKey: 'stream-key',
        hostname: 'stream.bunny.net',
        libraryId: 12345,
        tus: true,
        webhook: { secret: 'hook-secret' },
      },
    })

    const endpoints = getStreamEndpoints(options)
    const tusAuth = endpoints.find((endpoint) => endpoint.path === '/storage-bunny/stream/tus-auth')
    const webhook = endpoints.find((endpoint) => endpoint.path === '/storage-bunny/stream/webhook')

    expect(tusAuth?.custom?.openapi).toBe(tusAuthOperation)
    expect(webhook?.custom?.openapi).toBe(streamWebhookOperation)
  })

  it('attaches custom.openapi to the bunnyData field', () => {
    const field = bunnyGroupField({} as CollectionContext)
    expect(field.custom?.openapi).toBe(bunnyDataFieldOpenApi)
  })

  it('matches the committed docs/v4/api-reference/openapi.json (run pnpm docs:openapi)', () => {
    const root = resolve(import.meta.dirname, '../../../..')
    const { version } = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')) as { version: string }
    const committed = JSON.parse(readFileSync(resolve(root, 'docs/v4/api-reference/openapi.json'), 'utf8'))

    expect(committed).toEqual(
      JSON.parse(JSON.stringify({ ...openApiDocument, info: { ...openApiDocument.info, version } })),
    )
  })
})
