import type { PluginStorageBunnyTranslationsKeys } from '@/translations/index.js'
import type { CollectionContext } from '@/types/index.js'
import type { HandleDelete } from '@payloadcms/plugin-cloud-storage/types'
import type { TFunction } from '@payloadcms/translations'

import { deleteStorageFile, deleteStreamVideo, purgeCache } from '@/utils/client/index.js'
import { parseVideoFromDocument } from '@/utils/streamVideo.js'
import { posix } from 'node:path'
import { APIError } from 'payload'

import { getGenerateURL } from './generateURL.js'

export const getHandleDelete = (context: CollectionContext): HandleDelete => {
  const { purgeConfig, storageConfig, streamConfig } = context

  return async ({ collection, doc, filename, req }) => {
    const reqT = req.t as unknown as TFunction<PluginStorageBunnyTranslationsKeys>

    try {
      const video = parseVideoFromDocument(doc, filename)

      let fileUrl: null | string = null
      if (!video && purgeConfig) {
        fileUrl = await getGenerateURL(context)({
          collection,
          data: doc,
          filename,
          prefix: doc.prefix || '',
        })
      }

      if (streamConfig && video) {
        await deleteStreamVideo({ streamConfig, videoId: video.videoId })
      } else if (storageConfig) {
        const path = posix.join(doc.prefix || '', filename)

        await deleteStorageFile({
          path,
          storageConfig,
        })

        if (purgeConfig && fileUrl) {
          await purgeCache({ purgeConfig, url: fileUrl })
          req.payload.logger.debug({
            action: 'Cache purged after delete',
            url: fileUrl,
          })
        }
      } else {
        req.payload.logger.debug({
          action: 'No storage or stream config, skipping delete',
          file: { name: filename },
        })
      }
    } catch (err) {
      req.payload.logger.error({
        err,
        file: { name: filename },
        ...(storageConfig && { storage: storageConfig.zoneName }),
      })

      throw new APIError(reqT('@seshuk/payload-storage-bunny:errorDeleteFileFailed', { filename }), 500, undefined, true)
    }
  }
}
