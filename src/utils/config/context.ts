import type { NormalizedBunnyStorageConfig, NormalizedCollectionConfig, NormalizedStreamConfig } from '@/types/configNormalized.js'
import type { BunnyStorageConfig, CollectionContext } from '@/types/index.js'
import type { CollectionConfig } from 'payload'

import { intersectMimeTypes } from '../file.js'
import { createNormalizedConfig } from './normalizer.js'

const configCache = new WeakMap<BunnyStorageConfig, NormalizedBunnyStorageConfig>()

export const getNormalizedConfig = (
  config: BunnyStorageConfig,
): NormalizedBunnyStorageConfig => {
  const cached = configCache.get(config)
  if (cached) {
    return cached
  }

  const normalized = createNormalizedConfig(config)
  configCache.set(normalized._original, normalized)

  return normalized
}

export const createCollectionContext = (
  config: NormalizedBunnyStorageConfig,
  collection: CollectionConfig,
  prefixOverride?: string,
): CollectionContext => {
  const collectionConfig = config.collections.get(collection.slug)

  if (!collectionConfig) {
    return createDefaultContext(config, collection, prefixOverride)
  }

  const streamConfig = prepareStreamConfig(config, collection, collectionConfig)

  return {
    adminThumbnail: collectionConfig.adminThumbnail || undefined,
    collection,
    isTusUploadSupported: !!streamConfig?.tus && !!collection.upload,
    prefix: prefixOverride ?? collectionConfig.prefix,
    purgeConfig: config.purge,
    signedUrls: collectionConfig.signedUrls || undefined,
    storageConfig: config.storage || undefined,
    streamConfig: prepareStreamConfig(config, collection, collectionConfig),
    urlTransform: collectionConfig.urlTransform || undefined,
    usePayloadAccessControl: !collectionConfig.disablePayloadAccessControl,
  }
}

const createDefaultContext = (
  config: NormalizedBunnyStorageConfig,
  collection: CollectionConfig,
  prefixOverride?: string,
): CollectionContext => {
  return {
    adminThumbnail: config.adminThumbnail || undefined,
    collection,
    isTusUploadSupported: !!config.stream?.tus && !!collection.upload,
    prefix: prefixOverride ?? '',
    purgeConfig: config.purge,
    signedUrls: config.signedUrls || undefined,
    storageConfig: config.storage || undefined,
    streamConfig: config.stream,
    urlTransform: config.urlTransform || undefined,
    usePayloadAccessControl: true,
  }
}

const prepareStreamConfig = (
  config: NormalizedBunnyStorageConfig,
  collection: CollectionConfig,
  collectionConfig: NormalizedCollectionConfig,
): NormalizedStreamConfig | undefined => {
  if (!config.stream) {
    return undefined
  }

  const streamConfig = { ...config.stream }

  if (collectionConfig.stream?.thumbnailTime !== undefined) {
    streamConfig.thumbnailTime = collectionConfig.stream.thumbnailTime
  }

  if (streamConfig.tus && typeof collection.upload === 'object' && collection.upload.mimeTypes) {
    const filtered = intersectMimeTypes(
      collection.upload.mimeTypes,
      streamConfig.tus.mimeTypes,
    )

    if (filtered?.length) {
      streamConfig.tus = {
        ...streamConfig.tus,
        mimeTypes: filtered,
      }
    } else {
      streamConfig.tus = undefined
    }
  }

  return streamConfig
}
