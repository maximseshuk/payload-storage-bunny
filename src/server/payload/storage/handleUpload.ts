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
import { buildStoragePurgeUrl } from '@/server/urls.js'
import { matchesMimeTypePattern } from '@/shared/mimeTypes.js'
import type { PluginStorageBunnyTranslationsKeys } from '@/shared/translations/index.js'
import type { CollectionContext } from '@/shared/types/index.js'

export const getHandleUpload = (context: CollectionContext): HandleUpload => {
  const { accountApiKey, purgeOptions, storageOptions, streamOptions } = context

  return async ({ data, file, req, storageFilePath: path }) => {
    const reqT = req.t as unknown as TFunction<PluginStorageBunnyTranslationsKeys>

    try {
      const fileName = file.filename
      const isVideoFile = !!streamOptions?.mimeTypes?.some((pattern) => matchesMimeTypePattern(file.mimeType, pattern))

      if (streamOptions?.apiKey && isVideoFile) {
        const video = await createStreamVideo({
          apiKey: streamOptions.apiKey,
          libraryId: streamOptions.libraryId,
          thumbnailTime: streamOptions.thumbnailTime,
          title: fileName,
        })
        if (streamOptions.cleanup) {
          await createStreamVideoSession({
            libraryId: video.videoLibraryId,
            payload: req.payload,
            videoId: video.guid,
          })
        }
        await uploadStreamVideo({
          apiKey: streamOptions.apiKey,
          buffer: file.buffer,
          libraryId: streamOptions.libraryId,
          timeout: streamOptions.uploadTimeout,
          videoId: video.guid,
        })

        setStoredVideoId(data, video.guid)

        const adminThumbnail = getAdminThumbnail(context)
        if (adminThumbnail) {
          data.thumbnailURL = adminThumbnail({ doc: data as Record<string, unknown>, req })
        }
      } else if (storageOptions) {
        if (storageOptions.s3) {
          await uploadStorageFileS3({
            apiKey: storageOptions.apiKey,
            buffer: file.buffer,
            mimeType: file.mimeType,
            path,
            region: storageOptions.region,
            timeout: storageOptions.uploadTimeout,
            zoneName: storageOptions.zoneName,
          })
        } else {
          await uploadStorageFile({
            apiKey: storageOptions.apiKey,
            buffer: file.buffer,
            mimeType: file.mimeType,
            path,
            region: storageOptions.region,
            timeout: storageOptions.uploadTimeout,
            zoneName: storageOptions.zoneName,
          })
        }

        setStoredVideoId(data, null)

        if (purgeOptions && accountApiKey) {
          const url = buildStoragePurgeUrl({
            collectionPrefix: context.prefix,
            filename: fileName,
            hostname: storageOptions.hostname,
            prefix: data.prefix,
          })
          try {
            await purgeCache({ apiKey: accountApiKey, async: purgeOptions.async, url })
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
        ...(storageOptions && { storage: storageOptions.zoneName }),
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
