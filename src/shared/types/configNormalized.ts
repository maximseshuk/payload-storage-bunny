import type { TaskConfig } from 'payload'

import type {
  BunnyStorageConfig,
  ClientUploadsAccess,
  ClientUploadsPrefix,
  SignedUrlsConfig,
  StorageS3Config,
  StreamConfig,
  StreamTusConfig,
  UrlTransformFunction,
} from './config.js'

export type NormalizedClientUploadsConfig = {
  access?: ClientUploadsAccess
  edge?: {
    maxSize: number
    scriptUrl: string
    secret: string
  }
  prefix?: ClientUploadsPrefix
}

export type NormalizedStorageConfig = {
  apiKey: string
  clientUploads?: NormalizedClientUploadsConfig
  hostname: string
  region?: 'br' | 'jh' | 'la' | 'ny' | 'se' | 'sg' | 'syd' | 'uk' | ({} & string)
  s3?: StorageS3Config
  tokenSecurityKey?: string
  uploadTimeout: number
  zoneName: string
}

export type NormalizedStreamConfig = {
  cleanup?: {
    maxAge: number
    schedule: Exclude<TaskConfig['schedule'], undefined>[0]
  }
  mimeTypes: string[]
  mp4Fallback: boolean
  tus?: {
    autoMode: boolean
    expiresIn: number
  } & StreamTusConfig
  uploadTimeout: number
} & Omit<StreamConfig, 'cleanup' | 'mimeTypes' | 'mp4Fallback' | 'tus' | 'uploadTimeout'>

export type NormalizedSignedUrlsConfig = {
  expiresIn: number
  staticHandler?: {
    expiresIn?: number
    redirectStatus: 301 | 302 | 307 | 308
    useRedirect: boolean
  }
} & Omit<SignedUrlsConfig, 'expiresIn' | 'staticHandler'>

export type NormalizedUrlTransformConfig = {
  appendTimestamp: boolean
  queryParams: Record<string, string>
  transformUrl?: UrlTransformFunction
}

export type NormalizedThumbnailConfig = {
  sizeName?: string
  streamAnimated: boolean
} & NormalizedUrlTransformConfig

export type NormalizedPurgeConfig = {
  async: boolean
}

export interface NormalizedCollectionConfig {
  disablePayloadAccessControl: boolean
  prefix: string
  purge?: NormalizedPurgeConfig
  signedUrls?: NormalizedSignedUrlsConfig
  storage?: NormalizedStorageConfig
  stream?: NormalizedStreamConfig
  thumbnail?: NormalizedThumbnailConfig
  urlTransform?: NormalizedUrlTransformConfig
}

export interface NormalizedBunnyStorageConfig extends Pick<BunnyStorageConfig, 'i18n'> {
  _original: BunnyStorageConfig
  accountApiKey?: string
  collections: Map<string, NormalizedCollectionConfig>
  purge?: NormalizedPurgeConfig
  signedUrls?: NormalizedSignedUrlsConfig
  storage?: NormalizedStorageConfig
  stream?: NormalizedStreamConfig
  thumbnail?: NormalizedThumbnailConfig
  urlTransform?: NormalizedUrlTransformConfig
}
