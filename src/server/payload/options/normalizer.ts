import { trimTrailingSlashes } from '@/shared/http.js'
import type {
  BunnyStorageCollectionOptions,
  BunnyStorageOptions,
  ClientUploadsOptions,
  CollectionsOptions,
  PurgeOptions,
  SignedUrlsOptions,
  SignedUrlsExpiresIn,
  StaticHandlerRedirectOptions,
  StorageOptions,
  StreamOptions,
  ThumbnailOptions,
  UrlTransformOptions,
} from '@/shared/types/options.js'
import type {
  ExpiresResolver,
  NormalizedBunnyStorageOptions,
  NormalizedClientUploadsOptions,
  NormalizedCollectionOptions,
  NormalizedPurgeOptions,
  NormalizedSignedUrlsOptions,
  NormalizedStorageOptions,
  NormalizedStreamOptions,
  NormalizedThumbnailOptions,
  NormalizedUrlTransformOptions,
} from '@/shared/types/optionsNormalized.js'

import { OPTIONS_DEFAULTS } from './defaults.js'

const mergeDefined = <T extends object>(base: T, override: Partial<T>): T => {
  const defined = Object.fromEntries(Object.entries(override).filter(([, value]) => value !== undefined)) as Partial<T>
  return { ...base, ...defined }
}

export const createNormalizedOptions = (options: BunnyStorageOptions): NormalizedBunnyStorageOptions => {
  const normalized: NormalizedBunnyStorageOptions = {
    _original: options,
    accountApiKey: options.accountApiKey,
    collections: new Map(),
    purge: normalizePurgeOptions({ accountApiKey: options.accountApiKey, value: options.purge }),
    signedUrls: normalizeSignedUrlsOptions({ value: options.signedUrls }),
    storage: options.storage ? normalizeStorageOptions(options.storage) : undefined,
    stream: options.stream ? normalizeStreamOptions(options.stream) : undefined,
    thumbnail: normalizeThumbnailOptions({ value: options.thumbnail }),
    urlTransform: normalizeUrlTransformOptions({ value: options.urlTransform }),
  }

  normalized.collections = normalizeCollectionsOptions({ collections: options.collections, globalOptions: normalized })

  return normalized
}

const normalizeClientUploadsOptions = ({
  value,
}: {
  value: boolean | ClientUploadsOptions | undefined
}): NormalizedClientUploadsOptions | undefined => {
  if (!value) {
    return undefined
  }

  const options: ClientUploadsOptions = value === true ? {} : value

  const normalized: NormalizedClientUploadsOptions = {
    access: options.access,
    prefix: options.prefix,
  }

  if (options.edge) {
    normalized.edge = {
      maxSize: options.edge.maxSize ?? OPTIONS_DEFAULTS.clientUploads.edge.maxSize,
      scriptUrl: trimTrailingSlashes(options.edge.scriptUrl),
      secret: options.edge.secret,
    }
  }

  return normalized
}

const normalizeStorageOptions = (storage: StorageOptions): NormalizedStorageOptions => ({
  apiKey: storage.apiKey,
  clientUploads: normalizeClientUploadsOptions({ value: storage.clientUploads }),
  hostname: storage.hostname,
  region: storage.region ?? OPTIONS_DEFAULTS.storage.region,
  s3: storage.s3 === true,
  tokenSecurityKey: storage.tokenSecurityKey,
  uploadTimeout: storage.uploadTimeout ?? OPTIONS_DEFAULTS.storage.uploadTimeout,
  zoneName: storage.zoneName,
})

const normalizeStreamOptions = (stream: StreamOptions): NormalizedStreamOptions => {
  const normalized: NormalizedStreamOptions = {
    apiKey: stream.apiKey,
    hostname: stream.hostname,
    libraryId: stream.libraryId,
    mimeTypes: stream.mimeTypes ?? [...OPTIONS_DEFAULTS.stream.mimeTypes],
    mp4Fallback: stream.mp4Fallback ?? OPTIONS_DEFAULTS.stream.mp4Fallback,
    referer: stream.referer,
    thumbnailTime: stream.thumbnailTime,
    tokenSecurityKey: stream.tokenSecurityKey,
    uploadTimeout: stream.uploadTimeout ?? OPTIONS_DEFAULTS.stream.uploadTimeout,
    webhook: stream.webhook,
  }

  if (stream.cleanup === true) {
    normalized.cleanup = { ...OPTIONS_DEFAULTS.stream.cleanup }
  } else if (typeof stream.cleanup === 'object') {
    normalized.cleanup = {
      maxAge: stream.cleanup.maxAge ?? OPTIONS_DEFAULTS.stream.cleanup.maxAge,
      schedule: stream.cleanup.schedule ?? OPTIONS_DEFAULTS.stream.cleanup.schedule,
    }
  }

  if (stream.tus === true) {
    normalized.tus = { ...OPTIONS_DEFAULTS.stream.tus }
  } else if (typeof stream.tus === 'object') {
    normalized.tus = {
      access: stream.tus.access,
      autoMode: stream.tus.autoMode ?? OPTIONS_DEFAULTS.stream.tus.autoMode,
      expiresIn: stream.tus.expiresIn ?? OPTIONS_DEFAULTS.stream.tus.expiresIn,
    }
  }

  return normalized
}

const normalizePurgeOptions = ({
  accountApiKey,
  globalOptions,
  value,
}: {
  accountApiKey?: string
  globalOptions?: NormalizedPurgeOptions
  value: boolean | PurgeOptions | undefined
}): NormalizedPurgeOptions | undefined => {
  if (!value || !accountApiKey) {
    return undefined
  }

  return {
    async: (value === true ? undefined : value.async) ?? globalOptions?.async ?? OPTIONS_DEFAULTS.purge.async,
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

const DEFAULT_EXPIRES_IN: ExpiresResolver = () => OPTIONS_DEFAULTS.signedUrls.expiresIn

const normalizeRedirectOptions = ({
  expiresIn,
  globalOptions,
  value,
}: {
  expiresIn: ExpiresResolver
  globalOptions?: NormalizedSignedUrlsOptions['redirect']
  value: boolean | StaticHandlerRedirectOptions | undefined
}): NormalizedSignedUrlsOptions['redirect'] => {
  if (value === false) {
    return undefined
  }

  if (value === undefined) {
    return globalOptions
  }

  const options = value === true ? {} : value

  return {
    expiresIn:
      options.expiresIn === undefined
        ? globalOptions?.expiresIn
        : toExpiresResolver(options.expiresIn, globalOptions?.expiresIn ?? expiresIn),
    status: options.status ?? globalOptions?.status ?? 302,
  }
}

const normalizeSignedUrlsOptions = ({
  globalOptions,
  value,
}: {
  globalOptions?: NormalizedSignedUrlsOptions
  value?: boolean | SignedUrlsOptions
}): NormalizedSignedUrlsOptions | undefined => {
  if (!value) {
    return undefined
  }

  if (value === true) {
    return globalOptions ?? { expiresIn: DEFAULT_EXPIRES_IN }
  }

  const expiresIn = toExpiresResolver(value.expiresIn, globalOptions?.expiresIn ?? DEFAULT_EXPIRES_IN)

  return {
    allowedCountries: value.allowedCountries ?? globalOptions?.allowedCountries,
    blockedCountries: value.blockedCountries ?? globalOptions?.blockedCountries,
    expiresIn,
    redirect: normalizeRedirectOptions({
      expiresIn,
      globalOptions: globalOptions?.redirect,
      value: value.staticHandler?.redirect,
    }),
    shouldUseSignedUrl: value.shouldUseSignedUrl ?? globalOptions?.shouldUseSignedUrl,
    userIp: value.userIp ?? globalOptions?.userIp,
  }
}

const NO_URL_TRANSFORM = { appendTimestamp: false, queryParams: {} }

const normalizeThumbnailOptions = ({
  globalOptions,
  value,
}: {
  globalOptions?: NormalizedThumbnailOptions
  value?: boolean | ThumbnailOptions
}): NormalizedThumbnailOptions | undefined => {
  if (!value) {
    return undefined
  }

  const options = value === true ? {} : value
  const urlTransform =
    options.urlTransform === undefined || options.urlTransform === true
      ? (globalOptions ?? normalizeUrlTransformOptions({ defaults: OPTIONS_DEFAULTS.thumbnail, value: true }))
      : normalizeUrlTransformOptions({
          defaults: OPTIONS_DEFAULTS.thumbnail,
          globalOptions,
          value: options.urlTransform,
        })

  return {
    ...(urlTransform ?? NO_URL_TRANSFORM),
    sizeName: 'sizeName' in options ? options.sizeName : globalOptions?.sizeName,
    streamAnimated:
      options.streamAnimated ?? globalOptions?.streamAnimated ?? OPTIONS_DEFAULTS.thumbnail.streamAnimated,
  }
}

const normalizeUrlTransformOptions = ({
  defaults = OPTIONS_DEFAULTS.urlTransform,
  globalOptions,
  value,
}: {
  defaults?: { appendTimestamp: boolean; queryParams: Record<string, string> }
  globalOptions?: NormalizedUrlTransformOptions
  value?: UrlTransformOptions
}): NormalizedUrlTransformOptions | undefined => {
  if (!value) {
    return undefined
  }

  if (value === true) {
    return { appendTimestamp: defaults.appendTimestamp, queryParams: defaults.queryParams }
  }

  if (typeof value === 'function') {
    return { ...NO_URL_TRANSFORM, transformUrl: value }
  }

  const inherited = globalOptions?.transformUrl ? undefined : globalOptions

  return {
    appendTimestamp: value.appendTimestamp ?? inherited?.appendTimestamp ?? defaults.appendTimestamp,
    queryParams: value.queryParams ?? inherited?.queryParams ?? defaults.queryParams,
  }
}

const normalizeCollectionsOptions = ({
  collections,
  globalOptions,
}: {
  collections: CollectionsOptions
  globalOptions: NormalizedBunnyStorageOptions
}): Map<string, NormalizedCollectionOptions> => {
  const map = new Map<string, NormalizedCollectionOptions>()

  for (const [slug, collectionOptions] of Object.entries(collections)) {
    if (collectionOptions) {
      map.set(slug, normalizeCollectionOptions({ collectionOptions, globalOptions }))
    }
  }

  return map
}

const normalizeCollectionOptions = ({
  collectionOptions,
  globalOptions,
}: {
  collectionOptions: BunnyStorageCollectionOptions | true
  globalOptions: NormalizedBunnyStorageOptions
}): NormalizedCollectionOptions => {
  if (collectionOptions === true) {
    return {
      disablePayloadAccessControl: false,
      hasGenerateFileURL: false,
      prefix: '',
      purge: globalOptions.purge,
      signedUrls: globalOptions.signedUrls,
      storage: globalOptions.storage,
      stream: globalOptions.stream,
      thumbnail: globalOptions.thumbnail,
      urlTransform: globalOptions.urlTransform,
    }
  }

  const storage = resolveCollectionStorageOptions({
    collectionOverride: collectionOptions.storage,
    globalValue: globalOptions.storage,
  })

  return {
    disablePayloadAccessControl: collectionOptions.disablePayloadAccessControl ?? false,
    hasGenerateFileURL: typeof collectionOptions.generateFileURL === 'function',
    prefix: collectionOptions.prefix ?? '',
    purge: resolveCollectionOption(collectionOptions.purge, globalOptions.purge, (value) =>
      normalizePurgeOptions({ accountApiKey: globalOptions.accountApiKey, globalOptions: globalOptions.purge, value }),
    ),
    signedUrls: resolveCollectionOption(collectionOptions.signedUrls, globalOptions.signedUrls, (value) =>
      normalizeSignedUrlsOptions({ globalOptions: globalOptions.signedUrls, value }),
    ),
    storage,
    stream: resolveCollectionStreamOptions({
      collectionOverride: collectionOptions.stream,
      globalValue: globalOptions.stream,
    }),
    thumbnail: resolveCollectionOption(collectionOptions.thumbnail, globalOptions.thumbnail, (value) =>
      normalizeThumbnailOptions({ globalOptions: globalOptions.thumbnail, value }),
    ),
    urlTransform: resolveCollectionOption(collectionOptions.urlTransform, globalOptions.urlTransform, (value) =>
      normalizeUrlTransformOptions({ globalOptions: globalOptions.urlTransform, value }),
    ),
  }
}

const resolveCollectionClientUploadsOptions = ({
  collectionOverride,
  globalValue,
}: {
  collectionOverride: boolean | ClientUploadsOptions | undefined
  globalValue: NormalizedClientUploadsOptions | undefined
}): NormalizedClientUploadsOptions | undefined => {
  if (collectionOverride === false) {
    return undefined
  }

  if (collectionOverride === undefined) {
    return globalValue
  }

  if (collectionOverride === true) {
    return globalValue ?? normalizeClientUploadsOptions({ value: true })
  }

  if (!globalValue) {
    return normalizeClientUploadsOptions({ value: collectionOverride })
  }

  const merged = mergeDefined(globalValue, {
    access: collectionOverride.access,
    prefix: collectionOverride.prefix,
  })

  if (collectionOverride.edge !== undefined) {
    merged.edge = {
      maxSize:
        collectionOverride.edge.maxSize ?? globalValue.edge?.maxSize ?? OPTIONS_DEFAULTS.clientUploads.edge.maxSize,
      scriptUrl: trimTrailingSlashes(collectionOverride.edge.scriptUrl),
      secret: collectionOverride.edge.secret,
    }
  }

  return merged
}

const resolveCollectionStorageOptions = ({
  collectionOverride,
  globalValue,
}: {
  collectionOverride: BunnyStorageCollectionOptions['storage']
  globalValue: NormalizedStorageOptions | undefined
}): NormalizedStorageOptions | undefined => {
  if (collectionOverride === false) {
    return undefined
  }

  if (collectionOverride && 'apiKey' in collectionOverride) {
    return normalizeStorageOptions(collectionOverride)
  }

  if (!globalValue) {
    return undefined
  }

  if (!collectionOverride) {
    return globalValue
  }

  const merged = mergeDefined(globalValue, { uploadTimeout: collectionOverride.uploadTimeout })
  merged.clientUploads = resolveCollectionClientUploadsOptions({
    collectionOverride: collectionOverride.clientUploads,
    globalValue: globalValue.clientUploads,
  })

  return merged
}

const resolveCollectionStreamOptions = ({
  collectionOverride,
  globalValue,
}: {
  collectionOverride: BunnyStorageCollectionOptions['stream']
  globalValue: NormalizedStreamOptions | undefined
}): NormalizedStreamOptions | undefined => {
  if (collectionOverride === false) {
    return undefined
  }

  if (collectionOverride && 'apiKey' in collectionOverride) {
    return normalizeStreamOptions(collectionOverride)
  }

  if (!globalValue) {
    return undefined
  }

  if (!collectionOverride) {
    return globalValue
  }

  const streamOptions = mergeDefined(globalValue, {
    mimeTypes: collectionOverride.mimeTypes,
    mp4Fallback: collectionOverride.mp4Fallback,
    thumbnailTime: collectionOverride.thumbnailTime,
    uploadTimeout: collectionOverride.uploadTimeout,
  })

  const tus = collectionOverride.tus
  if (tus === false) {
    streamOptions.tus = undefined
  } else if (tus) {
    const base = streamOptions.tus ?? { ...OPTIONS_DEFAULTS.stream.tus }
    streamOptions.tus = tus === true ? base : mergeDefined(base, { autoMode: tus.autoMode, expiresIn: tus.expiresIn })
  }

  return streamOptions
}

const resolveCollectionOption = <T, R>(
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
