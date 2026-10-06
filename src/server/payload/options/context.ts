import type { CollectionConfig } from 'payload'

import { intersectMimeTypes } from '@/shared/mimeTypes.js'
import type { CollectionContext } from '@/shared/types/index.js'
import type { NormalizedBunnyStorageOptions, NormalizedStreamOptions } from '@/shared/types/optionsNormalized.js'

export const createCollectionContext = (
  options: NormalizedBunnyStorageOptions,
  collection: CollectionConfig,
  prefixOverride?: string,
): CollectionContext => {
  const collectionOptions = options.collections.get(collection.slug)

  if (!collectionOptions) {
    return createDefaultContext(options, collection, prefixOverride)
  }

  const streamOptions = applyStreamOptions(collectionOptions.stream, collection)

  return {
    accountApiKey: options.accountApiKey,
    collection,
    hasGenerateFileURL: collectionOptions.hasGenerateFileURL,
    isTusUploadSupported: !!streamOptions?.tus && !!collection.upload,
    prefix: prefixOverride ?? collectionOptions.prefix,
    purgeOptions: collectionOptions.purge,
    signedUrls: collectionOptions.signedUrls,
    storageOptions: collectionOptions.storage,
    streamOptions,
    thumbnail: collectionOptions.thumbnail,
    urlTransform: collectionOptions.urlTransform,
    usePayloadAccessControl: !collectionOptions.disablePayloadAccessControl,
  }
}

const createDefaultContext = (
  options: NormalizedBunnyStorageOptions,
  collection: CollectionConfig,
  prefixOverride?: string,
): CollectionContext => {
  const streamOptions = applyStreamOptions(options.stream, collection)

  return {
    accountApiKey: options.accountApiKey,
    collection,
    hasGenerateFileURL: false,
    isTusUploadSupported: !!streamOptions?.tus && !!collection.upload,
    prefix: prefixOverride ?? '',
    purgeOptions: options.purge,
    signedUrls: options.signedUrls,
    storageOptions: options.storage,
    streamOptions,
    thumbnail: options.thumbnail,
    urlTransform: options.urlTransform,
    usePayloadAccessControl: true,
  }
}

const applyStreamOptions = (
  streamOptions: NormalizedStreamOptions | undefined,
  collection: CollectionConfig,
): NormalizedStreamOptions | undefined => {
  if (!streamOptions?.tus || typeof collection.upload !== 'object' || !collection.upload.mimeTypes) {
    return streamOptions
  }

  const filtered = intersectMimeTypes(collection.upload.mimeTypes, streamOptions.mimeTypes)

  if (filtered?.length) {
    return {
      ...streamOptions,
      mimeTypes: filtered,
    }
  }

  return {
    ...streamOptions,
    tus: undefined,
  }
}
