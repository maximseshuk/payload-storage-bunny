import type { CollectionOptions } from '@payloadcms/plugin-cloud-storage/types'
import type { Plugin, UploadCollectionSlug } from 'payload'

export type AdminThumbnailOptions = {
  appendTimestamp?: boolean
  queryParams?: Record<string, string>
}

export type BunnyAdapterOptions = {
  adminThumbnail?: AdminThumbnailOptions | boolean
  purge?: {
    apiKey: string
    async?: boolean
    enabled: boolean
  }
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
    mp4Fallback?: {
      enabled: boolean
    }
    /**
     * @deprecated Use mp4Fallback with enabled: true instead.
     *
     * Example: mp4Fallback: { enabled: true }
     */
    mp4FallbackQuality?: '240p' | '360p' | '480p' | '720p'
    thumbnailTime?: number
  }
}

export type BunnyPlugin = (bunnyStorageOptions: BunnyStorageOptions) => Plugin

export type BunnyStorageOptions = {
  collections: Partial<Record<UploadCollectionSlug, Omit<CollectionOptions, 'adapter'> | true>>
  enabled?: boolean
  experimental?: {
    /**
       * Temporary workaround for Payload CMS issue where updating collection fields
       * (like alt text) causes unnecessary file re-download and overwrite operations.
       *
       * When enabled, replaces the save button component to prevent files from being
       * physically rewritten when only collection fields are being modified.
       *
       * @see https://github.com/payloadcms/payload/issues/13182
       * @deprecated Will be removed when upstream issue is resolved
       */
    replaceSaveButtonComponent?: boolean
  }
  options: BunnyAdapterOptions
}

export interface BunnyVideoMeta {
  availableMp4Resolutions?: string[]
  highestMp4Resolution?: string
}

export interface BunnyResolutionsResponse {
  data: {
    mp4Resolutions: Array<{
      path: string
      resolution: string
    }>
  }
  success: boolean
}
