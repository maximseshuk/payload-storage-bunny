import type { CollectionConfig } from 'payload'

import type {
  NormalizedPurgeConfig,
  NormalizedSignedUrlsConfig,
  NormalizedStorageConfig,
  NormalizedStreamConfig,
  NormalizedThumbnailConfig,
  NormalizedUrlTransformConfig,
} from './configNormalized.js'

export type CollectionContext = {
  accountApiKey?: string
  collection: CollectionConfig
  isTusUploadSupported: boolean
  prefix?: string
  purgeConfig?: NormalizedPurgeConfig
  signedUrls?: NormalizedSignedUrlsConfig
  storageConfig?: NormalizedStorageConfig
  streamConfig?: NormalizedStreamConfig
  thumbnail?: NormalizedThumbnailConfig
  urlTransform?: NormalizedUrlTransformConfig
  usePayloadAccessControl: boolean
}

export type StreamTusAuthRequest = {
  collection: string
  filename: string
  filesize: number
  filetype: string
  head?: string
  thumbnailTime?: number
  title?: string
  videoId?: string
  videoToken?: string
}

export type StreamClientUploadContext = {
  head: string
  signedReceipt: string
  videoId: string
  videoToken: string
}

type StreamTusAuthBase = {
  clientUploadContext?: StreamClientUploadContext
  libraryId: number
  thumbnailTime?: number
  videoId: string
  videoToken: string
}

type StreamTusAuthUpload = {
  authorizationExpire: number
  authorizationSignature: string
  type: 'upload'
} & StreamTusAuthBase

type StreamTusAuthUploaded = {
  title: string
  type: 'uploaded'
} & StreamTusAuthBase

export type StreamTusAuthResponse = StreamTusAuthUpload | StreamTusAuthUploaded

export type BunnyClientUploadExtra = {
  streamMimeTypes?: string[]
}

export type BunnyStreamData = {
  libraryId: number
  resolutions?: {
    available?: string[]
    highest?: string
  }
  videoId: string
}

export type BunnyData = {
  stream: BunnyStreamData
  type: 'stream'
}

export type BunnyDataInternal = {
  stream?: {
    resolutions?: {
      available?: string[]
      highest?: string
    }
    videoId: string
  }
}
