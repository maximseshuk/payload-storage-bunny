import type { CollectionAfterChangeHook, CollectionBeforeValidateHook, FileData, JsonObject, TypeWithID } from 'payload'
import { MissingFile } from 'payload'

import { getStreamVideo, isVideoProcessed } from '@/server/bunny/stream.js'
import { getSafeFileName } from '@/server/files.js'
import { readStoredVideo, setStoredVideoId } from '@/server/payload/fields/bunnyGroupField.js'
import { getHandleDelete } from '@/server/payload/storage/handleDelete.js'
import { deleteStreamVideoSession } from '@/server/payload/stream/sessionsCollection.js'
import type { CollectionContext } from '@/shared/types/index.js'

type BeforeValidateArgs = {
  context: CollectionContext
  filesRequiredOnCreate: boolean
}

type BeforeValidateData = JsonObject & TypeWithID

export const getBeforeValidateHook = ({
  context,
  filesRequiredOnCreate,
}: BeforeValidateArgs): CollectionBeforeValidateHook<BeforeValidateData> => {
  return async ({ data, operation, originalDoc, req }) => {
    const file = req.file

    if (operation === 'create' && filesRequiredOnCreate && !readStoredVideo(data)?.videoId && !file) {
      throw new MissingFile(req.t)
    }

    if (data && !readStoredVideo(data)?.videoId) {
      setStoredVideoId(data, null)
    }

    const processVideoData = async (videoId: string, targetData: typeof data) => {
      if (!context.streamConfig || !targetData) {
        return
      }

      const videoData = await getStreamVideo({
        apiKey: context.streamConfig.apiKey,
        libraryId: context.streamConfig.libraryId,
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

    if (operation === 'update' && originalDoc && data) {
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
    if (context.streamConfig?.cleanup && videoId) {
      await deleteStreamVideoSession({
        libraryId: context.streamConfig.libraryId,
        payload: req.payload,
        videoId,
      })
    }

    if (context.isTusUploadSupported) {
      const oldDoc = req.context?.oldDoc

      if (!oldDoc || typeof oldDoc !== 'object' || !('filename' in oldDoc) || typeof oldDoc.filename !== 'string') {
        return
      }

      const handleDelete = getHandleDelete(context)

      try {
        await handleDelete({
          collection: context.collection,
          doc: oldDoc as FileData & JsonObject & TypeWithID,
          filename: oldDoc.filename,
          req,
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
