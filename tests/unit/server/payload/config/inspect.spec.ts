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
import type { BunnyStorageConfig } from '@/shared/types/config.js'

import {
  createBaseStorage,
  createBaseStream,
  createOwnStorage,
  createOwnStream,
} from '../../../../helpers/unit/configBuilders.js'

describe('config inspect helpers', () => {
  describe('collectStreamConfigs', () => {
    it('keys by libraryId, global first, first config wins', () => {
      const config: BunnyStorageConfig = {
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
    it('dedups by zoneName across global and collections', () => {
      const config: BunnyStorageConfig = {
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
      } as BunnyStorageConfig

      expect(hasAnyStorage(createNormalizedConfig(config))).toBe(false)
    })
  })

  describe('tus / cleanup / webhook flags', () => {
    it('detects tus, cleanup and webhook secrets across global and per-collection sources', () => {
      const config: BunnyStorageConfig = {
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

    it('keys webhook secrets by libraryId, first configured secret wins per library', () => {
      const config: BunnyStorageConfig = {
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

    it('reports no tus/cleanup when none configured', () => {
      const config: BunnyStorageConfig = {
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
