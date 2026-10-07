import { posix } from 'node:path'

import type { CopyFile, DeleteFile } from '@payloadcms/plugin-cloud-storage/types'
import type { PayloadRequest, Where } from 'payload'

import { purgeCache } from '@/server/bunny/cdn.js'
import { copyStorageFileS3, deleteStorageFileS3 } from '@/server/bunny/s3.js'
import { copyStorageFile, deleteStorageFile } from '@/server/bunny/storage.js'
import { deleteStreamVideo } from '@/server/bunny/stream.js'
import { readStoredVideo } from '@/server/payload/fields/bunnyGroupField.js'
import { getLibraryCollectionSlugs, isVideoReferenced } from '@/server/payload/stream/references.js'
import { buildStoragePurgeUrl } from '@/server/urls.js'
import type { CollectionContext } from '@/shared/types/index.js'
import type { NormalizedBunnyStorageOptions } from '@/shared/types/optionsNormalized.js'

const STREAM_KEYS_CONTEXT_KEY = 'bunnyStreamKeys'

type StoredRepresentation = {
  _objectKey?: unknown
  filename?: unknown
  prefix?: unknown
}

const getStreamKeys = (req: PayloadRequest, collectionSlug: string): Map<string, string> => {
  req.context ??= {}
  const existing = req.context[STREAM_KEYS_CONTEXT_KEY]
  const collections =
    existing instanceof Map ? (existing as Map<string, Map<string, string>>) : new Map<string, Map<string, string>>()
  req.context[STREAM_KEYS_CONTEXT_KEY] = collections
  let keys = collections.get(collectionSlug)
  if (!keys) {
    keys = new Map<string, string>()
    collections.set(collectionSlug, keys)
  }
  return keys
}

export const setStreamKey = (req: PayloadRequest, collectionSlug: string, key: string, videoId: string): void => {
  getStreamKeys(req, collectionSlug).set(key, videoId)
}

export const rememberStreamKeys = (req: PayloadRequest, collectionSlug: string, doc: unknown): void => {
  const videoId = readStoredVideo(doc)?.videoId
  const resolveStorageKey = req.payload.collections[collectionSlug]?.config.upload?.fileOperations?.resolveStorageKey
  if (!videoId || !resolveStorageKey || !doc || typeof doc !== 'object') {
    return
  }
  const { original } = doc as { original?: unknown }
  for (const representation of [doc, original] as StoredRepresentation[]) {
    if (representation && typeof representation.filename === 'string' && representation.filename) {
      setStreamKey(
        req,
        collectionSlug,
        resolveStorageKey({
          _objectKey: typeof representation._objectKey === 'string' ? representation._objectKey : undefined,
          filename: representation.filename,
          prefix: typeof representation.prefix === 'string' ? representation.prefix : undefined,
        }),
        videoId,
      )
    }
  }
}

const findStreamVideoId = async (req: PayloadRequest, collectionSlug: string, key: string) => {
  const keys = getStreamKeys(req, collectionSlug)
  if (keys.has(key)) {
    return keys.get(key)
  }
  const filename = posix.basename(key)
  const fields = ['filename', 'original.filename']
  const docs = await req.payload.db.find({
    collection: collectionSlug,
    pagination: false,
    req,
    where: { or: fields.map((field) => ({ [field]: { equals: filename } })) } as Where,
  })
  for (const doc of docs.docs) {
    rememberStreamKeys(req, collectionSlug, doc)
  }
  if (req.payload.collections[collectionSlug]?.config.versions) {
    const versions = await req.payload.db.findVersions({
      collection: collectionSlug,
      pagination: false,
      req,
      where: { or: fields.map((field) => ({ [`version.${field}`]: { equals: filename } })) } as Where,
    })
    for (const version of versions.docs) {
      rememberStreamKeys(req, collectionSlug, version.version)
    }
  }
  return keys.get(key)
}

export const getCopyFile = (context: CollectionContext): CopyFile => {
  const { collection, storageOptions, streamOptions } = context

  return async ({ from, req, to }) => {
    const videoId = streamOptions ? await findStreamVideoId(req, collection.slug, from) : undefined
    if (videoId) {
      setStreamKey(req, collection.slug, to, videoId)
      return
    }
    if (!storageOptions) {
      throw new Error(`Unable to copy file: ${from}, no storage is configured`)
    }
    const { apiKey, region, uploadTimeout, zoneName } = storageOptions
    if (storageOptions.s3) {
      await copyStorageFileS3({ apiKey, from, region: storageOptions.region, timeout: uploadTimeout, to, zoneName })
    } else {
      await copyStorageFile({ apiKey, from, region, timeout: uploadTimeout, to, zoneName })
    }
  }
}

export const getDeleteFile = (context: CollectionContext, options: NormalizedBunnyStorageOptions): DeleteFile => {
  const { accountApiKey, collection, purgeOptions, storageOptions, streamOptions } = context

  return async ({ req, storageFilePath: path }) => {
    const videoId = streamOptions && (await findStreamVideoId(req, collection.slug, path))
    if (streamOptions && videoId) {
      const collectionSlugs = getLibraryCollectionSlugs(options, collection.slug, streamOptions.libraryId)
      if (await isVideoReferenced({ collectionSlugs, req, videoId })) {
        req.payload.logger.debug({
          msg: '[bunny:stream] delete: skipping, a document or version still uses the video',
          videoId,
        })
        return
      }
      await deleteStreamVideo({ apiKey: streamOptions.apiKey, libraryId: streamOptions.libraryId, videoId })
      return
    }

    if (!storageOptions) {
      req.payload.logger.debug({ msg: '[bunny:storage] delete: skipping, no storage options', path })
      return
    }

    const { apiKey, region, zoneName } = storageOptions
    if (storageOptions.s3) {
      await deleteStorageFileS3({ apiKey, path, region: storageOptions.region, zoneName })
    } else {
      await deleteStorageFile({ apiKey, path, region, zoneName })
    }

    if (purgeOptions && accountApiKey) {
      const url = buildStoragePurgeUrl({
        filename: posix.basename(path),
        hostname: storageOptions.hostname,
        prefix: posix.dirname(path),
      })
      try {
        await purgeCache({ apiKey: accountApiKey, async: purgeOptions.async, url })
        req.payload.logger.debug({ msg: '[bunny:storage] delete: cache purged', url })
      } catch (err) {
        req.payload.logger.error({ err, msg: '[bunny:storage] delete: cache purge failed', url })
      }
    }
  }
}
