import type { HandleUpload } from '@payloadcms/plugin-cloud-storage/types'
import type { TFunction } from '@payloadcms/translations'
import type { CollectionBeforeChangeHook } from 'payload'
import { APIError } from 'payload'

import { uploadStorageFileS3 } from '@/server/bunny/s3.js'
import { uploadStorageFile } from '@/server/bunny/storage.js'
import { createStreamVideo, getStreamSaveState, getStreamVideo, uploadStreamVideo } from '@/server/bunny/stream.js'
import { markServerStreamUpload, setStoredVideoId } from '@/server/payload/fields/bunnyGroupField.js'
import { getAdminThumbnail } from '@/server/payload/fields/hooks.js'
import { setStreamKey } from '@/server/payload/storage/fileOperations.js'
import { createStreamVideoSession } from '@/server/payload/stream/sessionsCollection.js'
import { matchesMimeTypePattern } from '@/shared/mimeTypes.js'
import type { PluginStorageBunnyTranslationsKeys } from '@/shared/translations/index.js'
import type { CollectionContext } from '@/shared/types/index.js'

const uploadsToStream = ({ streamOptions }: CollectionContext, mimeType: unknown): boolean =>
  !!streamOptions?.apiKey &&
  typeof mimeType === 'string' &&
  streamOptions.mimeTypes.some((pattern) => matchesMimeTypePattern(mimeType, pattern))

export const getForgetStreamVideoHook =
  (context: CollectionContext): CollectionBeforeChangeHook =>
  ({ data, req }) => {
    const { streamOptions } = context
    if (!streamOptions || !req.file || uploadsToStream(context, data.mimeType)) {
      return data
    }
    setStoredVideoId(
      data,
      null,
      streamOptions.status ? null : undefined,
      streamOptions.status && streamOptions.mp4Fallback ? null : undefined,
    )
    return data
  }

export const getHandleUpload = (context: CollectionContext): HandleUpload => {
  const { storageOptions, streamOptions } = context

  return async ({ data, file, req, storageFilePath: path }) => {
    const reqT = req.t as unknown as TFunction<PluginStorageBunnyTranslationsKeys>

    try {
      const fileName = file.filename

      if (streamOptions && uploadsToStream(context, file.mimeType)) {
        const video = await createStreamVideo({
          apiKey: streamOptions.apiKey,
          libraryId: streamOptions.libraryId,
          thumbnailTime: streamOptions.thumbnailTime,
          title: fileName.replace(/-original(?:-\d+)?(\.[^.]*)?$/, '$1'),
        })
        setStreamKey(req, context.collection.slug, path, video.guid)
        markServerStreamUpload(req, video.guid)
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

        const { apiKey, libraryId, mp4Fallback } = streamOptions
        const saved = streamOptions.status
          ? await getStreamVideo({ apiKey, libraryId, videoId: video.guid })
              .then((uploaded) =>
                getStreamSaveState({ apiKey, libraryId, logger: req.payload.logger, mp4Fallback, video: uploaded }),
              )
              .catch((err: unknown) => {
                req.payload.logger.error({
                  err,
                  msg: '[bunny:stream] upload: failed to read the video state',
                  videoId: video.guid,
                })
                return { resolutions: mp4Fallback ? null : undefined, status: 'processing' as const }
              })
          : undefined
        setStoredVideoId(data, video.guid, saved?.status, saved?.resolutions ?? (mp4Fallback ? null : undefined))

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
