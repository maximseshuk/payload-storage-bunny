import type { CollectionConfig } from 'payload'

import { intersectMimeTypes } from '@/shared/mimeTypes.js'
import type { NormalizedBunnyStorageConfig, NormalizedStreamConfig } from '@/shared/types/configNormalized.js'
import type { CollectionContext } from '@/shared/types/index.js'

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
    accountApiKey: config.accountApiKey,
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
    accountApiKey: config.accountApiKey,
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

  const filtered = intersectMimeTypes(collection.upload.mimeTypes, streamConfig.mimeTypes)

  if (filtered?.length) {
    return {
      ...streamConfig,
      mimeTypes: filtered,
    }
  }

  return {
    ...streamConfig,
    tus: undefined,
  }
}
