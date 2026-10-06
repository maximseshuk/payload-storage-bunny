import type { CollectionOptions } from '@payloadcms/plugin-cloud-storage/types'
import type { CollectionConfig, PayloadRequest, StorageAdapter, TaskConfig, UploadCollectionSlug } from 'payload'

import type { REGIONS } from '@/shared/regions.js'

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

export type UrlTransformOptions = {
  /**
   * Append a `t=<timestamp>` query parameter to the URL.
   * @default false
   */
  appendTimestamp?: boolean
  /**
   * Static query parameters to append to the URL.
   * @default {}
   */
  queryParams?: Record<string, string>
}

/**
 * URL transformation.
 * - `true`: use the defaults (inherit the global value at collection level).
 * - `false`: no transformation.
 * - An object: append a timestamp and/or static query parameters. Unset fields inherit the global object.
 * - A function: build the URL yourself. It replaces the object form completely.
 */
export type UrlTransformConfig = boolean | UrlTransformFunction | UrlTransformOptions

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
  /**
   * URL transformation for thumbnail URLs. Same shape as the top-level `urlTransform`.
   * Unset or `true`: inherit the global `thumbnail.urlTransform`, else append a timestamp.
   * `false`: no transformation.
   * @default { appendTimestamp: true }
   */
  urlTransform?: UrlTransformConfig
}

export type PurgeConfig = {
  /**
   * Run the purge asynchronously and return before it finishes.
   * @default false (wait for completion)
   */
  async?: boolean
}

export type StorageRegion = keyof typeof REGIONS | ({} & string)

type StorageBaseConfig = {
  /** Bunny Storage API key */
  apiKey: string
  /** CDN domain from your Pull Zone (e.g., 'example.b-cdn.net') */
  hostname: string
  /**
   * Primary region of the storage zone.
   * @default 'de'
   */
  region?: StorageRegion
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
  /** Browser-direct uploads through presigned S3 URLs, so files skip the server body-size limit. */
  clientUploads?: boolean | { access?: ClientUploadsAccess; prefix?: ClientUploadsPrefix }
  s3: true
}

/**
 * Storage zone using Bunny's HTTP Storage API (no S3).
 *
 * Browser-direct uploads for this zone go through a deployed Edge Script, so
 * `clientUploads.edge` is required whenever `clientUploads` is enabled.
 */
export type HttpStorageConfig = StorageBaseConfig & {
  /** Browser-direct uploads through the Edge Script in `edge`, so files skip the server body-size limit. */
  clientUploads?: { access?: ClientUploadsAccess; edge: ClientUploadsEdgeConfig; prefix?: ClientUploadsPrefix }
  s3?: false
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
   * Narrows who may request an upload URL. It runs after Payload's own check
   * (an authenticated user with create or update access to the collection), so
   * it can deny a request but never allow one that check rejects.
   */
  access?: ClientUploadsAccess
  /**
   * Edge Script proxy settings. Required for edge transport, i.e. when `storage.s3`
   * is not `true` (ignored when `storage.s3` is `true`).
   */
  edge?: ClientUploadsEdgeConfig
  /**
   * Resolve the storage path prefix at mint time, server-side, before the file is uploaded.
   * Use it for date/user folders, or a tenant segment in multi-tenant apps.
   * When the collection also has a static prefix, a result outside it is placed under it.
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
   * Decides who may create a TUS upload. It replaces the default check, so it can allow
   * users the default rejects. Call `defaultAccess()` to keep the default and add rules.
   * `data` is the parsed TUS auth request (`collection`, `filesize`, `filename`, ...).
   * @default a logged-in admin user with create access to the collection
   */
  access?: (args: {
    data: StreamTusAuthRequest
    defaultAccess: () => Promise<boolean>
    req: PayloadRequest
  }) => boolean | Promise<boolean>
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
   * Automatic cleanup of videos from uploads that never finished or whose document was never saved
   */
  cleanup?:
    | {
        /**
         * Time in seconds after which unsaved uploads are considered dead
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
   * File types that go to Bunny Stream. The collection's own `mimeTypes` still applies.
   * @default common video and audio types
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
  /**
   * Enable TUS resumable uploads for large video files
   * @default false
   */
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

export type StaticHandlerRedirectConfig = {
  /**
   * Same shape as `signedUrls.expiresIn`.
   * @default signedUrls.expiresIn
   */
  expiresIn?: SignedUrlsExpiresIn
  /**
   * Redirect status. Only temporary redirects, because the signed target expires.
   * @default 302
   */
  status?: 302 | 307
}

export type StaticHandlerConfig = {
  /**
   * Redirect to a signed URL instead of proxying the file through Payload.
   * `true` inherits the global redirect, else uses status 302. An object sets the status and the link expiration.
   * Only works when `disablePayloadAccessControl` is false.
   * @default false
   */
  redirect?: boolean | StaticHandlerRedirectConfig
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

/**
 * Signed URL expiration.
 * - A number: seconds from now.
 * - A function: return seconds from now (number), an absolute deadline (Date), or undefined for `defaultValue`.
 *   `defaultValue` is the inherited value (the global setting at collection level), else 7200 seconds.
 */
export type SignedUrlsExpiresIn =
  | ((args: { defaultValue: Date | number } & SignedUrlsCallbackArgs) => Date | number | undefined)
  | number

export type SignedUrlsConfig = {
  /** Allowed countries (ISO 3166-1 alpha-2 codes). Only requests from these countries will be allowed */
  allowedCountries?: string[]
  /** Blocked countries (ISO 3166-1 alpha-2 codes). Requests from these countries will be rejected */
  blockedCountries?: string[]
  /** @default 7200 */
  expiresIn?: SignedUrlsExpiresIn
  /**
   * Decide per file whether its URL is signed.
   * @default every file is signed
   */
  shouldUseSignedUrl?(args: SignedUrlsCallbackArgs): boolean
  /**
   * Static handler behavior when Payload access control is enabled
   * Has no effect when disablePayloadAccessControl is true
   */
  staticHandler?: StaticHandlerConfig
  /**
   * Lock signed URLs to the client's IPv4 address, for example from `x-forwarded-for`.
   * Return a falsy value to sign without the lock. Values that are not IPv4 are ignored with a warning.
   * Needs Token IP Validation on the pull zone or stream library, which turns off IPv6 routing on the zone.
   * Applies to url fields, admin thumbnails and redirects, not to `generateFileURL`, proxied downloads or purges.
   */
  userIp?(args: { req: PayloadRequest } & SignedUrlsCallbackArgs): string | undefined
}

/** Partial storage override — merged onto the global storage zone. */
export type CollectionStorageOverride = {
  /** `true` uses the global config, else the defaults. `false` turns it off. Object fields inherit. */
  clientUploads?: boolean | ClientUploadsConfig
  /** Upload timeout in milliseconds. */
  uploadTimeout?: number
}

/** Partial stream override — merged onto the global stream library. */
export type CollectionStreamOverride = {
  /** Replaces the global `stream.mimeTypes`. */
  mimeTypes?: string[]
  mp4Fallback?: boolean
  /** Thumbnail time in milliseconds. Use with `thumbnail: true`. */
  thumbnailTime?: number
  /**
   * `true` or an object turns TUS on, even when the global `stream.tus` is off. `false` turns it off.
   * Object fields inherit.
   * @default the global `stream.tus`
   */
  tus?:
    | boolean
    | {
        /**
         * When true, TUS auto-enables for supported video MIME types.
         * When false, user must manually click "Enable TUS mode" button.
         */
        autoMode?: boolean
        /** Upload session expiry in seconds. */
        expiresIn?: number
      }
  /** Upload timeout in milliseconds. */
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

export type BunnyStorageCollectionOptions = {
  /**
   * `false` turns it off. `true` or an object turns it on, even when the global `purge` is off.
   * Object fields inherit.
   * @default the global `purge`
   */
  purge?: boolean | PurgeConfig
  /**
   * Object fields inherit the global `signedUrls`.
   * @default the global `signedUrls`
   */
  signedUrls?: boolean | SignedUrlsConfig
  /**
   * - A full config (`apiKey`, `hostname`, `zoneName`) uses its own zone.
   *   An object with `apiKey` replaces the global config.
   * - A partial override (`uploadTimeout`, `clientUploads`) changes the global zone for this collection.
   * - `false` turns Bunny Storage off for this collection.
   */
  storage?: CollectionStorageOverride | false | StorageConfig
  /**
   * - A full config (`apiKey`, `hostname`, `libraryId`) uses its own library.
   *   An object with `apiKey` replaces the global config.
   * - A partial override (`mimeTypes`, `mp4Fallback`, `thumbnailTime`, `tus`, `uploadTimeout`) changes the
   *   global library for this collection.
   * - `false` turns Bunny Stream off for this collection.
   */
  stream?: CollectionStreamConfig | CollectionStreamOverride | false
  /** @default the global `thumbnail` */
  thumbnail?: boolean | ThumbnailConfig
  /** @default the global `urlTransform` */
  urlTransform?: UrlTransformConfig
} & Omit<CollectionOptions, 'adapter' | 'disableLocalStorage'>

/**
 * Configuration for which collections use Bunny Storage.
 * `true` uses the global settings, an object overrides them, `false` disables the collection.
 */
export type CollectionsConfig = Partial<Record<UploadCollectionSlug, boolean | BunnyStorageCollectionOptions>>

type BunnyStorageBaseConfig = {
  /** Bunny account API key. Required for `purge`. */
  accountApiKey?: string
  /** Which collections should use Bunny Storage */
  collections: CollectionsConfig
  /**
   * Enable or disable the plugin. When `false`, the hidden storage fields (such as `prefix`)
   * are still added, so the database schema matches the enabled plugin.
   * @default true
   */
  enabled?: boolean
  /**
   * CDN cache purging after uploads and deletes. Needs `accountApiKey`.
   * @default false
   */
  purge?: boolean | PurgeConfig
  /**
   * Sign file URLs with Bunny token authentication.
   * @default false
   */
  signedUrls?: boolean | SignedUrlsConfig
  /**
   * Thumbnails in the admin panel and the `thumbnailURL` field.
   * @default false
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
   * `false` to opt out explicitly; pass `{ url }` to send to your own collector.
   *
   * @see https://payload-storage-bunny.seshuk.im/v4/configuration/telemetry
   * @default true
   */
  telemetry?:
    | boolean
    | {
        /**
         * Collector URL that receives the telemetry report.
         * @default the plugin's public collector
         */
        url?: string
      }
  /**
   * Add query parameters to file URLs, or build them yourself.
   * @default false
   */
  urlTransform?: UrlTransformConfig
}

export type BunnyStorageOptions = {
  /** Optional when every collection has its own zone. */
  storage?: StorageConfig
  /** Optional when every collection has its own library. */
  stream?: StreamConfig
} & BunnyStorageBaseConfig

export type BunnyStoragePlugin = (pluginConfig: BunnyStorageOptions) => StorageAdapter
