import type { Payload } from 'payload'

import { PLUGIN_KEY } from '@/shared/constants.js'
import type { StorageRegion } from '@/shared/types/options.js'
import type { NormalizedBunnyStorageOptions } from '@/shared/types/optionsNormalized.js'

export type BunnyCollectionStorage = {
  apiKey: string
  hostname: string
  region: StorageRegion
  s3: boolean
  tokenSecurityKey?: string
  zoneName: string
}

export type BunnyCollectionStream = {
  apiKey: string
  hostname: string
  libraryId: number
  tokenSecurityKey?: string
}

export type BunnyCollectionOptions = {
  storage?: BunnyCollectionStorage
  stream?: BunnyCollectionStream
}

const readStash = (payload: Payload): NormalizedBunnyStorageOptions | undefined => {
  const stash = payload.config.custom?.[PLUGIN_KEY] as { config?: NormalizedBunnyStorageOptions } | undefined
  return stash?.config
}

export const getBunnyOptions = (payload: Payload): NormalizedBunnyStorageOptions | undefined => readStash(payload)

export const getBunnyCollectionOptions = (
  payload: Payload,
  collectionSlug: string,
): BunnyCollectionOptions | undefined => {
  const collection = readStash(payload)?.collections.get(collectionSlug)

  if (!collection) {
    return undefined
  }

  const result: BunnyCollectionOptions = {}

  if (collection.storage) {
    const { apiKey, hostname, region, s3, tokenSecurityKey, zoneName } = collection.storage
    result.storage = {
      apiKey,
      hostname,
      region,
      s3,
      zoneName,
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
): BunnyCollectionStorage | undefined => getBunnyCollectionOptions(payload, collectionSlug)?.storage

export const getBunnyStreamForCollection = (
  payload: Payload,
  collectionSlug: string,
): BunnyCollectionStream | undefined => getBunnyCollectionOptions(payload, collectionSlug)?.stream
