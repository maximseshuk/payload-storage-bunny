import { posix } from 'node:path'

import type { HandleUpload } from '@payloadcms/plugin-cloud-storage/types'
import type { TFunction } from '@payloadcms/translations'
import { APIError } from 'payload'

import type { PluginStorageBunnyTranslationsKeys } from '@/translations/index.js'
import type { CollectionContext } from '@/types/index.js'
import { createStreamVideo, purgeCache, uploadStorageFile, uploadStreamVideo } from '@/utils/client/index.js'
import { createStreamVideoSession, matchesMimeTypePattern } from '@/utils/index.js'

import { getGenerateURL } from './generateURL.js'

export const getHandleUpload = (context: CollectionContext): HandleUpload => {
  const { apiKey, prefix, purgeConfig, storageConfig, streamConfig } = context

  return async ({ collection, data, file, req }) => {
    const reqT = req.t as unknown as TFunction<PluginStorageBunnyTranslationsKeys>

    data.url = null
    data.thumbnailURL = null

    try {
      const fileName = file.filename
      const uploadPrefix = (data.prefix as string | undefined) ?? prefix ?? ''
      const path = posix.join(uploadPrefix, fileName)
      const isVideoFile = !!streamConfig?.mimeTypes?.some((pattern) => matchesMimeTypePattern(file.mimeType, pattern))

      if (streamConfig?.apiKey && isVideoFile) {
        const video = await createStreamVideo({
          apiKey: streamConfig.apiKey,
          libraryId: streamConfig.libraryId,
          thumbnailTime: streamConfig.thumbnailTime,
          title: fileName,
        })
        if (streamConfig.cleanup) {
          await createStreamVideoSession({
            libraryId: video.videoLibraryId,
            payload: req.payload,
            videoId: video.guid,
          })
        }
        await uploadStreamVideo({
          apiKey: streamConfig.apiKey,
          buffer: file.buffer,
          libraryId: streamConfig.libraryId,
          timeout: streamConfig.uploadTimeout,
          videoId: video.guid,
        })

        data.bunnyVideoId = video.guid
      } else if (storageConfig) {
        await uploadStorageFile({
          apiKey: storageConfig.apiKey,
          buffer: file.buffer,
          mimeType: file.mimeType,
          path,
          region: storageConfig.region,
          timeout: storageConfig.uploadTimeout,
          zoneName: storageConfig.zoneName,
        })

        data.bunnyVideoId = null

        if (purgeConfig && apiKey) {
          const url = await getGenerateURL(context)({ collection, data, filename: fileName, prefix: uploadPrefix })
          try {
            await purgeCache({ apiKey, async: purgeConfig.async, url })
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
      } else {
        throw new APIError(reqT('@seshuk/payload-storage-bunny:errorNoServiceConfigured'), 500, undefined, true)
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
        ...(storageConfig && { storage: storageConfig.zoneName }),
      })

      throw new APIError(
        reqT('@seshuk/payload-storage-bunny:errorUploadFileFailed', { filename: file.filename }),
        500,
        undefined,
        true,
      )
    }
  }
}
