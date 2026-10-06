import type {
  NormalizedBunnyStorageOptions,
  NormalizedCollectionOptions,
  NormalizedSignedUrlsOptions,
  NormalizedStorageOptions,
  NormalizedStreamOptions,
} from '@/shared/types/optionsNormalized.js'

export type TelemetryFeatures = {
  accountApiKey: boolean
  cdnPurge: boolean
  collectionOverrides: boolean
  collectionZones: boolean
  signedUrls: boolean
  signedUrlsCountryLock: boolean
  storage: boolean
  storageClientUploads: boolean
  storageClientUploadsEdge: boolean
  storageS3: boolean
  stream: boolean
  streamCleanup: boolean
  streamTus: boolean
  streamTusAutoMode: boolean
  streamWebhook: boolean
  thumbnail: boolean
  urlTransform: boolean
}

const collections = (options: NormalizedBunnyStorageOptions): NormalizedCollectionOptions[] => [
  ...options.collections.values(),
]

const allStorages = (options: NormalizedBunnyStorageOptions): NormalizedStorageOptions[] => {
  const list: NormalizedStorageOptions[] = []
  if (options.storage) {
    list.push(options.storage)
  }
  for (const collection of options.collections.values()) {
    if (collection.storage) {
      list.push(collection.storage)
    }
  }
  return list
}

const allStreams = (options: NormalizedBunnyStorageOptions): NormalizedStreamOptions[] => {
  const list: NormalizedStreamOptions[] = []
  if (options.stream) {
    list.push(options.stream)
  }
  for (const collection of options.collections.values()) {
    if (collection.stream) {
      list.push(collection.stream)
    }
  }
  return list
}

const allSignedUrls = (options: NormalizedBunnyStorageOptions): NormalizedSignedUrlsOptions[] => {
  const list: NormalizedSignedUrlsOptions[] = []
  if (options.signedUrls) {
    list.push(options.signedUrls)
  }
  for (const collection of options.collections.values()) {
    if (collection.signedUrls) {
      list.push(collection.signedUrls)
    }
  }
  return list
}

const originalCollections = (options: NormalizedBunnyStorageOptions): Record<string, unknown> =>
  options._original.collections as Record<string, unknown>

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null

const definesOwnZone = (collection: Record<string, unknown>): boolean => {
  const ownStorage = isObject(collection.storage) && 'apiKey' in collection.storage
  const ownStream = isObject(collection.stream) && 'apiKey' in collection.stream
  return ownStorage || ownStream
}

export const buildFeatures = (options: NormalizedBunnyStorageOptions): TelemetryFeatures => {
  const storages = allStorages(options)
  const streams = allStreams(options)
  const signedUrls = allSignedUrls(options)
  const originals = Object.values(originalCollections(options))

  return {
    accountApiKey: Boolean(options.accountApiKey),
    cdnPurge: Boolean(options.purge) || collections(options).some((c) => Boolean(c.purge)),
    collectionOverrides: originals.some((value) => isObject(value)),
    collectionZones: originals.some((value) => isObject(value) && definesOwnZone(value)),
    signedUrls: signedUrls.length > 0,
    signedUrlsCountryLock: signedUrls.some(
      (s) => Boolean(s.allowedCountries?.length) || Boolean(s.blockedCountries?.length),
    ),
    storage: storages.length > 0,
    storageClientUploads: storages.some((s) => Boolean(s.clientUploads)),
    storageClientUploadsEdge: storages.some((s) => Boolean(s.clientUploads?.edge)),
    storageS3: storages.some((s) => s.s3),
    stream: streams.length > 0,
    streamCleanup: streams.some((s) => Boolean(s.cleanup)),
    streamTus: streams.some((s) => Boolean(s.tus)),
    streamTusAutoMode: streams.some((s) => s.tus?.autoMode === true),
    streamWebhook: streams.some((s) => Boolean(s.webhook)),
    thumbnail: Boolean(options.thumbnail) || collections(options).some((c) => Boolean(c.thumbnail)),
    urlTransform: Boolean(options.urlTransform) || collections(options).some((c) => Boolean(c.urlTransform)),
  }
}
