import { describe, expect, it } from 'vitest'

import { OPTIONS_DEFAULTS } from '@/server/payload/options/defaults.js'
import { createNormalizedOptions } from '@/server/payload/options/normalizer.js'
import type { BunnyStorageOptions } from '@/shared/types/options.js'

import {
  createBaseStorage,
  createBaseStream,
  createOwnStorage,
  createOwnStream,
} from '../../../../helpers/unit/optionsBuilders.js'

const testShouldUseSignedURL = () => true
const testClientAccess = () => true
const testCollectionClientAccess = () => false
const testClientPrefix = () => 'global-prefix'
const globalUserIp = () => '203.0.113.7'
const collectionUserIp = () => '198.51.100.1'
const tusAccess = () => true
const args = { collection: { slug: 'media' } } as never

describe('options normalizer', () => {
  describe('collections', () => {
    it('leaves out collections set to false', () => {
      const options: BunnyStorageOptions = {
        collections: { docs: false, media: true },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedOptions(options)
      expect([...normalized.collections.keys()]).toEqual(['media'])
    })

    it('records whether the collection sets generateFileURL', () => {
      const options: BunnyStorageOptions = {
        collections: {
          docs: { prefix: 'docs' },
          files: { generateFileURL: () => 'https://example.com/x' },
          media: true,
        },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.collections.get('files')?.hasGenerateFileURL).toBe(true)
      expect(normalized.collections.get('docs')?.hasGenerateFileURL).toBe(false)
      expect(normalized.collections.get('media')?.hasGenerateFileURL).toBe(false)
    })

    it.each<[string, Partial<BunnyStorageOptions>]>([
      ['purge', { purge: true }],
      ['signedUrls', { signedUrls: true }],
      ['storage', {}],
      ['stream', { stream: createBaseStream() }],
      ['thumbnail', { thumbnail: { sizeName: 'preview', urlTransform: { appendTimestamp: true } } }],
      ['urlTransform', { urlTransform: { appendTimestamp: false, queryParams: { cdn: 'bunny' } } }],
    ])('turns %s off for a collection set to false', (key, global) => {
      const normalized = createNormalizedOptions({
        accountApiKey: 'test-api-key',
        collections: { docs: true, media: { [key]: false } },
        storage: createBaseStorage(),
        ...global,
      })

      expect(normalized.collections.get('docs')?.[key as 'storage']).toBeDefined()
      expect(normalized.collections.get('media')?.[key as 'storage']).toBeUndefined()
    })

    it.each<[string, object]>([
      [
        'signedUrls',
        {
          expiresIn: expect.toSatisfy((expiresIn: (a: never) => number) => expiresIn(args) === 7200),
          redirect: undefined,
        },
      ],
      ['thumbnail', { appendTimestamp: true, queryParams: {}, streamAnimated: false }],
      ['urlTransform', { appendTimestamp: false, queryParams: {} }],
    ])('enables %s with defaults for true without global options', (key, expected) => {
      const normalized = createNormalizedOptions({
        accountApiKey: 'test-api-key',
        collections: { media: { [key]: true } },
        storage: createBaseStorage(),
      })

      expect(normalized.collections.get('media')?.[key as 'signedUrls']).toEqual(expected)
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
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: { media: true },
        storage: createBaseStorage(),
        thumbnail: globalThumbnail,
      }

      const normalized = createNormalizedOptions(options)
      const mediaOptions = normalized.collections.get('media')

      expect(mediaOptions?.thumbnail).toEqual({
        ...normalizedGlobalThumbnail,
        transformUrl: undefined,
      })
    })

    it('overrides the given properties', () => {
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: {
          media: { thumbnail: { streamAnimated: true } },
        },
        storage: createBaseStorage(),
        thumbnail: globalThumbnail,
      }

      const normalized = createNormalizedOptions(options)
      const mediaOptions = normalized.collections.get('media')

      expect(mediaOptions?.thumbnail).toEqual({
        ...normalizedGlobalThumbnail,
        streamAnimated: true,
        transformUrl: undefined,
      })
    })

    it('replaces queryParams and keeps the global appendTimestamp', () => {
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: {
          media: { thumbnail: { urlTransform: { queryParams: { custom: 'value' } } } },
        },
        storage: createBaseStorage(),
        thumbnail: globalThumbnail,
      }

      const normalized = createNormalizedOptions(options)
      const mediaOptions = normalized.collections.get('media')

      expect(mediaOptions?.thumbnail?.queryParams).toEqual({ custom: 'value' })
      expect(mediaOptions?.thumbnail?.appendTimestamp).toBe(true)
    })

    it('keeps the global urlTransform function when the collection only sets sizeName', () => {
      const transform = () => 'https://cdn.example.com/x.jpg'
      const options: BunnyStorageOptions = {
        collections: { media: { thumbnail: { sizeName: 'small' } } },
        storage: createBaseStorage(),
        thumbnail: { urlTransform: transform },
      }

      const thumbnail = createNormalizedOptions(options).collections.get('media')?.thumbnail
      expect(thumbnail?.sizeName).toBe('small')
      expect(thumbnail?.transformUrl).toBe(transform)
    })

    it('uses the thumbnail defaults when a collection object replaces the global function', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { thumbnail: { urlTransform: { queryParams: { custom: 'value' } } } } },
        storage: createBaseStorage(),
        thumbnail: { urlTransform: () => 'https://cdn.example.com/x.jpg' },
      }

      const thumbnail = createNormalizedOptions(options).collections.get('media')?.thumbnail
      expect(thumbnail?.appendTimestamp).toBe(true)
      expect(thumbnail?.queryParams).toEqual({ custom: 'value' })
      expect(thumbnail?.transformUrl).toBeUndefined()
    })

    it('uses a urlTransform function and drops the default timestamp', () => {
      const transform = () => 'https://cdn.example.com/x.jpg'
      const options: BunnyStorageOptions = {
        collections: { media: true },
        storage: createBaseStorage(),
        thumbnail: { urlTransform: transform },
      }

      expect(createNormalizedOptions(options).thumbnail).toEqual({
        appendTimestamp: false,
        queryParams: {},
        sizeName: undefined,
        streamAnimated: false,
        transformUrl: transform,
      })
    })

    it('turns the URL transform off with urlTransform false', () => {
      const options: BunnyStorageOptions = {
        collections: { media: true },
        storage: createBaseStorage(),
        thumbnail: { urlTransform: false },
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.thumbnail?.appendTimestamp).toBe(false)
      expect(normalized.thumbnail?.queryParams).toEqual({})
    })
  })

  describe('urlTransform', () => {
    const globalUrlTransform = {
      appendTimestamp: false,
      queryParams: { cdn: 'bunny', region: 'eu' },
    }

    it('inherits global settings', () => {
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: { media: true },
        storage: createBaseStorage(),
        urlTransform: globalUrlTransform,
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.collections.get('media')?.urlTransform).toEqual({
        ...globalUrlTransform,
        transformUrl: undefined,
      })
    })

    it('overrides the given properties', () => {
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: {
          media: { urlTransform: { appendTimestamp: true } },
        },
        storage: createBaseStorage(),
        urlTransform: globalUrlTransform,
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.collections.get('media')?.urlTransform).toEqual({
        appendTimestamp: true,
        queryParams: globalUrlTransform.queryParams,
        transformUrl: undefined,
      })
    })

    it('replaces queryParams', () => {
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: {
          media: { urlTransform: { queryParams: { custom: 'value' } } },
        },
        storage: createBaseStorage(),
        urlTransform: globalUrlTransform,
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.collections.get('media')?.urlTransform?.queryParams).toEqual({
        custom: 'value',
      })
    })

    it('replaces the global object with a collection function', () => {
      const transform = () => 'https://cdn.example.com/x.jpg'
      const options: BunnyStorageOptions = {
        collections: { media: { urlTransform: transform } },
        storage: createBaseStorage(),
        urlTransform: globalUrlTransform,
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.collections.get('media')?.urlTransform).toEqual({
        appendTimestamp: false,
        queryParams: {},
        transformUrl: transform,
      })
    })

    it('replaces the global function with a collection object', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { urlTransform: { appendTimestamp: true } } },
        storage: createBaseStorage(),
        urlTransform: () => 'https://cdn.example.com/x.jpg',
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.collections.get('media')?.urlTransform).toEqual({
        appendTimestamp: true,
        queryParams: {},
      })
    })
  })

  describe('signedUrls', () => {
    it.each([
      { collection: true, expected: 3600 },
      { collection: { signedUrls: { expiresIn: 7200 } }, expected: 7200 },
    ])('resolves expiresIn to $expected for collection $collection', ({ collection, expected }) => {
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: { media: collection },
        signedUrls: { expiresIn: 3600 },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.collections.get('media')?.signedUrls?.expiresIn(args)).toBe(expected)
    })

    it('inherits global keys on a partial override', () => {
      const options: BunnyStorageOptions = {
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

      const collectionSigned = createNormalizedOptions(options).collections.get('media')?.signedUrls
      expect(collectionSigned?.userIp).toBe(globalUserIp)
      expect(collectionSigned?.expiresIn(args)).toBe(100)
      expect(collectionSigned?.allowedCountries).toEqual(['US', 'CA'])
      expect(collectionSigned?.shouldUseSignedUrl).toBeDefined()
      expect(collectionSigned?.redirect).toEqual({ expiresIn: undefined, status: 307 })
    })

    it('enables the redirect with status 302 for redirect true', () => {
      const options: BunnyStorageOptions = {
        collections: { media: true },
        signedUrls: { staticHandler: { redirect: true } },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.signedUrls?.redirect).toEqual({ expiresIn: undefined, status: 302 })
    })

    it('turns the global redirect off per collection with redirect false', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { signedUrls: { staticHandler: { redirect: false } } } },
        signedUrls: { staticHandler: { redirect: true } },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.collections.get('media')?.signedUrls?.redirect).toBeUndefined()
    })

    it('overrides userIp per collection', () => {
      const options: BunnyStorageOptions = {
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

      const collectionSigned = createNormalizedOptions(options).collections.get('media')?.signedUrls

      expect(collectionSigned?.userIp).toBe(collectionUserIp)
    })
  })

  describe('clientUploads', () => {
    it('inherits global keys on a partial override', () => {
      const options: BunnyStorageOptions = {
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

      const collectionCU = createNormalizedOptions(options).collections.get('media')?.storage?.clientUploads
      expect(collectionCU?.access).toBe(testCollectionClientAccess)
      expect(collectionCU?.prefix).toBe(testClientPrefix)
      expect(collectionCU?.edge?.scriptUrl).toBe('https://uploader.b-cdn.net')
      expect(collectionCU?.edge?.secret).toBe('shared')
    })

    it('uses the global options when the collection sets true', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { storage: { clientUploads: true } } },
        storage: {
          ...createBaseStorage(),
          clientUploads: {
            edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'shared' },
          },
        },
      }

      const collectionCU = createNormalizedOptions(options).collections.get('media')?.storage?.clientUploads
      expect(collectionCU?.edge?.scriptUrl).toBe('https://uploader.b-cdn.net')
      expect(collectionCU?.edge?.secret).toBe('shared')
    })

    it('enables per collection with defaults for true without global options', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { storage: { clientUploads: true } } },
        storage: { ...createBaseStorage(), s3: true },
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.storage?.clientUploads).toBeUndefined()
      expect(normalized.collections.get('media')?.storage?.clientUploads).toBeDefined()
    })

    it('disables per collection with false', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { storage: { clientUploads: false } } },
        storage: { ...createBaseStorage(), clientUploads: true, s3: true },
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.collections.get('media')?.storage?.clientUploads).toBeUndefined()
    })

    it('nests the normalized clientUploads under storage, not the raw value', () => {
      const options: BunnyStorageOptions = {
        collections: { media: true },
        storage: { ...createBaseStorage(), clientUploads: true, s3: true },
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.storage?.clientUploads).toEqual({ access: undefined, prefix: undefined })
      expect(normalized.collections.get('media')?.storage?.clientUploads).toEqual({
        access: undefined,
        prefix: undefined,
      })
    })
  })

  describe('purge', () => {
    it.each([
      { collection: true, expected: false },
      { collection: { purge: { async: true } }, expected: true },
    ])('resolves async to $expected for collection $collection', ({ collection, expected }) => {
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: { media: collection },
        purge: { async: false },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.collections.get('media')?.purge?.async).toBe(expected)
    })

    it('accepts true globally', () => {
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: { media: true },
        purge: true,
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.purge).toEqual({ async: false })
      expect(normalized.collections.get('media')?.purge).toEqual({ async: false })
    })

    it.each([true, { async: true }])('enables collection purge %o when the global purge is off', (purge) => {
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: { docs: true, media: { purge } },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.purge).toBeUndefined()
      expect(normalized.collections.get('media')?.purge).toEqual({ async: purge !== true })
      expect(normalized.collections.get('docs')?.purge).toBeUndefined()
    })

    it.each([true, { async: true }])('leaves purge %o off without accountApiKey', (purge) => {
      const options: BunnyStorageOptions = {
        collections: { media: { purge } },
        purge,
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.purge).toBeUndefined()
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
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: { media: true },
        storage: createBaseStorage(),
        stream: globalStream,
      }

      const normalized = createNormalizedOptions(options)
      const mediaStream = normalized.collections.get('media')?.stream

      expect(mediaStream?.mp4Fallback).toBe(true)
      expect(mediaStream?.thumbnailTime).toBe(5000)
    })

    it('overrides the given properties', () => {
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: {
          media: {
            stream: { mp4Fallback: false, thumbnailTime: 3000 },
          },
        },
        storage: createBaseStorage(),
        stream: globalStream,
      }

      const normalized = createNormalizedOptions(options)
      const mediaStream = normalized.collections.get('media')?.stream

      expect(mediaStream?.mp4Fallback).toBe(false)
      expect(mediaStream?.thumbnailTime).toBe(3000)
    })

    it('stores the status by default and turns it off globally or per collection', () => {
      const normalized = createNormalizedOptions({
        accountApiKey: 'test-api-key',
        collections: { clips: { stream: { status: false } }, media: true },
        storage: createBaseStorage(),
        stream: globalStream,
      })
      expect(normalized.stream?.status).toEqual({ link: true })
      expect(normalized.collections.get('media')?.stream?.status).toEqual({ link: true })
      expect(normalized.collections.get('clips')?.stream?.status).toBe(false)

      const off = createNormalizedOptions({
        accountApiKey: 'test-api-key',
        collections: { clips: { stream: { status: true } }, media: true },
        storage: createBaseStorage(),
        stream: { ...globalStream, status: false },
      })
      expect(off.collections.get('media')?.stream?.status).toBe(false)
      expect(off.collections.get('clips')?.stream?.status).toEqual({ link: true })
    })

    it('shows the edit view preview by default and lets a collection inherit or override it', () => {
      const normalized = createNormalizedOptions({
        collections: { clips: { stream: { preview: false } }, media: true },
        stream: globalStream,
      })
      expect(normalized.stream?.preview).toBe(true)
      expect(normalized.collections.get('media')?.stream?.preview).toBe(true)
      expect(normalized.collections.get('clips')?.stream?.preview).toBe(false)

      const off = createNormalizedOptions({
        collections: { clips: { stream: { preview: true } }, media: { stream: { mp4Fallback: false } } },
        stream: { ...globalStream, preview: false },
      })
      expect(off.collections.get('media')?.stream?.preview).toBe(false)
      expect(off.collections.get('clips')?.stream?.preview).toBe(true)
    })

    it('leaves the status sync off by default and fills its defaults', () => {
      const off = createNormalizedOptions({ collections: { media: true }, stream: { ...globalStream, status: {} } })
      expect(off.stream?.status).toEqual({ link: true })

      const defaults = createNormalizedOptions({
        collections: { media: true },
        stream: { ...globalStream, status: { sync: true } },
      })
      expect(defaults.stream?.status).toEqual({
        link: true,
        sync: { limit: 50, maxAge: 604800, schedule: { cron: '*/5 * * * *', queue: 'storage-bunny' } },
      })

      const on = createNormalizedOptions({
        collections: { media: true },
        stream: { ...globalStream, status: { sync: { limit: 10 } } },
      })
      expect(on.collections.get('media')?.stream?.status).toEqual({
        link: true,
        sync: { limit: 10, maxAge: 604800, schedule: { cron: '*/5 * * * *', queue: 'storage-bunny' } },
      })
    })

    it('turns the status sync on, off or changes it per collection and keeps the global schedule', () => {
      const schedule = { cron: '* * * * *', queue: 'q' }
      const normalized = createNormalizedOptions({
        collections: {
          clips: { stream: { status: { sync: { maxAge: 60 } } } },
          inherit: { stream: { status: true } },
          media: true,
          plain: { stream: { status: false } },
          shorts: { stream: { status: { sync: false } } },
        },
        stream: { ...globalStream, status: { sync: { limit: 20, schedule } } },
      })
      const statusOf = (slug: string) => normalized.collections.get(slug)?.stream?.status
      expect(statusOf('media')).toEqual({ link: true, sync: { limit: 20, maxAge: 604800, schedule } })
      expect(statusOf('inherit')).toEqual({ link: true, sync: { limit: 20, maxAge: 604800, schedule } })
      expect(statusOf('clips')).toEqual({ link: true, sync: { limit: 20, maxAge: 60, schedule } })
      expect(statusOf('shorts')).toEqual({ link: true })
      expect(statusOf('plain')).toBe(false)
      expect(normalized.stream?.status).toEqual({ link: true, sync: { limit: 20, maxAge: 604800, schedule } })

      const perCollection = createNormalizedOptions({
        collections: { clips: { stream: { status: { sync: true } } }, media: true },
        stream: { ...globalStream, status: false },
      })
      expect(perCollection.collections.get('clips')?.stream?.status).toEqual({
        link: true,
        sync: { limit: 50, maxAge: 604800, schedule: { cron: '*/5 * * * *', queue: 'storage-bunny' } },
      })
      expect(perCollection.collections.get('media')?.stream?.status).toBe(false)
    })

    it('turns the dashboard link off globally, inherits it in a partial override and defaults it to true with full options', () => {
      const schedule = { cron: '* * * * *', queue: 'q' }
      const normalized = createNormalizedOptions({
        collections: {
          clips: { stream: { status: { sync: { maxAge: 60 } } } },
          inherit: { stream: { status: true } },
          linked: { stream: { status: { link: true } } },
          media: true,
          own: { disablePayloadAccessControl: true, stream: { ...globalStream, libraryId: 2 } },
          ownOff: {
            disablePayloadAccessControl: true,
            stream: { ...globalStream, libraryId: 3, status: { link: false } },
          },
          shorts: { stream: { status: { sync: false } } },
        },
        stream: { ...globalStream, status: { link: false, sync: { schedule } } },
      })
      const statusOf = (slug: string) => normalized.collections.get(slug)?.stream?.status
      expect(normalized.stream?.status).toEqual({ link: false, sync: { limit: 50, maxAge: 604800, schedule } })
      expect(statusOf('media')).toEqual({ link: false, sync: { limit: 50, maxAge: 604800, schedule } })
      expect(statusOf('inherit')).toEqual({ link: false, sync: { limit: 50, maxAge: 604800, schedule } })
      expect(statusOf('clips')).toEqual({ link: false, sync: { limit: 50, maxAge: 60, schedule } })
      expect(statusOf('shorts')).toEqual({ link: false })
      expect(statusOf('linked')).toEqual({ link: true, sync: { limit: 50, maxAge: 604800, schedule } })
      expect(statusOf('own')).toEqual({ link: true })
      expect(statusOf('ownOff')).toEqual({ link: false })

      const globalOff = createNormalizedOptions({
        collections: { clips: { stream: { status: { link: false } } }, media: { stream: { status: { sync: true } } } },
        stream: { ...globalStream, status: false },
      })
      expect(globalOff.collections.get('clips')?.stream?.status).toEqual({ link: false })
      expect(globalOff.collections.get('media')?.stream?.status).toMatchObject({ link: true })
    })

    it('keeps tasks', () => {
      const normalized = createNormalizedOptions({
        collections: { media: true },
        stream: globalStream,
        tasks: { secret: 'a-long-enough-secret' },
      })
      expect(normalized.tasks).toEqual({ secret: 'a-long-enough-secret' })
    })

    it('disables TUS per collection with false', () => {
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: {
          media: { stream: { tus: false } },
          videos: true,
        },
        storage: createBaseStorage(),
        stream: { ...globalStream, tus: true },
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.collections.get('media')?.stream?.tus).toBeUndefined()
      expect(normalized.collections.get('videos')?.stream?.tus).toBeDefined()
    })

    it('overrides TUS settings per collection and keeps the global access', () => {
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: {
          media: { stream: { tus: { autoMode: false, expiresIn: 7200 } } },
        },
        storage: createBaseStorage(),
        stream: { ...globalStream, tus: { access: tusAccess } },
      }

      const mediaTus = createNormalizedOptions(options).collections.get('media')?.stream?.tus
      expect(mediaTus).toEqual({ access: tusAccess, autoMode: false, expiresIn: 7200 })
    })

    it('enables TUS per collection with true when the global TUS is off', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { stream: { tus: true } }, videos: true },
        storage: createBaseStorage(),
        stream: globalStream,
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.collections.get('media')?.stream?.tus).toEqual(OPTIONS_DEFAULTS.stream.tus)
      expect(normalized.collections.get('videos')?.stream?.tus).toBeUndefined()
    })

    it('enables TUS per collection with an object when the global TUS is off', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { stream: { tus: { expiresIn: 600 } } } },
        storage: createBaseStorage(),
        stream: globalStream,
      }

      const mediaTus = createNormalizedOptions(options).collections.get('media')?.stream?.tus
      expect(mediaTus).toEqual({ autoMode: OPTIONS_DEFAULTS.stream.tus.autoMode, expiresIn: 600 })
    })
  })

  describe('storage', () => {
    it.each([
      { collection: true, expected: 60000 },
      { collection: { storage: { uploadTimeout: 120000 } }, expected: 120000 },
    ])('resolves uploadTimeout to $expected for collection $collection', ({ collection, expected }) => {
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: { media: collection },
        storage: { ...createBaseStorage(), uploadTimeout: 60000 },
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.collections.get('media')?.storage?.uploadTimeout).toBe(expected)
    })

    it.each([
      { expected: { region: 'de', s3: false }, storage: {} },
      { expected: { region: 'de', s3: false }, storage: { region: 'de' } },
      { expected: { region: 'ny', s3: false }, storage: { region: 'ny' } },
      { expected: { region: 'de', s3: true }, storage: { s3: true } },
      { expected: { region: 'de', s3: true }, storage: { region: 'de', s3: true } },
      { expected: { region: 'ny', s3: true }, storage: { region: 'ny', s3: true } },
    ])('maps region $storage.region with s3 $storage.s3', ({ expected, storage }) => {
      const normalized = createNormalizedOptions({
        collections: { media: true },
        storage: { ...createBaseStorage(), ...storage },
      } as BunnyStorageOptions)

      expect(normalized.storage?.region).toBe(expected.region)
      expect(normalized.storage?.s3).toBe(expected.s3)
    })

    it('passes the S3 options to collections', () => {
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: { media: { storage: { uploadTimeout: 90000 } } },
        storage: { ...createBaseStorage(), s3: true },
      }

      const normalized = createNormalizedOptions(options)
      expect(normalized.storage?.s3).toBe(true)
      expect(normalized.collections.get('media')?.storage?.s3).toBe(true)
    })
  })

  describe('full per-collection storage override', () => {
    it('replaces the global zone without leaking global credentials and resets uploadTimeout to the default', () => {
      const options: BunnyStorageOptions = {
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

      const media = createNormalizedOptions(options).collections.get('media')?.storage
      expect(media?.apiKey).toBe('own-storage-key-media')
      expect(media?.hostname).toBe('own-media.b-cdn.net')
      expect(media?.zoneName).toBe('own-zone-media')
      expect(media?.tokenSecurityKey).toBeUndefined()
      expect(media?.s3).toBe(false)
      expect(media?.region).toBe('de')
      expect(media?.uploadTimeout).toBe(OPTIONS_DEFAULTS.storage.uploadTimeout)
    })

    it('normalizes clientUploads from its own zone without leaking global clientUploads', () => {
      const options: BunnyStorageOptions = {
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

      const normalized = createNormalizedOptions(options)
      const ownCU = normalized.collections.get('own')?.storage?.clientUploads
      expect(ownCU?.edge?.scriptUrl).toBe('https://own-edge.b-cdn.net')
      expect(ownCU?.edge?.secret).toBe('own-secret')
      expect(normalized.collections.get('plain')?.storage?.clientUploads).toBeUndefined()
    })
  })

  describe('full per-collection stream override', () => {
    it('replaces the global library with plugin defaults without leaking global values', () => {
      const options: BunnyStorageOptions = {
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

      const media = createNormalizedOptions(options).collections.get('media')?.stream
      expect(media?.libraryId).toBe(777)
      expect(media?.apiKey).toBe('own-stream-key-777')
      expect(media?.hostname).toBe('own-stream-777.b-cdn.net')
      expect(media?.mimeTypes).toEqual([...OPTIONS_DEFAULTS.stream.mimeTypes])
      expect(media?.mimeTypes).not.toContain('video/x-custom')
      expect(media?.mp4Fallback).toBe(OPTIONS_DEFAULTS.stream.mp4Fallback)
      expect(media?.thumbnailTime).toBe(1000)
      expect(media?.tus?.access).toBe(tusAccess)
    })

    it('normalizes cleanup on a full stream override', () => {
      const boolCleanup = createNormalizedOptions({
        collections: { media: { stream: createOwnStream(1, { cleanup: true }) } },
        storage: createBaseStorage(),
      } as BunnyStorageOptions).collections.get('media')?.stream
      expect(boolCleanup?.cleanup?.maxAge).toBe(OPTIONS_DEFAULTS.stream.cleanup.maxAge)

      const objCleanup = createNormalizedOptions({
        collections: { media: { stream: createOwnStream(2, { cleanup: { maxAge: 5 } }) } },
        storage: createBaseStorage(),
      } as BunnyStorageOptions).collections.get('media')?.stream
      expect(objCleanup?.cleanup?.maxAge).toBe(5)
    })
  })

  describe('relaxed top-level options', () => {
    it('normalizes with neither global storage nor stream when collections provide their own', () => {
      const options = {
        collections: {
          files: { storage: createOwnStorage('files') },
          videos: { stream: createOwnStream(500) },
        },
      } as BunnyStorageOptions

      const normalized = createNormalizedOptions(options)
      expect(normalized.storage).toBeUndefined()
      expect(normalized.stream).toBeUndefined()
      expect(normalized.collections.get('files')?.storage?.zoneName).toBe('own-zone-files')
      expect(normalized.collections.get('videos')?.stream?.libraryId).toBe(500)
    })
  })

  describe('collection properties', () => {
    it('sets prefix and disablePayloadAccessControl', () => {
      const options: BunnyStorageOptions = {
        accountApiKey: 'test-api-key',
        collections: {
          media: {
            disablePayloadAccessControl: true,
            prefix: 'custom-prefix',
          },
        },
        storage: createBaseStorage(),
      }

      const normalized = createNormalizedOptions(options)
      const mediaOptions = normalized.collections.get('media')

      expect(mediaOptions?.prefix).toBe('custom-prefix')
      expect(mediaOptions?.disablePayloadAccessControl).toBe(true)
    })
  })
})
