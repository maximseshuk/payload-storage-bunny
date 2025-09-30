import type {
  BunnyStorageCollectionConfig,
  BunnyStorageConfig,
  CollectionsConfig,
  PurgeConfig,
  SignedUrlsConfig,
  StorageConfig,
  StreamConfig,
  ThumbnailConfig,
  UrlTransformConfig,
} from '@/types/config.js'
import type {
  NormalizedBunnyStorageConfig,
  NormalizedCollectionConfig,
  NormalizedPurgeConfig,
  NormalizedSignedUrlsConfig,
  NormalizedStorageConfig,
  NormalizedStreamConfig,
  NormalizedThumbnailConfig,
  NormalizedUrlTransformConfig,
} from '@/types/configNormalized.js'

import { CONFIG_DEFAULTS } from './defaults.js'

export const createNormalizedConfig = (
  options: BunnyStorageConfig,
): NormalizedBunnyStorageConfig => {
  const thumbnailConfig = options.thumbnail ?? options.adminThumbnail

  const normalized: NormalizedBunnyStorageConfig = {
    _original: options,
    apiKey: options.apiKey,
    collections: new Map(),
    i18n: options.i18n,
    purge: options.purge ? normalizePurgeConfig(options.purge, options.apiKey) : undefined,
    signedUrls: normalizeSignedUrlsConfig(options.signedUrls),
    storage: options.storage ? normalizeStorageConfig(options.storage) : undefined,
    stream: options.stream ? normalizeStreamConfig(options.stream) : undefined,
    thumbnail: normalizeThumbnailConfig(thumbnailConfig),
    urlTransform: normalizeUrlTransformConfig(options.urlTransform),
  }

  normalized.collections = normalizeCollectionsConfig(options.collections, normalized)

  return normalized
}

const normalizeStorageConfig = (storage: StorageConfig): NormalizedStorageConfig => ({
  ...storage,
  uploadTimeout: storage.uploadTimeout ?? CONFIG_DEFAULTS.storage.uploadTimeout,
})

const normalizeStreamConfig = (stream: StreamConfig): NormalizedStreamConfig => {
  const normalized: NormalizedStreamConfig = {
    apiKey: stream.apiKey,
    hostname: stream.hostname,
    libraryId: stream.libraryId,
    mp4Fallback: stream.mp4Fallback ?? CONFIG_DEFAULTS.stream.mp4Fallback,
    thumbnailTime: stream.thumbnailTime,
    tokenSecurityKey: stream.tokenSecurityKey,
    uploadTimeout: stream.uploadTimeout ?? CONFIG_DEFAULTS.stream.uploadTimeout,
  }

  if (stream.cleanup === true) {
    normalized.cleanup = { ...CONFIG_DEFAULTS.stream.cleanup }
  } else if (typeof stream.cleanup === 'object') {
    normalized.cleanup = {
      maxAge: stream.cleanup.maxAge ?? CONFIG_DEFAULTS.stream.cleanup.maxAge,
      schedule: stream.cleanup.schedule ?? CONFIG_DEFAULTS.stream.cleanup.schedule,
    }
  }

  if (stream.tus === true) {
    normalized.tus = {
      checkAccess: undefined,
      ...CONFIG_DEFAULTS.stream.tus,
      mimeTypes: [...CONFIG_DEFAULTS.stream.tus.mimeTypes],
    }
  } else if (typeof stream.tus === 'object') {
    normalized.tus = {
      autoMode: stream.tus.autoMode ?? CONFIG_DEFAULTS.stream.tus.autoMode,
      checkAccess: stream.tus.checkAccess,
      mimeTypes: stream.tus.mimeTypes ?? [...CONFIG_DEFAULTS.stream.tus.mimeTypes],
      uploadTimeout: stream.tus.uploadTimeout ?? CONFIG_DEFAULTS.stream.tus.uploadTimeout,
    }
  }

  return normalized
}

const normalizePurgeConfig = (
  purge: boolean | PurgeConfig,
  fallbackApiKey?: string,
): NormalizedPurgeConfig | undefined => {
  if (purge === true) {
    if (!fallbackApiKey) {
      return undefined
    }
    return {
      async: CONFIG_DEFAULTS.purge.async,
    }
  }

  if (purge === false) {
    return undefined
  }

  const apiKey = purge.apiKey ?? fallbackApiKey
  if (!apiKey) {
    return undefined
  }

  return {
    async: purge.async ?? CONFIG_DEFAULTS.purge.async,
  }
}

const normalizeSignedUrlsConfig = (
  value?: boolean | SignedUrlsConfig,
): NormalizedSignedUrlsConfig | undefined => {
  if (!value || value === true) {
    return undefined
  }

  const normalized: NormalizedSignedUrlsConfig = {
    allowedCountries: value.allowedCountries,
    blockedCountries: value.blockedCountries,
    expiresIn: value.expiresIn ?? CONFIG_DEFAULTS.signedUrls.expiresIn,
    shouldUseSignedUrl: value.shouldUseSignedUrl ? (...args) => value.shouldUseSignedUrl!(...args) : undefined,
  }

  if (value.staticHandler) {
    normalized.staticHandler = {
      expiresIn: value.staticHandler.expiresIn,
      redirectStatus: value.staticHandler.redirectStatus ?? 302,
      useRedirect: value.staticHandler.useRedirect ?? false,
    }
  }

  return normalized
}

const normalizeThumbnailConfig = (
  value?: boolean | ThumbnailConfig,
): NormalizedThumbnailConfig | undefined => {
  const baseConfig = normalizeUrlTransformConfig(value, CONFIG_DEFAULTS.thumbnail)

  if (!baseConfig) {
    return undefined
  }

  return {
    ...baseConfig,
    sizeName: typeof value === 'object' && value && 'sizeName' in value ? value.sizeName : undefined,
  }
}

const normalizeUrlTransformConfig = (
  value?: boolean | UrlTransformConfig,
  defaults?: { appendTimestamp: boolean; queryParams: Record<string, string> },
): NormalizedUrlTransformConfig | undefined => {
  if (!value) {
    return undefined
  }

  const defaultConfig = defaults ?? CONFIG_DEFAULTS.urlTransform

  if (value === true) {
    return {
      ...defaultConfig,
      transformUrl: undefined,
    }
  }

  if ('transformUrl' in value) {
    return {
      appendTimestamp: false,
      queryParams: {},
      transformUrl: value.transformUrl,
    }
  }

  return {
    appendTimestamp: value.appendTimestamp ?? defaultConfig.appendTimestamp,
    queryParams: value.queryParams ?? defaultConfig.queryParams,
    transformUrl: undefined,
  }
}

const normalizeCollectionsConfig = (
  collections: CollectionsConfig,
  normalizedGlobalConfig: NormalizedBunnyStorageConfig,
): Map<string, NormalizedCollectionConfig> => {
  const map = new Map<string, NormalizedCollectionConfig>()

  for (const [slug, collectionConfig] of Object.entries(collections)) {
    if (collectionConfig !== undefined) {
      const normalized = normalizeCollectionConfig(collectionConfig, normalizedGlobalConfig)
      map.set(slug, normalized)
    }
  }

  return map
}

const normalizeCollectionConfig = (
  collectionConfig: BunnyStorageCollectionConfig | true,
  normalizedGlobalConfig: NormalizedBunnyStorageConfig,
): NormalizedCollectionConfig => {
  if (collectionConfig === true) {
    return {
      disablePayloadAccessControl: false,
      prefix: '',
      purge: normalizedGlobalConfig.purge,
      signedUrls: normalizedGlobalConfig.signedUrls,
      storage: normalizedGlobalConfig.storage,
      stream: normalizedGlobalConfig.stream,
      thumbnail: normalizedGlobalConfig.thumbnail,
      urlTransform: normalizedGlobalConfig.urlTransform,
    }
  }

  const collectionThumbnailConfig = collectionConfig.thumbnail ?? collectionConfig.adminThumbnail

  return {
    disablePayloadAccessControl: collectionConfig.disablePayloadAccessControl ?? false,
    prefix: collectionConfig.prefix ?? '',
    purge: resolveCollectionPurgeConfig(collectionConfig.purge, normalizedGlobalConfig.purge),
    signedUrls: resolveCollectionConfigSetting(
      collectionConfig.signedUrls,
      normalizedGlobalConfig.signedUrls,
      normalizeSignedUrlsConfig,
    ),
    storage: resolveCollectionStorageConfig(collectionConfig.storage, normalizedGlobalConfig.storage),
    stream: resolveCollectionStreamConfig(collectionConfig.stream, normalizedGlobalConfig.stream),
    thumbnail: resolveCollectionConfigSetting(
      collectionThumbnailConfig,
      normalizedGlobalConfig.thumbnail,
      normalizeThumbnailConfig,
    ),
    urlTransform: resolveCollectionConfigSetting(
      collectionConfig.urlTransform,
      normalizedGlobalConfig.urlTransform,
      normalizeUrlTransformConfig,
    ),
  }
}

const resolveCollectionStorageConfig = (
  collectionOverride: BunnyStorageCollectionConfig['storage'],
  globalStorage: NormalizedStorageConfig | undefined,
): NormalizedStorageConfig | undefined => {
  if (collectionOverride === false) {
    return undefined
  }

  if (!globalStorage) {
    return undefined
  }

  if (!collectionOverride) {
    return globalStorage
  }

  const storageConfig = { ...globalStorage }

  if (collectionOverride.uploadTimeout !== undefined) {
    storageConfig.uploadTimeout = collectionOverride.uploadTimeout
  }

  return storageConfig
}

const resolveCollectionStreamConfig = (
  collectionOverride: BunnyStorageCollectionConfig['stream'],
  globalStream: NormalizedStreamConfig | undefined,
): NormalizedStreamConfig | undefined => {
  if (collectionOverride === false) {
    return undefined
  }

  if (!globalStream) {
    return undefined
  }

  if (!collectionOverride) {
    return globalStream
  }

  const streamConfig = { ...globalStream }

  if (collectionOverride.mp4Fallback !== undefined) {
    streamConfig.mp4Fallback = collectionOverride.mp4Fallback
  }

  if (collectionOverride.thumbnailTime !== undefined) {
    streamConfig.thumbnailTime = collectionOverride.thumbnailTime
  }

  if (collectionOverride.tus?.uploadTimeout !== undefined && streamConfig.tus) {
    streamConfig.tus = {
      ...streamConfig.tus,
      uploadTimeout: collectionOverride.tus.uploadTimeout,
    }
  }

  if (collectionOverride.uploadTimeout !== undefined) {
    streamConfig.uploadTimeout = collectionOverride.uploadTimeout
  }

  return streamConfig
}

const resolveCollectionPurgeConfig = (
  collectionValue: boolean | Partial<PurgeConfig> | undefined,
  globalValue: NormalizedPurgeConfig | undefined,
): NormalizedPurgeConfig | undefined => {
  if (collectionValue === false) {
    return undefined
  }

  if (collectionValue === true || collectionValue === undefined) {
    return globalValue
  }

  if (!globalValue) {
    return normalizePurgeConfig(collectionValue)
  }

  return {
    ...globalValue,
    ...(collectionValue.async !== undefined && { async: collectionValue.async }),
  }
}

const resolveCollectionConfigSetting = <T, R>(
  collectionValue: boolean | T | undefined,
  globalValue: R | undefined,
  normalizer: (value?: boolean | T) => R | undefined,
): R | undefined => {
  if (collectionValue === false) {
    return undefined
  }

  if (collectionValue === true || collectionValue === undefined) {
    return globalValue
  }

  return normalizer(collectionValue)
}
