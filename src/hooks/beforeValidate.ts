import type { CollectionContext } from '@/types/index.js'
import type { CollectionBeforeValidateHook, JsonObject, TypeWithID } from 'payload'

import { getStreamVideo } from '@/utils/client/index.js'
import { getSafeFileName, isVideoProcessed } from '@/utils/index.js'
import { MissingFile } from 'payload'

type Args = {
  context: CollectionContext
  filesRequiredOnCreate: boolean
}

export const getBeforeValidateHook =
 ({ context, filesRequiredOnCreate }: Args): CollectionBeforeValidateHook<JsonObject & TypeWithID> => {
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
         streamConfig: context.streamConfig,
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
