import { describe, expect, it } from 'vitest'

import { createNormalizedConfig } from '@/config/normalizer.js'
import { validateNormalizedConfig } from '@/config/validator.js'
import type { BunnyStorageConfig } from '@/types/config.js'

import {
  createBaseStorage,
  createBaseStream,
  createOwnStorage,
  createOwnStream,
} from '../../helpers/unit/configBuilders.js'

const normalizeAndValidate = (config: BunnyStorageConfig) => {
  const normalized = createNormalizedConfig(config)
  validateNormalizedConfig(normalized)
  return normalized
}

describe('Config Validator', () => {
  describe('service requirements', () => {
    it('throws if neither storage nor stream configured', () => {
      const config = {
        collections: { media: true },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow('collections [media] must have at least one service enabled')
    })

    it('throws if collection has no service (storage=false, stream=false)', () => {
      const config: BunnyStorageConfig = {
        collections: {
          media: {
            storage: false,
            stream: false,
          },
        },
        storage: createBaseStorage(),
        stream: createBaseStream(),
      }

      expect(() => normalizeAndValidate(config)).toThrow('collections [media] must have at least one service enabled')
    })

    it('passes valid config with storage only', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('passes valid config with stream only', () => {
      const config: BunnyStorageConfig = {
        collections: {
          media: {
            disablePayloadAccessControl: true,
          },
        },
        stream: createBaseStream(),
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('passes valid config with both services', () => {
      const config: BunnyStorageConfig = {
        collections: {
          media: {
            disablePayloadAccessControl: true,
          },
        },
        storage: createBaseStorage(),
        stream: createBaseStream(),
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })
  })

  describe('client uploads validation', () => {
    it('throws when edge transport is missing scriptUrl or secret', () => {
      const config = {
        collections: { media: true },
        storage: {
          ...createBaseStorage(),
          clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net' } },
        },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow('uses edge-transport client uploads')
    })

    it('throws when edge transport has no edge config at all', () => {
      const config = {
        collections: { media: true },
        storage: { ...createBaseStorage(), clientUploads: true },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow('uses edge-transport client uploads')
    })

    it('passes edge transport with scriptUrl and secret', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        storage: {
          ...createBaseStorage(),
          clientUploads: { edge: { scriptUrl: 'https://uploader.b-cdn.net', secret: 'shared' } },
        },
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('passes s3 transport without edge config when storage.s3 is enabled', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        storage: { ...createBaseStorage(), clientUploads: {}, s3: { region: 'de' } },
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('throws when a collection enables client uploads without Bunny Storage', () => {
      const config: BunnyStorageConfig = {
        collections: {
          media: {
            disablePayloadAccessControl: true,
            storage: { clientUploads: true },
          },
        },
        stream: createBaseStream(),
      }

      expect(() => normalizeAndValidate(config)).toThrow(
        'collection "media" enables `storage.clientUploads` but Bunny Storage is not enabled for it',
      )
    })
  })

  describe('purge validation', () => {
    it('throws if purge enabled without accountApiKey', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        purge: true,
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(config)).toThrow('`purge` requires global `accountApiKey` to be provided')
    })

    it('passes when purge enabled with global accountApiKey', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'global-api-key',
        collections: { media: true },
        purge: true,
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('throws if collection-level purge is enabled without accountApiKey', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { purge: true } },
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(config)).toThrow(
        'collections [media] enable `purge` but global `accountApiKey` is not provided',
      )
    })

    it('throws if collection-level purge config object is set without accountApiKey', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { purge: { async: true } } },
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(config)).toThrow(
        'collections [media] enable `purge` but global `accountApiKey` is not provided',
      )
    })

    it('passes when collection-level purge is enabled with accountApiKey', () => {
      const config: BunnyStorageConfig = {
        accountApiKey: 'global-api-key',
        collections: { media: { purge: true } },
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('passes when collection-level purge is false without accountApiKey', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { purge: false } },
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })
  })

  describe('removed aliases (v3)', () => {
    it('throws a boot error for the removed `adminThumbnail` alias', () => {
      const config = {
        adminThumbnail: { appendTimestamp: true },
        collections: { media: true },
        storage: createBaseStorage(),
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        'Config error: "adminThumbnail" was removed in v3. Rename it to "thumbnail" (same shape).',
      )
    })

    it('throws a boot error for the removed `stream.tus.mimeTypes` alias', () => {
      const config = {
        collections: { media: { disablePayloadAccessControl: true } },
        stream: { ...createBaseStream(), tus: { mimeTypes: ['video/mp4'] } },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        'Config error: "stream.tus.mimeTypes" was removed in v3. Move the array to "stream.mimeTypes".',
      )
    })

    it('throws a boot error for the removed `stream.tus.uploadTimeout` alias', () => {
      const config = {
        collections: { media: { disablePayloadAccessControl: true } },
        stream: { ...createBaseStream(), tus: { uploadTimeout: 3600 } },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        `Config error: "stream.tus.uploadTimeout" was removed in v3. Rename it to "stream.tus.expiresIn" (it's a session expiry in seconds).`,
      )
    })

    it('throws a boot error for the removed `purge.apiKey` alias', () => {
      const config = {
        collections: { media: true },
        purge: { apiKey: 'purge-api-key' },
        storage: createBaseStorage(),
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        'Config error: "purge.apiKey" was removed in v3. Use the global `accountApiKey` instead.',
      )
    })

    it('throws a boot error for the removed top-level `apiKey` alias', () => {
      const config = {
        apiKey: 'account-api-key',
        collections: { media: true },
        storage: createBaseStorage(),
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        'Config error: "apiKey" was removed in v3. Rename it to "accountApiKey".',
      )
    })

    it('throws a boot error for the moved top-level `clientUploads` alias', () => {
      const config = {
        clientUploads: true,
        collections: { media: true },
        storage: createBaseStorage(),
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        'Config error: "clientUploads" was moved in v3. Nest it under "storage.clientUploads".',
      )
    })

    it('throws a boot error for the moved per-collection `clientUploads` alias', () => {
      const config = {
        collections: { media: { clientUploads: true } },
        storage: createBaseStorage(),
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        'Config error: Per-collection "clientUploads" was moved in v3 (collection "media"). Nest it under "storage.clientUploads".',
      )
    })

    it('throws a boot error for the removed `clientUploads.mode` option', () => {
      const modeConfigs = [
        {
          collections: { media: true },
          storage: { ...createBaseStorage(), clientUploads: { mode: 's3' } },
        },
        {
          clientUploads: { mode: 'edge' },
          collections: { media: true },
          storage: createBaseStorage(),
        },
        {
          collections: { media: { storage: { clientUploads: { mode: 'edge' } } } },
          storage: createBaseStorage(),
        },
      ] as unknown as BunnyStorageConfig[]

      for (const config of modeConfigs) {
        expect(() => normalizeAndValidate(config)).toThrow(
          `Config error: "clientUploads.mode" was removed in v3 — the transport is chosen automatically ('s3' when "storage.s3" is set, otherwise 'edge').`,
        )
      }
    })
  })

  describe('storage hostname validation', () => {
    it('throws if storage hostname includes storage.bunnycdn.com', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        storage: {
          ...createBaseStorage(),
          hostname: 'storage.bunnycdn.com',
        },
      }

      expect(() => normalizeAndValidate(config)).toThrow('storage `hostname` cannot include "storage.bunnycdn.com"')
    })

    it('throws if storage hostname contains storage.bunnycdn.com anywhere', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        storage: {
          ...createBaseStorage(),
          hostname: 'https://storage.bunnycdn.com/zone',
        },
      }

      expect(() => normalizeAndValidate(config)).toThrow('storage `hostname` cannot include "storage.bunnycdn.com"')
    })

    it('passes with valid CDN hostname', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        storage: {
          ...createBaseStorage(),
          hostname: 'myzone.b-cdn.net',
        },
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })
  })

  describe('storage S3 validation', () => {
    it('throws if s3 is enabled without a region', () => {
      const config = {
        collections: { media: true },
        storage: {
          ...createBaseStorage(),
          s3: { region: '' },
        },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow('storage `s3.region` is required when S3 mode is enabled')
    })

    it('passes with a valid s3 region', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        storage: {
          ...createBaseStorage(),
          s3: { region: 'de' },
        },
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })
  })

  describe('signed URLs validation', () => {
    it('throws if signedUrls enabled without storage.tokenSecurityKey', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        signedUrls: true,
        storage: {
          apiKey: 'storage-key',
          hostname: 'storage.bunny.net',
          zoneName: 'test-zone',
        },
      }

      expect(() => normalizeAndValidate(config)).toThrow(
        'collections [media] enable `signedUrls` but storage `tokenSecurityKey` is not provided',
      )
    })

    it('throws if signedUrls + stream without stream.tokenSecurityKey', () => {
      const config: BunnyStorageConfig = {
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

      expect(() => normalizeAndValidate(config)).toThrow(
        'collections [media] enable `signedUrls` but stream `tokenSecurityKey` is not provided',
      )
    })

    it('passes when signedUrls enabled with all required keys', () => {
      const config: BunnyStorageConfig = {
        collections: {
          media: {
            disablePayloadAccessControl: true,
          },
        },
        signedUrls: true,
        storage: createBaseStorage(),
        stream: createBaseStream(),
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('passes when signedUrls enabled with storage only', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        signedUrls: true,
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('throws if collection-level signedUrls is enabled without storage.tokenSecurityKey', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { signedUrls: true } },
        storage: createBaseStorage({ tokenSecurityKey: undefined }),
      }

      expect(() => normalizeAndValidate(config)).toThrow(
        'collections [media] enable `signedUrls` but storage `tokenSecurityKey` is not provided',
      )
    })

    it('throws if collection-level signedUrls is enabled without stream.tokenSecurityKey', () => {
      const config: BunnyStorageConfig = {
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

      expect(() => normalizeAndValidate(config)).toThrow(
        'collections [media] enable `signedUrls` but stream `tokenSecurityKey` is not provided',
      )
    })

    it('passes when collection-level signedUrls is enabled with tokenSecurityKey present', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { signedUrls: true } },
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })
  })

  describe('access control + stream validation', () => {
    it('throws if access control + stream without mp4Fallback or signed redirect', () => {
      const config = {
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
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        'collections [videos] with `disablePayloadAccessControl: false` require',
      )
    })

    it('passes with mp4Fallback enabled', () => {
      const config = {
        collections: {
          videos: {
            disablePayloadAccessControl: false,
          },
        },
        storage: createBaseStorage(),
        stream: {
          ...createBaseStream(),
          mp4Fallback: true,
        },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('passes with signed URLs and useRedirect enabled', () => {
      const config = {
        collections: {
          videos: {
            disablePayloadAccessControl: false,
          },
        },
        signedUrls: {
          staticHandler: {
            useRedirect: true,
          },
        },
        storage: createBaseStorage(),
        stream: {
          ...createBaseStream(),
          mp4Fallback: false,
        },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('passes when disablePayloadAccessControl is true', () => {
      const config: BunnyStorageConfig = {
        collections: {
          videos: {
            disablePayloadAccessControl: true,
          },
        },
        stream: {
          ...createBaseStream(),
          mp4Fallback: false,
        },
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('throws for multiple collections with issues', () => {
      const config = {
        collections: {
          videos1: { disablePayloadAccessControl: false },
          videos2: { disablePayloadAccessControl: false },
        },
        storage: createBaseStorage(),
        stream: {
          ...createBaseStream(),
          mp4Fallback: false,
        },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        /collections \[videos1, videos2\]|collections \[videos2, videos1\]/,
      )
    })
  })

  describe('per-collection full override validation', () => {
    it('errors when a full storage override is missing zoneName', () => {
      const config = {
        collections: { media: { storage: { apiKey: 'k', hostname: 'media.b-cdn.net' } } },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        'collection "media" provides its own storage config but is missing `zoneName`',
      )
    })

    it('errors when a full stream override is missing hostname and libraryId', () => {
      const config = {
        collections: { media: { disablePayloadAccessControl: true, stream: { apiKey: 'k' } } },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        'collection "media" provides its own stream config but is missing `hostname`',
      )
      expect(() => normalizeAndValidate(config)).toThrow(
        'collection "media" provides its own stream config but is missing `libraryId`',
      )
    })

    it('errors when an own zone lacks tokenSecurityKey under global-inherited signedUrls', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { storage: createOwnStorage('media') } },
        signedUrls: true,
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(config)).toThrow(
        'collections [media] enable `signedUrls` but storage `tokenSecurityKey` is not provided',
      )
    })

    it('errors when an own zone lacks tokenSecurityKey under collection-level signedUrls', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { signedUrls: true, storage: createOwnStorage('media') } },
      }

      expect(() => normalizeAndValidate(config)).toThrow(
        'collections [media] enable `signedUrls` but storage `tokenSecurityKey` is not provided',
      )
    })

    it('passes when the own zone has its own tokenSecurityKey even if the global zone lacks one', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { storage: createOwnStorage('media', { tokenSecurityKey: 'own-token' }) } },
        signedUrls: true,
        storage: createBaseStorage({ tokenSecurityKey: undefined }),
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('errors when an own zone hostname includes storage.bunnycdn.com', () => {
      const config = {
        collections: { media: { storage: createOwnStorage('media', { hostname: 'x.storage.bunnycdn.com' }) } },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        'collection "media" storage `hostname` cannot include "storage.bunnycdn.com"',
      )
    })

    it('errors when an own zone enables s3 without a region', () => {
      const config = {
        collections: { media: { storage: createOwnStorage('media', { s3: { region: '' } }) } },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        'collection "media" storage `s3.region` is required when S3 mode is enabled',
      )
    })

    it('fires the edge-transport error for an own zone with clientUploads but no s3 or edge', () => {
      const config = {
        collections: { media: { storage: createOwnStorage('media', { clientUploads: true }) } },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow('collection "media" uses edge-transport client uploads')
    })
  })

  describe('cross-collection conflicts', () => {
    it('errors when the same library is configured with different apiKeys', () => {
      const config = {
        collections: {
          a: { disablePayloadAccessControl: true, stream: { apiKey: 'key-a', hostname: 'a.b-cdn.net', libraryId: 55 } },
          b: { disablePayloadAccessControl: true, stream: { apiKey: 'key-b', hostname: 'b.b-cdn.net', libraryId: 55 } },
        },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        'stream library 55 is configured with conflicting API keys across collections',
      )
    })

    it('passes when the same library shares an apiKey with different mimeTypes', () => {
      const config = {
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
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('errors when the same library is configured with different webhook secrets', () => {
      const config = {
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
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        'stream library 55 is configured with conflicting webhook secrets across collections',
      )
    })

    it('passes when the same library shares a webhook secret across collections', () => {
      const config = {
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
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('errors when a webhook secret is an empty string', () => {
      const config = {
        collections: {
          a: {
            disablePayloadAccessControl: true,
            stream: { apiKey: 'k', hostname: 'a.b-cdn.net', libraryId: 55, webhook: { secret: '' } },
          },
        },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow('stream `webhook.secret` must be a non-empty string')
    })
  })

  describe('relaxed top-level requirements', () => {
    it('passes an all-full-per-collection config with no global services', () => {
      const config = {
        collections: {
          files: { storage: createOwnStorage('files') },
          videos: { disablePayloadAccessControl: true, stream: createOwnStream(700, { mp4Fallback: true }) },
        },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('errors when a collection has only a partial override and no global service', () => {
      const config = {
        collections: { media: { storage: { uploadTimeout: 5 } } },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow('collections [media] must have at least one service enabled')
    })

    it('passes a global-less collection with its own stream and mp4Fallback', () => {
      const config = {
        collections: { videos: { stream: createOwnStream(800, { mp4Fallback: true }) } },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('does not flag a storage-only collection (stream: false) for mp4Fallback (regression)', () => {
      const config: BunnyStorageConfig = {
        collections: { media: { stream: false } },
        storage: createBaseStorage(),
        stream: { ...createBaseStream(), mp4Fallback: false },
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })
  })

  describe('error message format', () => {
    it('includes documentation link in error message', () => {
      const config = {
        collections: { media: true },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow('https://github.com/maximseshuk/payload-storage-bunny')
    })

    it('combines multiple errors with semicolons', () => {
      const config = {
        collections: { media: true },
        purge: true,
      } as unknown as BunnyStorageConfig

      try {
        normalizeAndValidate(config)
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
      const config: BunnyStorageConfig = {
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

      expect(() => normalizeAndValidate(config)).toThrow(
        'share `clientUploads.edge.scriptUrl` but configure different `secret` values',
      )
    })

    it('does not throw when zones share a scriptUrl and the same secret', () => {
      const config: BunnyStorageConfig = {
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
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })
  })
})
