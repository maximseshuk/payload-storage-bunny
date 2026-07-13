import type { BunnyStorageConfig } from '@/types/config.js'

import { createNormalizedConfig } from '@/utils/config/normalizer.js'
import { validateNormalizedConfig } from '@/utils/config/validator.js'
import { describe, expect, it } from 'vitest'

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

      expect(() => normalizeAndValidate(config)).toThrow(
        'either `storage` or `stream` configuration must be provided',
      )
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

      expect(() => normalizeAndValidate(config)).toThrow(
        'collections [media] must have at least one service enabled',
      )
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

  describe('purge validation', () => {
    it('throws if purge enabled without apiKey', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        purge: true,
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(config)).toThrow(
        '`purge` requires global `apiKey` to be provided',
      )
    })

    it('passes when purge enabled with global apiKey', () => {
      const config: BunnyStorageConfig = {
        apiKey: 'global-api-key',
        collections: { media: true },
        purge: true,
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
    })

    it('passes when purge has its own apiKey', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        purge: { apiKey: 'purge-api-key' },
        storage: createBaseStorage(),
      }

      expect(() => normalizeAndValidate(config)).not.toThrow()
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

      expect(() => normalizeAndValidate(config)).toThrow(
        'storage `hostname` cannot include "storage.bunnycdn.com"',
      )
    })

    it('throws if storage hostname contains storage.bunnycdn.com anywhere', () => {
      const config: BunnyStorageConfig = {
        collections: { media: true },
        storage: {
          ...createBaseStorage(),
          hostname: 'https://storage.bunnycdn.com/zone',
        },
      }

      expect(() => normalizeAndValidate(config)).toThrow(
        'storage `hostname` cannot include "storage.bunnycdn.com"',
      )
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
        'storage `tokenSecurityKey` is required when signed URLs are enabled',
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
        'stream `tokenSecurityKey` is required when signed URLs and stream are both enabled',
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

  describe('error message format', () => {
    it('includes documentation link in error message', () => {
      const config = {
        collections: { media: true },
      } as unknown as BunnyStorageConfig

      expect(() => normalizeAndValidate(config)).toThrow(
        'https://github.com/maximseshuk/payload-storage-bunny',
      )
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
        expect(message).toContain('either `storage` or `stream`')
        expect(message).toContain('`purge` requires global `apiKey`')
      }
    })
  })
})
