import type { CollectionConfig } from 'payload'

import type {
  NormalizedClientUploadsConfig,
  NormalizedPurgeConfig,
  NormalizedSignedUrlsConfig,
  NormalizedStorageConfig,
  NormalizedStreamConfig,
  NormalizedThumbnailConfig,
  NormalizedUrlTransformConfig,
} from './configNormalized.js'

export type CollectionContext = {
  apiKey?: string
  clientUploads?: NormalizedClientUploadsConfig
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
  thumbnailTime?: number
  title?: string
  videoId?: string
}

type StreamTusAuthBase = {
  libraryId: number
  thumbnailTime?: number
  videoId: string
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
