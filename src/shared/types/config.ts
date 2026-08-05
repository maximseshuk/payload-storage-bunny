import type { CollectionOptions } from '@payloadcms/plugin-cloud-storage/types'
import type { AcceptedLanguages } from '@payloadcms/translations'
import type { CollectionConfig, PayloadRequest, Plugin, TaskConfig, UploadCollectionSlug } from 'payload'

import type { StreamTusAuthRequest } from './core.js'

export type UrlTransformFunction = (args: {
  /** Base URL */
  baseUrl: string
  /** Collection configuration */
  collection: CollectionConfig
  /** Document data (for streams contains bunnyData.stream.videoId) */
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

export type ThumbnailConfig = {
  /**
   * Use a specific size from upload collection's sizes instead of original file
   * Only works for image uploads that have sizes configured
   */
  sizeName?: string
  /**
   * Enable animated preview (WebP) instead of static thumbnail for Bunny Stream videos.
   * When enabled, uses preview.webp instead of thumbnail.jpg for video thumbnails.
   * Only works when stream configuration is enabled for the collection.
   * @default false
   */
  streamAnimated?: boolean
} & UrlTransformConfig

export type PurgeConfig = {
  /**
   * Run the purge asynchronously and return before it finishes.
   * @default false (wait for completion)
   */
  async?: boolean
}

export type StorageS3Config = {
  /**
   * S3 region code of your storage zone — the region the zone was created in.
   * The endpoint becomes `https://{region}-s3.storage.bunnycdn.com`.
   * @example 'de'
   */
  region: 'de' | 'jh' | 'la' | 'ny' | 'se' | 'sg' | 'syd' | 'uk' | ({} & string)
}

type StorageBaseConfig = {
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

/**
 * Storage zone using S3-compatible transport.
 *
 * The zone must have been created with S3 compatibility enabled — it cannot be
 * turned on for an existing zone. When set, the plugin uploads and deletes files
 * through Bunny's S3 endpoint (SigV4) instead of the HTTP Storage API.
 *
 * Credentials are reused from this config: the S3 access key is `zoneName` and the
 * secret is `apiKey` (your storage zone password). No extra secrets are needed.
 *
 * With S3 enabled, browser-direct uploads presign the S3 endpoint directly, so no
 * Edge Script is involved and `clientUploads.edge` is not applicable.
 */
export type S3StorageConfig = StorageBaseConfig & {
  /**
   * Enable browser-direct uploads that bypass the Payload server for the file bytes,
   * removing serverless body-size limits (e.g. Vercel's ~4.5 MB). Can be overridden per collection.
   * Set to true to enable with defaults. Uses presigned S3 uploads.
   */
  clientUploads?: boolean | { access?: ClientUploadsAccess; prefix?: ClientUploadsPrefix }
  /** Enable S3-compatible access for this storage zone. */
  s3: StorageS3Config
}

/**
 * Storage zone using Bunny's HTTP Storage API (no S3).
 *
 * Browser-direct uploads for this zone go through a deployed Edge Script, so
 * `clientUploads.edge` is required whenever `clientUploads` is enabled.
 */
export type HttpStorageConfig = StorageBaseConfig & {
  /**
   * Enable browser-direct uploads that bypass the Payload server for the file bytes,
   * removing serverless body-size limits (e.g. Vercel's ~4.5 MB). Can be overridden per collection.
   * Requires `edge` (Edge Script proxy) because the zone is not S3-enabled.
   */
  clientUploads?: { access?: ClientUploadsAccess; edge: ClientUploadsEdgeConfig; prefix?: ClientUploadsPrefix }
  s3?: never
}

export type StorageConfig = HttpStorageConfig | S3StorageConfig

export type ClientUploadsAccess = (args: { collectionSlug: string; req: PayloadRequest }) => boolean | Promise<boolean>

export type ClientUploadsPrefix = (args: { collectionSlug: string; req: PayloadRequest }) => Promise<string> | string

export type ClientUploadsEdgeConfig = {
  /**
   * Max accepted file size in bytes. Also enforced by the Edge Script.
   * @default 1073741824 (1 GiB)
   */
  maxSize?: number
  /**
   * Deployed Edge Script URL, e.g. 'https://my-uploader.b-cdn.net'.
   * Printed by the `bunny:deploy-edge-script` command.
   */
  scriptUrl: string
  /** Shared HMAC secret. Must match the script's SHARED_SECRET secret. */
  secret: string
}

export type ClientUploadsConfig = {
  /**
   * Determines who may request an upload URL.
   * @default any authenticated user
   */
  access?: ClientUploadsAccess
  /**
   * Edge Script proxy settings. Required for edge transport, i.e. when `storage.s3`
   * is not set (ignored when `storage.s3` is set).
   */
  edge?: ClientUploadsEdgeConfig
  /**
   * Resolve the storage path prefix at mint time, server-side, before the file is uploaded.
   * Use it for date/user folders, or a tenant segment in multi-tenant apps.
   * @default the collection's static prefix
   */
  prefix?: ClientUploadsPrefix
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
   *
   * Receives the parsed TUS auth request body as a second argument (e.g. to gate on
   * `collection`, `filesize`, or `filename` before creating the upload).
   */
  checkAccess?: (req: PayloadRequest, body: StreamTusAuthRequest) => boolean | Promise<boolean>
  /**
   * Time in seconds for TUS upload session to expire
   * @default 3600
   */
  expiresIn?: number
}

export type StreamConfig = {
  /** Bunny Stream API key */
  apiKey: string
  /**
   * Automatic cleanup of incomplete uploads that failed or were abandoned
   */
  cleanup?:
    | {
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
      }
    | boolean
  /** Stream CDN domain (e.g., 'vz-example-123.b-cdn.net') */
  hostname: string
  /** Video library ID from your Bunny Stream settings */
  libraryId: number
  /**
   * Video and audio file types that should use Bunny Stream. Defaults include:
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
   * Collection mimeTypes settings override these stream settings.
   * If you allow a format here but block it in your collection config,
   * the collection setting wins.
   */
  mimeTypes?: string[]
  /**
   * Enable MP4 downloads (required when using Payload access control, unless signed URLs with redirect are enabled)
   * @default false
   */
  mp4Fallback?: boolean
  /**
   * Referer header sent on server-side requests to Bunny when serving the MP4
   * fallback through Payload access control. Set this only if your Stream library
   * blocks requests without a referrer (BlockNoneReferrer); the value must satisfy
   * the library's allowed referrers. Leave unset for default libraries.
   */
  referer?: string
  /**
   * Default thumbnail time in milliseconds for Bunny Stream videos.
   * Specifies which moment in videos to capture as thumbnail.
   * Can be overridden per collection. Use with thumbnail: true to display thumbnails.
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
  /**
   * Webhook configuration for receiving video status updates from Bunny Stream.
   * When enabled, creates an endpoint at: /api/storage-bunny/stream/webhook
   *
   * Configure this URL in your Bunny Stream library settings.
   */
  webhook?: {
    /**
     * Signing secret used to verify Bunny Stream webhook signatures.
     * This is the library's Read-Only API key: Bunny signs each webhook with the
     * `X-BunnyStream-Signature` header (lowercase hex HMAC-SHA256 of the raw request
     * body keyed by this value), which binds every event to its own stream library.
     */
    secret: string
  }
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
   * Only works when `disablePayloadAccessControl` is false.
   *
   * @default false
   */
  useRedirect?: boolean
}

export type SignedUrlsCallbackArgs = {
  /** Collection configuration */
  collection: CollectionConfig
  /** Filename being signed */
  filename: string
  /**
   * Incoming Payload request, when one is available at signing time.
   * URLs generated outside a request context (for example while purging the CDN cache)
   * are signed without a request.
   */
  req?: PayloadRequest
}

export type SignedUrlsConfig = {
  /** Allowed countries (ISO 3166-1 alpha-2 codes). Only requests from these countries will be allowed */
  allowedCountries?: string[]
  /** Blocked countries (ISO 3166-1 alpha-2 codes). Requests from these countries will be rejected */
  blockedCountries?: string[]
  /**
   * Resolve an absolute expiration time for a signed URL instead of the sliding
   * expiresIn window. Return a Date or a UNIX timestamp in seconds; return a falsy
   * value to fall back to expiresIn. Useful for links that must stop working at a
   * fixed moment, such as the end of a live event.
   */
  expiresAt?(args: SignedUrlsCallbackArgs): Date | number | undefined
  /**
   * Link expiration time in seconds
   * @default 7200
   */
  expiresIn?: number
  /** Custom function to determine if a file should use signed URLs */
  shouldUseSignedUrl?(args: SignedUrlsCallbackArgs): boolean
  /**
   * Static handler behavior when Payload access control is enabled
   * Has no effect when disablePayloadAccessControl is true
   */
  staticHandler?: StaticHandlerConfig
  /**
   * Lock signed URLs to the client's IP address (Bunny token IP validation).
   *
   * Extract the client's IPv4 address from the incoming request — how the real client
   * IP is obtained depends on your host and proxy setup (for example
   * req.headers.get('x-forwarded-for') or a CDN-specific header). Return a falsy value
   * when no IP can be determined; the URL is then signed without an IP lock instead of
   * failing. The IP becomes part of the token hash only and is never added to the URL.
   *
   * Requires the pull zone's Token IP Validation setting (or the stream library's
   * equivalent) to be enabled on Bunny for the lock to be enforced. Only IPv4 is
   * supported by Bunny; enabling Token IP Validation disables IPv6 routing on the
   * pull zone. Values that are not a plain IPv4 address are ignored with a warning.
   *
   * The callback is only invoked for URLs that end up in the client's hands while a
   * request is available: document url fields, admin thumbnails and staticHandler
   * redirects. URLs the server fetches itself (proxied downloads) and URLs generated
   * without a request (cache purging) are never IP-locked.
   */
  userIp?(args: { req: PayloadRequest } & SignedUrlsCallbackArgs): string | undefined
}

/** Partial storage override — merged onto the global storage zone. */
export type CollectionStorageOverride = {
  /**
   * Override global client uploads config for this collection.
   * Set to true to enable browser-direct uploads with defaults for this collection.
   * Set to false to disable browser-direct uploads for this collection.
   */
  clientUploads?: boolean | ClientUploadsConfig
  /**
   * Override upload timeout in milliseconds for this collection
   */
  uploadTimeout?: number
}

/** Partial stream override — merged onto the global stream library. */
export type CollectionStreamOverride = {
  /**
   * Override allowed MIME types for Bunny Stream uploads in this collection.
   * Replaces the global stream.mimeTypes setting for this collection.
   */
  mimeTypes?: string[]
  /**
   * Override MP4 fallback setting for this collection
   */
  mp4Fallback?: boolean
  /**
   * Override default thumbnail time in milliseconds for Bunny Stream videos.
   * Specifies which moment in the video to capture as thumbnail.
   * Use with thumbnail: true to display the thumbnail in admin and API responses.
   */
  thumbnailTime?: number
  /**
   * Override TUS resumable uploads config for this collection.
   * Set to false to disable TUS resumable uploads for this collection.
   */
  tus?:
    | false
    | {
        /**
         * Override automatic TUS mode enablement for this collection.
         * When true, TUS auto-enables for supported video MIME types.
         * When false, user must manually click "Enable tus mode" button.
         */
        autoMode?: boolean
        /**
         * Override TUS upload session expiry in seconds for this collection
         */
        expiresIn?: number
      }
  /**
   * Override upload timeout in milliseconds for this collection
   */
  uploadTimeout?: number
}

/**
 * A complete stream library config for one collection. Replaces the global
 * library entirely — nothing is inherited from the global `stream` config.
 * `cleanup.schedule` is plugin-level and can only be set on the global config;
 * per-collection cleanup controls only `maxAge`.
 */
export type CollectionStreamConfig = {
  /**
   * Automatic cleanup of incomplete uploads that failed or were abandoned
   * for this collection's library. The cleanup task schedule is global-only.
   */
  cleanup?: boolean | { maxAge?: number }
} & Omit<StreamConfig, 'cleanup'>

export type BunnyStorageCollectionConfig = {
  /**
   * Override global CDN cache purging config for this collection.
   * Set to false to disable cache purging for this collection.
   */
  purge?: boolean | Partial<PurgeConfig>
  /** Override global signed URLs config for this collection */
  signedUrls?: boolean | SignedUrlsConfig
  /**
   * Storage settings for this collection.
   * - Pass a full `StorageConfig` (with `apiKey`/`hostname`/`zoneName`) to point this
   *   collection at its OWN storage zone; the global zone is ignored entirely.
   * - Pass a partial override (`uploadTimeout`/`clientUploads`) to tweak the global zone.
   * - Set to false to disable Bunny Storage uploads for this collection.
   */
  storage?: CollectionStorageOverride | false | StorageConfig
  /**
   * Stream settings for this collection.
   * - Pass a full config (with `apiKey`/`hostname`/`libraryId`) to point this collection
   *   at its OWN stream library; the global library is ignored entirely.
   * - Pass a partial override (mimeTypes/mp4Fallback/thumbnailTime/tus/uploadTimeout)
   *   to tweak the global library.
   * - Set to false to disable Bunny Stream uploads for this collection.
   */
  stream?: CollectionStreamConfig | CollectionStreamOverride | false
  /**
   * Enable thumbnail display in admin panel and thumbnailURL field in API responses.
   *
   * For Bunny Stream videos: combines with stream.thumbnailTime to show video thumbnails.
   * For images: can specify sizeName to use a particular image size as thumbnail.
   *
   * The plugin serves this through a hidden `thumbnailURL` field populated on read.
   */
  thumbnail?: boolean | ThumbnailConfig
  /**
   * Override global URL transformation config for this collection
   * Set to false to disable URL transformation for this collection.
   */
  urlTransform?: boolean | UrlTransformConfig
} & Omit<CollectionOptions, 'adapter' | 'disableLocalStorage'>

/** Configuration for which collections use Bunny Storage */
export type CollectionsConfig = Partial<Record<UploadCollectionSlug, BunnyStorageCollectionConfig | true>>

type BunnyStorageBaseConfig = {
  /**
   * Bunny Account API key (AccessKey) for account-level operations.
   * Required for CDN cache purging feature.
   */
  accountApiKey?: string
  /** Which collections should use Bunny Storage */
  collections: CollectionsConfig
  /**
   * Enable or disable the plugin
   * @default true
   */
  enabled?: boolean
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
  purge?: boolean | PurgeConfig
  /** Global signed URLs config (can be overridden per collection) */
  signedUrls?: boolean | SignedUrlsConfig
  /**
   * Global thumbnail settings for all collections.
   *
   * Enables thumbnail display in admin panel and thumbnailURL field in API responses.
   * For Bunny Stream videos: works with stream.thumbnailTime setting.
   * For images: can specify sizeName to use a particular image size.
   *
   * The plugin serves this through a hidden `thumbnailURL` field populated on read.
   */
  thumbnail?: boolean | ThumbnailConfig
  /**
   * Anonymous, opt-out usage telemetry: plugin, Payload and Node versions plus which
   * features are enabled. Never sends secrets, IP, keys, zone/library/bucket names,
   * hostnames, countries, file paths, collection names, or URL-transform internals.
   * A one-time notice prints on first run.
   *
   * Disabled automatically when `payload.config.telemetry` is `false`, when the
   * `DO_NOT_TRACK` or `BUNNY_TELEMETRY_DISABLED` env var is set, or in CI. Set to
   * `false` to opt out explicitly; pass `{ endpoint }` to send to your own collector.
   *
   * @see https://payload-storage-bunny.seshuk.im/configuration/telemetry
   * @default true
   */
  telemetry?: boolean | { endpoint?: string }
  /**
   * Global URL transformation config for all collections (can be overridden per collection)
   */
  urlTransform?: boolean | UrlTransformConfig
}

export type BunnyStorageConfig = {
  /** Bunny Storage configuration (optional if every collection provides its own) */
  storage?: StorageConfig
  /** Bunny Stream configuration (optional if every collection provides its own) */
  stream?: StreamConfig
} & BunnyStorageBaseConfig

export type BunnyStoragePlugin = (pluginConfig: BunnyStorageConfig) => Plugin
