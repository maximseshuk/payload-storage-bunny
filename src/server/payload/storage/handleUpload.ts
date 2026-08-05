import { posix } from 'node:path'

import type { HandleUpload } from '@payloadcms/plugin-cloud-storage/types'
import type { TFunction } from '@payloadcms/translations'
import { APIError } from 'payload'

import { purgeCache } from '@/server/bunny/cdn.js'
import { uploadStorageFileS3 } from '@/server/bunny/s3.js'
import { uploadStorageFile } from '@/server/bunny/storage.js'
import { createStreamVideo, uploadStreamVideo } from '@/server/bunny/stream.js'
import { setStoredVideoId } from '@/server/payload/fields/bunnyGroupField.js'
import { getAdminThumbnail } from '@/server/payload/fields/hooks.js'
import { createStreamVideoSession } from '@/server/payload/stream/sessionsCollection.js'
import { matchesMimeTypePattern } from '@/shared/mimeTypes.js'
import type { PluginStorageBunnyTranslationsKeys } from '@/shared/translations/index.js'
import type { CollectionContext } from '@/shared/types/index.js'

import { getGenerateUrl } from './generateUrl.js'

export const getHandleUpload = (context: CollectionContext): HandleUpload => {
  const { accountApiKey, prefix, purgeConfig, storageConfig, streamConfig } = context

  return async ({ clientUploadContext, collection, data, file, req }) => {
    const reqT = req.t as unknown as TFunction<PluginStorageBunnyTranslationsKeys>

    if (clientUploadContext) {
      setStoredVideoId(data, null)
      return data
    }

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

        setStoredVideoId(data, video.guid)

        const adminThumbnail = getAdminThumbnail(context)
        if (adminThumbnail) {
          data.thumbnailURL = adminThumbnail({ doc: data as Record<string, unknown>, req })
        }
      } else if (storageConfig) {
        if (storageConfig.s3) {
          await uploadStorageFileS3({
            apiKey: storageConfig.apiKey,
            buffer: file.buffer,
            mimeType: file.mimeType,
            path,
            s3: storageConfig.s3,
            timeout: storageConfig.uploadTimeout,
            zoneName: storageConfig.zoneName,
          })
        } else {
          await uploadStorageFile({
            apiKey: storageConfig.apiKey,
            buffer: file.buffer,
            mimeType: file.mimeType,
            path,
            region: storageConfig.region,
            timeout: storageConfig.uploadTimeout,
            zoneName: storageConfig.zoneName,
          })
        }

        setStoredVideoId(data, null)

        if (purgeConfig && accountApiKey) {
          const url = await getGenerateUrl(context)({ collection, data, filename: fileName, prefix: uploadPrefix })
          try {
            await purgeCache({ apiKey: accountApiKey, async: purgeConfig.async, url })
            req.payload.logger.debug({
              msg: '[bunny:storage] upload: cache purged',
              url,
            })
          } catch (err) {
            req.payload.logger.error({
              err,
              msg: '[bunny:storage] upload: cache purge failed',
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
        msg: '[bunny:storage] upload: failed',
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
