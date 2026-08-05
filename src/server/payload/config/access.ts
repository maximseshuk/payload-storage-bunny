import type { Payload } from 'payload'

import { PLUGIN_KEY } from '@/shared/constants.js'
import type { StorageS3Config } from '@/shared/types/config.js'
import type { NormalizedBunnyStorageConfig } from '@/shared/types/configNormalized.js'

/**
 * Resolved Bunny Storage settings for one collection, with global config and
 * per-collection overrides already applied.
 *
 * Server-side only — contains your Storage API key and, when configured, a
 * token security key. Never send this object to the client.
 */
export type BunnyCollectionStorage = {
  /** Bunny Storage API key (password) for the zone. */
  apiKey: string
  /** Pull-zone hostname used to build public URLs (e.g. `my-zone.b-cdn.net`). */
  hostname: string
  /** Storage zone region code, when the zone is not in the default region. */
  region?: string
  /** Present when the zone is served through Bunny's S3-compatible endpoint. */
  s3?: StorageS3Config
  /** URL token authentication key for the zone, when signed URLs are enabled. */
  tokenSecurityKey?: string
  /** Bunny Storage zone name. */
  zoneName: string
}

/**
 * Resolved Bunny Stream settings for one collection, with global config and
 * per-collection overrides already applied.
 *
 * Server-side only — contains your Stream API key and, when configured, a
 * token security key. Never send this object to the client.
 */
export type BunnyCollectionStream = {
  /** Bunny Stream API key for the library. */
  apiKey: string
  /** Stream pull-zone hostname used to build playback URLs. */
  hostname: string
  /** Bunny Stream library id the collection's videos live in. */
  libraryId: number
  /** URL token authentication key for the library, when signed URLs are enabled. */
  tokenSecurityKey?: string
}

/**
 * Resolved per-collection Bunny config: whichever backends the collection uses.
 * A backend that is disabled for the collection is simply absent.
 *
 * Server-side only — contains API keys. Never send this object to the client.
 */
export type BunnyCollectionConfig = {
  /** Storage settings, or `undefined` for stream-only collections. */
  storage?: BunnyCollectionStorage
  /** Stream settings, or `undefined` for storage-only collections. */
  stream?: BunnyCollectionStream
}

const readStash = (payload: Payload): NormalizedBunnyStorageConfig | undefined => {
  const stash = payload.config.custom?.[PLUGIN_KEY] as { config?: NormalizedBunnyStorageConfig } | undefined
  return stash?.config
}

/**
 * The plugin's full normalized config, read from `payload.config.custom`.
 *
 * Escape hatch for anything the curated accessors do not expose. Its shape is
 * internal and may change between minor releases — treat the result as
 * read-only and prefer {@link getBunnyCollectionConfig} and its siblings.
 *
 * Returns `undefined` when the plugin is not installed or is disabled.
 *
 * Server-side only — contains API keys. Never send this object to the client.
 *
 * @param payload - A running Payload instance (e.g. `req.payload`).
 */
export const getBunnyConfig = (payload: Payload): NormalizedBunnyStorageConfig | undefined => readStash(payload)

/**
 * Resolved Bunny config for a collection managed by this plugin, with global
 * config and per-collection overrides already applied.
 *
 * Returns `undefined` when the plugin is not installed/enabled or the slug is
 * not one of the plugin's configured `collections`. A managed collection always
 * returns an object; a backend it does not use is absent from that object.
 *
 * Server-side only — the returned object contains API keys. Never send it to
 * the client.
 *
 * @param payload - A running Payload instance (e.g. `req.payload`).
 * @param collectionSlug - The upload collection's slug.
 */
export const getBunnyCollectionConfig = (
  payload: Payload,
  collectionSlug: string,
): BunnyCollectionConfig | undefined => {
  const collection = readStash(payload)?.collections.get(collectionSlug)

  if (!collection) {
    return undefined
  }

  const result: BunnyCollectionConfig = {}

  if (collection.storage) {
    const { apiKey, hostname, region, s3, tokenSecurityKey, zoneName } = collection.storage
    result.storage = {
      apiKey,
      hostname,
      zoneName,
      ...(region !== undefined ? { region } : {}),
      ...(s3 !== undefined ? { s3: { ...s3 } } : {}),
      ...(tokenSecurityKey !== undefined ? { tokenSecurityKey } : {}),
    }
  }

  if (collection.stream) {
    const { apiKey, hostname, libraryId, tokenSecurityKey } = collection.stream
    result.stream = {
      apiKey,
      hostname,
      libraryId,
      ...(tokenSecurityKey !== undefined ? { tokenSecurityKey } : {}),
    }
  }

  return result
}

/**
 * Resolved Bunny Storage settings for a collection — convenience for
 * `getBunnyCollectionConfig(payload, slug)?.storage`.
 *
 * Returns `undefined` when the plugin is not installed/enabled, the slug is not
 * managed by the plugin, or the collection does not use Storage (stream-only).
 *
 * Server-side only — the returned object contains your Storage API key. Never
 * send it to the client.
 *
 * @param payload - A running Payload instance (e.g. `req.payload`).
 * @param collectionSlug - The upload collection's slug.
 */
export const getBunnyStorageForCollection = (
  payload: Payload,
  collectionSlug: string,
): BunnyCollectionStorage | undefined => getBunnyCollectionConfig(payload, collectionSlug)?.storage

/**
 * Resolved Bunny Stream settings for a collection — convenience for
 * `getBunnyCollectionConfig(payload, slug)?.stream`.
 *
 * Returns `undefined` when the plugin is not installed/enabled, the slug is not
 * managed by the plugin, or the collection does not use Stream (storage-only).
 *
 * Server-side only — the returned object contains your Stream API key. Never
 * send it to the client.
 *
 * @param payload - A running Payload instance (e.g. `req.payload`).
 * @param collectionSlug - The upload collection's slug.
 */
export const getBunnyStreamForCollection = (
  payload: Payload,
  collectionSlug: string,
): BunnyCollectionStream | undefined => getBunnyCollectionConfig(payload, collectionSlug)?.stream
