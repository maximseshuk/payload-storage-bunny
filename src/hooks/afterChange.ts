import type { CollectionContext } from '@/types/index.js'
import type { CollectionAfterChangeHook, FileData, JsonObject, TypeWithID } from 'payload'

import { getHandleDelete } from '@/handlers/index.js'
import { deleteStreamVideoSession } from '@/utils/index.js'

type Data = FileData & JsonObject & TypeWithID

export const getAfterChangeHook = (context: CollectionContext): CollectionAfterChangeHook<Data> => {
  return async ({ data, req }) => {
    if (context.streamConfig?.cleanup && 'bunnyVideoId' in data) {
      await deleteStreamVideoSession({
        libraryId: context.streamConfig.libraryId,
        payload: req.payload,
        videoId: data.bunnyVideoId,
      })
    }

    if (context.isTusUploadSupported) {
      const oldDoc = req.context?.oldDoc

      if (!oldDoc ||
          typeof oldDoc !== 'object' ||
          !('filename' in oldDoc) ||
          typeof oldDoc.filename !== 'string') {
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
