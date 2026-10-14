import { describe, expect, it } from 'vitest'

import { createNormalizedOptions } from '@/server/payload/options/normalizer.js'
import { validateNormalizedOptions } from '@/server/payload/options/validator.js'
import type { BunnyStorageOptions } from '@/shared/types/options.js'

import {
  createBaseStorage,
  createBaseStream,
  createOwnStorage,
  createOwnStream,
} from '../../../../helpers/unit/optionsBuilders.js'

const normalizeAndValidate = (options: BunnyStorageOptions) => {
  const normalized = createNormalizedOptions(options)
  validateNormalizedOptions(normalized)
  return normalized
}

describe('options validator', () => {
  describe('service requirements', () => {
    it.each<[string, unknown]>([
      ['neither storage nor stream is configured', { collections: { media: true } }],
      [
        'a collection sets storage: false and stream: false',
        {
          collections: { media: { storage: false, stream: false } },
          storage: createBaseStorage(),
          stream: createBaseStream(),
        },
      ],
      [
        'a collection has only a partial override and no global service',
        { collections: { media: { storage: { uploadTimeout: 5 } } } },
      ],
    ])('throws when %s', (_, options) => {
      expect(() => normalizeAndValidate(options as BunnyStorageOptions)).toThrow(
        'collections [media] must have at least one service enabled',
      )
    })
  })

  describe('background tasks validation', () => {
    it('throws when tasks.secret is shorter than 16 characters', () => {
      expect(() =>
        normalizeAndValidate({
          collections: { media: true },
          storage: createBaseStorage(),
          tasks: { secret: 'short' },
        }),
      ).toThrow('`tasks.secret` must be a string of at least 16 characters')
    })

    it.each([
      { key: 'limit', value: 0 },
      { key: 'limit', value: 2.5 },
      { key: 'maxAge', value: -1 },
      { key: 'maxAge', value: '60' },
    ])('throws when the global status sync sets $key to $value', ({ key, value }) => {
      expect(() =>
        normalizeAndValidate({
          collections: { media: { disablePayloadAccessControl: true } },
          stream: { ...createBaseStream(), status: { sync: { [key]: value } } },
        }),
      ).toThrow(`\`stream.status.sync.${key}\` must be a positive integer`)
    })

    it.each([
      { path: 'stream.status', status: 'on' },
      { path: 'stream.status', status: null },
      { path: 'stream.status.sync', status: { sync: 1 } },
      { path: 'stream.status.sync', status: { sync: null } },
    ])('throws when the global $path is $status', ({ path, status }) => {
      expect(() =>
        normalizeAndValidate({
          collections: { media: { disablePayloadAccessControl: true } },
          stream: { ...createBaseStream(), status: status as never },
        }),
      ).toThrow(`\`${path}\` must be a boolean or an object`)
    })

    it.each([
      { path: 'stream.status', status: 1 },
      { path: 'stream.status.sync', status: { sync: 'yes' } },
      { path: 'stream.status.sync', status: { sync: null } },
    ])('throws when a collection $path is $status', ({ path, status }) => {
      expect(() =>
        normalizeAndValidate({
          collections: { media: { disablePayloadAccessControl: true, stream: { status: status as never } } },
          stream: createBaseStream(),
        }),
      ).toThrow(`collection "media" sets \`${path}\`, which must be a boolean or an object`)
    })

    it.each<[string, unknown, string]>([
      [
        'a collection status sync limit is 0',
        { collections: { media: { disablePayloadAccessControl: true, stream: { status: { sync: { limit: 0 } } } } } },
        'collection "media" sets `stream.status.sync.limit`, which must be a positive integer',
      ],
      [
        'the global status link is not a boolean',
        { stream: { ...createBaseStream(), status: { link: 'no' } } },
        '`stream.status.link` must be a boolean',
      ],
      [
        'a collection status link is not a boolean',
        { collections: { media: { disablePayloadAccessControl: true, stream: { status: { link: 0 } } } } },
        'collection "media" sets `stream.status.link`, which must be a boolean',
      ],
      [
        'the global preview is not a boolean',
        { stream: { ...createBaseStream(), preview: 'no' } },
        '`stream.preview` must be a boolean',
      ],
      [
        'a collection preview is not a boolean',
        { collections: { media: { disablePayloadAccessControl: true, stream: { preview: 1 } } } },
        'collection "media" sets `stream.preview`, which must be a boolean',
      ],
    ])('throws when %s', (_, options, message) => {
      expect(() =>
        normalizeAndValidate({
          collections: { media: { disablePayloadAccessControl: true } },
          stream: createBaseStream(),
          ...(options as object),
        } as BunnyStorageOptions),
      ).toThrow(message)
    })
  })

  describe('client uploads validation', () => {
    it.each<[string, unknown]>([
      ['has a scriptUrl but no secret', { edge: { scriptUrl: 'https://uploader.b-cdn.net' } }],
      ['has no edge options at all', true],
    ])('throws when edge transport %s', (_, clientUploads) => {
      const options = {
        collections: { media: true },
        storage: { ...createBaseStorage(), clientUploads },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow('collection "media" uses edge-transport client uploads')
    })

    it('throws when a collection enables client uploads without Bunny Storage', () => {
      const options: BunnyStorageOptions = {
        collections: {
          media: {
            disablePayloadAccessControl: true,
            storage: { clientUploads: true },
          },
        },
        stream: createBaseStream(),
      }

      expect(() => normalizeAndValidate(options)).toThrow(
        'collection "media" enables `storage.clientUploads` but Bunny Storage is not enabled for it',
      )
    })
  })

  describe('purge validation', () => {
    it.each([true, { async: true }])('throws when purge %o is enabled without accountApiKey', (purge) => {
      const options: BunnyStorageOptions = {
        collections: { media: true },
        purge,
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(options)).toThrow('`purge` requires global `accountApiKey` to be provided')
    })

    it.each([true, { async: true }])('throws when collection purge %o is set without accountApiKey', (purge) => {
      const options: BunnyStorageOptions = {
        collections: { docs: { purge: false }, media: { purge }, photos: { purge } },
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(options)).toThrow(
        'collections [media, photos] enable `purge` but global `accountApiKey` is not provided',
      )
    })
  })

  describe('storage hostname validation', () => {
    it.each([
      'storage.bunnycdn.com',
      'ny.storage.bunnycdn.com',
      'NY.Storage.BunnyCDN.com',
      'storage.bunnycdn.com.',
      'https://storage.bunnycdn.com',
      'storage.bunnycdn.com/',
      'storage.bunnycdn.com:443',
    ])('rejects the storage endpoint host %s', (hostname) => {
      const options: BunnyStorageOptions = {
        collections: { media: true },
        storage: { ...createBaseStorage(), hostname },
      }

      expect(() => normalizeAndValidate(options)).toThrow(
        'collection "media" storage `hostname` cannot be the Bunny Storage API host (storage.bunnycdn.com)',
      )
    })

    it.each(['example.b-cdn.net', 'storage.bunnycdn.com.example.com', 'mystorage.bunnycdn.com'])(
      'accepts the pull zone host %s',
      (hostname) => {
        const options: BunnyStorageOptions = {
          collections: { media: true },
          storage: { ...createBaseStorage(), hostname },
        }

        expect(() => normalizeAndValidate(options)).not.toThrow()
      },
    )
  })

  describe('signed URL redirect validation', () => {
    it.each<[string, unknown]>([
      ['signedUrls', { collections: { media: true }, signedUrls: { staticHandler: { redirect: { status: 301 } } } }],
      [
        'collections.media.signedUrls',
        { collections: { media: { signedUrls: { staticHandler: { redirect: { status: 308 } } } } } },
      ],
    ])('throws for a permanent redirect status in %s', (path, options) => {
      expect(() =>
        normalizeAndValidate({ storage: createBaseStorage(), ...(options as object) } as BunnyStorageOptions),
      ).toThrow(`\`${path}.staticHandler.redirect.status\` must be 302 or 307`)
    })
  })

  describe('signed URL expiry validation', () => {
    it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 400000000])('throws for signedUrls.expiresIn %s', (value) => {
      const options: BunnyStorageOptions = {
        collections: { media: true },
        signedUrls: { expiresIn: value },
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(options)).toThrow('`signedUrls.expiresIn` must be more than 0')
    })

    it('names the collection and the redirect key', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { signedUrls: { staticHandler: { redirect: { expiresIn: 0 } } } } },
        signedUrls: true,
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(options)).toThrow(
        '`collections.media.signedUrls.staticHandler.redirect.expiresIn` must be more than 0',
      )
    })

    it('accepts 10 years and functions', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { signedUrls: { expiresIn: () => 0 } } },
        signedUrls: { expiresIn: 315360000, staticHandler: { redirect: { expiresIn: 60 } } },
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(options)).not.toThrow()
    })
  })

  describe('signed URLs validation', () => {
    it.each<[string, unknown, string]>([
      [
        'global signedUrls without storage tokenSecurityKey',
        {
          collections: { media: true },
          signedUrls: true,
          storage: createBaseStorage({ tokenSecurityKey: undefined }),
        },
        'storage',
      ],
      [
        'global signedUrls and stream without stream tokenSecurityKey',
        {
          collections: { media: { disablePayloadAccessControl: true } },
          signedUrls: true,
          storage: createBaseStorage(),
          stream: { ...createBaseStream(), tokenSecurityKey: undefined },
        },
        'stream',
      ],
      [
        'collection signedUrls without storage tokenSecurityKey',
        { collections: { media: { signedUrls: true } }, storage: createBaseStorage({ tokenSecurityKey: undefined }) },
        'storage',
      ],
      [
        'collection signedUrls without stream tokenSecurityKey',
        {
          collections: {
            media: { disablePayloadAccessControl: true, signedUrls: { expiresIn: 3600 }, storage: false },
          },
          storage: createBaseStorage(),
          stream: { ...createBaseStream(), tokenSecurityKey: undefined },
        },
        'stream',
      ],
      [
        'an own zone without tokenSecurityKey that inherits global signedUrls',
        {
          collections: { media: { storage: createOwnStorage('media') } },
          signedUrls: true,
          storage: createBaseStorage(),
        },
        'storage',
      ],
    ])('throws for %s', (_, options, service) => {
      expect(() => normalizeAndValidate(options as BunnyStorageOptions)).toThrow(
        `collections [media] enable \`signedUrls\` but ${service} \`tokenSecurityKey\` is not provided`,
      )
    })
  })

  describe('access control and stream validation', () => {
    it('throws for every collection with access control and stream but no mp4Fallback or signed redirect', () => {
      const options = {
        collections: {
          videos1: { disablePayloadAccessControl: false },
          videos2: { disablePayloadAccessControl: false },
        },
        storage: createBaseStorage(),
        stream: {
          ...createBaseStream(),
          mp4Fallback: false,
        },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow(
        'collections [videos1, videos2] with `disablePayloadAccessControl: false` require: 1) `mp4Fallback` to be enabled, or 2) signed URLs with `staticHandler.redirect` enabled (globally or per collection)',
      )
    })
  })

  describe('per-collection full override validation', () => {
    it('throws when a full storage override is missing zoneName', () => {
      const options = {
        collections: { media: { storage: { apiKey: 'k', hostname: 'media.b-cdn.net' } } },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow(
        'collection "media" provides its own storage options but is missing `zoneName`',
      )
    })

    it('throws when a full stream override is missing hostname and libraryId', () => {
      const options = {
        collections: { media: { disablePayloadAccessControl: true, stream: { apiKey: 'k' } } },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow(
        'collection "media" provides its own stream options but is missing `hostname`',
      )
      expect(() => normalizeAndValidate(options)).toThrow(
        'collection "media" provides its own stream options but is missing `libraryId`',
      )
    })

    it('throws when an own zone hostname includes storage.bunnycdn.com', () => {
      const options = {
        collections: { media: { storage: createOwnStorage('media', { hostname: 'x.storage.bunnycdn.com' }) } },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow(
        'collection "media" storage `hostname` cannot be the Bunny Storage API host (storage.bunnycdn.com)',
      )
    })

    it('throws the edge transport error for an own zone with clientUploads but no S3 or edge', () => {
      const options = {
        collections: { media: { storage: createOwnStorage('media', { clientUploads: true }) } },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow('collection "media" uses edge-transport client uploads')
    })
  })

  describe('cross-collection conflicts', () => {
    it.each<[string, unknown, string]>([
      [
        'library',
        {
          a: { disablePayloadAccessControl: true, stream: { apiKey: 'key-a', hostname: 'a.b-cdn.net', libraryId: 55 } },
          b: { disablePayloadAccessControl: true, stream: { apiKey: 'key-b', hostname: 'b.b-cdn.net', libraryId: 55 } },
        },
        'stream library 55 is configured with conflicting API keys across collections',
      ],
      [
        'storage zone',
        {
          a: { storage: createOwnStorage('a', { zoneName: 'shared-zone' }) },
          b: { storage: createOwnStorage('b', { zoneName: 'shared-zone' }) },
        },
        'storage zone shared-zone is configured with conflicting API keys across collections',
      ],
    ])('throws when the same %s is configured with different apiKeys', (_, collections, message) => {
      expect(() => normalizeAndValidate({ collections } as BunnyStorageOptions)).toThrow(message)
    })

    it('throws when the same library is configured with different webhook secrets', () => {
      const options = {
        collections: {
          a: {
            disablePayloadAccessControl: true,
            stream: { apiKey: 'same', hostname: 'a.b-cdn.net', libraryId: 55, webhook: { secret: 'hook-a' } },
          },
          b: {
            disablePayloadAccessControl: true,
            stream: { apiKey: 'same', hostname: 'b.b-cdn.net', libraryId: 55, webhook: { secret: 'hook-b' } },
          },
        },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow(
        'stream library 55 is configured with conflicting webhook secrets across collections',
      )
    })

    it.each([
      ['turns on cleanup for only one of them', true, undefined],
      ['sets different cleanup maxAge values', { maxAge: 3600 }, { maxAge: 7200 }],
    ])('throws when streams on the same library %s', (_, cleanupA, cleanupB) => {
      const stream = { apiKey: 'same', hostname: 'a.b-cdn.net', libraryId: 55 }
      const options = {
        collections: {
          a: { disablePayloadAccessControl: true },
          b: { disablePayloadAccessControl: true, stream: { ...stream, cleanup: cleanupB } },
        },
        stream: { ...stream, cleanup: cleanupA },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow(
        'stream library 55 is configured with conflicting `cleanup` options across collections',
      )
    })

    it('accepts streams on the same library with the same cleanup options', () => {
      const stream = { apiKey: 'same', cleanup: { maxAge: 3600 }, hostname: 'a.b-cdn.net', libraryId: 55 }
      const options = {
        collections: {
          a: { disablePayloadAccessControl: true },
          b: { disablePayloadAccessControl: true, stream: { ...stream, hostname: 'b.b-cdn.net' } },
        },
        stream,
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).not.toThrow()
    })

    it('throws when a webhook secret is an empty string', () => {
      const options = {
        collections: {
          a: {
            disablePayloadAccessControl: true,
            stream: { apiKey: 'k', hostname: 'a.b-cdn.net', libraryId: 55, webhook: { secret: '' } },
          },
        },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow('stream `webhook.secret` must be a non-empty string')
    })
  })

  describe('error message format', () => {
    it('combines multiple errors with semicolons', () => {
      const options = {
        collections: { media: true },
        purge: true,
      } as unknown as BunnyStorageOptions

      try {
        normalizeAndValidate(options)
        expect.fail('Should have thrown')
      } catch (e) {
        const message = (e as Error).message
        expect(message).toContain(';')
        expect(message).toContain('must have at least one service')
        expect(message).toContain('`purge` requires global `accountApiKey`')
      }
    })
  })

  describe('shared Edge Script secret consistency', () => {
    it('throws when zones share a scriptUrl but configure different secrets', () => {
      const options: BunnyStorageOptions = {
        collections: {
          archives: {
            storage: createOwnStorage('archives', {
              clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'secret-b' } },
            }),
          },
          media: true,
        },
        storage: createBaseStorage({
          clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'secret-a' } },
        }),
      }

      expect(() => normalizeAndValidate(options)).toThrow(
        'share `clientUploads.edge.scriptUrl` but configure different `secret` values',
      )
    })
  })

  it.each<[string, unknown]>([
    ['storage only', { collections: { media: true }, storage: createBaseStorage() }],
    [
      'a tasks secret of 16 characters',
      { collections: { media: true }, storage: createBaseStorage(), tasks: { secret: 'x'.repeat(16) } },
    ],
    [
      'positive integer status sync values',
      {
        collections: { media: { disablePayloadAccessControl: true, stream: { status: { sync: { maxAge: 3600 } } } } },
        stream: { ...createBaseStream(), status: { sync: { limit: 20 } } },
      },
    ],
    [
      'a boolean status link',
      {
        collections: { media: { disablePayloadAccessControl: true, stream: { status: { link: true } } } },
        stream: { ...createBaseStream(), status: { link: false } },
      },
    ],
    [
      'a boolean or object status and sync',
      {
        collections: {
          clips: { disablePayloadAccessControl: true, stream: { status: false } },
          media: { disablePayloadAccessControl: true, stream: { status: { sync: true } } },
        },
        stream: { ...createBaseStream(), status: { sync: false } },
      },
    ],
    [
      'a boolean preview',
      {
        collections: { media: { disablePayloadAccessControl: true, stream: { preview: true } } },
        stream: { ...createBaseStream(), preview: false },
      },
    ],
    ['stream only', { collections: { media: { disablePayloadAccessControl: true } }, stream: createBaseStream() }],
    [
      'edge transport with scriptUrl and secret',
      {
        collections: { media: true },
        storage: {
          ...createBaseStorage(),
          clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'shared' } },
        },
      },
    ],
    [
      's3 transport without edge options',
      { collections: { media: true }, storage: { ...createBaseStorage(), clientUploads: {}, s3: true } },
    ],
    [
      'global clientUploads on a collection with storage: false',
      {
        collections: { media: { disablePayloadAccessControl: true, storage: false } },
        storage: { ...createBaseStorage(), clientUploads: true, s3: true },
        stream: createBaseStream(),
      },
    ],
    [
      'purge with global accountApiKey',
      { accountApiKey: 'global-api-key', collections: { media: true }, purge: true, storage: createBaseStorage() },
    ],
    [
      'collection-level purge with accountApiKey',
      { accountApiKey: 'global-api-key', collections: { media: { purge: true } }, storage: createBaseStorage() },
    ],
    [
      'accountApiKey without purge',
      { accountApiKey: 'global-api-key', collections: { media: true }, storage: createBaseStorage() },
    ],
    ['S3 in the default region', { collections: { media: true }, storage: { ...createBaseStorage(), s3: true } }],
    [
      'S3 in any region the user sets',
      { collections: { media: true }, storage: { ...createBaseStorage(), region: 'br', s3: true } },
    ],
    [
      'a disabled collection next to an enabled one',
      { collections: { docs: false, media: true }, storage: createBaseStorage() },
    ],
    [
      'collection-level purge: false without accountApiKey',
      { collections: { media: { purge: false } }, storage: createBaseStorage() },
    ],
    [
      'signedUrls with storage and stream token keys',
      {
        collections: { media: { disablePayloadAccessControl: true } },
        signedUrls: true,
        storage: createBaseStorage(),
        stream: createBaseStream(),
      },
    ],
    ['signedUrls with storage only', { collections: { media: true }, signedUrls: true, storage: createBaseStorage() }],
    [
      'collection-level signedUrls with tokenSecurityKey',
      { collections: { media: { signedUrls: true } }, storage: createBaseStorage() },
    ],
    [
      'own zone with its own tokenSecurityKey when the global zone lacks one',
      {
        collections: { media: { storage: createOwnStorage('media', { tokenSecurityKey: 'own-token' }) } },
        signedUrls: true,
        storage: createBaseStorage({ tokenSecurityKey: undefined }),
      },
    ],
    [
      'access control + stream with mp4Fallback',
      {
        collections: { videos: { disablePayloadAccessControl: false } },
        storage: createBaseStorage(),
        stream: { ...createBaseStream(), mp4Fallback: true },
      },
    ],
    [
      'access control + stream with signed redirect',
      {
        collections: { videos: { disablePayloadAccessControl: false } },
        signedUrls: { staticHandler: { redirect: true } },
        storage: createBaseStorage(),
        stream: { ...createBaseStream(), mp4Fallback: false },
      },
    ],
    [
      'stream without mp4Fallback when disablePayloadAccessControl is true',
      {
        collections: { videos: { disablePayloadAccessControl: true } },
        stream: { ...createBaseStream(), mp4Fallback: false },
      },
    ],
    [
      'storage-only collection (stream: false) without mp4Fallback',
      {
        collections: { media: { stream: false } },
        storage: createBaseStorage(),
        stream: { ...createBaseStream(), mp4Fallback: false },
      },
    ],
    [
      'one library shared with the same apiKey and different mimeTypes',
      {
        collections: {
          a: {
            disablePayloadAccessControl: true,
            stream: { apiKey: 'same', hostname: 'a.b-cdn.net', libraryId: 55, mimeTypes: ['video/mp4'] },
          },
          b: {
            disablePayloadAccessControl: true,
            stream: { apiKey: 'same', hostname: 'b.b-cdn.net', libraryId: 55, mimeTypes: ['video/webm'] },
          },
        },
      },
    ],
    [
      'one library shared with the same webhook secret',
      {
        collections: {
          a: {
            disablePayloadAccessControl: true,
            stream: { apiKey: 'same', hostname: 'a.b-cdn.net', libraryId: 55, webhook: { secret: 'shared-hook' } },
          },
          b: {
            disablePayloadAccessControl: true,
            stream: { apiKey: 'same', hostname: 'b.b-cdn.net', libraryId: 55, webhook: { secret: 'shared-hook' } },
          },
        },
      },
    ],
    [
      'only full per-collection services and no global ones',
      {
        collections: {
          files: { storage: createOwnStorage('files') },
          videos: { disablePayloadAccessControl: true, stream: createOwnStream(700, { mp4Fallback: true }) },
        },
      },
    ],
    [
      'a global-less collection with its own stream and mp4Fallback',
      { collections: { videos: { stream: createOwnStream(800, { mp4Fallback: true }) } } },
    ],
    [
      'zones sharing a scriptUrl and the same secret',
      {
        collections: {
          archives: {
            storage: createOwnStorage('archives', {
              clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'shared' } },
            }),
          },
          media: true,
        },
        storage: createBaseStorage({
          clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'shared' } },
        }),
      },
    ],
  ])('accepts %s', (_, options) => {
    expect(() => normalizeAndValidate(options as BunnyStorageOptions)).not.toThrow()
  })
})
