import type { TaskConfig } from 'payload'

import type {
  BunnyStorageCollectionConfig,
  BunnyStorageConfig,
  PurgeConfig,
  SignedUrlsConfig,
  StorageConfig,
  StreamConfig,
  StreamTusConfig,
  UrlTransformFunction,
} from './config.js'

export type NormalizedStorageConfig = {
  uploadTimeout: number
} & StorageConfig

export type NormalizedStreamConfig = {
  cleanup?: {
    maxAge: number
    schedule: Exclude<TaskConfig['schedule'], undefined>[0]
  }
  mp4Fallback: boolean
  tus?: {
    autoMode: boolean
    mimeTypes: string[]
    uploadTimeout: number
  } & StreamTusConfig
  uploadTimeout: number
} & Omit<StreamConfig, 'cleanup' | 'mp4Fallback' | 'tus' | 'uploadTimeout'>

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

export type NormalizedAdminThumbnailConfig = {
  sizeName?: string
} & NormalizedUrlTransformConfig

export type NormalizedPurgeConfig = {
  async: boolean
} & PurgeConfig

export interface NormalizedCollectionConfig extends Pick<BunnyStorageCollectionConfig, 'stream'> {
  adminThumbnail: false | NormalizedAdminThumbnailConfig
  disablePayloadAccessControl: boolean
  prefix: string
  signedUrls: false | NormalizedSignedUrlsConfig
  urlTransform: false | NormalizedUrlTransformConfig
}

export interface NormalizedBunnyStorageConfig extends Pick<BunnyStorageConfig, 'i18n'> {
  _original: BunnyStorageConfig
  adminThumbnail: false | NormalizedAdminThumbnailConfig
  collections: Map<string, NormalizedCollectionConfig>
  purge?: NormalizedPurgeConfig
  signedUrls: false | NormalizedSignedUrlsConfig
  storage: NormalizedStorageConfig
  stream?: NormalizedStreamConfig
  urlTransform: false | NormalizedUrlTransformConfig
}
