import { describe, expect, it } from 'vitest'

import { createNormalizedConfig } from '@/config/normalizer.js'
import type { BunnyStorageConfig } from '@/types/config.js'

const createBaseStorage = () => ({
  apiKey: 'storage-key',
  hostname: 'storage.bunny.net',
  tokenSecurityKey: 'token-key',
  zoneName: 'test-zone',
})

const createBaseStream = () => ({
  apiKey: 'stream-key',
  hostname: 'stream.bunny.net',
  libraryId: 12345,
  tokenSecurityKey: 'stream-token',
})

describe('Config Normalizer', () => {
  describe('thumbnail', () => {
    const globalThumbnail = {
      appendTimestamp: true,
      queryParams: { class: 'thumbnail', version: '2.0' },
      sizeName: 'preview',
      streamAnimated: false,
    }

    it('should inherit global settings', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: { media: true },
        storage: createBaseStorage(),
        thumbnail: globalThumbnail,
      }

      const normalized = createNormalizedConfig(config)
      const mediaConfig = normalized.collections.get('media')

      expect(mediaConfig?.thumbnail).toEqual({
        ...globalThumbnail,
        transformUrl: undefined,
      })
    })

    it('should override specified properties', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: {
          media: { thumbnail: { streamAnimated: true } },
        },
        storage: createBaseStorage(),
        thumbnail: globalThumbnail,
      }

      const normalized = createNormalizedConfig(config)
      const mediaConfig = normalized.collections.get('media')

      expect(mediaConfig?.thumbnail).toEqual({
        ...globalThumbnail,
        streamAnimated: true,
        transformUrl: undefined,
      })
    })

    it('should replace queryParams', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: {
          media: { thumbnail: { queryParams: { custom: 'value' } } },
        },
        storage: createBaseStorage(),
        thumbnail: globalThumbnail,
      }

      const normalized = createNormalizedConfig(config)
      const mediaConfig = normalized.collections.get('media')

      expect(mediaConfig?.thumbnail?.queryParams).toEqual({ custom: 'value' })
    })

    it('should disable via false', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: { media: { thumbnail: false } },
        storage: createBaseStorage(),
        thumbnail: globalThumbnail,
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.thumbnail).toBeUndefined()
    })

    it('should enable with defaults when true and no global config', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: { media: { thumbnail: true } },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.thumbnail).toBeDefined()
      expect(normalized.collections.get('media')?.thumbnail?.appendTimestamp).toBe(true)
      expect(normalized.collections.get('media')?.thumbnail?.streamAnimated).toBe(false)
    })
  })

  describe('urlTransform', () => {
    const globalUrlTransform = {
      appendTimestamp: false,
      queryParams: { cdn: 'bunny', region: 'eu' },
    }

    it('should inherit global settings', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: { media: true },
        storage: createBaseStorage(),
        urlTransform: globalUrlTransform,
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.urlTransform).toEqual({
        ...globalUrlTransform,
        transformUrl: undefined,
      })
    })

    it('should override specified properties', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: {
          media: { urlTransform: { appendTimestamp: true } },
        },
        storage: createBaseStorage(),
        urlTransform: globalUrlTransform,
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.urlTransform).toEqual({
        appendTimestamp: true,
        queryParams: globalUrlTransform.queryParams,
        transformUrl: undefined,
      })
    })

    it('should replace queryParams', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: {
          media: { urlTransform: { queryParams: { custom: 'value' } } },
        },
        storage: createBaseStorage(),
        urlTransform: globalUrlTransform,
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.urlTransform?.queryParams).toEqual({
        custom: 'value',
      })
    })

    it('should disable via false', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: { media: { urlTransform: false as const } },
        storage: createBaseStorage(),
        urlTransform: globalUrlTransform,
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.urlTransform).toBeUndefined()
    })

    it('should enable with defaults when true and no global config', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: { media: { urlTransform: true } },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.urlTransform).toBeDefined()
      expect(normalized.collections.get('media')?.urlTransform?.appendTimestamp).toBe(false)
      expect(normalized.collections.get('media')?.urlTransform?.queryParams).toEqual({})
    })
  })

  describe('signedUrls', () => {
    it('should inherit and overrides expiresIn', () => {
      const configs: Array<{
        collection:
          | {
              signedUrls: { expiresIn: number }
            }
          | true
        expected: number
      }> = [
        { collection: true, expected: 3600 },
        { collection: { signedUrls: { expiresIn: 7200 } }, expected: 7200 },
      ]

      configs.forEach(({ collection, expected }) => {
        const config: BunnyStorageConfig = {
          apiKey: 'test-api-key',
          collections: { media: collection },
          signedUrls: { expiresIn: 3600 },
          storage: createBaseStorage(),
        }

        const normalized = createNormalizedConfig(config)
        expect(normalized.collections.get('media')?.signedUrls?.expiresIn).toBe(expected)
      })
    })

    it('should enable with defaults when true and no global config', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: { media: { signedUrls: true } },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.signedUrls).toBeDefined()
      expect(normalized.collections.get('media')?.signedUrls?.expiresIn).toBe(7200)
    })

    it('should disable via false', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: { media: { signedUrls: false } },
        signedUrls: true,
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.signedUrls).toBeUndefined()
    })
  })

  describe('purge', () => {
    it('should inherit and overrides async', () => {
      const configs: Array<{
        collection:
          | {
              purge: { async: boolean }
            }
          | true
        expected: boolean
      }> = [
        { collection: true, expected: false },
        { collection: { purge: { async: true } }, expected: true },
      ]

      configs.forEach(({ collection, expected }) => {
        const config: BunnyStorageConfig = {
          apiKey: 'test-api-key',
          collections: { media: collection },
          purge: { async: false },
          storage: createBaseStorage(),
        }

        const normalized = createNormalizedConfig(config)
        expect(normalized.collections.get('media')?.purge?.async).toBe(expected)
      })
    })

    it('should disable via false', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: { media: { purge: false } },
        purge: true,
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.purge).toBeUndefined()
    })
  })

  describe('stream', () => {
    const globalStream = {
      ...createBaseStream(),
      mp4Fallback: true,
      thumbnailTime: 5000,
    }

    it('should inherit global settings', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: { media: true },
        storage: createBaseStorage(),
        stream: globalStream,
      }

      const normalized = createNormalizedConfig(config)
      const mediaStream = normalized.collections.get('media')?.stream

      expect(mediaStream?.mp4Fallback).toBe(true)
      expect(mediaStream?.thumbnailTime).toBe(5000)
    })

    it('should override specified properties', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: {
          media: {
            stream: { mp4Fallback: false, thumbnailTime: 3000 },
          },
        },
        storage: createBaseStorage(),
        stream: globalStream,
      }

      const normalized = createNormalizedConfig(config)
      const mediaStream = normalized.collections.get('media')?.stream

      expect(mediaStream?.mp4Fallback).toBe(false)
      expect(mediaStream?.thumbnailTime).toBe(3000)
    })

    it('should disable via false', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: { media: { stream: false } },
        storage: createBaseStorage(),
        stream: globalStream,
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.stream).toBeUndefined()
    })
  })

  describe('storage', () => {
    it('should inherit and overrides uploadTimeout', () => {
      const configs: Array<{
        collection:
          | {
              storage: { uploadTimeout: number }
            }
          | true
        expected: number
      }> = [
        { collection: true, expected: 60000 },
        { collection: { storage: { uploadTimeout: 120000 } }, expected: 120000 },
      ]

      configs.forEach(({ collection, expected }) => {
        const config: BunnyStorageConfig = {
          apiKey: 'test-api-key',
          collections: { media: collection },
          storage: { ...createBaseStorage(), uploadTimeout: 60000 },
        }

        const normalized = createNormalizedConfig(config)
        expect(normalized.collections.get('media')?.storage?.uploadTimeout).toBe(expected)
      })
    })

    it('should disable via false', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: { media: { storage: false } },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.storage).toBeUndefined()
    })

    it('should carry the s3 config through to collections', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: { media: { storage: { uploadTimeout: 90000 } } },
        storage: { ...createBaseStorage(), s3: { region: 'de' } },
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.storage?.s3).toEqual({ region: 'de' })
      expect(normalized.collections.get('media')?.storage?.s3).toEqual({ region: 'de' })
    })
  })

  describe('collection properties', () => {
    it('should set prefix and disablePayloadAccessControl', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: {
          media: {
            disablePayloadAccessControl: true,
            prefix: 'custom-prefix',
          },
        },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      const mediaConfig = normalized.collections.get('media')

      expect(mediaConfig?.prefix).toBe('custom-prefix')
      expect(mediaConfig?.disablePayloadAccessControl).toBe(true)
    })
  })

  describe('multiple collections', () => {
    it('should handle different overrides per collection', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'test-api-key',
        collections: {
          images: {
            prefix: 'img',
            thumbnail: { streamAnimated: true },
          },
          videos: {
            prefix: 'vid',
            stream: { mp4Fallback: false },
            thumbnail: false,
          },
        },
        storage: createBaseStorage(),
        stream: { ...createBaseStream(), mp4Fallback: true },
        thumbnail: {
          appendTimestamp: true,
          queryParams: { class: 'thumb' },
          streamAnimated: false,
        },
      }

      const normalized = createNormalizedConfig(config)
      const imagesConfig = normalized.collections.get('images')
      const videosConfig = normalized.collections.get('videos')

      expect(imagesConfig?.prefix).toBe('img')
      expect(imagesConfig?.thumbnail?.streamAnimated).toBe(true)
      expect(imagesConfig?.thumbnail?.appendTimestamp).toBe(true)
      expect(imagesConfig?.thumbnail?.queryParams).toEqual({ class: 'thumb' })

      expect(videosConfig?.prefix).toBe('vid')
      expect(videosConfig?.stream?.mp4Fallback).toBe(false)
      expect(videosConfig?.thumbnail).toBeUndefined()
    })
  })
})
