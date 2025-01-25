import type { CollectionOptions } from '@payloadcms/plugin-cloud-storage/types'
import type { Plugin, UploadCollectionSlug } from 'payload'

export type AdminThumbnailOptions = {
  appendTimestamp?: boolean
  queryParams?: Record<string, string>
}

export type BunnyAdapterOptions = {
  adminThumbnail?: AdminThumbnailOptions | boolean
  storage: {
    apiKey: string
    hostname: string
    region?: 'br' | 'jh' | 'la' | 'ny' | 'se' | 'sg' | 'syd' | 'uk' | ({} & string)
    zoneName: string
  }
  stream?: {
    apiKey: string
    hostname: string
    libraryId: string
    mp4FallbackQuality?: '240p' | '360p' | '480p' | '720p'
    thumbnailTime?: number
  }
}

export type BunnyPlugin = (bunnyStorageOptions: BunnyStorageOptions) => Plugin

export type BunnyStorageOptions = {
  collections: Partial<Record<UploadCollectionSlug, Omit<CollectionOptions, 'adapter'> | true>>
  enabled?: boolean
  options: BunnyAdapterOptions
}
