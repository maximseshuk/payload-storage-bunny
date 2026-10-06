import { describe, expect, it } from 'vitest'

import {
  collectStorageConfigs,
  collectStreamConfigs,
  collectWebhookSecrets,
  hasAnyStorage,
  hasAnyStreamCleanup,
  hasAnyStreamTus,
} from '@/server/payload/config/inspect.js'
import { createNormalizedConfig } from '@/server/payload/config/normalizer.js'
import type { BunnyStorageOptions } from '@/shared/types/config.js'

import {
  createBaseStorage,
  createBaseStream,
  createOwnStorage,
  createOwnStream,
} from '../../../../helpers/unit/configBuilders.js'

describe('config inspect helpers', () => {
  describe('collectStreamConfigs', () => {
    it('keys configs by libraryId and keeps the first one, global first', () => {
      const config: BunnyStorageOptions = {
        collections: {
          a: { stream: createOwnStream(200, { mp4Fallback: true }) },
          b: { stream: createOwnStream(200, { mp4Fallback: false }) },
          c: { stream: createOwnStream(300) },
          global: true,
        },
        storage: createBaseStorage(),
        stream: createBaseStream(),
      }

      const map = collectStreamConfigs(createNormalizedConfig(config))
      expect([...map.keys()]).toEqual([12345, 200, 300])
      expect(map.get(200)?.apiKey).toBe('own-stream-key-200')
      expect(map.get(200)?.mp4Fallback).toBe(true)
    })
  })

  describe('collectStorageConfigs', () => {
    it('removes duplicate zones by zoneName across global and collection configs', () => {
      const config: BunnyStorageOptions = {
        collections: {
          own: { storage: createOwnStorage('own') },
          shared: true,
        },
        storage: createBaseStorage(),
      }

      const zones = collectStorageConfigs(createNormalizedConfig(config)).map((s) => s.zoneName)
      expect(zones).toEqual(['test-zone', 'own-zone-own'])
      expect(hasAnyStorage(createNormalizedConfig(config))).toBe(true)
    })

    it('reports no storage when nothing configures it', () => {
      const config = {
        collections: { videos: { stream: createOwnStream(9) } },
      } as BunnyStorageOptions

      expect(hasAnyStorage(createNormalizedConfig(config))).toBe(false)
    })
  })

  describe('TUS, cleanup and webhook flags', () => {
    it('detects TUS, cleanup and webhook secrets across global and per-collection sources', () => {
      const config: BunnyStorageOptions = {
        collections: {
          global: true,
          own: {
            stream: createOwnStream(42, { cleanup: true, tus: true, webhook: { secret: 'own-hook' } }),
          },
        },
        storage: createBaseStorage(),
        stream: { ...createBaseStream(), webhook: { secret: 'global-hook' } },
      }

      const normalized = createNormalizedConfig(config)
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
      const config: BunnyStorageOptions = {
        collections: {
          global: true,
          own: {
            stream: createOwnStream(12345, { webhook: { secret: 'collection-hook' } }),
          },
        },
        storage: createBaseStorage(),
        stream: { ...createBaseStream(), webhook: { secret: 'global-hook' } },
      }

      const map = collectWebhookSecrets(createNormalizedConfig(config))
      expect(map.get(12345)).toBe('global-hook')
      expect(map.size).toBe(1)
    })

    it('detects TUS that a collection turns on over a global stream without TUS', () => {
      const config: BunnyStorageOptions = {
        collections: { media: true, videos: { stream: { tus: true } } },
        storage: createBaseStorage(),
        stream: createBaseStream(),
      }

      expect(hasAnyStreamTus(createNormalizedConfig(config))).toBe(true)
    })

    it('reports no TUS or cleanup when none is configured', () => {
      const config: BunnyStorageOptions = {
        collections: { media: true },
        storage: createBaseStorage(),
        stream: createBaseStream(),
      }

      const normalized = createNormalizedConfig(config)
      expect(hasAnyStreamTus(normalized)).toBe(false)
      expect(hasAnyStreamCleanup(normalized)).toBe(false)
      expect(collectWebhookSecrets(normalized).size).toBe(0)
    })
  })
})
