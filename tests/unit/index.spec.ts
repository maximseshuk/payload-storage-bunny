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

describe('client upload handler registration', () => {
  const stream = { apiKey: 'stream-key', hostname: 'vz.b-cdn.net', libraryId: 1, mp4Fallback: true, tus: true }

  const getHandlerProviders = (media: MediaOptions): Array<{ clientProps: Record<string, unknown> }> => {
    const incoming = {
      collections: [{ slug: 'media', fields: [], upload: { mimeTypes: ['video/*', 'image/*'] } }],
    } as unknown as Config

    const result = bunnyStorage({
      collections: { media },
      storage: { apiKey: 'zone-pw', hostname: 'cdn.b-cdn.net', s3: { region: 'de' }, zoneName: 'zone' },
      stream,
    } as BunnyStorageConfig)(incoming) as Config

    return (result.admin?.components?.providers ?? []).filter(
      (provider) =>
        typeof provider === 'object' &&
        provider.path === '@seshuk/payload-storage-bunny/client#BunnyClientUploadHandler',
    ) as Array<{ clientProps: Record<string, unknown> }>
  }

  it('routes Stream-only TUS collections through the handler with their video types', () => {
    const [provider] = getHandlerProviders({ disablePayloadAccessControl: true, storage: false })

    expect(provider?.clientProps.collectionSlug).toBe('media')
    const { streamMimeTypes } = provider!.clientProps.extra as { streamMimeTypes: string[] }
    expect(streamMimeTypes).toContain('video/mp4')
    expect(streamMimeTypes.some((type) => type.startsWith('image/'))).toBe(false)
  })

  it('routes videos over TUS when the collection also has Storage client uploads', () => {
    const [provider] = getHandlerProviders({ storage: { clientUploads: true } })

    expect(provider?.clientProps.extra).toHaveProperty('streamMimeTypes')
  })

  it('leaves Storage + Stream collections without client uploads on server uploads', () => {
    expect(getHandlerProviders(true)).toEqual([])
  })
})
