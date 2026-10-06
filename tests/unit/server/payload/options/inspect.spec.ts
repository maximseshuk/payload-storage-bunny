import { describe, expect, it } from 'vitest'

import {
  collectStorageOptions,
  collectStreamOptions,
  collectWebhookSecrets,
  hasAnyStorage,
  hasAnyStreamCleanup,
  hasAnyStreamTus,
} from '@/server/payload/options/inspect.js'
import { createNormalizedOptions } from '@/server/payload/options/normalizer.js'
import type { BunnyStorageOptions } from '@/shared/types/options.js'

import {
  createBaseStorage,
  createBaseStream,
  createOwnStorage,
  createOwnStream,
} from '../../../../helpers/unit/optionsBuilders.js'

describe('options inspect helpers', () => {
  describe('collectStreamOptions', () => {
    it('keys options by libraryId and keeps the first one, global first', () => {
      const options: BunnyStorageOptions = {
        collections: {
          a: { stream: createOwnStream(200, { mp4Fallback: true }) },
          b: { stream: createOwnStream(200, { mp4Fallback: false }) },
          c: { stream: createOwnStream(300) },
          global: true,
        },
        storage: createBaseStorage(),
        stream: createBaseStream(),
      }

      const map = collectStreamOptions(createNormalizedOptions(options))
      expect([...map.keys()]).toEqual([12345, 200, 300])
      expect(map.get(200)?.apiKey).toBe('own-stream-key-200')
      expect(map.get(200)?.mp4Fallback).toBe(true)
    })
  })

  describe('collectStorageOptions', () => {
    it('removes duplicate zones by zoneName across global and collection options', () => {
      const options: BunnyStorageOptions = {
        collections: {
          own: { storage: createOwnStorage('own') },
          shared: true,
        },
        storage: createBaseStorage(),
      }

      const zones = collectStorageOptions(createNormalizedOptions(options)).map((s) => s.zoneName)
      expect(zones).toEqual(['test-zone', 'own-zone-own'])
      expect(hasAnyStorage(createNormalizedOptions(options))).toBe(true)
    })

    it('reports no storage when nothing configures it', () => {
      const options = {
        collections: { videos: { stream: createOwnStream(9) } },
      } as BunnyStorageOptions

      expect(hasAnyStorage(createNormalizedOptions(options))).toBe(false)
    })
  })

  describe('TUS, cleanup and webhook flags', () => {
    it('detects TUS, cleanup and webhook secrets across global and per-collection sources', () => {
      const options: BunnyStorageOptions = {
        collections: {
          global: true,
          own: {
            stream: createOwnStream(42, { cleanup: true, tus: true, webhook: { secret: 'own-hook' } }),
          },
        },
        storage: createBaseStorage(),
        stream: { ...createBaseStream(), webhook: { secret: 'global-hook' } },
      }

      const normalized = createNormalizedOptions(options)
      expect(hasAnyStreamTus(normalized)).toBe(true)
      expect(hasAnyStreamCleanup(normalized)).toBe(true)
      expect(collectWebhookSecrets(normalized)).toEqual(
        new Map([
          [12345, 'global-hook'],
          [42, 'own-hook'],
        ]),
      )
    })

    it('keys webhook secrets by libraryId and keeps the first secret of each library', () => {
      const options: BunnyStorageOptions = {
        collections: {
          global: true,
          own: {
            stream: createOwnStream(12345, { webhook: { secret: 'collection-hook' } }),
          },
        },
        storage: createBaseStorage(),
        stream: { ...createBaseStream(), webhook: { secret: 'global-hook' } },
      }

      const map = collectWebhookSecrets(createNormalizedOptions(options))
      expect(map.get(12345)).toBe('global-hook')
      expect(map.size).toBe(1)
    })

    it('detects TUS that a collection turns on over a global stream without TUS', () => {
      const options: BunnyStorageOptions = {
        collections: { media: true, videos: { stream: { tus: true } } },
        storage: createBaseStorage(),
        stream: createBaseStream(),
      }

      expect(hasAnyStreamTus(createNormalizedOptions(options))).toBe(true)
    })

    it('reports no TUS or cleanup when none is configured', () => {
      const options: BunnyStorageOptions = {
        collections: { media: true },
        storage: createBaseStorage(),
        stream: createBaseStream(),
      }

      const normalized = createNormalizedOptions(options)
      expect(hasAnyStreamTus(normalized)).toBe(false)
      expect(hasAnyStreamCleanup(normalized)).toBe(false)
      expect(collectWebhookSecrets(normalized).size).toBe(0)
    })
  })
})
