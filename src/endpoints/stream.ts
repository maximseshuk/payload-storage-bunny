import type { PluginStorageBunnyTFunction } from '@/translations/index.js'
import type { NormalizedBunnyStorageConfig } from '@/types/configNormalized.js'
import type { StreamTusAuthRequest, StreamTusAuthResponse } from '@/types/index.js'
import type { Endpoint } from 'payload'

import {
  createStreamVideo,
  getStreamVideo,
  getStreamVideoResolutions,
} from '@/utils/client/index.js'
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
        const reqT = req.t as unknown as PluginStorageBunnyTFunction

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

          const tusUploadTimeout = collectionStreamConfig.tus?.uploadTimeout ?? stream.tus.uploadTimeout
          const expirationTime = Math.floor(Date.now() / 1000) + tusUploadTimeout
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
          throw new APIError(reqT('error:unknown'), 500, undefined, true)
        }
      },
      method: 'post',
      path: '/storage-bunny/stream/tus-auth',
    })
  }

  if (stream.webhook) {
    endpoints.push({
      handler: async (req) => {
        try {
          const url = new URL(req.url || '', 'http://localhost')
          const secret = url.searchParams.get('secret')

          if (secret !== stream.webhook!.secret) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 })
          }

          const body = req.json ? await req.json() : req.body
          const { Status, VideoGuid, VideoLibraryId } = body

          if (!VideoLibraryId || !VideoGuid || Status === undefined) {
            return Response.json({ error: 'Invalid webhook payload' }, { status: 400 })
          }

          if (VideoLibraryId !== stream.libraryId) {
            return Response.json({ error: 'Library ID mismatch' }, { status: 403 })
          }

          if (Status === 3 && stream.mp4Fallback) {
            for (const collectionSlug of config.collections.keys()) {
              const collection = req.payload.collections[collectionSlug]?.config
              if (!collection) {
                continue
              }

              const collectionContext = createCollectionContext(config, collection)
              if (!collectionContext.streamConfig) {
                continue
              }

              try {
                const docs = await req.payload.find({
                  collection: collectionSlug,
                  limit: 1,
                  where: {
                    bunnyVideoId: {
                      equals: VideoGuid,
                    },
                  },
                })

                if (docs.docs.length > 0) {
                  const doc = docs.docs[0]

                  const resolutionsData = await getStreamVideoResolutions({
                    streamConfig: collectionContext.streamConfig,
                    videoId: VideoGuid,
                  })

                  if (resolutionsData.success && resolutionsData.data.mp4Resolutions) {
                    const availableResolutions = resolutionsData.data.mp4Resolutions
                      ?.map((r) => r.resolution)
                      .filter((resolution): resolution is string => Boolean(resolution)) || []

                    if (availableResolutions.length > 0) {
                      const sortedResolutions = [...availableResolutions].sort((a, b) =>
                        parseInt(b.replace('p', '')) - parseInt(a.replace('p', '')),
                      )

                      await req.payload.update({
                        id: doc.id,
                        collection: collectionSlug,
                        data: {
                          bunnyVideoResolutions: {
                            available: availableResolutions,
                            highest: sortedResolutions[0],
                          },
                        },
                      })

                      req.payload.logger.debug({
                        msg: 'Webhook: Updated video resolutions',
                        resolutions: availableResolutions,
                        videoId: VideoGuid,
                      })
                    }
                  }

                  break
                }
              } catch (err) {
                req.payload.logger.error({ err, msg: 'Webhook: Error processing video', videoId: VideoGuid })
              }
            }
          }

          return Response.json({ success: true })
        } catch (err) {
          req.payload.logger.error({ err, msg: 'Webhook error' })
          return Response.json({ error: 'Internal server error' }, { status: 500 })
        }
      },
      method: 'post',
      path: '/storage-bunny/stream/webhook',
    })
  }

  return endpoints
}
