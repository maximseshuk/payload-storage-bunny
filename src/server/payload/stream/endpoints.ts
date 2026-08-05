import { createHmac, timingSafeEqual } from 'node:crypto'

import type { Endpoint } from 'payload'
import { APIError, getAccessResults } from 'payload'

import {
  canUploadToVideo,
  createStreamVideo,
  getStreamVideo,
  getStreamVideoResolutions,
  isVideoInErrorState,
  isVideoProcessed,
  parseMp4Resolutions,
} from '@/server/bunny/stream.js'
import { createCollectionContext } from '@/server/payload/config/context.js'
import { collectStreamConfigs, collectWebhookSecrets, hasAnyStreamTus } from '@/server/payload/config/inspect.js'
import { streamWebhookOperation, tusAuthOperation } from '@/server/payload/openapi.js'
import { createStreamVideoSession } from '@/server/payload/stream/sessionsCollection.js'
import { generateStreamTusUploadSignature } from '@/server/payload/stream/tusSignature.js'
import { jsonResponse } from '@/shared/http.js'
import type { PluginStorageBunnyTFunction } from '@/shared/translations/index.js'
import type { NormalizedBunnyStorageConfig } from '@/shared/types/configNormalized.js'
import type { StreamTusAuthRequest, StreamTusAuthResponse } from '@/shared/types/index.js'

export const getStreamEndpoints = (config: NormalizedBunnyStorageConfig): Endpoint[] => {
  const webhookSecrets = collectWebhookSecrets(config)
  const streamConfigs = collectStreamConfigs(config)

  const endpoints: Endpoint[] = []

  if (hasAnyStreamTus(config)) {
    endpoints.push({
      handler: async (req): Promise<Response> => {
        const reqT = req.t as unknown as PluginStorageBunnyTFunction

        try {
          const body: StreamTusAuthRequest = req.json ? await req.json() : req.body

          if (!body.collection || !body.filename || !body.filetype || !body.filesize) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorMissingRequiredFields'), 400, undefined, true)
          }

          const collection = req.payload.collections[body.collection]?.config
          if (!collection) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorAccessDenied'), 404, undefined, true)
          }

          const collectionContext = createCollectionContext(config, collection)
          const collectionStreamConfig = collectionContext.streamConfig

          if (!collectionStreamConfig || !collectionStreamConfig.tus) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorStreamConfigMissing'), 400, undefined, true)
          }

          let accessResult = true
          if (collectionStreamConfig.tus.checkAccess) {
            accessResult = await collectionStreamConfig.tus.checkAccess(req, body)
          } else {
            const accessResults = await getAccessResults({ req })
            accessResult = false

            if (accessResults.canAccessAdmin) {
              const collectionAccess = accessResults.collections?.[body.collection]?.create
              accessResult = collectionAccess === true
            }
          }

          if (!accessResult) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorAccessDenied'), 403, undefined, true)
          }

          let videoId = body.videoId
          let videoData = null

          if (videoId) {
            try {
              videoData = await getStreamVideo({
                apiKey: collectionStreamConfig.apiKey,
                libraryId: collectionStreamConfig.libraryId,
                videoId,
              })
              const videoStatus = videoData.status

              if (isVideoInErrorState(videoStatus)) {
                videoId = undefined
                videoData = null
              } else if (isVideoProcessed(videoStatus)) {
                return jsonResponse({
                  type: 'uploaded',
                  libraryId: collectionStreamConfig.libraryId,
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
              apiKey: collectionStreamConfig.apiKey,
              libraryId: collectionStreamConfig.libraryId,
              thumbnailTime: collectionStreamConfig.thumbnailTime,
              title,
            })

            if (collectionStreamConfig.cleanup) {
              await createStreamVideoSession({
                libraryId: newVideo.videoLibraryId,
                payload: req.payload,
                videoId: newVideo.guid,
              })
            }

            videoId = newVideo.guid
          }

          const tusExpiresIn = collectionStreamConfig.tus.expiresIn
          const expirationTime = Math.floor(Date.now() / 1000) + tusExpiresIn
          const signature = generateStreamTusUploadSignature({
            apiKey: collectionStreamConfig.apiKey,
            expirationTime,
            libraryId: collectionStreamConfig.libraryId,
            videoId,
          })

          return jsonResponse({
            type: 'upload',
            authorizationExpire: expirationTime,
            authorizationSignature: signature,
            libraryId: collectionStreamConfig.libraryId,
            thumbnailTime: collectionStreamConfig.thumbnailTime,
            videoId,
          } as StreamTusAuthResponse)
        } catch (err) {
          if (err instanceof APIError) {
            throw err
          }

          req.payload.logger.error({ err, msg: '[bunny:stream] tus-auth: request failed' })
          throw new APIError(reqT('error:unknown'), 500, undefined, true)
        }
      },
      custom: { openapi: tusAuthOperation },
      method: 'post',
      path: '/storage-bunny/stream/tus-auth',
    })
  }

  if (webhookSecrets.size > 0) {
    endpoints.push({
      handler: async (req) => {
        try {
          const rawBody = req.text ? await req.text() : ''

          let body: { Status?: number; VideoGuid?: string; VideoLibraryId?: number }
          try {
            body = JSON.parse(rawBody)
          } catch {
            return jsonResponse({ error: 'Invalid webhook payload' }, 400)
          }

          const { Status, VideoGuid, VideoLibraryId } = body

          if (!VideoLibraryId || !VideoGuid || Status === undefined) {
            return jsonResponse({ error: 'Invalid webhook payload' }, 400)
          }

          if (!streamConfigs.has(VideoLibraryId)) {
            return jsonResponse({ error: 'Library ID mismatch' }, 403)
          }

          const signingSecret = webhookSecrets.get(VideoLibraryId)
          const signature = req.headers?.get('x-bunnystream-signature')
          const signatureVersion = req.headers?.get('x-bunnystream-signature-version')
          const signatureAlgorithm = req.headers?.get('x-bunnystream-signature-algorithm')

          if (!signingSecret || !signature || signatureVersion !== 'v1' || signatureAlgorithm !== 'hmac-sha256') {
            return jsonResponse({ error: 'Unauthorized' }, 401)
          }

          const expected = createHmac('sha256', signingSecret).update(rawBody).digest('hex')
          const expectedBuffer = Buffer.from(expected)
          const signatureBuffer = Buffer.from(signature)

          if (expectedBuffer.length !== signatureBuffer.length || !timingSafeEqual(expectedBuffer, signatureBuffer)) {
            return jsonResponse({ error: 'Unauthorized' }, 401)
          }

          if (Status === 3) {
            for (const collectionSlug of config.collections.keys()) {
              const collection = req.payload.collections[collectionSlug]?.config
              if (!collection) {
                continue
              }

              const collectionContext = createCollectionContext(config, collection)
              if (
                !collectionContext.streamConfig ||
                collectionContext.streamConfig.libraryId !== VideoLibraryId ||
                !collectionContext.streamConfig.mp4Fallback
              ) {
                continue
              }

              try {
                const docs = await req.payload.find({
                  collection: collectionSlug,
                  limit: 1,
                  where: {
                    'bunnyData.stream.videoId': {
                      equals: VideoGuid,
                    },
                  },
                })

                if (docs.docs.length > 0) {
                  const doc = docs.docs[0]

                  const resolutionsData = await getStreamVideoResolutions({
                    apiKey: collectionContext.streamConfig.apiKey,
                    libraryId: collectionContext.streamConfig.libraryId,
                    videoId: VideoGuid,
                  })

                  if (resolutionsData.success && resolutionsData.data.mp4Resolutions) {
                    const { available, sorted } = parseMp4Resolutions(resolutionsData.data)

                    if (available.length > 0) {
                      await req.payload.update({
                        id: doc.id,
                        collection: collectionSlug,
                        data: {
                          bunnyData: {
                            stream: {
                              resolutions: {
                                available,
                                highest: sorted[0],
                              },
                            },
                          },
                        },
                      })

                      req.payload.logger.debug({
                        msg: '[bunny:stream] webhook: updated video resolutions',
                        resolutions: available,
                        videoId: VideoGuid,
                      })
                    }
                  }

                  break
                }
              } catch (err) {
                req.payload.logger.error({
                  err,
                  msg: '[bunny:stream] webhook: error processing video',
                  videoId: VideoGuid,
                })
              }
            }
          }

          return jsonResponse({ success: true })
        } catch (err) {
          req.payload.logger.error({ err, msg: '[bunny:stream] webhook: handler failed' })
          return jsonResponse({ error: 'Internal server error' }, 500)
        }
      },
      custom: { openapi: streamWebhookOperation },
      method: 'post',
      path: '/storage-bunny/stream/webhook',
    })
  }

  return endpoints
}
