import type {
  NormalizedBunnyStorageConfig,
  NormalizedCollectionConfig,
  NormalizedSignedUrlsConfig,
  NormalizedStorageConfig,
  NormalizedStreamConfig,
} from '@/shared/types/configNormalized.js'

import type { TelemetryFeatures } from './types.js'

const collections = (config: NormalizedBunnyStorageConfig): NormalizedCollectionConfig[] => [
  ...config.collections.values(),
]

const allStorages = (config: NormalizedBunnyStorageConfig): NormalizedStorageConfig[] => {
  const list: NormalizedStorageConfig[] = []
  if (config.storage) {
    list.push(config.storage)
  }
  for (const collection of config.collections.values()) {
    if (collection.storage) {
      list.push(collection.storage)
    }
  }
  return list
}

const allStreams = (config: NormalizedBunnyStorageConfig): NormalizedStreamConfig[] => {
  const list: NormalizedStreamConfig[] = []
  if (config.stream) {
    list.push(config.stream)
  }
  for (const collection of config.collections.values()) {
    if (collection.stream) {
      list.push(collection.stream)
    }
  }
  return list
}

const allSignedUrls = (config: NormalizedBunnyStorageConfig): NormalizedSignedUrlsConfig[] => {
  const list: NormalizedSignedUrlsConfig[] = []
  if (config.signedUrls) {
    list.push(config.signedUrls)
  }
  for (const collection of config.collections.values()) {
    if (collection.signedUrls) {
      list.push(collection.signedUrls)
    }
  }
  return list
}

const originalCollections = (config: NormalizedBunnyStorageConfig): Record<string, unknown> =>
  config._original.collections as Record<string, unknown>

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const definesOwnZone = (collection: Record<string, unknown>): boolean => {
  const ownStorage = isObject(collection.storage) && 'apiKey' in collection.storage
  const ownStream = isObject(collection.stream) && 'apiKey' in collection.stream
  return ownStorage || ownStream
}

export const buildFeatures = (config: NormalizedBunnyStorageConfig): TelemetryFeatures => {
  const storages = allStorages(config)
  const streams = allStreams(config)
  const signedUrls = allSignedUrls(config)
  const originals = Object.values(originalCollections(config))

  return {
    accountApiKey: Boolean(config.accountApiKey),
    cdnPurge: Boolean(config.purge) || collections(config).some((c) => Boolean(c.purge)),
    collectionOverrides: originals.some((value) => isObject(value)),
    collectionZones: originals.some((value) => isObject(value) && definesOwnZone(value)),
    signedUrls: signedUrls.length > 0,
    signedUrlsCountryLock: signedUrls.some(
      (s) => Boolean(s.allowedCountries?.length) || Boolean(s.blockedCountries?.length),
    ),
    storage: storages.length > 0,
    storageClientUploads: storages.some((s) => Boolean(s.clientUploads)),
    storageClientUploadsEdge: storages.some((s) => Boolean(s.clientUploads?.edge)),
    storageS3: storages.some((s) => Boolean(s.s3)),
    stream: streams.length > 0,
    streamCleanup: streams.some((s) => Boolean(s.cleanup)),
    streamTus: streams.some((s) => Boolean(s.tus)),
    streamTusAutoMode: streams.some((s) => s.tus?.autoMode === true),
    streamWebhook: streams.some((s) => Boolean(s.webhook)),
    thumbnail: Boolean(config.thumbnail) || collections(config).some((c) => Boolean(c.thumbnail)),
    urlTransform: Boolean(config.urlTransform) || collections(config).some((c) => Boolean(c.urlTransform)),
  }
}
