import type { PluginStorageBunnyTranslationsKeys } from '@/translations/index.js'
import type { NormalizedBunnyStorageConfig } from '@/types/configNormalized.js'
import type { StreamTusAuthRequest, StreamTusAuthResponse } from '@/types/index.js'
import type { TFunction } from '@payloadcms/translations'
import type { Endpoint } from 'payload'

import { createStreamVideo, getStreamVideo } from '@/utils/client/index.js'
import { createCollectionContext } from '@/utils/config/context.js'
import {
  canUploadToVideo,
  createStreamVideoSession,
  generateStreamTusUploadSignature,
  isVideoInErrorState, isVideoProcessed,
} from '@/utils/index.js'
import { APIError, getAccessResults } from 'payload'

export function getStreamEndpoints(config: NormalizedBunnyStorageConfig): Endpoint[] {
  const { stream } = config

  if (!stream) {
    return []
  }

  const endpoints: Endpoint[] = []

  if (stream.tus) {
    endpoints.push({
      handler: async (req): Promise<Response> => {
        const reqT = req.t as unknown as TFunction<PluginStorageBunnyTranslationsKeys>

        if (!stream.tus) {
          throw new APIError(reqT('@seshuk/payload-storage-bunny:errorAccessDenied'), 500, undefined, true)
        }

        try {
          if (!stream.apiKey || !stream.libraryId) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorStreamConfigMissing'), 500, undefined, true)
          }

          const body: StreamTusAuthRequest = req.json ? await req.json() : req.body

          if (!body.collection || !body.filename || !body.filetype || !body.filesize) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorMissingRequiredFields'), 400, undefined, true)
          }

          let accessResult = true
          if (stream.tus?.checkAccess) {
            accessResult = await stream.tus.checkAccess(req)
          } else {
            const accessResults = await getAccessResults({ req })
            accessResult = false

            if (accessResults.canAccessAdmin) {
              for (const collectionSlug of config.collections.keys()) {
                const collectionAccess = accessResults.collections?.[collectionSlug]?.create
                if (collectionAccess === true) {
                  accessResult = true
                  break
                }
              }
            }
          }

          if (!accessResult) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorAccessDenied'), 403, undefined, true)
          }

          const collection = req.payload.collections[body.collection]?.config
          if (!collection) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorAccessDenied'), 404, undefined, true)
          }

          const collectionContext = createCollectionContext(config, collection)
          const collectionStreamConfig = collectionContext.streamConfig || stream

          let videoId = body.videoId
          let videoData = null

          if (videoId) {
            try {
              videoData = await getStreamVideo({ streamConfig: stream, videoId })
              const videoStatus = videoData.status

              if (isVideoInErrorState(videoStatus)) {
                videoId = undefined
                videoData = null
              } else if (isVideoProcessed(videoStatus)) {
                return Response.json({
                  type: 'uploaded',
                  libraryId: stream.libraryId,
                  thumbnailTime: collectionStreamConfig.thumbnailTime,
                  title: videoData.title || body.filename,
                  videoId,
                } as StreamTusAuthResponse)
              } else if (!canUploadToVideo(videoStatus)) {
                videoId = undefined
                videoData = null
              }
            } catch {
              videoId = undefined
              videoData = null
            }
          }

          if (!videoId || !videoData) {
            const title = (body.title || body.filename).trim()
            if (!title || title.length === 0) {
              throw new APIError(reqT('@seshuk/payload-storage-bunny:errorTitleRequired'), 400, undefined, true)
            }

            const newVideo = await createStreamVideo({
              streamConfig: collectionStreamConfig,
              thumbnailTime: collectionStreamConfig.thumbnailTime,
              title,
            })

            if (stream.cleanup) {
              await createStreamVideoSession({
                libraryId: newVideo.videoLibraryId,
                payload: req.payload,
                videoId: newVideo.guid,
              })
            }

            videoId = newVideo.guid
          }

          const expirationTime = Math.floor(Date.now() / 1000) + stream.tus.uploadTimeout
          const signature = generateStreamTusUploadSignature({
            apiKey: stream.apiKey,
            expirationTime,
            libraryId: stream.libraryId,
            videoId,
          })

          return Response.json({
            type: 'upload',
            authorizationExpire: expirationTime,
            authorizationSignature: signature,
            libraryId: stream.libraryId,
            thumbnailTime: collectionStreamConfig.thumbnailTime,
            videoId,
          } as StreamTusAuthResponse)

        } catch (err) {
          if (err instanceof APIError) {
            throw err
          }

          req.payload.logger.error({ err })
          throw new APIError(reqT('@seshuk/payload-storage-bunny:errorInternalServer'), 500, undefined, true)
        }
      },
      method: 'post',
      path: '/storage-bunny/stream/tus-auth',
    })
  }

  return endpoints
}
