import type { TypeWithPrefix } from '@payloadcms/plugin-cloud-storage/types'
import { buildStoragePathData } from '@payloadcms/plugin-cloud-storage/utilities'
import type {
  CollectionAfterChangeHook,
  CollectionBeforeValidateHook,
  FileData,
  JsonObject,
  PayloadRequest,
  TypeWithID,
  Where,
} from 'payload'
import { Forbidden, MissingFile, ValidationError } from 'payload'

import { getStreamVideo, isVideoProcessed } from '@/server/bunny/stream.js'
import { getSafeFileName } from '@/server/files.js'
import { readStoredVideo, setStoredVideoId } from '@/server/payload/fields/bunnyGroupField.js'
import { getHandleDelete } from '@/server/payload/storage/handleDelete.js'
import { getStreamClientUpload } from '@/server/payload/stream/clientUploads.js'
import { deleteStreamVideoSession } from '@/server/payload/stream/sessionsCollection.js'
import { verifyStreamVideoToken } from '@/server/payload/stream/tusSignature.js'
import type { NormalizedBunnyStorageConfig } from '@/shared/types/configNormalized.js'
import type { CollectionContext } from '@/shared/types/index.js'

type BeforeValidateArgs = {
  config: NormalizedBunnyStorageConfig
  context: CollectionContext
  filesRequiredOnCreate: boolean
}

type AssertVideoUnclaimedArgs = {
  config: NormalizedBunnyStorageConfig
  context: CollectionContext
  id?: number | string
  req: PayloadRequest
  videoId: string
}

const assertVideoUnclaimed = async ({ config, context, id, req, videoId }: AssertVideoUnclaimedArgs) => {
  const slugs = new Set([context.collection.slug])
  for (const [slug, collectionConfig] of config.collections) {
    if (collectionConfig.stream && collectionConfig.stream.libraryId === context.streamConfig?.libraryId) {
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
  config,
  context,
  filesRequiredOnCreate,
}: BeforeValidateArgs): CollectionBeforeValidateHook<BeforeValidateData> => {
  return async ({ data, operation, originalDoc, req }) => {
    const file = req.file

    if (operation === 'create' && filesRequiredOnCreate && !readStoredVideo(data)?.videoId && !file) {
      throw new MissingFile(req.t)
    }

    const streamClientUpload = getStreamClientUpload(file?.clientUploadContext)
    if (streamClientUpload && data && context.streamConfig) {
      const tokenValid = verifyStreamVideoToken({
        collection: context.collection.slug,
        libraryId: context.streamConfig.libraryId,
        secret: req.payload.secret,
        token: streamClientUpload.videoToken,
        user: req.user,
        videoId: streamClientUpload.videoId,
      })
      if (!tokenValid) {
        throw new Forbidden(req.t)
      }
      await getStreamVideo({
        apiKey: context.streamConfig.apiKey,
        libraryId: context.streamConfig.libraryId,
        videoId: streamClientUpload.videoId,
      })
      setStoredVideoId(data, streamClientUpload.videoId)
    }

    if (data && !readStoredVideo(data)?.videoId) {
      setStoredVideoId(data, null)
    }

    const storedVideoId = readStoredVideo(data)?.videoId
    if (storedVideoId && context.streamConfig && storedVideoId !== readStoredVideo(originalDoc)?.videoId) {
      await assertVideoUnclaimed({ config, context, id: originalDoc?.id, req, videoId: storedVideoId })
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
      const doc = oldDoc as FileData & JsonObject & TypeWithID & TypeWithPrefix

      try {
        await handleDelete({
          collection: context.collection,
          doc,
          filename: oldDoc.filename,
          req,
          storageFilePath: buildStoragePathData({
            collectionPrefix: context.prefix,
            docPrefix: doc.prefix,
            filename: oldDoc.filename,
          }).storageFilePath,
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
