import type { CollectionOptions } from '@payloadcms/plugin-cloud-storage/types'
import type { AcceptedLanguages } from '@payloadcms/translations'
import type { CollectionConfig, PayloadRequest, Plugin, TaskConfig, UploadCollectionSlug } from 'payload'

export type UrlTransformFunction = (args: {
  /** Base URL */
  baseUrl: string
  /** Collection configuration */
  collection: CollectionConfig
  /** Document data (for streams contains bunnyVideoId) */
  data?: Record<string, unknown>
  /** Base filename */
  filename: string
  /** File prefix/path */
  prefix?: string
}) => string

export type UrlTransformConfig =
  | {
    /**
     * Append timestamp to the URL
     * @default false (true for admin thumbnails)
     */
    appendTimestamp?: boolean
    /**
     * Static query parameters to append to the URL
     * Works together with appendTimestamp
     */
    queryParams?: Record<string, string>
    transformUrl?: never
  }
  | {
    /**
     * Custom transform function for complete URL control
     */
    transformUrl: UrlTransformFunction
  }

export type AdminThumbnailConfig = {
  /**
   * Use a specific size from upload collection's sizes instead of original file
   * Only works for image uploads that have sizes configured
   */
  sizeName?: string
} & UrlTransformConfig

export type PurgeConfig = {
  /** Bunny API key for CDN cache purging operations */
  apiKey: string
  /**
   * Wait for purge to complete before continuing
   * @default false
   */
  async?: boolean
}

export type StorageConfig = {
  /** Bunny Storage API key */
  apiKey: string
  /** CDN domain from your Pull Zone (e.g., 'example.b-cdn.net') */
  hostname: string
  /** Storage region code (optional, defaults to primary region) */
  region?: 'br' | 'jh' | 'la' | 'ny' | 'se' | 'sg' | 'syd' | 'uk' | ({} & string)
  /** Security key for signing storage URLs. Used to generate signed URLs for secure file access */
  tokenSecurityKey?: string
  /**
   * Upload timeout in milliseconds
   * @default 120000
   */
  uploadTimeout?: number
  /** Storage zone name from your Bunny Storage settings */
  zoneName: string
}

export type StreamTusConfig = {
  /**
   * Automatically enable TUS mode when file MIME type is supported.
   * When enabled, hides the toggle button for switching between standard and TUS upload modes.
   * @default true
   */
  autoMode?: boolean
  /**
     * Custom authorization check for TUS API endpoints.
     *
     * By default, checks if user has admin access and create access to at least one collection
     * configured in the plugin.
     */
  checkAccess?: (req: PayloadRequest) => boolean | Promise<boolean>
  /**
     * Video and audio file types allowed for TUS uploads. Defaults include:
     * - video/mp4 (mp4, m4p, m4v)
     * - video/x-matroska (mkv)
     * - video/webm (webm)
     * - video/x-flv (flv)
     * - video/x-ms-vod (vod)
     * - video/x-msvideo (avi)
     * - video/quicktime (mov)
     * - video/x-ms-wmv (wmv)
     * - video/x-amv (amv)
     * - video/mpeg (mpeg, mpg)
     * - video/4mv (4mv)
     * - video/mp2t (ts)
     * - video/mxf (mxf)
     * - audio/mpeg (mp3)
     * - audio/ogg (ogg)
     * - audio/wav (wav)
     *
     * Collection mimeTypes settings override these TUS settings.
     * If you allow a format here but block it in your collection config,
     * the collection setting wins.
     */
  mimeTypes?: string[]
  /**
     * Time in seconds for TUS upload session to expire
     * @default 3600
     */
  uploadTimeout?: number
}

export type StreamConfig = {
  /** Bunny Stream API key */
  apiKey: string
  /**
   * Automatic cleanup of incomplete uploads that failed or were abandoned
   */
  cleanup?: {
    /**
     * Time in seconds after which incomplete uploads are considered dead
     * @default 86400
     */
    maxAge?: number
    /**
     * Cron schedule configuration for cleanup task
     * @default { cron: '0 2 * * *', queue: 'storage-bunny' }
     */
    schedule?: Exclude<TaskConfig['schedule'], undefined>[0]
  } | boolean
  /** Stream CDN domain (e.g., 'vz-example-123.b-cdn.net') */
  hostname: string
  /** Video library ID from your Bunny Stream settings */
  libraryId: number
  /**
   * Enable MP4 downloads (required when using Payload access control, unless signed URLs with redirect are enabled)
   * @default false
   */
  mp4Fallback?: boolean
  /**
   * Default thumbnail time in ms for all collections. Can be overridden per collection
   */
  thumbnailTime?: number
  /** Security key for signing stream URLs. Used to generate signed URLs for secure video access */
  tokenSecurityKey?: string
  /** Enable TUS resumable uploads for large video files */
  tus?: boolean | StreamTusConfig
  /**
   * Upload timeout in milliseconds
   * @default 300000
   */
  uploadTimeout?: number
}

export type StaticHandlerConfig = {
  /**
   * Link expiration time in seconds for redirect URLs
   * If not specified, uses the main expiresIn value from SignedUrlsConfig
   *
   * Useful for setting shorter expiration for redirects vs direct signed URLs
   */
  expiresIn?: number
  /**
   * HTTP status code for redirects
   * @default 302
   */
  redirectStatus?: 301 | 302 | 307 | 308
  /**
   * Redirect to signed URL instead of proxying content through Payload
   *
   * When enabled, static handler responds with HTTP redirect instead of streaming content.
   * Only works when enablePayloadAccessControl is true.
   *
   * @default false
   */
  useRedirect?: boolean
}

export type SignedUrlsConfig = {
  /** Allowed countries (ISO 3166-1 alpha-2 codes). Only requests from these countries will be allowed */
  allowedCountries?: string[]
  /** Blocked countries (ISO 3166-1 alpha-2 codes). Requests from these countries will be rejected */
  blockedCountries?: string[]
  /**
   * Link expiration time in seconds
   * @default 7200
   */
  expiresIn?: number
  /** Custom function to determine if a file should use signed URLs */
  shouldUseSignedUrl?(args: {
    collection: CollectionConfig
    filename: string
  }): boolean
  /**
   * Static handler behavior when Payload access control is enabled
   * Has no effect when disablePayloadAccessControl is true
   */
  staticHandler?: StaticHandlerConfig
}

export type BunnyStorageCollectionConfig = {
  /** Override global admin thumbnail config for this collection */
  adminThumbnail?: AdminThumbnailConfig | boolean
  /** Override global signed URLs config for this collection */
  signedUrls?: boolean | SignedUrlsConfig
  /** Stream settings for this collection */
  stream?: {
    /** Override default thumbnail time in milliseconds */
    thumbnailTime?: number
  }
  /**
   * Override global URL transformation config for this collection
   * @note Does not work when `disablePayloadAccessControl` is true
   */
  urlTransform?: UrlTransformConfig
} & Omit<CollectionOptions, 'adapter'>

/** Configuration for which collections use Bunny Storage */
export type CollectionsConfig = Partial<
  Record<
    UploadCollectionSlug,
    | BunnyStorageCollectionConfig
    | true
  >
>

export type BunnyStorageConfig = {
  /** Global admin thumbnail settings for all collections */
  adminThumbnail?: AdminThumbnailConfig | boolean
  /** Which collections should use Bunny Storage */
  collections: CollectionsConfig
  /**
   * Enable or disable the plugin
   * @default true
   */
  enabled?: boolean
  /** Experimental features that may change in future versions */
  experimental?: Record<string, never>
  /** Internationalization settings for UI elements */
  i18n?: {
    translations: {
      [key in AcceptedLanguages]?: {
        tusUploadDisableMode?: string
        tusUploadEnableMode?: string
      }
    }
  }
  /** CDN cache purging configuration */
  purge?: PurgeConfig
  /** Global signed URLs config (can be overridden per collection) */
  signedUrls?: boolean | SignedUrlsConfig
  /** Bunny Storage configuration */
  storage: StorageConfig
  /** Bunny Stream configuration */
  stream?: StreamConfig
  /**
   * Global URL transformation config for all collections (can be overridden per collection)
   * @note Does not work when `disablePayloadAccessControl` is true for the collection
   */
  urlTransform?: UrlTransformConfig
}

export type BunnyStoragePlugin = (pluginConfig: BunnyStorageConfig) => Plugin
