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
    it('throws when neither storage nor stream is configured', () => {
      const options = {
        collections: { media: true },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow('collections [media] must have at least one service enabled')
    })

    it('throws when a collection has no service (storage: false, stream: false)', () => {
      const options: BunnyStorageOptions = {
        collections: {
          media: {
            storage: false,
            stream: false,
          },
        },
        storage: createBaseStorage(),
        stream: createBaseStream(),
      }

      expect(() => normalizeAndValidate(options)).toThrow('collections [media] must have at least one service enabled')
    })
  })

  describe('client uploads validation', () => {
    it('throws when edge transport is missing scriptUrl or secret', () => {
      const options = {
        collections: { media: true },
        storage: {
          ...createBaseStorage(),
          clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net' } },
        },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow('uses edge-transport client uploads')
    })

    it('throws when edge transport has no edge options at all', () => {
      const options = {
        collections: { media: true },
        storage: { ...createBaseStorage(), clientUploads: true },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow('uses edge-transport client uploads')
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
    it('throws when the storage hostname includes storage.bunnycdn.com', () => {
      const options: BunnyStorageOptions = {
        collections: { media: true },
        storage: {
          ...createBaseStorage(),
          hostname: 'storage.bunnycdn.com',
        },
      }

      expect(() => normalizeAndValidate(options)).toThrow('storage `hostname` cannot include "storage.bunnycdn.com"')
    })
  })

  describe('signed URL redirect validation', () => {
    it('throws for a permanent redirect status', () => {
      const options = {
        collections: { media: true },
        signedUrls: { staticHandler: { redirect: { status: 301 } } },
        storage: createBaseStorage(),
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow(
        '`signedUrls.staticHandler.redirect.status` must be 302 or 307',
      )
    })

    it('names the collection in the redirect status error', () => {
      const options = {
        collections: { media: { signedUrls: { staticHandler: { redirect: { status: 308 } } } } },
        storage: createBaseStorage(),
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow(
        '`collections.media.signedUrls.staticHandler.redirect.status` must be 302 or 307',
      )
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
    it('throws when signedUrls is enabled without storage.tokenSecurityKey', () => {
      const options: BunnyStorageOptions = {
        collections: { media: true },
        signedUrls: true,
        storage: {
          apiKey: 'storage-key',
          hostname: 'storage.bunny.net',
          zoneName: 'test-zone',
        },
      }

      expect(() => normalizeAndValidate(options)).toThrow(
        'collections [media] enable `signedUrls` but storage `tokenSecurityKey` is not provided',
      )
    })

    it('throws when signedUrls and stream are set without stream.tokenSecurityKey', () => {
      const options: BunnyStorageOptions = {
        collections: {
          media: {
            disablePayloadAccessControl: true,
          },
        },
        signedUrls: true,
        storage: createBaseStorage(),
        stream: {
          apiKey: 'stream-key',
          hostname: 'stream.bunny.net',
          libraryId: 12345,
        },
      }

      expect(() => normalizeAndValidate(options)).toThrow(
        'collections [media] enable `signedUrls` but stream `tokenSecurityKey` is not provided',
      )
    })

    it('throws when collection signedUrls is enabled without storage.tokenSecurityKey', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { signedUrls: true } },
        storage: createBaseStorage({ tokenSecurityKey: undefined }),
      }

      expect(() => normalizeAndValidate(options)).toThrow(
        'collections [media] enable `signedUrls` but storage `tokenSecurityKey` is not provided',
      )
    })

    it('throws when collection signedUrls is enabled without stream.tokenSecurityKey', () => {
      const options: BunnyStorageOptions = {
        collections: {
          media: {
            disablePayloadAccessControl: true,
            signedUrls: { expiresIn: 3600 },
            storage: false,
          },
        },
        storage: createBaseStorage(),
        stream: {
          apiKey: 'stream-key',
          hostname: 'stream.bunny.net',
          libraryId: 12345,
        },
      }

      expect(() => normalizeAndValidate(options)).toThrow(
        'collections [media] enable `signedUrls` but stream `tokenSecurityKey` is not provided',
      )
    })
  })

  describe('access control and stream validation', () => {
    it('throws when access control and stream are set without mp4Fallback or a signed redirect', () => {
      const options = {
        collections: {
          videos: {
            disablePayloadAccessControl: false,
          },
        },
        storage: createBaseStorage(),
        stream: {
          ...createBaseStream(),
          mp4Fallback: false,
        },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow(
        'collections [videos] with `disablePayloadAccessControl: false` require',
      )
    })

    it('throws for multiple collections with issues', () => {
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
        /collections \[videos1, videos2\]|collections \[videos2, videos1\]/,
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

    it('throws when an own zone has no tokenSecurityKey but inherits global signedUrls', () => {
      const options: BunnyStorageOptions = {
        collections: { media: { storage: createOwnStorage('media') } },
        signedUrls: true,
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(options)).toThrow(
        'collections [media] enable `signedUrls` but storage `tokenSecurityKey` is not provided',
      )
    })

    it('throws when an own zone hostname includes storage.bunnycdn.com', () => {
      const options = {
        collections: { media: { storage: createOwnStorage('media', { hostname: 'x.storage.bunnycdn.com' }) } },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow(
        'collection "media" storage `hostname` cannot include "storage.bunnycdn.com"',
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
    it('throws when the same library is configured with different apiKeys', () => {
      const options = {
        collections: {
          a: { disablePayloadAccessControl: true, stream: { apiKey: 'key-a', hostname: 'a.b-cdn.net', libraryId: 55 } },
          b: { disablePayloadAccessControl: true, stream: { apiKey: 'key-b', hostname: 'b.b-cdn.net', libraryId: 55 } },
        },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow(
        'stream library 55 is configured with conflicting API keys across collections',
      )
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

  describe('relaxed top-level requirements', () => {
    it('throws when a collection has only a partial override and no global service', () => {
      const options = {
        collections: { media: { storage: { uploadTimeout: 5 } } },
      } as unknown as BunnyStorageOptions

      expect(() => normalizeAndValidate(options)).toThrow('collections [media] must have at least one service enabled')
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
