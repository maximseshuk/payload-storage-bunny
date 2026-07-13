import type { CollectionAfterChangeHook, CollectionBeforeValidateHook, FileData, JsonObject, TypeWithID } from 'payload'
import { MissingFile } from 'payload'

import { getHandleDelete } from '@/adapter/handleDelete.js'
import { getStreamVideo } from '@/stream/api.js'
import { deleteStreamVideoSession } from '@/stream/sessionsCollection.js'
import { isVideoProcessed } from '@/stream/video.js'
import type { CollectionContext } from '@/types/index.js'
import { getSafeFileName } from '@/utils/file.js'

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

    if (operation === 'create' && filesRequiredOnCreate && !data?.bunnyVideoId && !file) {
      throw new MissingFile(req.t)
    }

    if (data && !data.bunnyVideoId) {
      data.bunnyVideoId = null
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
        targetData.bunnyVideoId = videoData.guid

        if (!targetData.mimeType) {
          targetData.mimeType = 'video/mp4'
        }

        if (!targetData.filesize) {
          targetData.filesize = videoData.storageSize
        }
      }
    }

    if (operation === 'update' && originalDoc && data) {
      if (!file && data.bunnyVideoId && data.bunnyVideoId !== originalDoc.bunnyVideoId) {
        if (!req.context) {
          req.context = {}
        }
        req.context.oldDoc = originalDoc

        await processVideoData(data.bunnyVideoId, data)
      }
    }

    if (operation === 'create' && !file && data?.bunnyVideoId) {
      await processVideoData(data.bunnyVideoId, data)
    }

    return data
  }
}

type AfterChangeData = FileData & JsonObject & TypeWithID

export const getAfterChangeHook = (context: CollectionContext): CollectionAfterChangeHook<AfterChangeData> => {
  return async ({ data, req }) => {
    if (context.streamConfig?.cleanup && data.bunnyVideoId) {
      await deleteStreamVideoSession({
        libraryId: context.streamConfig.libraryId,
        payload: req.payload,
        videoId: data.bunnyVideoId,
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
          action: 'File cleanup after upload change',
          filename: oldDoc.filename,
          message: `Successfully deleted old file: ${oldDoc.filename}`,
        })
      } catch (err) {
        req.payload.logger.error({
          action: 'File cleanup after upload change',
          err,
          filename: oldDoc.filename,
          message: `Failed to delete old file: ${oldDoc.filename}`,
        })
      }
    }
  }
}
