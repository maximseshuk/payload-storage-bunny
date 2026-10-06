import type { TaskConfig } from 'payload'

import type {
  BunnyStorageOptions,
  ClientUploadsAccess,
  ClientUploadsPrefix,
  SignedUrlsCallbackArgs,
  SignedUrlsOptions,
  StorageRegion,
  StreamOptions,
  StreamTusOptions,
  UrlTransformFunction,
} from './options.js'

export type NormalizedClientUploadsOptions = {
  access?: ClientUploadsAccess
  edge?: {
    maxSize: number
    scriptUrl: string
    secret: string
  }
  prefix?: ClientUploadsPrefix
}

export type NormalizedStorageOptions = {
  apiKey: string
  clientUploads?: NormalizedClientUploadsOptions
  hostname: string
  region: StorageRegion
  s3: boolean
  tokenSecurityKey?: string
  uploadTimeout: number
  zoneName: string
}

export type NormalizedStreamOptions = {
  cleanup?: {
    maxAge: number
    schedule: Exclude<TaskConfig['schedule'], undefined>[0]
  }
  mimeTypes: string[]
  mp4Fallback: boolean
  tus?: {
    autoMode: boolean
    expiresIn: number
  } & StreamTusOptions
  uploadTimeout: number
} & Omit<StreamOptions, 'cleanup' | 'mimeTypes' | 'mp4Fallback' | 'tus' | 'uploadTimeout'>

export type ExpiresResolver = (args: SignedUrlsCallbackArgs) => Date | number

export type NormalizedSignedUrlsOptions = {
  expiresIn: ExpiresResolver
  redirect?: {
    expiresIn?: ExpiresResolver
    status: 302 | 307
  }
} & Pick<SignedUrlsOptions, 'allowedCountries' | 'blockedCountries' | 'shouldUseSignedUrl' | 'userIp'>

export type NormalizedUrlTransformOptions = {
  appendTimestamp: boolean
  queryParams: Record<string, string>
  transformUrl?: UrlTransformFunction
}

export type NormalizedThumbnailOptions = {
  sizeName?: string
  streamAnimated: boolean
} & NormalizedUrlTransformOptions

export type NormalizedPurgeOptions = {
  async: boolean
}

export interface NormalizedCollectionOptions {
  disablePayloadAccessControl: boolean
  hasGenerateFileURL: boolean
  prefix: string
  purge?: NormalizedPurgeOptions
  signedUrls?: NormalizedSignedUrlsOptions
  storage?: NormalizedStorageOptions
  stream?: NormalizedStreamOptions
  thumbnail?: NormalizedThumbnailOptions
  urlTransform?: NormalizedUrlTransformOptions
}

export interface NormalizedBunnyStorageOptions {
  _original: BunnyStorageOptions
  accountApiKey?: string
  collections: Map<string, NormalizedCollectionOptions>
  purge?: NormalizedPurgeOptions
  signedUrls?: NormalizedSignedUrlsOptions
  storage?: NormalizedStorageOptions
  stream?: NormalizedStreamOptions
  thumbnail?: NormalizedThumbnailOptions
  urlTransform?: NormalizedUrlTransformOptions
}
