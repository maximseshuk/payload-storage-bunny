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

const mergeDefined = <T extends object>(base: T, override: Partial<T>): T => {
  const defined = Object.fromEntries(Object.entries(override).filter(([, value]) => value !== undefined)) as Partial<T>
  return { ...base, ...defined }
}

export const createNormalizedConfig = (options: BunnyStorageConfig): NormalizedBunnyStorageConfig => {
  const normalized: NormalizedBunnyStorageConfig = {
    _original: options,
    accountApiKey: options.accountApiKey,
    collections: new Map(),
    i18n: options.i18n,
    purge: options.purge
      ? normalizePurgeConfig({ accountApiKey: options.accountApiKey, purge: options.purge })
      : undefined,
    signedUrls: normalizeSignedUrlsConfig({ value: options.signedUrls }),
    storage: options.storage ? normalizeStorageConfig(options.storage) : undefined,
    stream: options.stream ? normalizeStreamConfig(options.stream) : undefined,
    thumbnail: normalizeThumbnailConfig({ value: options.thumbnail }),
    urlTransform: normalizeUrlTransformConfig({ value: options.urlTransform }),
  }

  normalized.collections = normalizeCollectionsConfig({ collections: options.collections, globalConfig: normalized })

  return normalized
}

const normalizeClientUploadsConfig = ({
  value,
}: {
  value: boolean | ClientUploadsConfig | undefined
}): NormalizedClientUploadsConfig | undefined => {
  if (!value) {
    return undefined
  }

  const config: ClientUploadsConfig = value === true ? {} : value

  const normalized: NormalizedClientUploadsConfig = {
    access: config.access,
    prefix: config.prefix,
  }

  if (config.edge) {
    normalized.edge = {
      maxSize: config.edge.maxSize ?? CONFIG_DEFAULTS.clientUploads.edge.maxSize,
      scriptUrl: config.edge.scriptUrl.replace(/\/+$/, ''),
      secret: config.edge.secret,
    }
  }

  return normalized
}

const normalizeStorageConfig = (storage: StorageConfig): NormalizedStorageConfig => ({
  apiKey: storage.apiKey,
  clientUploads: normalizeClientUploadsConfig({ value: storage.clientUploads }),
  hostname: storage.hostname,
  region: storage.region,
  s3: storage.s3,
  tokenSecurityKey: storage.tokenSecurityKey,
  uploadTimeout: storage.uploadTimeout ?? CONFIG_DEFAULTS.storage.uploadTimeout,
  zoneName: storage.zoneName,
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
      expiresIn: stream.tus.expiresIn ?? CONFIG_DEFAULTS.stream.tus.expiresIn,
    }
  }

  return normalized
}

const normalizePurgeConfig = ({
  accountApiKey,
  purge,
}: {
  accountApiKey?: string
  purge: boolean | PurgeConfig
}): NormalizedPurgeConfig | undefined => {
  if (purge === true) {
    if (!accountApiKey) {
      return undefined
    }
    return {
      async: CONFIG_DEFAULTS.purge.async,
    }
  }

  if (purge === false) {
    return undefined
  }

  if (!accountApiKey) {
    return undefined
  }

  return {
    async: purge.async ?? CONFIG_DEFAULTS.purge.async,
  }
}

const normalizeSignedUrlsConfig = ({
  globalConfig,
  value,
}: {
  globalConfig?: NormalizedSignedUrlsConfig
  value?: boolean | SignedUrlsConfig
}): NormalizedSignedUrlsConfig | undefined => {
  if (!value) {
    return undefined
  }

  if (value === true) {
    return globalConfig ?? { expiresIn: CONFIG_DEFAULTS.signedUrls.expiresIn }
  }

  const normalized: NormalizedSignedUrlsConfig = {
    allowedCountries: value.allowedCountries ?? globalConfig?.allowedCountries,
    blockedCountries: value.blockedCountries ?? globalConfig?.blockedCountries,
    expiresAt: value.expiresAt ? (...args) => value.expiresAt!(...args) : globalConfig?.expiresAt,
    expiresIn: value.expiresIn ?? globalConfig?.expiresIn ?? CONFIG_DEFAULTS.signedUrls.expiresIn,
    shouldUseSignedUrl: value.shouldUseSignedUrl
      ? (...args) => value.shouldUseSignedUrl!(...args)
      : globalConfig?.shouldUseSignedUrl,
    userIp: value.userIp ? (...args) => value.userIp!(...args) : globalConfig?.userIp,
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

const normalizeThumbnailConfig = ({
  globalConfig,
  value,
}: {
  globalConfig?: NormalizedThumbnailConfig
  value?: boolean | ThumbnailConfig
}): NormalizedThumbnailConfig | undefined => {
  const baseConfig = normalizeUrlTransformConfig({
    defaults: globalConfig ?? CONFIG_DEFAULTS.thumbnail,
    globalConfig,
    value,
  })

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

const normalizeUrlTransformConfig = ({
  defaults,
  globalConfig,
  value,
}: {
  defaults?: { appendTimestamp: boolean; queryParams: Record<string, string> }
  globalConfig?: NormalizedUrlTransformConfig
  value?: boolean | UrlTransformConfig
}): NormalizedUrlTransformConfig | undefined => {
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

const normalizeCollectionsConfig = ({
  collections,
  globalConfig,
}: {
  collections: CollectionsConfig
  globalConfig: NormalizedBunnyStorageConfig
}): Map<string, NormalizedCollectionConfig> => {
  const map = new Map<string, NormalizedCollectionConfig>()

  for (const [slug, collectionConfig] of Object.entries(collections)) {
    if (collectionConfig !== undefined) {
      map.set(slug, normalizeCollectionConfig({ collectionConfig, globalConfig }))
    }
  }

  return map
}

const normalizeCollectionConfig = ({
  collectionConfig,
  globalConfig,
}: {
  collectionConfig: BunnyStorageCollectionConfig | true
  globalConfig: NormalizedBunnyStorageConfig
}): NormalizedCollectionConfig => {
  if (collectionConfig === true) {
    return {
      disablePayloadAccessControl: false,
      prefix: '',
      purge: globalConfig.purge,
      signedUrls: globalConfig.signedUrls,
      storage: globalConfig.storage,
      stream: globalConfig.stream,
      thumbnail: globalConfig.thumbnail,
      urlTransform: globalConfig.urlTransform,
    }
  }

  const storage = resolveCollectionStorageConfig({
    collectionOverride: collectionConfig.storage,
    globalValue: globalConfig.storage,
  })

  return {
    disablePayloadAccessControl: collectionConfig.disablePayloadAccessControl ?? false,
    prefix: collectionConfig.prefix ?? '',
    purge: resolveCollectionPurgeConfig({
      accountApiKey: globalConfig.accountApiKey,
      collectionOverride: collectionConfig.purge,
      globalValue: globalConfig.purge,
    }),
    signedUrls: resolveCollectionConfigSetting(collectionConfig.signedUrls, globalConfig.signedUrls, (value) =>
      normalizeSignedUrlsConfig({ globalConfig: globalConfig.signedUrls, value }),
    ),
    storage,
    stream: resolveCollectionStreamConfig({
      collectionOverride: collectionConfig.stream,
      globalValue: globalConfig.stream,
    }),
    thumbnail: resolveCollectionConfigSetting(collectionConfig.thumbnail, globalConfig.thumbnail, (value) =>
      normalizeThumbnailConfig({ globalConfig: globalConfig.thumbnail, value }),
    ),
    urlTransform: resolveCollectionConfigSetting(collectionConfig.urlTransform, globalConfig.urlTransform, (value) =>
      normalizeUrlTransformConfig({ globalConfig: globalConfig.urlTransform, value }),
    ),
  }
}

const resolveCollectionClientUploadsConfig = ({
  collectionOverride,
  globalValue,
}: {
  collectionOverride: boolean | ClientUploadsConfig | undefined
  globalValue: NormalizedClientUploadsConfig | undefined
}): NormalizedClientUploadsConfig | undefined => {
  if (collectionOverride === false) {
    return undefined
  }

  if (collectionOverride === undefined) {
    return globalValue
  }

  if (collectionOverride === true) {
    return globalValue ?? normalizeClientUploadsConfig({ value: true })
  }

  if (!globalValue) {
    return normalizeClientUploadsConfig({ value: collectionOverride })
  }

  const merged = mergeDefined(globalValue, {
    access: collectionOverride.access,
    prefix: collectionOverride.prefix,
  })

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

const resolveCollectionStorageConfig = ({
  collectionOverride,
  globalValue,
}: {
  collectionOverride: BunnyStorageCollectionConfig['storage']
  globalValue: NormalizedStorageConfig | undefined
}): NormalizedStorageConfig | undefined => {
  if (collectionOverride === false) {
    return undefined
  }

  if (collectionOverride && 'apiKey' in collectionOverride) {
    return normalizeStorageConfig(collectionOverride)
  }

  if (!globalValue) {
    return undefined
  }

  if (!collectionOverride) {
    return globalValue
  }

  const merged = mergeDefined(globalValue, { uploadTimeout: collectionOverride.uploadTimeout })
  merged.clientUploads = resolveCollectionClientUploadsConfig({
    collectionOverride: collectionOverride.clientUploads,
    globalValue: globalValue.clientUploads,
  })

  return merged
}

const resolveCollectionStreamConfig = ({
  collectionOverride,
  globalValue,
}: {
  collectionOverride: BunnyStorageCollectionConfig['stream']
  globalValue: NormalizedStreamConfig | undefined
}): NormalizedStreamConfig | undefined => {
  if (collectionOverride === false) {
    return undefined
  }

  if (collectionOverride && 'apiKey' in collectionOverride) {
    return normalizeStreamConfig(collectionOverride)
  }

  if (!globalValue) {
    return undefined
  }

  if (!collectionOverride) {
    return globalValue
  }

  const streamConfig = mergeDefined(globalValue, {
    mimeTypes: collectionOverride.mimeTypes,
    mp4Fallback: collectionOverride.mp4Fallback,
    thumbnailTime: collectionOverride.thumbnailTime,
    uploadTimeout: collectionOverride.uploadTimeout,
  })

  if (collectionOverride.tus === false) {
    streamConfig.tus = undefined
  } else if (collectionOverride.tus && streamConfig.tus) {
    streamConfig.tus = mergeDefined(streamConfig.tus, {
      autoMode: collectionOverride.tus.autoMode,
      expiresIn: collectionOverride.tus.expiresIn,
    })
  }

  return streamConfig
}

const resolveCollectionPurgeConfig = ({
  accountApiKey,
  collectionOverride,
  globalValue,
}: {
  accountApiKey?: string
  collectionOverride: boolean | Partial<PurgeConfig> | undefined
  globalValue: NormalizedPurgeConfig | undefined
}): NormalizedPurgeConfig | undefined => {
  if (collectionOverride === false) {
    return undefined
  }

  if (collectionOverride === undefined) {
    return globalValue
  }

  if (collectionOverride === true) {
    return globalValue ?? normalizePurgeConfig({ accountApiKey, purge: true })
  }

  if (!globalValue) {
    return normalizePurgeConfig({ accountApiKey, purge: collectionOverride })
  }

  return mergeDefined(globalValue, { async: collectionOverride.async })
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
