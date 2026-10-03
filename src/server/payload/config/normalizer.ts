import { trimTrailingSlashes } from '@/shared/http.js'
import type {
  BunnyStorageCollectionConfig,
  BunnyStorageConfig,
  ClientUploadsConfig,
  CollectionsConfig,
  PurgeConfig,
  SignedUrlsConfig,
  SignedUrlsExpiresIn,
  StaticHandlerRedirectConfig,
  StorageConfig,
  StreamConfig,
  ThumbnailConfig,
  UrlTransformConfig,
} from '@/shared/types/config.js'
import type {
  ExpiresResolver,
  NormalizedBunnyStorageConfig,
  NormalizedClientUploadsConfig,
  NormalizedCollectionConfig,
  NormalizedPurgeConfig,
  NormalizedSignedUrlsConfig,
  NormalizedStorageConfig,
  NormalizedStreamConfig,
  NormalizedThumbnailConfig,
  NormalizedUrlTransformConfig,
} from '@/shared/types/configNormalized.js'

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
    purge: normalizePurgeConfig({ accountApiKey: options.accountApiKey, value: options.purge }),
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
      scriptUrl: trimTrailingSlashes(config.edge.scriptUrl),
      secret: config.edge.secret,
    }
  }

  return normalized
}

const normalizeStorageConfig = (storage: StorageConfig): NormalizedStorageConfig => ({
  apiKey: storage.apiKey,
  clientUploads: normalizeClientUploadsConfig({ value: storage.clientUploads }),
  hostname: storage.hostname,
  region: storage.region ?? CONFIG_DEFAULTS.storage.region,
  s3: storage.s3 === true,
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
    normalized.tus = { ...CONFIG_DEFAULTS.stream.tus }
  } else if (typeof stream.tus === 'object') {
    normalized.tus = {
      access: stream.tus.access,
      autoMode: stream.tus.autoMode ?? CONFIG_DEFAULTS.stream.tus.autoMode,
      expiresIn: stream.tus.expiresIn ?? CONFIG_DEFAULTS.stream.tus.expiresIn,
    }
  }

  return normalized
}

const normalizePurgeConfig = ({
  accountApiKey,
  globalConfig,
  value,
}: {
  accountApiKey?: string
  globalConfig?: NormalizedPurgeConfig
  value: boolean | PurgeConfig | undefined
}): NormalizedPurgeConfig | undefined => {
  if (!value || !accountApiKey) {
    return undefined
  }

  return {
    async: (value === true ? undefined : value.async) ?? globalConfig?.async ?? CONFIG_DEFAULTS.purge.async,
  }
}

const toExpiresResolver = (value: SignedUrlsExpiresIn | undefined, fallback: ExpiresResolver): ExpiresResolver => {
  if (value === undefined) {
    return fallback
  }

  if (typeof value === 'number') {
    return () => value
  }

  return (args) => {
    const defaultValue = fallback(args)
    return value({ ...args, defaultValue }) ?? defaultValue
  }
}

const DEFAULT_EXPIRES_IN: ExpiresResolver = () => CONFIG_DEFAULTS.signedUrls.expiresIn

const normalizeRedirectConfig = ({
  expiresIn,
  globalConfig,
  value,
}: {
  expiresIn: ExpiresResolver
  globalConfig?: NormalizedSignedUrlsConfig['redirect']
  value: boolean | StaticHandlerRedirectConfig | undefined
}): NormalizedSignedUrlsConfig['redirect'] => {
  if (value === false) {
    return undefined
  }

  if (value === undefined) {
    return globalConfig
  }

  const config = value === true ? {} : value

  return {
    expiresIn:
      config.expiresIn === undefined
        ? globalConfig?.expiresIn
        : toExpiresResolver(config.expiresIn, globalConfig?.expiresIn ?? expiresIn),
    status: config.status ?? globalConfig?.status ?? 302,
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
    return globalConfig ?? { expiresIn: DEFAULT_EXPIRES_IN }
  }

  const expiresIn = toExpiresResolver(value.expiresIn, globalConfig?.expiresIn ?? DEFAULT_EXPIRES_IN)

  return {
    allowedCountries: value.allowedCountries ?? globalConfig?.allowedCountries,
    blockedCountries: value.blockedCountries ?? globalConfig?.blockedCountries,
    expiresIn,
    redirect: normalizeRedirectConfig({
      expiresIn,
      globalConfig: globalConfig?.redirect,
      value: value.staticHandler?.redirect,
    }),
    shouldUseSignedUrl: value.shouldUseSignedUrl ?? globalConfig?.shouldUseSignedUrl,
    userIp: value.userIp ?? globalConfig?.userIp,
  }
}

const NO_URL_TRANSFORM = { appendTimestamp: false, queryParams: {} }

const normalizeThumbnailConfig = ({
  globalConfig,
  value,
}: {
  globalConfig?: NormalizedThumbnailConfig
  value?: boolean | ThumbnailConfig
}): NormalizedThumbnailConfig | undefined => {
  if (!value) {
    return undefined
  }

  const config = value === true ? {} : value
  const urlTransform =
    config.urlTransform === undefined || config.urlTransform === true
      ? (globalConfig ?? normalizeUrlTransformConfig({ defaults: CONFIG_DEFAULTS.thumbnail, value: true }))
      : normalizeUrlTransformConfig({
          defaults: CONFIG_DEFAULTS.thumbnail,
          globalConfig,
          value: config.urlTransform,
        })

  return {
    ...(urlTransform ?? NO_URL_TRANSFORM),
    sizeName: 'sizeName' in config ? config.sizeName : globalConfig?.sizeName,
    streamAnimated: config.streamAnimated ?? globalConfig?.streamAnimated ?? CONFIG_DEFAULTS.thumbnail.streamAnimated,
  }
}

const normalizeUrlTransformConfig = ({
  defaults = CONFIG_DEFAULTS.urlTransform,
  globalConfig,
  value,
}: {
  defaults?: { appendTimestamp: boolean; queryParams: Record<string, string> }
  globalConfig?: NormalizedUrlTransformConfig
  value?: UrlTransformConfig
}): NormalizedUrlTransformConfig | undefined => {
  if (!value) {
    return undefined
  }

  if (value === true) {
    return { appendTimestamp: defaults.appendTimestamp, queryParams: defaults.queryParams }
  }

  if (typeof value === 'function') {
    return { ...NO_URL_TRANSFORM, transformUrl: value }
  }

  const inherited = globalConfig?.transformUrl ? undefined : globalConfig

  return {
    appendTimestamp: value.appendTimestamp ?? inherited?.appendTimestamp ?? defaults.appendTimestamp,
    queryParams: value.queryParams ?? inherited?.queryParams ?? defaults.queryParams,
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
    if (collectionConfig) {
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
      hasGenerateFileURL: false,
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
    hasGenerateFileURL: typeof collectionConfig.generateFileURL === 'function',
    prefix: collectionConfig.prefix ?? '',
    purge: resolveCollectionConfigSetting(collectionConfig.purge, globalConfig.purge, (value) =>
      normalizePurgeConfig({ accountApiKey: globalConfig.accountApiKey, globalConfig: globalConfig.purge, value }),
    ),
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
      scriptUrl: trimTrailingSlashes(collectionOverride.edge.scriptUrl),
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

  const tus = collectionOverride.tus
  if (tus === false) {
    streamConfig.tus = undefined
  } else if (tus) {
    const base = streamConfig.tus ?? { ...CONFIG_DEFAULTS.stream.tus }
    streamConfig.tus = tus === true ? base : mergeDefined(base, { autoMode: tus.autoMode, expiresIn: tus.expiresIn })
  }

  return streamConfig
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
