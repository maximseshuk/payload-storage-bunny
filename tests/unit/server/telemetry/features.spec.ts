import { describe, expect, it } from 'vitest'

import { createNormalizedConfig } from '@/server/payload/config/normalizer.js'
import { buildFeatures } from '@/server/telemetry/features.js'
import type { BunnyStorageConfig } from '@/shared/types/config.js'

import { createBaseStorage, createBaseStream, createOwnStorage } from '../../../helpers/unit/configBuilders.js'

const features = (config: BunnyStorageConfig) => buildFeatures(createNormalizedConfig(config))

describe('buildFeatures', () => {
  it('storage-only (HTTP API) sets storage, leaves S3/stream/clientUploads off', () => {
    const result = features({ collections: { media: true }, storage: createBaseStorage() })

    expect(result).toMatchObject({
      storage: true,
      storageClientUploads: false,
      storageClientUploadsEdge: false,
      storageS3: false,
      stream: false,
    })
  })

  it('S3 backend with client uploads sets storageS3 + storageClientUploads (no edge)', () => {
    const result = features({
      collections: { media: true },
      storage: createBaseStorage({ clientUploads: true, s3: { region: 'de' } }),
    })

    expect(result).toMatchObject({
      storageClientUploads: true,
      storageClientUploadsEdge: false,
      storageS3: true,
    })
  })

  it('HTTP client uploads via edge script sets storageClientUploadsEdge', () => {
    const result = features({
      collections: { media: true },
      storage: createBaseStorage({
        clientUploads: { edge: { scriptUrl: 'https://up.b-cdn.net', secret: 'sh' } },
      }),
    })

    expect(result.storageClientUploads).toBe(true)
    expect(result.storageClientUploadsEdge).toBe(true)
  })

  it('stream with tus + webhook + cleanup sets the stream flags', () => {
    const result = features({
      collections: { videos: true },
      stream: { ...createBaseStream(), cleanup: true, tus: true, webhook: { secret: 'wh' } },
    })

    expect(result).toMatchObject({
      stream: true,
      streamCleanup: true,
      streamTus: true,
      streamTusAutoMode: true,
      streamWebhook: true,
    })
  })

  it('tus.autoMode:false keeps streamTus on but streamTusAutoMode off', () => {
    const result = features({
      collections: { videos: true },
      stream: { ...createBaseStream(), tus: { autoMode: false } },
    })

    expect(result.streamTus).toBe(true)
    expect(result.streamTusAutoMode).toBe(false)
  })

  it('signedUrls sets signedUrlsCountryLock only with a country list', () => {
    const withCountries = features({
      collections: { media: true },
      signedUrls: { allowedCountries: ['US'] },
      storage: createBaseStorage(),
    })
    const withoutCountries = features({ collections: { media: true }, signedUrls: true, storage: createBaseStorage() })

    expect(withCountries).toMatchObject({ signedUrls: true, signedUrlsCountryLock: true })
    expect(withoutCountries).toMatchObject({ signedUrls: true, signedUrlsCountryLock: false })
  })

  it('cdnPurge requires both purge and an accountApiKey', () => {
    expect(
      features({ accountApiKey: 'k', collections: { media: true }, purge: true, storage: createBaseStorage() })
        .cdnPurge,
    ).toBe(true)
    expect(features({ collections: { media: true }, purge: true, storage: createBaseStorage() }).cdnPurge).toBe(false)
  })

  it('an object collection config sets collectionOverrides; `true` alone does not', () => {
    expect(features({ collections: { media: true }, storage: createBaseStorage() }).collectionOverrides).toBe(false)
    expect(
      features({ collections: { media: { thumbnail: true } }, storage: createBaseStorage() }).collectionOverrides,
    ).toBe(true)
  })

  it('sets collectionZones for a full own zone but not for a partial override', () => {
    const ownZone = features({
      collections: { media: true, other: { storage: createOwnStorage() } },
      storage: createBaseStorage(),
    })
    const partial = features({
      collections: { media: { storage: { uploadTimeout: 5000 } } },
      storage: createBaseStorage(),
    })

    expect(ownZone.collectionZones).toBe(true)
    expect(partial).toMatchObject({ collectionOverrides: true, collectionZones: false })
  })

  it('accountApiKey reflects an account-level key', () => {
    expect(
      features({ accountApiKey: 'k', collections: { media: true }, storage: createBaseStorage() }).accountApiKey,
    ).toBe(true)
    expect(features({ collections: { media: true }, storage: createBaseStorage() }).accountApiKey).toBe(false)
  })
})
