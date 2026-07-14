import type {
  BunnyStorageCollectionConfig,
  BunnyStorageConfig,
  ClientUploadsConfig,
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
  NormalizedClientUploadsConfig,
  NormalizedCollectionConfig,
  NormalizedPurgeConfig,
  NormalizedSignedUrlsConfig,
  NormalizedStorageConfig,
  NormalizedStreamConfig,
  NormalizedThumbnailConfig,
  NormalizedUrlTransformConfig,
} from '@/types/configNormalized.js'

import { CONFIG_DEFAULTS } from './defaults.js'

export const createNormalizedConfig = (options: BunnyStorageConfig): NormalizedBunnyStorageConfig => {
  const normalized: NormalizedBunnyStorageConfig = {
    _original: options,
    apiKey: options.apiKey,
    clientUploads: normalizeClientUploadsConfig(options.clientUploads, !!options.storage?.s3),
    collections: new Map(),
    i18n: options.i18n,
    purge: options.purge ? normalizePurgeConfig(options.purge, options.apiKey) : undefined,
    signedUrls: normalizeSignedUrlsConfig(options.signedUrls),
    storage: options.storage ? normalizeStorageConfig(options.storage) : undefined,
    stream: options.stream ? normalizeStreamConfig(options.stream) : undefined,
    thumbnail: normalizeThumbnailConfig(options.thumbnail),
    urlTransform: normalizeUrlTransformConfig(options.urlTransform),
  }

  normalized.collections = normalizeCollectionsConfig(options.collections, normalized)

  return normalized
}

const normalizeClientUploadsConfig = (
  value: ClientUploadsConfig | false | undefined,
  hasS3: boolean,
): NormalizedClientUploadsConfig | undefined => {
  if (!value) {
    return undefined
  }

  const normalized: NormalizedClientUploadsConfig = {
    access: value.access,
    mode: value.mode ?? (hasS3 ? 's3' : 'edge'),
    prefix: value.prefix,
  }

  if (value.edge) {
    normalized.edge = {
      maxSize: value.edge.maxSize ?? CONFIG_DEFAULTS.clientUploads.edge.maxSize,
      scriptUrl: value.edge.scriptUrl.replace(/\/+$/, ''),
      secret: value.edge.secret,
    }
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
    mimeTypes: stream.mimeTypes ?? [...CONFIG_DEFAULTS.stream.mimeTypes],
    mp4Fallback: stream.mp4Fallback ?? CONFIG_DEFAULTS.stream.mp4Fallback,
    referer: stream.referer,
    thumbnailTime: stream.thumbnailTime,
    tokenSecurityKey: stream.tokenSecurityKey,
    uploadTimeout: stream.uploadTimeout ?? CONFIG_DEFAULTS.stream.uploadTimeout,
    webhook: stream.webhook,
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
    }
  } else if (typeof stream.tus === 'object') {
    normalized.tus = {
      autoMode: stream.tus.autoMode ?? CONFIG_DEFAULTS.stream.tus.autoMode,
      checkAccess: stream.tus.checkAccess,
      uploadTimeout: stream.tus.uploadTimeout ?? CONFIG_DEFAULTS.stream.tus.uploadTimeout,
    }
  }

  return normalized
}

const normalizePurgeConfig = (purge: boolean | PurgeConfig, apiKey?: string): NormalizedPurgeConfig | undefined => {
  if (purge === true) {
    if (!apiKey) {
      return undefined
    }
    return {
      async: CONFIG_DEFAULTS.purge.async,
    }
  }

  if (purge === false) {
    return undefined
  }

  if (!apiKey) {
    return undefined
  }

  return {
    async: purge.async ?? CONFIG_DEFAULTS.purge.async,
  }
}

const normalizeSignedUrlsConfig = (
  value?: boolean | SignedUrlsConfig,
  globalConfig?: NormalizedSignedUrlsConfig,
): NormalizedSignedUrlsConfig | undefined => {
  if (!value) {
    return undefined
  }

  if (value === true) {
    return globalConfig ?? { expiresIn: CONFIG_DEFAULTS.signedUrls.expiresIn }
  }

  const normalized: NormalizedSignedUrlsConfig = {
    allowedCountries: value.allowedCountries ?? globalConfig?.allowedCountries,
    blockedCountries: value.blockedCountries ?? globalConfig?.blockedCountries,
    expiresIn: value.expiresIn ?? globalConfig?.expiresIn ?? CONFIG_DEFAULTS.signedUrls.expiresIn,
    shouldUseSignedUrl: value.shouldUseSignedUrl
      ? (...args) => value.shouldUseSignedUrl!(...args)
      : globalConfig?.shouldUseSignedUrl,
  }

  if (value.staticHandler) {
    normalized.staticHandler = {
      expiresIn: value.staticHandler.expiresIn ?? globalConfig?.staticHandler?.expiresIn,
      redirectStatus: value.staticHandler.redirectStatus ?? globalConfig?.staticHandler?.redirectStatus ?? 302,
      useRedirect: value.staticHandler.useRedirect ?? globalConfig?.staticHandler?.useRedirect ?? false,
    }
  } else if (globalConfig?.staticHandler) {
    normalized.staticHandler = globalConfig.staticHandler
  }

  return normalized
}

const normalizeThumbnailConfig = (
  value?: boolean | ThumbnailConfig,
  globalConfig?: NormalizedThumbnailConfig,
): NormalizedThumbnailConfig | undefined => {
  const baseConfig = normalizeUrlTransformConfig(value, globalConfig ?? CONFIG_DEFAULTS.thumbnail, globalConfig)

  if (!baseConfig) {
    return undefined
  }

  return {
    ...baseConfig,
    sizeName: typeof value === 'object' && value && 'sizeName' in value ? value.sizeName : globalConfig?.sizeName,
    streamAnimated:
      typeof value === 'object' && value && 'streamAnimated' in value
        ? (value.streamAnimated ?? CONFIG_DEFAULTS.thumbnail.streamAnimated)
        : (globalConfig?.streamAnimated ?? CONFIG_DEFAULTS.thumbnail.streamAnimated),
  }
}

const normalizeUrlTransformConfig = (
  value?: boolean | UrlTransformConfig,
  defaults?: { appendTimestamp: boolean; queryParams: Record<string, string> },
  globalConfig?: NormalizedUrlTransformConfig,
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
    appendTimestamp: value.appendTimestamp ?? globalConfig?.appendTimestamp ?? defaultConfig.appendTimestamp,
    queryParams: value.queryParams ?? globalConfig?.queryParams ?? defaultConfig.queryParams,
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
      clientUploads: normalizedGlobalConfig.clientUploads,
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

  const storage = resolveCollectionStorageConfig(collectionConfig.storage, normalizedGlobalConfig.storage)

  return {
    clientUploads: resolveCollectionClientUploadsConfig(
      collectionConfig.clientUploads,
      normalizedGlobalConfig.clientUploads,
      !!storage?.s3,
    ),
    disablePayloadAccessControl: collectionConfig.disablePayloadAccessControl ?? false,
    prefix: collectionConfig.prefix ?? '',
    purge: resolveCollectionPurgeConfig(
      collectionConfig.purge,
      normalizedGlobalConfig.purge,
      normalizedGlobalConfig.apiKey,
    ),
    signedUrls: resolveCollectionConfigSetting(
      collectionConfig.signedUrls,
      normalizedGlobalConfig.signedUrls,
      (value) => normalizeSignedUrlsConfig(value, normalizedGlobalConfig.signedUrls),
    ),
    storage,
    stream: resolveCollectionStreamConfig(collectionConfig.stream, normalizedGlobalConfig.stream),
    thumbnail: resolveCollectionConfigSetting(collectionConfig.thumbnail, normalizedGlobalConfig.thumbnail, (value) =>
      normalizeThumbnailConfig(value, normalizedGlobalConfig.thumbnail),
    ),
    urlTransform: resolveCollectionConfigSetting(
      collectionConfig.urlTransform,
      normalizedGlobalConfig.urlTransform,
      (value) => normalizeUrlTransformConfig(value, undefined, normalizedGlobalConfig.urlTransform),
    ),
  }
}

const resolveCollectionClientUploadsConfig = (
  collectionOverride: BunnyStorageCollectionConfig['clientUploads'],
  globalValue: NormalizedClientUploadsConfig | undefined,
  hasS3: boolean,
): NormalizedClientUploadsConfig | undefined => {
  if (collectionOverride === false) {
    return undefined
  }

  if (collectionOverride === undefined) {
    return globalValue
  }

  if (!globalValue) {
    return normalizeClientUploadsConfig(collectionOverride, hasS3)
  }

  const merged: NormalizedClientUploadsConfig = { ...globalValue }

  if (collectionOverride.access !== undefined) {
    merged.access = collectionOverride.access
  }

  if (collectionOverride.mode !== undefined) {
    merged.mode = collectionOverride.mode
  }

  if (collectionOverride.prefix !== undefined) {
    merged.prefix = collectionOverride.prefix
  }

  if (collectionOverride.edge !== undefined) {
    merged.edge = {
      maxSize:
        collectionOverride.edge.maxSize ?? globalValue.edge?.maxSize ?? CONFIG_DEFAULTS.clientUploads.edge.maxSize,
      scriptUrl: collectionOverride.edge.scriptUrl.replace(/\/+$/, ''),
      secret: collectionOverride.edge.secret,
    }
  }

  return merged
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

  if (collectionOverride.mimeTypes !== undefined) {
    streamConfig.mimeTypes = collectionOverride.mimeTypes
  }

  if (collectionOverride.mp4Fallback !== undefined) {
    streamConfig.mp4Fallback = collectionOverride.mp4Fallback
  }

  if (collectionOverride.thumbnailTime !== undefined) {
    streamConfig.thumbnailTime = collectionOverride.thumbnailTime
  }

  if (collectionOverride.tus && streamConfig.tus) {
    if (collectionOverride.tus.uploadTimeout !== undefined) {
      streamConfig.tus = {
        ...streamConfig.tus,
        uploadTimeout: collectionOverride.tus.uploadTimeout,
      }
    }

    if (collectionOverride.tus.autoMode !== undefined) {
      streamConfig.tus = {
        ...streamConfig.tus,
        autoMode: collectionOverride.tus.autoMode,
      }
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
  apiKey?: string,
): NormalizedPurgeConfig | undefined => {
  if (collectionValue === false) {
    return undefined
  }

  if (collectionValue === undefined) {
    return globalValue
  }

  if (collectionValue === true) {
    return globalValue ?? normalizePurgeConfig(true, apiKey)
  }

  if (!globalValue) {
    return normalizePurgeConfig(collectionValue, apiKey)
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

  if (collectionValue === undefined) {
    return globalValue
  }

  if (collectionValue === true) {
    return globalValue ?? normalizer(true)
  }

  return normalizer(collectionValue)
}
