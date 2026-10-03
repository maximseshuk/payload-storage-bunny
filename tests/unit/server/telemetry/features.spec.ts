import { describe, expect, it } from 'vitest'

import { createNormalizedConfig } from '@/server/payload/config/normalizer.js'
import { buildFeatures } from '@/server/telemetry/features.js'
import type { BunnyStorageConfig } from '@/shared/types/config.js'

import { createBaseStorage, createBaseStream, createOwnStorage } from '../../../helpers/unit/configBuilders.js'

const features = (config: BunnyStorageConfig) => buildFeatures(createNormalizedConfig(config))

describe('buildFeatures', () => {
  it('sets only storage for an HTTP API storage-only config', () => {
    const result = features({ collections: { media: true }, storage: createBaseStorage() })

    expect(result).toMatchObject({
      storage: true,
      storageClientUploads: false,
      storageClientUploadsEdge: false,
      storageS3: false,
      stream: false,
    })
  })

  it('sets storageS3 and storageClientUploads, not edge, for S3 with client uploads', () => {
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

  it('sets storageClientUploadsEdge for HTTP client uploads through the Edge Script', () => {
    const result = features({
      collections: { media: true },
      storage: createBaseStorage({
        clientUploads: { edge: { scriptUrl: 'https://up.b-cdn.net', secret: 'sh' } },
      }),
    })

    expect(result.storageClientUploads).toBe(true)
    expect(result.storageClientUploadsEdge).toBe(true)
  })

  it('sets the stream flags for TUS, webhook and cleanup', () => {
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

  it('keeps streamTus on and streamTusAutoMode off for tus.autoMode: false', () => {
    const result = features({
      collections: { videos: true },
      stream: { ...createBaseStream(), tus: { autoMode: false } },
    })

    expect(result.streamTus).toBe(true)
    expect(result.streamTusAutoMode).toBe(false)
  })

  it('sets signedUrlsCountryLock only when signedUrls has a country list', () => {
    const withCountries = features({
      collections: { media: true },
      signedUrls: { allowedCountries: ['US'] },
      storage: createBaseStorage(),
    })
    const withoutCountries = features({ collections: { media: true }, signedUrls: true, storage: createBaseStorage() })

    expect(withCountries).toMatchObject({ signedUrls: true, signedUrlsCountryLock: true })
    expect(withoutCountries).toMatchObject({ signedUrls: true, signedUrlsCountryLock: false })
  })

  it('sets cdnPurge only with both purge and an accountApiKey', () => {
    expect(
      features({ accountApiKey: 'k', collections: { media: true }, purge: true, storage: createBaseStorage() })
        .cdnPurge,
    ).toBe(true)
    expect(features({ collections: { media: true }, purge: true, storage: createBaseStorage() }).cdnPurge).toBe(false)
  })

  it('sets collectionOverrides for an object collection config but not for `true`', () => {
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

  it('sets accountApiKey when an account-level key exists', () => {
    expect(
      features({ accountApiKey: 'k', collections: { media: true }, storage: createBaseStorage() }).accountApiKey,
    ).toBe(true)
    expect(features({ collections: { media: true }, storage: createBaseStorage() }).accountApiKey).toBe(false)
  })
})
