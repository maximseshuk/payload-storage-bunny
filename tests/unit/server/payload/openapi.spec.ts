import { describe, expect, it } from 'vitest'

import { createNormalizedConfig } from '@/server/payload/config/normalizer.js'
import { bunnyGroupField } from '@/server/payload/fields/bunnyGroupField.js'
import {
  bunnyDataFieldOpenApi,
  clientUploadOperation,
  streamWebhookOperation,
  tusAuthOperation,
} from '@/server/payload/openapi.js'
import { getStreamEndpoints } from '@/server/payload/stream/endpoints.js'
import type { CollectionContext } from '@/shared/types/index.js'

describe('openapi metadata', () => {
  it('attaches custom.openapi to the stream endpoints', () => {
    const config = createNormalizedConfig({
      collections: { media: { disablePayloadAccessControl: true } },
      stream: {
        apiKey: 'stream-key',
        hostname: 'stream.bunny.net',
        libraryId: 12345,
        tus: true,
        webhook: { secret: 'hook-secret' },
      },
    })

    const endpoints = getStreamEndpoints(config)
    const tusAuth = endpoints.find((endpoint) => endpoint.path === '/storage-bunny/stream/tus-auth')
    const webhook = endpoints.find((endpoint) => endpoint.path === '/storage-bunny/stream/webhook')

    expect(tusAuth?.custom?.openapi).toBe(tusAuthOperation)
    expect(webhook?.custom?.openapi).toBe(streamWebhookOperation)
  })

  it('attaches custom.openapi to the bunnyData field', () => {
    const field = bunnyGroupField({} as CollectionContext)
    expect(field.custom?.openapi).toBe(bunnyDataFieldOpenApi)
  })

  it('describes each operation with a summary and Bunny tags', () => {
    expect(tusAuthOperation.summary).toBeDefined()
    expect(tusAuthOperation.tags).toEqual(['Bunny Stream'])
    expect(streamWebhookOperation.tags).toEqual(['Bunny Stream'])
    expect(clientUploadOperation.tags).toEqual(['Bunny Storage'])
  })
})
