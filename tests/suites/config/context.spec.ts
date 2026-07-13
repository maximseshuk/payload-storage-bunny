import type { BunnyStorageConfig } from '@/types/config.js'
import type { CollectionConfig } from 'payload'

import { createCollectionContext, getNormalizedConfig } from '@/utils/config/context.js'
import { createNormalizedConfig } from '@/utils/config/normalizer.js'
import { describe, expect, it } from 'vitest'

const createBaseStorage = () => ({
  apiKey: 'storage-key',
  hostname: 'storage.bunny.net',
  tokenSecurityKey: 'token-key',
  uploadTimeout: 60000,
  zoneName: 'test-zone',
})

const createBaseStream = () => ({
  apiKey: 'stream-key',
  hostname: 'stream.bunny.net',
  libraryId: 12345,
  tokenSecurityKey: 'stream-token',
})

const createMockCollection = (slug: string, overrides: Partial<CollectionConfig> = {}): CollectionConfig => ({
  slug,
  fields: [],
  ...overrides,
})

describe('createCollectionContext', () => {
  describe('global config inheritance', () => {
    it('inherits all global settings when collection has no overrides', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'global-api-key',
        collections: { media: true },
        purge: { async: true },
        signedUrls: { expiresIn: 3600 },
        storage: createBaseStorage(),
        thumbnail: { appendTimestamp: true, queryParams: {}, streamAnimated: false },
        urlTransform: { appendTimestamp: false, queryParams: { format: 'webp' } },
      }

      const normalized = createNormalizedConfig(config)
      const context = createCollectionContext(normalized, createMockCollection('media'))

      expect(context.apiKey).toBe('global-api-key')
      expect(context.storageConfig).toBeDefined()
      expect(context.purgeConfig?.async).toBe(true)
      expect(context.signedUrls?.expiresIn).toBe(3600)
      expect(context.thumbnail?.appendTimestamp).toBe(true)
      expect(context.urlTransform?.queryParams).toEqual({ format: 'webp' })
    })
  })

  describe('per-collection overrides', () => {
    it('applies storage override and handles storage: false', () => {
      const config1: BunnyStorageConfig = {
        collections: { media: { storage: { uploadTimeout: 120000 } } },
        storage: createBaseStorage(),
      }
      const ctx1 = createCollectionContext(
        createNormalizedConfig(config1),
        createMockCollection('media'),
      )
      expect(ctx1.storageConfig?.uploadTimeout).toBe(120000)

      const config2: BunnyStorageConfig = {
        collections: { media: { storage: false } },
        storage: createBaseStorage(),
        stream: createBaseStream(),
      }
      const ctx2 = createCollectionContext(
        createNormalizedConfig(config2),
        createMockCollection('media'),
      )
      expect(ctx2.storageConfig).toBeUndefined()
      expect(ctx2.streamConfig).toBeDefined()
    })

    it('applies stream override and handles stream: false', () => {
      const config1: BunnyStorageConfig = {
        collections: {
          media: {
            disablePayloadAccessControl: true,
            stream: { mp4Fallback: false, thumbnailTime: 5000 },
          },
        },
        stream: { ...createBaseStream(), mp4Fallback: true },
      }
      const ctx1 = createCollectionContext(
        createNormalizedConfig(config1),
        createMockCollection('media'),
      )
      expect(ctx1.streamConfig?.mp4Fallback).toBe(false)
      expect(ctx1.streamConfig?.thumbnailTime).toBe(5000)

      const config2: BunnyStorageConfig = {
        collections: { media: { stream: false } },
        storage: createBaseStorage(),
        stream: createBaseStream(),
      }
      const ctx2 = createCollectionContext(
        createNormalizedConfig(config2),
        createMockCollection('media'),
      )
      expect(ctx2.streamConfig).toBeUndefined()
      expect(ctx2.storageConfig).toBeDefined()
    })

    it('applies signedUrls/purge overrides and handles false', () => {
      const config1: BunnyStorageConfig = {
        collections: { media: { signedUrls: { expiresIn: 7200 } } },
        signedUrls: { expiresIn: 3600 },
        storage: createBaseStorage(),
      }
      const ctx1 = createCollectionContext(
        createNormalizedConfig(config1),
        createMockCollection('media'),
      )
      expect(ctx1.signedUrls?.expiresIn).toBe(7200)

      const config2: BunnyStorageConfig = {
        collections: { media: { signedUrls: false } },
        signedUrls: { expiresIn: 3600 },
        storage: createBaseStorage(),
      }
      const ctx2 = createCollectionContext(
        createNormalizedConfig(config2),
        createMockCollection('media'),
      )
      expect(ctx2.signedUrls).toBeUndefined()

      const config3: BunnyStorageConfig = {
        apiKey: 'global-api-key',
        collections: { media: { purge: { async: true } } },
        purge: { async: false },
        storage: createBaseStorage(),
      }
      const ctx3 = createCollectionContext(
        createNormalizedConfig(config3),
        createMockCollection('media'),
      )
      expect(ctx3.purgeConfig?.async).toBe(true)

      const config4: BunnyStorageConfig = {
        apiKey: 'global-api-key',
        collections: { media: { purge: false } },
        purge: { async: false },
        storage: createBaseStorage(),
      }
      const ctx4 = createCollectionContext(
        createNormalizedConfig(config4),
        createMockCollection('media'),
      )
      expect(ctx4.purgeConfig).toBeUndefined()
    })
  })

  describe('prefix and access control', () => {
    it('uses collection prefix or prefixOverride', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { prefix: 'config-prefix' } },
        storage: createBaseStorage(),
      }
      const normalized = createNormalizedConfig(config)

      const ctx1 = createCollectionContext(normalized, createMockCollection('media'))
      expect(ctx1.prefix).toBe('config-prefix')

      const ctx2 = createCollectionContext(normalized, createMockCollection('media'), 'override')
      expect(ctx2.prefix).toBe('override')
    })

    it('sets usePayloadAccessControl based on disablePayloadAccessControl', () => {
      const config1: BunnyStorageConfig = {
        collections: { media: { disablePayloadAccessControl: true } },
        storage: createBaseStorage(),
      }
      const ctx1 = createCollectionContext(
        createNormalizedConfig(config1),
        createMockCollection('media'),
      )
      expect(ctx1.usePayloadAccessControl).toBe(false)

      const config2: BunnyStorageConfig = {
        collections: { media: true },
        storage: createBaseStorage(),
      }
      const ctx2 = createCollectionContext(
        createNormalizedConfig(config2),
        createMockCollection('media'),
      )
      expect(ctx2.usePayloadAccessControl).toBe(true)
    })
  })

  describe('TUS upload support', () => {
    it('enables TUS when stream.tus and collection.upload exist', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { disablePayloadAccessControl: true } },
        stream: { ...createBaseStream(), tus: true },
      }
      const ctx = createCollectionContext(
        createNormalizedConfig(config),
        createMockCollection('media', { upload: true }),
      )
      expect(ctx.isTusUploadSupported).toBe(true)
    })

    it('disables TUS when config or upload missing', () => {
      const config1: BunnyStorageConfig = {
        collections: { media: { disablePayloadAccessControl: true } },
        stream: createBaseStream(),
      }
      const ctx1 = createCollectionContext(
        createNormalizedConfig(config1),
        createMockCollection('media', { upload: true }),
      )
      expect(ctx1.isTusUploadSupported).toBe(false)

      const config2: BunnyStorageConfig = {
        collections: { media: { disablePayloadAccessControl: true } },
        stream: { ...createBaseStream(), tus: true },
      }
      const ctx2 = createCollectionContext(
        createNormalizedConfig(config2),
        createMockCollection('media'),
      )
      expect(ctx2.isTusUploadSupported).toBe(false)
    })
  })

  describe('stream MIME type filtering', () => {
    it('intersects collection mimeTypes with stream mimeTypes', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { disablePayloadAccessControl: true } },
        stream: { ...createBaseStream(), mimeTypes: ['video/mp4', 'video/webm', 'audio/mpeg'], tus: true },
      }
      const ctx = createCollectionContext(
        createNormalizedConfig(config),
        createMockCollection('media', { upload: { mimeTypes: ['video/mp4', 'image/jpeg'] } }),
      )

      expect(ctx.streamConfig?.mimeTypes).toContain('video/mp4')
      expect(ctx.streamConfig?.mimeTypes).not.toContain('video/webm')
      expect(ctx.streamConfig?.mimeTypes).not.toContain('audio/mpeg')
    })

    it('disables TUS when no MIME type intersection', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { disablePayloadAccessControl: true } },
        stream: { ...createBaseStream(), mimeTypes: ['video/mp4'], tus: true },
      }
      const ctx = createCollectionContext(
        createNormalizedConfig(config),
        createMockCollection('media', { upload: { mimeTypes: ['image/jpeg'] } }),
      )

      expect(ctx.streamConfig?.tus).toBeUndefined()
      expect(ctx.isTusUploadSupported).toBe(false)
    })

    it('keeps original mimeTypes when collection has no restriction', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { disablePayloadAccessControl: true } },
        stream: { ...createBaseStream(), mimeTypes: ['video/mp4', 'video/webm'], tus: true },
      }
      const ctx = createCollectionContext(
        createNormalizedConfig(config),
        createMockCollection('media', { upload: true }),
      )

      expect(ctx.streamConfig?.mimeTypes).toEqual(['video/mp4', 'video/webm'])
      expect(ctx.streamConfig?.tus).toBeDefined()
    })
  })
})

describe('getNormalizedConfig', () => {
  it('caches normalized config by reference', () => {
    const config: BunnyStorageConfig = {
      collections: { media: true },
      storage: createBaseStorage(),
    }

    const normalized1 = getNormalizedConfig(config)
    const normalized2 = getNormalizedConfig(config)

    expect(normalized1).toBe(normalized2)
  })
})
