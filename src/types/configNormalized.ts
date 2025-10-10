import type { TaskConfig } from 'payload'

import type {
  BunnyStorageConfig,
  MediaPreviewConfig,
  SignedUrlsConfig,
  StorageConfig,
  StreamConfig,
  StreamTusConfig,
  UrlTransformFunction,
} from './config.js'

export type NormalizedStorageConfig = {
  uploadTimeout: number
} & StorageConfig

export type NormalizedMediaPreviewConfig = MediaPreviewConfig

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

export type NormalizedThumbnailConfig = {
  sizeName?: string
  streamAnimated: boolean
} & NormalizedUrlTransformConfig

export type NormalizedPurgeConfig = {
  async: boolean
}

export interface NormalizedCollectionConfig {
  disablePayloadAccessControl: boolean
  mediaPreview?: NormalizedMediaPreviewConfig
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
  apiKey?: string
  collections: Map<string, NormalizedCollectionConfig>
  mediaPreview?: NormalizedMediaPreviewConfig
  purge?: NormalizedPurgeConfig
  signedUrls?: NormalizedSignedUrlsConfig
  storage?: NormalizedStorageConfig
  stream?: NormalizedStreamConfig
  thumbnail?: NormalizedThumbnailConfig
  urlTransform?: NormalizedUrlTransformConfig
}
