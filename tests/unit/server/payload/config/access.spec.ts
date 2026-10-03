import type { Payload } from 'payload'
import { describe, expect, it } from 'vitest'

import {
  getBunnyCollectionConfig,
  getBunnyConfig,
  getBunnyStorageForCollection,
  getBunnyStreamForCollection,
} from '@/server/payload/config/access.js'
import { createNormalizedConfig } from '@/server/payload/config/normalizer.js'
import type { BunnyStorageConfig } from '@/shared/types/config.js'

import {
  createBaseStorage as sharedCreateBaseStorage,
  createBaseStream,
  createOwnStorage,
  createOwnStream,
} from '../../../../helpers/unit/configBuilders.js'

const createBaseStorage = (overrides: Record<string, unknown> = {}) =>
  sharedCreateBaseStorage({ uploadTimeout: 60000, ...overrides })

const fakePayload = (custom?: Record<string, unknown>): Payload => ({ config: { custom } }) as unknown as Payload

const payloadFor = (userConfig: BunnyStorageConfig): Payload =>
  fakePayload({ '@seshuk/payload-storage-bunny': { config: createNormalizedConfig(userConfig) } })

describe('config accessors', () => {
  it('returns exactly the curated global storage and stream view for a `true` shorthand collection', () => {
    const payload = payloadFor({
      collections: { media: true },
      storage: createBaseStorage(),
      stream: createBaseStream(),
    })

    expect(getBunnyCollectionConfig(payload, 'media')).toEqual({
      storage: {
        apiKey: 'storage-key',
        hostname: 'storage.bunny.net',
        tokenSecurityKey: 'token-key',
        zoneName: 'test-zone',
      },
      stream: {
        apiKey: 'stream-key',
        hostname: 'stream.bunny.net',
        libraryId: 12345,
        tokenSecurityKey: 'stream-token',
      },
    })
    expect(getBunnyStorageForCollection(payload, 'media')?.zoneName).toBe('test-zone')
    expect(getBunnyStreamForCollection(payload, 'media')?.libraryId).toBe(12345)
  })

  it('returns the values of its own zone and library, not the global ones', () => {
    const payload = payloadFor({
      collections: {
        own: {
          disablePayloadAccessControl: true,
          storage: createOwnStorage('own'),
          stream: createOwnStream(777),
        },
        sibling: { disablePayloadAccessControl: true },
      },
      storage: createBaseStorage(),
      stream: createBaseStream(),
    })

    expect(getBunnyStorageForCollection(payload, 'own')?.zoneName).toBe('own-zone-own')
    expect(getBunnyStreamForCollection(payload, 'own')?.libraryId).toBe(777)
    expect(getBunnyStorageForCollection(payload, 'sibling')?.zoneName).toBe('test-zone')
    expect(getBunnyStreamForCollection(payload, 'sibling')?.libraryId).toBe(12345)
  })

  it('omits stream for a storage-only collection', () => {
    const payload = payloadFor({
      collections: { media: { stream: false } },
      storage: createBaseStorage(),
      stream: createBaseStream(),
    })

    const collection = getBunnyCollectionConfig(payload, 'media')
    expect(collection?.storage).toBeDefined()
    expect(collection?.stream).toBeUndefined()
    expect(getBunnyStreamForCollection(payload, 'media')).toBeUndefined()
  })

  it('omits storage for a stream-only collection', () => {
    const payload = payloadFor({
      collections: { media: { storage: false } },
      storage: createBaseStorage(),
      stream: createBaseStream(),
    })

    const collection = getBunnyCollectionConfig(payload, 'media')
    expect(collection?.stream).toBeDefined()
    expect(collection?.storage).toBeUndefined()
    expect(getBunnyStorageForCollection(payload, 'media')).toBeUndefined()
  })

  it('passes through s3 and region on the curated storage view', () => {
    const payload = payloadFor({
      collections: { media: true },
      storage: createBaseStorage({ region: 'de', s3: { region: 'de' } }),
    })

    const storage = getBunnyStorageForCollection(payload, 'media')
    expect(storage?.region).toBe('de')
    expect(storage?.s3).toEqual({ region: 'de' })

    const native = payloadFor({ collections: { media: true }, storage: createBaseStorage() })
    const nativeStorage = getBunnyStorageForCollection(native, 'media')
    expect(nativeStorage?.s3).toBeUndefined()
  })

  it('returns fresh copies that do not mutate the stash', () => {
    const payload = payloadFor({
      collections: { media: true },
      storage: createBaseStorage(),
    })

    const storage = getBunnyStorageForCollection(payload, 'media')!
    storage.zoneName = 'mutated'

    expect(getBunnyConfig(payload)!.collections.get('media')!.storage!.zoneName).toBe('test-zone')
    expect(getBunnyStorageForCollection(payload, 'media')?.zoneName).toBe('test-zone')
  })

  it('returns undefined for an unmanaged slug', () => {
    const payload = payloadFor({
      collections: { media: true },
      storage: createBaseStorage(),
    })

    expect(getBunnyCollectionConfig(payload, 'nope')).toBeUndefined()
    expect(getBunnyStorageForCollection(payload, 'nope')).toBeUndefined()
    expect(getBunnyStreamForCollection(payload, 'nope')).toBeUndefined()
  })

  it('returns undefined when the plugin stash is absent, without throwing', () => {
    expect(getBunnyConfig(fakePayload())).toBeUndefined()
    expect(getBunnyConfig(fakePayload({}))).toBeUndefined()
    expect(getBunnyConfig(fakePayload({ '@seshuk/payload-storage-bunny': {} }))).toBeUndefined()

    const empty = fakePayload()
    expect(getBunnyCollectionConfig(empty, 'media')).toBeUndefined()
    expect(getBunnyStorageForCollection(empty, 'media')).toBeUndefined()
    expect(getBunnyStreamForCollection(empty, 'media')).toBeUndefined()
  })
})
