import { posix } from 'node:path'

import type { TypeWithPrefix } from '@payloadcms/plugin-cloud-storage/types'
import type {
  CollectionAfterChangeHook,
  CollectionBeforeValidateHook,
  FileData,
  JsonObject,
  PayloadRequest,
  TypeWithID,
  Where,
} from 'payload'
import { MissingFile, ValidationError } from 'payload'

import { getStreamVideo, isVideoProcessed } from '@/server/bunny/stream.js'
import { getSafeFileName } from '@/server/files.js'
import { readStoredVideo, setStoredVideoId } from '@/server/payload/fields/bunnyGroupField.js'
import { readClientUpload } from '@/server/payload/storage/clientUploads/receipt.js'
import { getHandleDelete } from '@/server/payload/storage/handleDelete.js'
import { deleteStreamVideoSession } from '@/server/payload/stream/sessionsCollection.js'
import type { CollectionContext } from '@/shared/types/index.js'
import type { NormalizedBunnyStorageOptions } from '@/shared/types/optionsNormalized.js'

type BeforeValidateArgs = {
  options: NormalizedBunnyStorageOptions
  context: CollectionContext
  filesRequiredOnCreate: boolean
}

type AssertVideoUnclaimedArgs = {
  options: NormalizedBunnyStorageOptions
  context: CollectionContext
  id?: number | string
  req: PayloadRequest
  videoId: string
}

const assertVideoUnclaimed = async ({ options, context, id, req, videoId }: AssertVideoUnclaimedArgs) => {
  const slugs = new Set([context.collection.slug])
  for (const [slug, collectionOptions] of options.collections) {
    if (collectionOptions.stream && collectionOptions.stream.libraryId === context.streamOptions?.libraryId) {
      slugs.add(slug)
    }
  }

  for (const slug of slugs) {
    if (!req.payload.collections[slug]) {
      continue
    }
    const where: Where[] = [{ 'bunnyData.stream.videoId': { equals: videoId } }]
    if (slug === context.collection.slug && id !== undefined) {
      where.push({ id: { not_equals: id } })
    }
    if (await req.payload.db.findOne({ collection: slug, req, where: { and: where } })) {
      throw new ValidationError({
        collection: context.collection.slug,
        errors: [{ message: 'This video is already used by another document.', path: 'bunnyData.stream.videoId' }],
        req,
      })
    }
  }
}

type BeforeValidateData = JsonObject & TypeWithID

export const getBeforeValidateHook = ({
  options,
  context,
  filesRequiredOnCreate,
}: BeforeValidateArgs): CollectionBeforeValidateHook<BeforeValidateData> => {
  return async ({ data, operation, originalDoc, req }) => {
    const file = req.file

    if (operation === 'create' && filesRequiredOnCreate && !readStoredVideo(data)?.videoId && !file) {
      throw new MissingFile(req.t)
    }

    const clientVideoId =
      file &&
      readClientUpload({
        collectionSlug: context.collection.slug,
        filename: file.name,
        req,
        uploadReference: file.uploadReference,
      })?.videoId
    if (clientVideoId && data && context.streamOptions) {
      await getStreamVideo({
        apiKey: context.streamOptions.apiKey,
        libraryId: context.streamOptions.libraryId,
        videoId: clientVideoId,
      })
      setStoredVideoId(data, clientVideoId)
    }

    if (data && !readStoredVideo(data)?.videoId) {
      setStoredVideoId(data, null)
    }

    const storedVideoId = readStoredVideo(data)?.videoId
    if (storedVideoId && context.streamOptions && storedVideoId !== readStoredVideo(originalDoc)?.videoId) {
      await assertVideoUnclaimed({ options, context, id: originalDoc?.id, req, videoId: storedVideoId })
    }

    const processVideoData = async (videoId: string, targetData: typeof data) => {
      if (!context.streamOptions || !targetData) {
        return
      }

      const videoData = await getStreamVideo({
        apiKey: context.streamOptions.apiKey,
        libraryId: context.streamOptions.libraryId,
        videoId,
      })

      if (isVideoProcessed(videoData.status)) {
        const safeFilename = await getSafeFileName({
          collectionSlug: context.collection.slug,
          desiredFilename: videoData.title || `video-${videoData.guid}`,
          req,
          staticPath: '',
        })

        targetData.filename = safeFilename
        targetData.width = null
        targetData.height = null
        targetData.focalX = null
        targetData.focalY = null
        setStoredVideoId(targetData, videoData.guid)

        if (!targetData.mimeType) {
          targetData.mimeType = 'video/mp4'
        }

        if (!targetData.filesize) {
          targetData.filesize = videoData.storageSize
        }
      }
    }

    if (operation === 'update' && originalDoc && data && !req.context?.skipCloudStorage) {
      const incomingVideoId = readStoredVideo(data)?.videoId
      if (!file && incomingVideoId && incomingVideoId !== readStoredVideo(originalDoc)?.videoId) {
        if (!req.context) {
          req.context = {}
        }
        req.context.oldDoc = originalDoc

        await processVideoData(incomingVideoId, data)
      }
    }

    if (operation === 'create' && !file) {
      const incomingVideoId = readStoredVideo(data)?.videoId
      if (incomingVideoId) {
        await processVideoData(incomingVideoId, data)
      }
    }

    return data
  }
}

type AfterChangeData = FileData & JsonObject & TypeWithID

export const getAfterChangeHook = (context: CollectionContext): CollectionAfterChangeHook<AfterChangeData> => {
  return async ({ data, req }) => {
    const videoId = readStoredVideo(data)?.videoId
    if (context.streamOptions?.cleanup && videoId) {
      await deleteStreamVideoSession({
        libraryId: context.streamOptions.libraryId,
        req,
        videoId,
      })
    }

    if (context.isTusUploadSupported) {
      const oldDoc = req.context?.oldDoc

      if (!oldDoc || typeof oldDoc !== 'object' || !('filename' in oldDoc) || typeof oldDoc.filename !== 'string') {
        return
      }

      const handleDelete = getHandleDelete(context)
      const doc = oldDoc as FileData & JsonObject & TypeWithID & TypeWithPrefix

      try {
        await handleDelete({
          collection: context.collection,
          doc,
          filename: oldDoc.filename,
          req,
          storageFilePath: posix.join(doc.prefix || '', oldDoc.filename),
        })

        req.payload.logger.debug({
          filename: oldDoc.filename,
          msg: '[bunny:stream] tus: deleted replaced file after upload',
        })
      } catch (err) {
        req.payload.logger.error({
          err,
          filename: oldDoc.filename,
          msg: '[bunny:stream] tus: failed to delete replaced file after upload',
        })
      }
    }
  }
}
