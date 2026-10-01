import type { CollectionConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import { createCollectionContext } from '@/server/payload/config/context.js'
import { createNormalizedConfig } from '@/server/payload/config/normalizer.js'
import type { BunnyStorageConfig } from '@/shared/types/config.js'

import {
  createBaseStorage as sharedCreateBaseStorage,
  createBaseStream,
  createOwnStorage,
  createOwnStream,
} from '../../../../helpers/unit/configBuilders.js'

const createBaseStorage = () => sharedCreateBaseStorage({ uploadTimeout: 60000 })

const createMockCollection = (slug: string, overrides: Partial<CollectionConfig> = {}): CollectionConfig => ({
  slug,
  fields: [],
  ...overrides,
})

describe('createCollectionContext', () => {
  it('exposes the resolved collection config without further merging', () => {
    const normalized = createNormalizedConfig({
      accountApiKey: 'global-api-key',
      collections: {
        media: {
          purge: { async: true },
          signedUrls: { expiresIn: 7200 },
          storage: { uploadTimeout: 120000 },
          stream: { mp4Fallback: false, thumbnailTime: 5000 },
        },
      },
      purge: { async: false },
      signedUrls: { expiresIn: 3600 },
      storage: createBaseStorage(),
      stream: { ...createBaseStream(), mp4Fallback: true },
      thumbnail: { appendTimestamp: true, queryParams: {}, streamAnimated: false },
      urlTransform: { appendTimestamp: false, queryParams: { format: 'webp' } },
    })
    const media = normalized.collections.get('media')!

    const context = createCollectionContext(normalized, createMockCollection('media'))

    expect(context.accountApiKey).toBe('global-api-key')
    expect(context.storageConfig).toBe(media.storage)
    expect(context.streamConfig).toBe(media.stream)
    expect(context.purgeConfig).toBe(media.purge)
    expect(context.signedUrls).toBe(media.signedUrls)
    expect(context.thumbnail).toBe(media.thumbnail)
    expect(context.urlTransform).toBe(media.urlTransform)
    expect(context.storageConfig?.uploadTimeout).toBe(120000)
    expect(context.streamConfig?.thumbnailTime).toBe(5000)
    expect(context.purgeConfig?.async).toBe(true)
    expect(context.signedUrls?.expiresIn).toBe(7200)
  })

  describe('full per-collection override contexts', () => {
    it('exposes own storage/stream configs while a sibling keeps global', () => {
      const config: BunnyStorageConfig = {
        collections: {
          own: {
            disablePayloadAccessControl: true,
            storage: createOwnStorage('own'),
            stream: createOwnStream(777),
          },
          sibling: { disablePayloadAccessControl: true },
        },
        storage: createBaseStorage(),
        stream: createBaseStream(),
      }
      const normalized = createNormalizedConfig(config)

      const ownCtx = createCollectionContext(normalized, createMockCollection('own'))
      expect(ownCtx.storageConfig?.zoneName).toBe('own-zone-own')
      expect(ownCtx.streamConfig?.libraryId).toBe(777)

      const siblingCtx = createCollectionContext(normalized, createMockCollection('sibling'))
      expect(siblingCtx.storageConfig?.zoneName).toBe('test-zone')
      expect(siblingCtx.streamConfig?.libraryId).toBe(12345)
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
      const ctx1 = createCollectionContext(createNormalizedConfig(config1), createMockCollection('media'))
      expect(ctx1.usePayloadAccessControl).toBe(false)

      const config2: BunnyStorageConfig = {
        collections: { media: true },
        storage: createBaseStorage(),
      }
      const ctx2 = createCollectionContext(createNormalizedConfig(config2), createMockCollection('media'))
      expect(ctx2.usePayloadAccessControl).toBe(true)
    })
  })

  describe('TUS upload support', () => {
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
      const ctx2 = createCollectionContext(createNormalizedConfig(config2), createMockCollection('media'))
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

    it('keeps original mimeTypes and enables TUS when collection has no restriction', () => {
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
      expect(ctx.isTusUploadSupported).toBe(true)
    })
  })
})
