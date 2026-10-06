import type { CollectionConfig } from 'payload'
import { describe, expect, it } from 'vitest'

import { createCollectionContext } from '@/server/payload/options/context.js'
import { createNormalizedOptions } from '@/server/payload/options/normalizer.js'
import type { BunnyStorageOptions } from '@/shared/types/options.js'

import {
  createBaseStorage as sharedCreateBaseStorage,
  createBaseStream,
  createOwnStorage,
  createOwnStream,
} from '../../../../helpers/unit/optionsBuilders.js'

const createBaseStorage = () => sharedCreateBaseStorage({ uploadTimeout: 60000 })

const createMockCollection = (slug: string, overrides: Partial<CollectionConfig> = {}): CollectionConfig => ({
  slug,
  fields: [],
  ...overrides,
})

describe('createCollectionContext', () => {
  it('exposes the resolved collection options without further merging', () => {
    const normalized = createNormalizedOptions({
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
      thumbnail: { streamAnimated: false, urlTransform: { appendTimestamp: true, queryParams: {} } },
      urlTransform: { appendTimestamp: false, queryParams: { format: 'webp' } },
    })
    const media = normalized.collections.get('media')!

    const context = createCollectionContext(normalized, createMockCollection('media'))

    expect(context.accountApiKey).toBe('global-api-key')
    expect(context.hasGenerateFileURL).toBe(false)
    expect(context.storageOptions).toBe(media.storage)
    expect(context.streamOptions).toBe(media.stream)
    expect(context.purgeOptions).toBe(media.purge)
    expect(context.signedUrls).toBe(media.signedUrls)
    expect(context.thumbnail).toBe(media.thumbnail)
    expect(context.urlTransform).toBe(media.urlTransform)
    expect(context.storageOptions?.uploadTimeout).toBe(120000)
    expect(context.streamOptions?.thumbnailTime).toBe(5000)
    expect(context.purgeOptions?.async).toBe(true)
    expect(context.signedUrls?.expiresIn({ collection: createMockCollection('media'), filename: 'a.jpg' })).toBe(7200)
  })

  describe('full per-collection override contexts', () => {
    it('exposes its own storage and stream options while a sibling keeps the global ones', () => {
      const options: BunnyStorageOptions = {
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
      const normalized = createNormalizedOptions(options)

      const ownCtx = createCollectionContext(normalized, createMockCollection('own'))
      expect(ownCtx.storageOptions?.zoneName).toBe('own-zone-own')
      expect(ownCtx.streamOptions?.libraryId).toBe(777)

      const siblingCtx = createCollectionContext(normalized, createMockCollection('sibling'))
      expect(siblingCtx.storageOptions?.zoneName).toBe('test-zone')
      expect(siblingCtx.streamOptions?.libraryId).toBe(12345)
    })
  })

  describe('prefix and access control', () => {
    it('uses the collection prefix or prefixOverride', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { prefix: 'config-prefix' } },
        storage: createBaseStorage(),
      }
      const normalized = createNormalizedOptions(options)

      const ctx1 = createCollectionContext(normalized, createMockCollection('media'))
      expect(ctx1.prefix).toBe('config-prefix')

      const ctx2 = createCollectionContext(normalized, createMockCollection('media'), 'override')
      expect(ctx2.prefix).toBe('override')
    })

    it('sets usePayloadAccessControl based on disablePayloadAccessControl', () => {
      const options1: BunnyStorageOptions = {
        collections: { media: { disablePayloadAccessControl: true } },
        storage: createBaseStorage(),
      }
      const ctx1 = createCollectionContext(createNormalizedOptions(options1), createMockCollection('media'))
      expect(ctx1.usePayloadAccessControl).toBe(false)

      const options2: BunnyStorageOptions = {
        collections: { media: true },
        storage: createBaseStorage(),
      }
      const ctx2 = createCollectionContext(createNormalizedOptions(options2), createMockCollection('media'))
      expect(ctx2.usePayloadAccessControl).toBe(true)
    })
  })

  describe('TUS upload support', () => {
    it('disables TUS when the options or upload are missing', () => {
      const options1: BunnyStorageOptions = {
        collections: { media: { disablePayloadAccessControl: true } },
        stream: createBaseStream(),
      }
      const ctx1 = createCollectionContext(
        createNormalizedOptions(options1),
        createMockCollection('media', { upload: true }),
      )
      expect(ctx1.isTusUploadSupported).toBe(false)

      const options2: BunnyStorageOptions = {
        collections: { media: { disablePayloadAccessControl: true } },
        stream: { ...createBaseStream(), tus: true },
      }
      const ctx2 = createCollectionContext(createNormalizedOptions(options2), createMockCollection('media'))
      expect(ctx2.isTusUploadSupported).toBe(false)
    })
  })

  describe('stream MIME type filtering', () => {
    it('intersects collection mimeTypes with stream mimeTypes', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { disablePayloadAccessControl: true } },
        stream: { ...createBaseStream(), mimeTypes: ['video/mp4', 'video/webm', 'audio/mpeg'], tus: true },
      }
      const ctx = createCollectionContext(
        createNormalizedOptions(options),
        createMockCollection('media', { upload: { mimeTypes: ['video/mp4', 'image/jpeg'] } }),
      )

      expect(ctx.streamOptions?.mimeTypes).toContain('video/mp4')
      expect(ctx.streamOptions?.mimeTypes).not.toContain('video/webm')
      expect(ctx.streamOptions?.mimeTypes).not.toContain('audio/mpeg')
    })

    it('disables TUS when the MIME types do not intersect', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { disablePayloadAccessControl: true } },
        stream: { ...createBaseStream(), mimeTypes: ['video/mp4'], tus: true },
      }
      const ctx = createCollectionContext(
        createNormalizedOptions(options),
        createMockCollection('media', { upload: { mimeTypes: ['image/jpeg'] } }),
      )

      expect(ctx.streamOptions?.tus).toBeUndefined()
      expect(ctx.isTusUploadSupported).toBe(false)
    })

    it('keeps the original mimeTypes and enables TUS when the collection has no restriction', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { disablePayloadAccessControl: true } },
        stream: { ...createBaseStream(), mimeTypes: ['video/mp4', 'video/webm'], tus: true },
      }
      const ctx = createCollectionContext(
        createNormalizedOptions(options),
        createMockCollection('media', { upload: true }),
      )

      expect(ctx.streamOptions?.mimeTypes).toEqual(['video/mp4', 'video/webm'])
      expect(ctx.streamOptions?.tus).toBeDefined()
      expect(ctx.isTusUploadSupported).toBe(true)
    })
  })
})
