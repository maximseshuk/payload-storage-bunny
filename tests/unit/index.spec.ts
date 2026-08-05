import type { Config } from 'payload'
import { describe, expect, it } from 'vitest'

import { bunnyStorage } from '@/index.js'
import type { BunnyStorageConfig } from '@/shared/types/index.js'

type MediaOptions = BunnyStorageConfig['collections'][string]

const buildMediaUpload = (media: MediaOptions, options: Partial<BunnyStorageConfig> = {}): Record<string, unknown> => {
  const incoming = {
    collections: [{ slug: 'media', fields: [], upload: { disableLocalStorage: true } }],
  } as unknown as Config

  const result = bunnyStorage({
    collections: { media },
    storage: {
      apiKey: 'zone-pw',
      hostname: 'cdn.b-cdn.net',
      tokenSecurityKey: 'security-key',
      zoneName: 'zone',
    },
    ...options,
  } as BunnyStorageConfig)(incoming) as Config

  const collection = result.collections?.find((entry) => entry.slug === 'media')

  return collection?.upload as Record<string, unknown>
}

describe('upload.cacheTags wiring', () => {
  it('disables cache tags for direct CDN urls signed by Bunny', () => {
    const upload = buildMediaUpload({ disablePayloadAccessControl: true }, { signedUrls: true })

    expect(upload.cacheTags).toBe(false)
  })

  it('keeps cache tags when signed urls are served through the Payload handler', () => {
    const upload = buildMediaUpload(true, { signedUrls: true })

    expect(upload.cacheTags).toBeUndefined()
  })

  it('keeps cache tags when nothing signs the url', () => {
    const upload = buildMediaUpload({ disablePayloadAccessControl: true })

    expect(upload.cacheTags).toBeUndefined()
  })

  it('disables cache tags when the thumbnail appends its own timestamp', () => {
    const upload = buildMediaUpload(true, { thumbnail: { appendTimestamp: true } })

    expect(upload.cacheTags).toBe(false)
  })
})
