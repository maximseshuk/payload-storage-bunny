import type { Payload } from 'payload'

import { PLUGIN_KEY } from '@/shared/constants.js'
import type { StorageS3Config } from '@/shared/types/config.js'
import type { NormalizedBunnyStorageConfig } from '@/shared/types/configNormalized.js'

export type BunnyCollectionStorage = {
  apiKey: string
  hostname: string
  region?: string
  s3?: StorageS3Config
  tokenSecurityKey?: string
  zoneName: string
}

export type BunnyCollectionStream = {
  apiKey: string
  hostname: string
  libraryId: number
  tokenSecurityKey?: string
}

export type BunnyCollectionConfig = {
  storage?: BunnyCollectionStorage
  stream?: BunnyCollectionStream
}

const readStash = (payload: Payload): NormalizedBunnyStorageConfig | undefined => {
  const stash = payload.config.custom?.[PLUGIN_KEY] as { config?: NormalizedBunnyStorageConfig } | undefined
  return stash?.config
}

export const getBunnyConfig = (payload: Payload): NormalizedBunnyStorageConfig | undefined => readStash(payload)

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

export const getBunnyStorageForCollection = (
  payload: Payload,
  collectionSlug: string,
): BunnyCollectionStorage | undefined => getBunnyCollectionConfig(payload, collectionSlug)?.storage

export const getBunnyStreamForCollection = (
  payload: Payload,
  collectionSlug: string,
): BunnyCollectionStream | undefined => getBunnyCollectionConfig(payload, collectionSlug)?.stream
