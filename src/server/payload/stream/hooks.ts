import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import { buildUploadStoragePathData } from '@payloadcms/plugin-cloud-storage/utilities'
import type {
  CollectionAfterChangeHook,
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeOperationHook,
  CollectionBeforeValidateHook,
  FileData,
  JsonObject,
  TypeWithID,
} from 'payload'
import { MissingFile, ValidationError } from 'payload'
import { getOriginalFilename, getSafeFileName } from 'payload/internal'
import { getSanitizedUploadFilename } from 'payload/shared'

import {
  getStreamSaveState,
  getStreamTusUpload,
  getStreamVideo,
  getStreamVideoOriginalSize,
} from '@/server/bunny/stream.js'
import { hasStatus, readStoredVideo, setStoredVideoId } from '@/server/payload/fields/bunnyGroupField.js'
import { rememberStreamKeys, setStreamKey } from '@/server/payload/storage/fileOperations.js'
import { getLibraryCollectionSlugs, isVideoReferenced } from '@/server/payload/stream/references.js'
import { deleteStreamVideoSession } from '@/server/payload/stream/sessionsCollection.js'
import { checkStreamTusUpload, isStreamUploadVerified } from '@/server/payload/stream/tusUpload.js'
import { isStreamFileMimeType, matchesMimeTypePattern } from '@/shared/mimeTypes.js'
import type { CollectionContext } from '@/shared/types/index.js'
import type { NormalizedBunnyStorageOptions } from '@/shared/types/optionsNormalized.js'

type BeforeValidateArgs = {
  options: NormalizedBunnyStorageOptions
  context: CollectionContext
  filesRequiredOnCreate: boolean
}

type BeforeValidateData = JsonObject & TypeWithID

const FILE_DATA_KEYS = ['filename', 'filesize', 'mimeType'] as const

export const getBeforeValidateHook = ({
  options,
  context,
  filesRequiredOnCreate,
}: BeforeValidateArgs): CollectionBeforeValidateHook<BeforeValidateData> => {
  return async ({ data, operation, originalDoc, req }) => {
    const file = req.file
    const verified = req.context?._payloadVerifiedProviderOriginal as
      | undefined
      | { _objectKey?: unknown; key?: unknown; signedReceipt?: unknown }
    const providerVideoId =
      file &&
      typeof verified?._objectKey === 'string' &&
      (file.uploadReference as undefined | { signedReceipt?: unknown })?.signedReceipt === verified.signedReceipt &&
      context.streamOptions?.mimeTypes.some((pattern) => matchesMimeTypePattern(file.mimetype, pattern)) &&
      isStreamUploadVerified(req, verified._objectKey)
        ? verified._objectKey
        : undefined
    if (data && providerVideoId) {
      setStoredVideoId(data, providerVideoId, undefined)
      if (typeof verified?.key === 'string') {
        setStreamKey(req, context.collection.slug, verified.key, providerVideoId)
      }
    }

    if (
      (operation === 'create' || (operation === 'validate' && !originalDoc?.id)) &&
      filesRequiredOnCreate &&
      !hasStatus(data?._status, 'draft') &&
      !readStoredVideo(data)?.videoId &&
      !file
    ) {
      throw new MissingFile(req.t)
    }

    if (data && !readStoredVideo(data)?.videoId) {
      const status = context.streamOptions?.status
      setStoredVideoId(
        data,
        null,
        status ? null : undefined,
        status && context.streamOptions?.mp4Fallback ? null : undefined,
      )
    }

    const storedVideoId = readStoredVideo(data)?.videoId
    if (storedVideoId && context.streamOptions && storedVideoId !== readStoredVideo(originalDoc)?.videoId) {
      const isReferenced = await isVideoReferenced({
        collectionSlugs: getLibraryCollectionSlugs(options, context.collection.slug, context.streamOptions.libraryId),
        except: originalDoc?.id !== undefined ? { collection: context.collection.slug, id: originalDoc.id } : undefined,
        req,
        videoId: storedVideoId,
      })
      if (isReferenced) {
        throw new ValidationError({
          collection: context.collection.slug,
          errors: [{ message: 'This video is already used by another document.', path: 'bunnyData.stream.videoId' }],
          req,
        })
      }
    }

    const isSameVideo = operation === 'update' && storedVideoId === readStoredVideo(originalDoc)?.videoId
    if (
      !context.streamOptions ||
      !data ||
      (file && !providerVideoId) ||
      !storedVideoId ||
      req.context?.skipCloudStorage ||
      req.context?.isRestoringVersion ||
      (operation !== 'create' && operation !== 'update') ||
      (operation === 'update' && !originalDoc)
    ) {
      return data
    }

    const { apiKey, libraryId, mimeTypes, mp4Fallback, status } = context.streamOptions
    const getOriginalSize = async (videoId: string, storageSize: number) =>
      (await getStreamVideoOriginalSize({ apiKey, libraryId, videoId }).catch(() => 0)) || storageSize

    if (isSameVideo) {
      for (const key of FILE_DATA_KEYS) {
        data[key] ||= originalDoc?.[key]
      }
      if (FILE_DATA_KEYS.every((key) => data[key])) {
        return data
      }
      let video
      try {
        video = await getStreamVideo({ apiKey, libraryId, videoId: storedVideoId })
      } catch (err) {
        req.payload.logger.warn({
          err,
          msg: '[bunny:stream] save: unable to read the video to fill the file fields',
          videoId: storedVideoId,
        })
        return data
      }
      data.mimeType ||= 'video/mp4'
      data.filesize ||= await getOriginalSize(video.guid, video.storageSize)
      data.filename ||= await getSafeFileName({
        collectionSlug: context.collection.slug,
        desiredFilename: getOriginalFilename({
          filename: getSanitizedUploadFilename(video.title || `video-${video.guid}`),
        }),
        prefix: (typeof data.prefix === 'string' ? data.prefix : originalDoc?.prefix) || context.prefix,
        req,
      })
      data.original = {
        ...(originalDoc?.original as JsonObject | undefined),
        ...(data.original as JsonObject | undefined),
        filename: data.filename,
        filesize: data.filesize,
        mimeType: data.mimeType,
      }
      return data
    }

    const video = await getStreamVideo({ apiKey, libraryId, videoId: storedVideoId })
    const saved = status
      ? await getStreamSaveState({ apiKey, libraryId, logger: req.payload.logger, mp4Fallback, video })
      : undefined
    setStoredVideoId(data, video.guid, saved?.status, saved?.resolutions ?? (mp4Fallback ? null : undefined))
    if (providerVideoId) {
      return data
    }

    const upload =
      getStreamTusUpload(video) && (await checkStreamTusUpload({ streamOptions: context.streamOptions, video }))
    if (upload && upload.state !== 'complete') {
      req.payload.logger.warn({
        msg: `[bunny:stream] save: ${upload.reason}`,
        status: video.status,
        videoId: video.guid,
        ...upload.details,
      })
      throw new ValidationError({
        collection: context.collection.slug,
        errors: [{ message: `The video upload is not usable: ${upload.reason}.`, path: 'bunnyData.stream.videoId' }],
        req,
      })
    }

    if (!isStreamFileMimeType(data.mimeType ?? originalDoc?.mimeType, mimeTypes)) {
      data.mimeType = 'video/mp4'
      data.filesize = null
    }
    data.mimeType ||= 'video/mp4'
    data.filesize = upload ? upload.length : data.filesize || (await getOriginalSize(video.guid, video.storageSize))

    const desiredFilename = getOriginalFilename({
      filename: getSanitizedUploadFilename(video.title || `video-${video.guid}`),
    })
    const prefix = buildUploadStoragePathData({
      collectionPrefix: context.prefix,
      docPrefix: (typeof data.prefix === 'string' ? data.prefix : originalDoc?.prefix) || context.prefix,
      filename: desiredFilename,
    }).sanitizedDocPrefix
    const filename = await getSafeFileName({ collectionSlug: context.collection.slug, desiredFilename, prefix, req })
    const _objectKey = randomUUID()

    data.filename = filename
    data.prefix = prefix
    data._objectKey = _objectKey
    data.original = {
      _objectKey,
      filename,
      filesize: data.filesize,
      mimeType: data.mimeType,
      prefix,
    }
    data.width = null
    data.height = null
    data.focalX = null
    data.focalY = null

    return data
  }
}

export const getStreamFileChangeBeforeOperationHook =
  (context: CollectionContext): CollectionBeforeOperationHook =>
  async ({ args, operation, req }) => {
    const { data, id } = args as { data?: JsonObject; id?: number | string }
    const videoId = readStoredVideo(data)?.videoId
    if (operation !== 'update' || id === undefined || !data || !videoId || req.file || req.context?.skipCloudStorage) {
      return args
    }
    const slug = context.collection.slug
    const current = req.payload.collections[slug]?.config.versions?.drafts
      ? (
          await req.payload.db.findVersions({
            collection: slug,
            limit: 1,
            pagination: false,
            req,
            sort: '-updatedAt',
            where: { and: [{ parent: { equals: id } }, { latest: { equals: true } }] },
          })
        ).docs[0]?.version
      : await req.payload.db.findOne({ collection: slug, req, where: { id: { equals: id } } })
    if (current && readStoredVideo(current)?.videoId !== videoId) {
      data._objectKey = randomUUID()
    }
    return args
  }

export const getStreamKeysBeforeChangeHook =
  (context: CollectionContext): CollectionBeforeChangeHook<BeforeValidateData> =>
  async ({ data, operation, originalDoc, req }) => {
    const slug = context.collection.slug
    if (operation !== 'update' || !originalDoc) {
      return data
    }
    rememberStreamKeys(req, slug, originalDoc)
    rememberStreamKeys(req, slug, data)

    const versions = req.payload.collections[slug]?.config.versions
    const maxPerDoc = versions ? versions.maxPerDoc : 0
    if (!maxPerDoc || maxPerDoc <= 0) {
      return data
    }
    const parent = { parent: { equals: originalDoc.id } }
    const {
      docs: [oldestKept],
    } = await req.payload.db.findVersions({
      collection: slug,
      limit: 1,
      page: maxPerDoc,
      pagination: false,
      req,
      sort: '-updatedAt',
      where: parent,
    })
    if (!oldestKept?.updatedAt) {
      return data
    }
    const { docs } = await req.payload.db.findVersions({
      collection: slug,
      pagination: false,
      req,
      where: { and: [parent, { updatedAt: { less_than_equal: oldestKept.updatedAt } }] },
    })
    for (const version of docs) {
      rememberStreamKeys(req, slug, version.version)
    }
    return data
  }

export const getStreamKeysBeforeDeleteHook =
  (context: CollectionContext): CollectionBeforeDeleteHook =>
  async ({ id, req }) => {
    const slug = context.collection.slug
    rememberStreamKeys(
      req,
      slug,
      await req.payload.db.findOne({ collection: slug, req, where: { id: { equals: id } } }),
    )
    if (!req.payload.collections[slug]?.config.versions) {
      return
    }
    const { docs } = await req.payload.db.findVersions({
      collection: slug,
      pagination: false,
      req,
      where: { parent: { equals: id } },
    })
    for (const version of docs) {
      rememberStreamKeys(req, slug, version.version)
    }
  }

export const getStreamBeforeChangeHook = (
  context: CollectionContext,
): CollectionBeforeChangeHook<BeforeValidateData> => {
  return async ({ data, operation, originalDoc, req }) => {
    const incoming = readStoredVideo(data)
    if (operation !== 'update' || !originalDoc || !incoming?.videoId) {
      return data
    }

    if (req.context?.isRestoringVersion && context.streamOptions?.status) {
      const { apiKey, libraryId, mp4Fallback } = context.streamOptions
      try {
        const video = await getStreamVideo({ apiKey, libraryId, videoId: incoming.videoId })
        const saved = await getStreamSaveState({ apiKey, libraryId, logger: req.payload.logger, mp4Fallback, video })
        setStoredVideoId(data, incoming.videoId, saved.status, mp4Fallback ? (saved.resolutions ?? null) : undefined)
        return data
      } catch (err) {
        req.payload.logger.warn({
          err,
          msg: '[bunny:stream] restore: unable to refresh the video status',
          videoId: incoming.videoId,
        })
      }
    }

    const stored = readStoredVideo(
      await req.payload.db.findOne({
        collection: context.collection.slug,
        req,
        where: { id: { equals: originalDoc.id } },
      }),
    )
    if (stored?.videoId !== incoming.videoId) {
      return data
    }

    if (context.streamOptions?.status) {
      incoming.status = stored.status ?? null
    }
    if (
      context.streamOptions?.mp4Fallback &&
      stored.resolutions?.available?.length &&
      (!incoming.resolutions?.available?.length ||
        isDeepStrictEqual(incoming.resolutions, readStoredVideo(originalDoc)?.resolutions))
    ) {
      incoming.resolutions = stored.resolutions
    }

    return data
  }
}

type AfterChangeData = FileData & JsonObject & TypeWithID

export const getAfterChangeHook = (context: CollectionContext): CollectionAfterChangeHook<AfterChangeData> => {
  return async ({ data, doc: savedDoc, req }) => {
    const videoId = readStoredVideo(data)?.videoId
    if (context.streamOptions?.cleanup && videoId) {
      await deleteStreamVideoSession({
        libraryId: context.streamOptions.libraryId,
        req,
        videoId,
      })
    }

    const draftStream = readStoredVideo(savedDoc)
    if (
      req.context?.skipCloudStorage &&
      context.streamOptions &&
      draftStream?.videoId &&
      typeof savedDoc.filename === 'string' &&
      hasStatus(savedDoc._status, 'draft')
    ) {
      await req.payload.db.updateOne({
        collection: context.collection.slug,
        data: {
          bunnyData: {
            stream: {
              ...(draftStream.resolutions !== undefined && { resolutions: draftStream.resolutions }),
              ...(draftStream.status !== undefined && { status: draftStream.status }),
              videoId: draftStream.videoId,
            },
          },
          updatedAt: null,
        },
        req,
        select: { id: true },
        where: {
          and: [
            { id: { equals: savedDoc.id } },
            { _status: { equals: 'draft' } },
            { filename: { equals: savedDoc.filename } },
            {
              or: [{ 'bunnyData.stream.videoId': { exists: false } }, { 'bunnyData.stream.videoId': { equals: null } }],
            },
          ],
        },
      })
    }
  }
}
