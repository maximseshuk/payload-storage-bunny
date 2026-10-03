import { describe, expect, it } from 'vitest'

import { CONFIG_DEFAULTS } from '@/server/payload/config/defaults.js'
import { createNormalizedConfig } from '@/server/payload/config/normalizer.js'
import type { BunnyStorageConfig } from '@/shared/types/config.js'

import {
  createBaseStorage,
  createBaseStream,
  createOwnStorage,
  createOwnStream,
} from '../../../../helpers/unit/configBuilders.js'

const testShouldUseSignedURL = () => true
const testClientAccess = () => true
const testCollectionClientAccess = () => false
const testClientPrefix = () => 'global-prefix'
const globalUserIp = () => '203.0.113.7'
const collectionUserIp = () => '198.51.100.1'
const tusAccess = () => true
const args = { collection: { slug: 'media' } } as never

describe('config normalizer', () => {
  describe('collections', () => {
    it('leaves out collections set to false', () => {
      const config: BunnyStorageConfig = {
        collections: { docs: false, media: true },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect([...normalized.collections.keys()]).toEqual(['media'])
    })

    it('records whether the collection sets generateFileURL', () => {
      const config: BunnyStorageConfig = {
        collections: {
          docs: { prefix: 'docs' },
          files: { generateFileURL: () => 'https://example.com/x' },
          media: true,
        },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('files')?.hasGenerateFileURL).toBe(true)
      expect(normalized.collections.get('docs')?.hasGenerateFileURL).toBe(false)
      expect(normalized.collections.get('media')?.hasGenerateFileURL).toBe(false)
    })
  })

  describe('thumbnail', () => {
    const globalThumbnail = {
      sizeName: 'preview',
      urlTransform: { appendTimestamp: true, queryParams: { class: 'thumbnail', version: '2.0' } },
    }
    const normalizedGlobalThumbnail = {
      appendTimestamp: true,
      queryParams: { class: 'thumbnail', version: '2.0' },
      sizeName: 'preview',
      streamAnimated: false,
    }

    it('inherits global settings', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: { media: true },
        storage: createBaseStorage(),
        thumbnail: globalThumbnail,
      }

      const normalized = createNormalizedConfig(config)
      const mediaConfig = normalized.collections.get('media')

      expect(mediaConfig?.thumbnail).toEqual({
        ...normalizedGlobalThumbnail,
        transformUrl: undefined,
      })
    })

    it('overrides the given properties', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: {
          media: { thumbnail: { streamAnimated: true } },
        },
        storage: createBaseStorage(),
        thumbnail: globalThumbnail,
      }

      const normalized = createNormalizedConfig(config)
      const mediaConfig = normalized.collections.get('media')

      expect(mediaConfig?.thumbnail).toEqual({
        ...normalizedGlobalThumbnail,
        streamAnimated: true,
        transformUrl: undefined,
      })
    })

    it('replaces queryParams and keeps the global appendTimestamp', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: {
          media: { thumbnail: { urlTransform: { queryParams: { custom: 'value' } } } },
        },
        storage: createBaseStorage(),
        thumbnail: globalThumbnail,
      }

      const normalized = createNormalizedConfig(config)
      const mediaConfig = normalized.collections.get('media')

      expect(mediaConfig?.thumbnail?.queryParams).toEqual({ custom: 'value' })
      expect(mediaConfig?.thumbnail?.appendTimestamp).toBe(true)
    })

    it('keeps the global urlTransform function when the collection only sets sizeName', () => {
      const transform = () => 'https://cdn.example.com/x.jpg'
      const config: BunnyStorageConfig = {
        collections: { media: { thumbnail: { sizeName: 'small' } } },
        storage: createBaseStorage(),
        thumbnail: { urlTransform: transform },
      }

      const thumbnail = createNormalizedConfig(config).collections.get('media')?.thumbnail
      expect(thumbnail?.sizeName).toBe('small')
      expect(thumbnail?.transformUrl).toBe(transform)
    })

    it('uses the thumbnail defaults when a collection object replaces the global function', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { thumbnail: { urlTransform: { queryParams: { custom: 'value' } } } } },
        storage: createBaseStorage(),
        thumbnail: { urlTransform: () => 'https://cdn.example.com/x.jpg' },
      }

      const thumbnail = createNormalizedConfig(config).collections.get('media')?.thumbnail
      expect(thumbnail?.appendTimestamp).toBe(true)
      expect(thumbnail?.queryParams).toEqual({ custom: 'value' })
      expect(thumbnail?.transformUrl).toBeUndefined()
    })

    it('uses a urlTransform function and drops the default timestamp', () => {
      const transform = () => 'https://cdn.example.com/x.jpg'
      const config: BunnyStorageConfig = {
        collections: { media: true },
        storage: createBaseStorage(),
        thumbnail: { urlTransform: transform },
      }

      expect(createNormalizedConfig(config).thumbnail).toEqual({
        appendTimestamp: false,
        queryParams: {},
        sizeName: undefined,
        streamAnimated: false,
        transformUrl: transform,
      })
    })

    it('turns the URL transform off with urlTransform false', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        storage: createBaseStorage(),
        thumbnail: { urlTransform: false },
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.thumbnail?.appendTimestamp).toBe(false)
      expect(normalized.thumbnail?.queryParams).toEqual({})
    })

    it('disables with false', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: { media: { thumbnail: false } },
        storage: createBaseStorage(),
        thumbnail: globalThumbnail,
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.thumbnail).toBeUndefined()
    })

    it('enables with defaults for true without a global config', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
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

    it('inherits global settings', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
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

    it('overrides the given properties', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
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

    it('replaces queryParams', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
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

    it('replaces the global object with a collection function', () => {
      const transform = () => 'https://cdn.example.com/x.jpg'
      const config: BunnyStorageConfig = {
        collections: { media: { urlTransform: transform } },
        storage: createBaseStorage(),
        urlTransform: globalUrlTransform,
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.urlTransform).toEqual({
        appendTimestamp: false,
        queryParams: {},
        transformUrl: transform,
      })
    })

    it('replaces the global function with a collection object', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { urlTransform: { appendTimestamp: true } } },
        storage: createBaseStorage(),
        urlTransform: () => 'https://cdn.example.com/x.jpg',
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.urlTransform).toEqual({
        appendTimestamp: true,
        queryParams: {},
      })
    })

    it('disables with false', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: { media: { urlTransform: false as const } },
        storage: createBaseStorage(),
        urlTransform: globalUrlTransform,
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.urlTransform).toBeUndefined()
    })

    it('enables with defaults for true without a global config', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
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
    it('inherits and overrides expiresIn', () => {
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
          accountApiKey: 'test-api-key',
          collections: { media: collection },
          signedUrls: { expiresIn: 3600 },
          storage: createBaseStorage(),
        }

        const normalized = createNormalizedConfig(config)
        expect(normalized.collections.get('media')?.signedUrls?.expiresIn(args)).toBe(expected)
      })
    })

    it('enables with defaults for true without a global config', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: { media: { signedUrls: true } },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.signedUrls).toBeDefined()
      expect(normalized.collections.get('media')?.signedUrls?.expiresIn(args)).toBe(7200)
      expect(normalized.collections.get('media')?.signedUrls?.redirect).toBeUndefined()
    })

    it('inherits global keys on a partial override', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: { media: { signedUrls: { expiresIn: 100 } } },
        signedUrls: {
          allowedCountries: ['US', 'CA'],
          expiresIn: 3600,
          shouldUseSignedUrl: testShouldUseSignedURL,
          staticHandler: { redirect: { status: 307 } },
          userIp: globalUserIp,
        },
        storage: createBaseStorage(),
      }

      const collectionSigned = createNormalizedConfig(config).collections.get('media')?.signedUrls
      expect(collectionSigned?.userIp).toBe(globalUserIp)
      expect(collectionSigned?.expiresIn(args)).toBe(100)
      expect(collectionSigned?.allowedCountries).toEqual(['US', 'CA'])
      expect(collectionSigned?.shouldUseSignedUrl).toBeDefined()
      expect(collectionSigned?.redirect).toEqual({ expiresIn: undefined, status: 307 })
    })

    it('enables the redirect with status 302 for redirect true', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        signedUrls: { staticHandler: { redirect: true } },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.signedUrls?.redirect).toEqual({ expiresIn: undefined, status: 302 })
    })

    it('turns the global redirect off per collection with redirect false', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { signedUrls: { staticHandler: { redirect: false } } } },
        signedUrls: { staticHandler: { redirect: true } },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.signedUrls?.redirect).toBeUndefined()
    })

    it('disables with false', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: { media: { signedUrls: false } },
        signedUrls: true,
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.signedUrls).toBeUndefined()
    })

    it('overrides userIp per collection', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: {
          media: { signedUrls: { userIp: collectionUserIp } },
        },
        signedUrls: {
          expiresIn: 3600,
          userIp: () => '203.0.113.7',
        },
        storage: createBaseStorage(),
      }

      const collectionSigned = createNormalizedConfig(config).collections.get('media')?.signedUrls

      expect(collectionSigned?.userIp).toBe(collectionUserIp)
    })
  })

  describe('clientUploads', () => {
    it('inherits global keys on a partial override', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: { media: { storage: { clientUploads: { access: testCollectionClientAccess } } } },
        storage: {
          ...createBaseStorage(),
          clientUploads: {
            access: testClientAccess,
            edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'shared' },
            prefix: testClientPrefix,
          },
        },
      }

      const collectionCU = createNormalizedConfig(config).collections.get('media')?.storage?.clientUploads
      expect(collectionCU?.access).toBe(testCollectionClientAccess)
      expect(collectionCU?.prefix).toBe(testClientPrefix)
      expect(collectionCU?.edge?.scriptUrl).toBe('https://uploader.b-cdn.net')
      expect(collectionCU?.edge?.secret).toBe('shared')
    })

    it('uses the global config when the collection sets true', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { storage: { clientUploads: true } } },
        storage: {
          ...createBaseStorage(),
          clientUploads: {
            edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'shared' },
          },
        },
      }

      const collectionCU = createNormalizedConfig(config).collections.get('media')?.storage?.clientUploads
      expect(collectionCU?.edge?.scriptUrl).toBe('https://uploader.b-cdn.net')
      expect(collectionCU?.edge?.secret).toBe('shared')
    })

    it('enables per collection with defaults for true without a global config', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { storage: { clientUploads: true } } },
        storage: { ...createBaseStorage(), s3: true },
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.storage?.clientUploads).toBeUndefined()
      expect(normalized.collections.get('media')?.storage?.clientUploads).toBeDefined()
    })

    it('disables per collection with false', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { storage: { clientUploads: false } } },
        storage: { ...createBaseStorage(), clientUploads: true, s3: true },
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.storage?.clientUploads).toBeUndefined()
    })

    it('nests the normalized clientUploads under storage, not the raw value', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        storage: { ...createBaseStorage(), clientUploads: true, s3: true },
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.storage?.clientUploads).toEqual({ access: undefined, prefix: undefined })
      expect(normalized.collections.get('media')?.storage?.clientUploads).toEqual({
        access: undefined,
        prefix: undefined,
      })
    })
  })

  describe('purge', () => {
    it('inherits and overrides async', () => {
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
          accountApiKey: 'test-api-key',
          collections: { media: collection },
          purge: { async: false },
          storage: createBaseStorage(),
        }

        const normalized = createNormalizedConfig(config)
        expect(normalized.collections.get('media')?.purge?.async).toBe(expected)
      })
    })

    it('accepts true globally', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: { media: true },
        purge: true,
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.purge).toEqual({ async: false })
      expect(normalized.collections.get('media')?.purge).toEqual({ async: false })
    })

    it.each([true, { async: true }])('enables collection purge %o when the global purge is off', (purge) => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: { docs: true, media: { purge } },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.purge).toBeUndefined()
      expect(normalized.collections.get('media')?.purge).toEqual({ async: purge !== true })
      expect(normalized.collections.get('docs')?.purge).toBeUndefined()
    })

    it.each([true, { async: true }])('leaves purge %o off without accountApiKey', (purge) => {
      const config: BunnyStorageConfig = {
        collections: { media: { purge } },
        purge,
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.purge).toBeUndefined()
      expect(normalized.collections.get('media')?.purge).toBeUndefined()
    })

    it('disables with false', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
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

    it('inherits global settings', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: { media: true },
        storage: createBaseStorage(),
        stream: globalStream,
      }

      const normalized = createNormalizedConfig(config)
      const mediaStream = normalized.collections.get('media')?.stream

      expect(mediaStream?.mp4Fallback).toBe(true)
      expect(mediaStream?.thumbnailTime).toBe(5000)
    })

    it('overrides the given properties', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
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

    it('disables with false', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: { media: { stream: false } },
        storage: createBaseStorage(),
        stream: globalStream,
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.stream).toBeUndefined()
    })

    it('disables TUS per collection with false', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: {
          media: { stream: { tus: false } },
          videos: true,
        },
        storage: createBaseStorage(),
        stream: { ...globalStream, tus: true },
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.stream?.tus).toBeUndefined()
      expect(normalized.collections.get('videos')?.stream?.tus).toBeDefined()
    })

    it('overrides TUS settings per collection and keeps the global access', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: {
          media: { stream: { tus: { autoMode: false, expiresIn: 7200 } } },
        },
        storage: createBaseStorage(),
        stream: { ...globalStream, tus: { access: tusAccess } },
      }

      const mediaTus = createNormalizedConfig(config).collections.get('media')?.stream?.tus
      expect(mediaTus).toEqual({ access: tusAccess, autoMode: false, expiresIn: 7200 })
    })

    it('enables TUS per collection with true when the global TUS is off', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { stream: { tus: true } }, videos: true },
        storage: createBaseStorage(),
        stream: globalStream,
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.stream?.tus).toEqual(CONFIG_DEFAULTS.stream.tus)
      expect(normalized.collections.get('videos')?.stream?.tus).toBeUndefined()
    })

    it('enables TUS per collection with an object when the global TUS is off', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { stream: { tus: { expiresIn: 600 } } } },
        storage: createBaseStorage(),
        stream: globalStream,
      }

      const mediaTus = createNormalizedConfig(config).collections.get('media')?.stream?.tus
      expect(mediaTus).toEqual({ autoMode: CONFIG_DEFAULTS.stream.tus.autoMode, expiresIn: 600 })
    })
  })

  describe('storage', () => {
    it('inherits and overrides uploadTimeout', () => {
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
          accountApiKey: 'test-api-key',
          collections: { media: collection },
          storage: { ...createBaseStorage(), uploadTimeout: 60000 },
        }

        const normalized = createNormalizedConfig(config)
        expect(normalized.collections.get('media')?.storage?.uploadTimeout).toBe(expected)
      })
    })

    it('disables with false', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: { media: { storage: false } },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.collections.get('media')?.storage).toBeUndefined()
    })

    it.each([
      { expected: { region: 'de', s3: false }, storage: {} },
      { expected: { region: 'de', s3: false }, storage: { region: 'de' } },
      { expected: { region: 'ny', s3: false }, storage: { region: 'ny' } },
      { expected: { region: 'de', s3: true }, storage: { s3: true } },
      { expected: { region: 'de', s3: true }, storage: { region: 'de', s3: true } },
      { expected: { region: 'ny', s3: true }, storage: { region: 'ny', s3: true } },
    ])('maps region $storage.region with s3 $storage.s3', ({ expected, storage }) => {
      const normalized = createNormalizedConfig({
        collections: { media: true },
        storage: { ...createBaseStorage(), ...storage },
      } as BunnyStorageConfig)

      expect(normalized.storage?.region).toBe(expected.region)
      expect(normalized.storage?.s3).toBe(expected.s3)
    })

    it('passes the S3 config to collections', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: { media: { storage: { uploadTimeout: 90000 } } },
        storage: { ...createBaseStorage(), s3: true },
      }

      const normalized = createNormalizedConfig(config)
      expect(normalized.storage?.s3).toBe(true)
      expect(normalized.collections.get('media')?.storage?.s3).toBe(true)
    })
  })

  describe('full per-collection storage override', () => {
    it('replaces the global zone without leaking global credentials and resets uploadTimeout to the default', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: {
          media: { storage: createOwnStorage('media', { tokenSecurityKey: undefined }) },
        },
        storage: {
          ...createBaseStorage(),
          region: 'ny',
          s3: true,
          uploadTimeout: 999999,
        },
      }

      const media = createNormalizedConfig(config).collections.get('media')?.storage
      expect(media?.apiKey).toBe('own-storage-key-media')
      expect(media?.hostname).toBe('own-media.b-cdn.net')
      expect(media?.zoneName).toBe('own-zone-media')
      expect(media?.tokenSecurityKey).toBeUndefined()
      expect(media?.s3).toBe(false)
      expect(media?.region).toBe('de')
      expect(media?.uploadTimeout).toBe(CONFIG_DEFAULTS.storage.uploadTimeout)
    })

    it('normalizes clientUploads from its own zone without leaking global clientUploads', () => {
      const config: BunnyStorageConfig = {
        collections: {
          own: {
            storage: createOwnStorage('own', {
              clientUploads: { edge: { scriptUrl: 'https://own-edge.b-cdn.net', secret: 'own-secret' } },
            }),
          },
          plain: { storage: createOwnStorage('plain') },
        },
        storage: {
          ...createBaseStorage(),
          clientUploads: {
            edge: { scriptUrl: 'https://global-edge.b-cdn.net', secret: 'global-secret' },
          },
        },
      }

      const normalized = createNormalizedConfig(config)
      const ownCU = normalized.collections.get('own')?.storage?.clientUploads
      expect(ownCU?.edge?.scriptUrl).toBe('https://own-edge.b-cdn.net')
      expect(ownCU?.edge?.secret).toBe('own-secret')
      expect(normalized.collections.get('plain')?.storage?.clientUploads).toBeUndefined()
    })
  })

  describe('full per-collection stream override', () => {
    it('replaces the global library with plugin defaults without leaking global values', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
        collections: {
          media: {
            stream: createOwnStream(777, { thumbnailTime: 1000, tus: { access: tusAccess } }),
          },
        },
        storage: createBaseStorage(),
        stream: {
          ...createBaseStream(),
          mimeTypes: ['video/x-custom'],
          mp4Fallback: true,
          thumbnailTime: 9000,
        },
      }

      const media = createNormalizedConfig(config).collections.get('media')?.stream
      expect(media?.libraryId).toBe(777)
      expect(media?.apiKey).toBe('own-stream-key-777')
      expect(media?.hostname).toBe('own-stream-777.b-cdn.net')
      expect(media?.mimeTypes).toEqual([...CONFIG_DEFAULTS.stream.mimeTypes])
      expect(media?.mimeTypes).not.toContain('video/x-custom')
      expect(media?.mp4Fallback).toBe(CONFIG_DEFAULTS.stream.mp4Fallback)
      expect(media?.thumbnailTime).toBe(1000)
      expect(media?.tus?.access).toBe(tusAccess)
    })

    it('normalizes cleanup on a full stream override', () => {
      const boolCleanup = createNormalizedConfig({
        collections: { media: { stream: createOwnStream(1, { cleanup: true }) } },
        storage: createBaseStorage(),
      } as BunnyStorageConfig).collections.get('media')?.stream
      expect(boolCleanup?.cleanup?.maxAge).toBe(CONFIG_DEFAULTS.stream.cleanup.maxAge)

      const objCleanup = createNormalizedConfig({
        collections: { media: { stream: createOwnStream(2, { cleanup: { maxAge: 5 } }) } },
        storage: createBaseStorage(),
      } as BunnyStorageConfig).collections.get('media')?.stream
      expect(objCleanup?.cleanup?.maxAge).toBe(5)
    })
  })

  describe('relaxed top-level config', () => {
    it('normalizes with neither global storage nor stream when collections provide their own', () => {
      const config = {
        collections: {
          files: { storage: createOwnStorage('files') },
          videos: { stream: createOwnStream(500) },
        },
      } as BunnyStorageConfig

      const normalized = createNormalizedConfig(config)
      expect(normalized.storage).toBeUndefined()
      expect(normalized.stream).toBeUndefined()
      expect(normalized.collections.get('files')?.storage?.zoneName).toBe('own-zone-files')
      expect(normalized.collections.get('videos')?.stream?.libraryId).toBe(500)
    })
  })

  describe('collection properties', () => {
    it('sets prefix and disablePayloadAccessControl', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'test-api-key',
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
})
