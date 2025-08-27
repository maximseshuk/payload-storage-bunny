import type { PluginStorageBunnyTranslationsKeys } from '@/translations/index.js'
import type { CollectionContext } from '@/types/index.js'
import type { HandleUpload } from '@payloadcms/plugin-cloud-storage/types'
import type { TFunction } from '@payloadcms/translations'

import { createStreamVideo, purgeCache, uploadStorageFile, uploadStreamVideo } from '@/utils/client/index.js'
import { createStreamVideoSession, isStream } from '@/utils/index.js'
import { posix } from 'node:path'
import { APIError } from 'payload'

import { getGenerateURL } from './generateURL.js'

export const getHandleUpload = (context: CollectionContext): HandleUpload => {
  const { prefix, purgeConfig, storageConfig, streamConfig } = context

  return async ({ collection, data, file, req }) => {
    const reqT = req.t as unknown as TFunction<PluginStorageBunnyTranslationsKeys>

    data.url = null
    data.thumbnailURL = null

    try {
      const fileName = file.filename
      const path = posix.join(prefix || '', fileName)
      const isVideoFile = isStream(file.mimeType)

      if (streamConfig?.apiKey && isVideoFile) {
        const video = await createStreamVideo({ streamConfig, title: fileName })
        if (streamConfig.cleanup) {
          await createStreamVideoSession({
            libraryId: video.videoLibraryId,
            payload: req.payload,
            videoId: video.guid,
          })
        }
        await uploadStreamVideo({
          buffer: file.buffer,
          streamConfig,
          videoId: video.guid,
        })

        data.bunnyVideoId = video.guid
      } else {
        await uploadStorageFile({
          buffer: file.buffer,
          mimeType: file.mimeType,
          path,
          storageConfig,
        })

        data.bunnyVideoId = null

        if (purgeConfig) {
          const url = await getGenerateURL(context)({ collection, data, filename: fileName, prefix: prefix || '' })
          try {
            await purgeCache({ purgeConfig, url })
            req.payload.logger.debug({
              action: 'Cache purged after upload',
              url,
            })
          } catch (err) {
            req.payload.logger.error({
              action: 'Cache purge after upload',
              err,
              url,
            })
          }
        }
      }

      return data
    } catch (err) {
      req.payload.logger.error({
        err,
        file: {
          name: file.filename,
          type: file.mimeType,
          size: file.filesize,
        },
        storage: storageConfig.zoneName,
      })

      throw new APIError(reqT('@seshuk/payload-storage-bunny:errorUploadFileFailed', { filename: file.filename }), 500)
    }
  }
}
