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
    collections: normalizeCollectionsConfig(options.collections, options),
    i18n: options.i18n,
    purge: options.purge ? normalizePurgeConfig(options.purge) : undefined,
    signedUrls: normalizeSignedUrlsConfig(options.signedUrls),
    storage: options.storage ? normalizeStorageConfig(options.storage) : undefined,
    stream: options.stream ? normalizeStreamConfig(options.stream) : undefined,
    thumbnail: normalizeThumbnailConfig(thumbnailConfig),
    urlTransform: normalizeUrlTransformConfig(options.urlTransform),
  }

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

const normalizePurgeConfig = (purge: PurgeConfig): NormalizedPurgeConfig => ({
  ...purge,
  async: purge.async ?? CONFIG_DEFAULTS.purge.async,
})

const normalizeSignedUrlsConfig = (
  value?: boolean | SignedUrlsConfig,
): false | NormalizedSignedUrlsConfig => {
  if (!value || value === true) {
    return false
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

const normalizeUrlTransformConfig = (
  value?: boolean | UrlTransformConfig,
  defaults?: { appendTimestamp: boolean; queryParams: Record<string, string> },
): false | NormalizedUrlTransformConfig => {
  if (!value) {
    return false
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

const normalizeThumbnailConfig = (
  value?: boolean | ThumbnailConfig,
): false | NormalizedThumbnailConfig => {
  const baseConfig = normalizeUrlTransformConfig(value, CONFIG_DEFAULTS.thumbnail)

  if (!baseConfig) {
    return false
  }

  return {
    ...baseConfig,
    sizeName: typeof value === 'object' && value && 'sizeName' in value ? value.sizeName : undefined,
  }
}

const normalizeCollectionsConfig = (
  collections: CollectionsConfig,
  globalConfig: BunnyStorageConfig,
): Map<string, NormalizedCollectionConfig> => {
  const map = new Map<string, NormalizedCollectionConfig>()

  for (const [slug, collectionConfig] of Object.entries(collections)) {
    if (collectionConfig !== undefined) {
      const normalized = normalizeCollectionConfig(collectionConfig, globalConfig)
      map.set(slug, normalized)
    }
  }

  return map
}

const normalizeCollectionConfig = (
  collectionConfig: BunnyStorageCollectionConfig | true,
  globalConfig: BunnyStorageConfig,
): NormalizedCollectionConfig => {
  if (collectionConfig === true) {
    const globalThumbnailConfig = globalConfig.thumbnail ?? globalConfig.adminThumbnail
    return {
      disablePayloadAccessControl: false,
      prefix: '',
      purge: globalConfig.purge ? normalizePurgeConfig(globalConfig.purge) : false,
      signedUrls: normalizeSignedUrlsConfig(globalConfig.signedUrls),
      stream: globalConfig.stream
        ? { thumbnailTime: globalConfig.stream.thumbnailTime }
        : undefined,
      thumbnail: normalizeThumbnailConfig(globalThumbnailConfig),
      urlTransform: normalizeUrlTransformConfig(globalConfig.urlTransform),
    }
  }

  const collectionThumbnailConfig = collectionConfig.thumbnail ?? collectionConfig.adminThumbnail
  const globalThumbnailConfig = globalConfig.thumbnail ?? globalConfig.adminThumbnail

  return {
    disablePayloadAccessControl: collectionConfig.disablePayloadAccessControl ?? false,
    prefix: collectionConfig.prefix ?? '',
    purge: resolveCollectionPurgeConfig(collectionConfig.purge, globalConfig.purge),
    signedUrls: resolveCollectionConfigSetting(
      collectionConfig.signedUrls,
      globalConfig.signedUrls,
      normalizeSignedUrlsConfig,
    ),
    stream: collectionConfig.stream
      ? {
        thumbnailTime: collectionConfig.stream.thumbnailTime,
      }
      : globalConfig.stream
        ? { thumbnailTime: globalConfig.stream.thumbnailTime }
        : undefined,
    thumbnail: resolveCollectionConfigSetting(
      collectionThumbnailConfig,
      globalThumbnailConfig,
      normalizeThumbnailConfig,
    ),
    urlTransform: resolveCollectionConfigSetting(
      collectionConfig.urlTransform,
      globalConfig.urlTransform,
      normalizeUrlTransformConfig,
    ),
  }
}

const resolveCollectionPurgeConfig = (
  collectionValue: boolean | PurgeConfig | undefined,
  globalValue: PurgeConfig | undefined,
): false | NormalizedPurgeConfig => {
  if (collectionValue === false) {
    return false
  }

  if (collectionValue === true) {
    return globalValue ? normalizePurgeConfig(globalValue) : false
  }

  if (collectionValue !== undefined) {
    return normalizePurgeConfig(collectionValue)
  }

  return globalValue ? normalizePurgeConfig(globalValue) : false
}

const resolveCollectionConfigSetting = <T, R>(
  collectionValue: boolean | T | undefined,
  globalValue: boolean | T | undefined,
  normalizer: (value?: boolean | T) => false | R,
): false | R => {
  if (collectionValue === false) {
    return false
  }

  if (collectionValue === true) {
    return normalizer(globalValue)
  }

  if (collectionValue !== undefined) {
    return normalizer(collectionValue)
  }

  return normalizer(globalValue)
}
