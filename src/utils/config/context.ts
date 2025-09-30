import type { NormalizedBunnyStorageConfig, NormalizedStreamConfig } from '@/types/configNormalized.js'
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

  const streamConfig = applyStreamConfig(collectionConfig.stream, collection)

  return {
    apiKey: config.apiKey,
    collection,
    isTusUploadSupported: !!streamConfig?.tus && !!collection.upload,
    prefix: prefixOverride ?? collectionConfig.prefix,
    purgeConfig: collectionConfig.purge,
    signedUrls: collectionConfig.signedUrls,
    storageConfig: collectionConfig.storage,
    streamConfig,
    thumbnail: collectionConfig.thumbnail,
    urlTransform: collectionConfig.urlTransform,
    usePayloadAccessControl: !collectionConfig.disablePayloadAccessControl,
  }
}

const createDefaultContext = (
  config: NormalizedBunnyStorageConfig,
  collection: CollectionConfig,
  prefixOverride?: string,
): CollectionContext => {
  const streamConfig = applyStreamConfig(config.stream, collection)

  return {
    apiKey: config.apiKey,
    collection,
    isTusUploadSupported: !!streamConfig?.tus && !!collection.upload,
    prefix: prefixOverride ?? '',
    purgeConfig: config.purge,
    signedUrls: config.signedUrls,
    storageConfig: config.storage,
    streamConfig,
    thumbnail: config.thumbnail,
    urlTransform: config.urlTransform,
    usePayloadAccessControl: true,
  }
}

const applyStreamConfig = (
  streamConfig: NormalizedStreamConfig | undefined,
  collection: CollectionConfig,
): NormalizedStreamConfig | undefined => {
  if (!streamConfig?.tus || typeof collection.upload !== 'object' || !collection.upload.mimeTypes) {
    return streamConfig
  }

  const filtered = intersectMimeTypes(
    collection.upload.mimeTypes,
    streamConfig.tus.mimeTypes,
  )

  if (filtered?.length) {
    return {
      ...streamConfig,
      tus: {
        ...streamConfig.tus,
        mimeTypes: filtered,
      },
    }
  }

  return {
    ...streamConfig,
    tus: undefined,
  }
}
