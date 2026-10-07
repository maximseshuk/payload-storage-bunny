import type { CollectionConfig } from 'payload'

import type {
  NormalizedPurgeOptions,
  NormalizedSignedUrlsOptions,
  NormalizedStorageOptions,
  NormalizedStreamOptions,
  NormalizedThumbnailOptions,
  NormalizedUrlTransformOptions,
} from './optionsNormalized.js'

export type CollectionContext = {
  accountApiKey?: string
  collection: CollectionConfig
  hasGenerateFileURL: boolean
  isTusUploadSupported: boolean
  prefix?: string
  purgeOptions?: NormalizedPurgeOptions
  signedUrls?: NormalizedSignedUrlsOptions
  storageOptions?: NormalizedStorageOptions
  streamOptions?: NormalizedStreamOptions
  thumbnail?: NormalizedThumbnailOptions
  urlTransform?: NormalizedUrlTransformOptions
  usePayloadAccessControl: boolean
}

export type StreamTusAuthRequest = {
  collection: string
  filename: string
  filesize: number
  filetype: string
  renew?: boolean
  thumbnailTime?: number
  title?: string
  videoId?: string
  videoToken?: string
}

type StreamTusAuthBase = {
  libraryId: number
  videoId: string
  videoToken: string
}

type StreamTusAuthUpload = {
  expiresIn: number
  headers: Record<string, string>
  type: 'upload'
  uploadUrl: string
} & StreamTusAuthBase

type StreamTusAuthUploaded = {
  title: string
  type: 'uploaded'
} & StreamTusAuthBase

export type StreamTusAuthResponse = StreamTusAuthUpload | StreamTusAuthUploaded

export type StreamTusUploadData = {
  errorMessage: string
  expiresIn: number
  headers: Record<string, string>
  uploadUrl: string
  videoId: string
  videoToken: string
}

export type StreamVideoState = 'failed' | 'processing' | 'ready'

export type StreamStatusResponse = {
  resolutions?: BunnyStreamData['resolutions']
  state: StreamVideoState
}

export type BunnyStreamData = {
  libraryId: number
  resolutions?: {
    available?: string[]
    highest?: string
  }
  status?: null | StreamVideoState
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
