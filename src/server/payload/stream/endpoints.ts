import { createHmac, timingSafeEqual } from 'node:crypto'

import type { Endpoint } from 'payload'
import { APIError, getAccessResults } from 'payload'
import sanitize from 'sanitize-filename'

import {
  canUploadToVideo,
  createStreamVideo,
  getStreamVideo,
  getStreamVideoResolutions,
  isVideoInErrorState,
  isVideoProcessed,
  parseMp4Resolutions,
} from '@/server/bunny/stream.js'
import { getSafeFileName } from '@/server/files.js'
import { streamWebhookOperation, tusAuthOperation } from '@/server/payload/openapi.js'
import { createCollectionContext } from '@/server/payload/options/context.js'
import { collectStreamOptions, collectWebhookSecrets, hasAnyStreamTus } from '@/server/payload/options/inspect.js'
import { signClientUpload } from '@/server/payload/storage/clientUploads/receipt.js'
import {
  assertClientUploadFile,
  resolveClientUploadPrefix,
} from '@/server/payload/storage/clientUploads/uploadInstructions.js'
import { createStreamVideoSession } from '@/server/payload/stream/sessionsCollection.js'
import {
  generateStreamTusUploadSignature,
  signStreamVideoToken,
  verifyStreamVideoToken,
} from '@/server/payload/stream/tusSignature.js'
import { jsonResponse } from '@/shared/http.js'
import { matchesMimeTypePattern } from '@/shared/mimeTypes.js'
import type { PluginStorageBunnyTFunction } from '@/shared/translations/index.js'
import type { StreamTusAuthRequest, StreamTusAuthResponse } from '@/shared/types/index.js'
import type { NormalizedBunnyStorageOptions } from '@/shared/types/optionsNormalized.js'

const MAX_HEAD_LENGTH = 8192

export const getStreamEndpoints = (options: NormalizedBunnyStorageOptions): Endpoint[] => {
  const webhookSecrets = collectWebhookSecrets(options)
  const streamOptionsByLibrary = collectStreamOptions(options)

  const endpoints: Endpoint[] = []

  if (hasAnyStreamTus(options)) {
    endpoints.push({
      handler: async (req): Promise<Response> => {
        const reqT = req.t as unknown as PluginStorageBunnyTFunction

        try {
          const body: StreamTusAuthRequest = req.json ? await req.json() : req.body

          if (!body.collection || !body.filename || !body.filetype || !body.filesize) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorMissingRequiredFields'), 400, undefined, true)
          }

          if (body.head !== undefined && (typeof body.head !== 'string' || body.head.length > MAX_HEAD_LENGTH)) {
            throw new APIError('Invalid file head', 400, undefined, true)
          }

          const collection = req.payload.collections[body.collection]?.config
          if (!collection) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorAccessDenied'), 404, undefined, true)
          }

          const collectionContext = createCollectionContext(options, collection)
          const collectionStreamOptions = collectionContext.streamOptions

          if (!collectionStreamOptions || !collectionStreamOptions.tus) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorStreamOptionsMissing'), 400, undefined, true)
          }

          const defaultAccess = async (): Promise<boolean> => {
            const accessResults = await getAccessResults({ req })
            return (
              accessResults.canAccessAdmin === true && accessResults.collections?.[body.collection]?.create === true
            )
          }

          const accessResult = collectionStreamOptions.tus.access
            ? await collectionStreamOptions.tus.access({ data: body, defaultAccess, req })
            : await defaultAccess()

          if (!accessResult) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorAccessDenied'), 403, undefined, true)
          }

          assertClientUploadFile({
            collection,
            filename: body.filename,
            filesize: body.filesize,
            mimeType: body.filetype,
            req,
          })
          if (!collectionStreamOptions.mimeTypes.some((pattern) => matchesMimeTypePattern(body.filetype, pattern))) {
            throw new APIError(`File type "${body.filetype}" is not allowed`, 415)
          }

          const tokenInput = {
            collection: body.collection,
            libraryId: collectionStreamOptions.libraryId,
            secret: req.payload.secret,
            user: req.user,
          }
          const withVideoToken = async (videoId: string) => {
            const videoToken = signStreamVideoToken({ ...tokenInput, videoId })
            const head = body.head
            if (head === undefined) {
              return { videoId, videoToken }
            }
            const filename = await getSafeFileName({
              collectionSlug: body.collection,
              desiredFilename: sanitize(body.filename),
              req,
              staticPath: '',
            })
            const signedReceipt = signClientUpload({
              claims: { filesize: body.filesize, head, mimeType: body.filetype, videoId },
              collectionSlug: body.collection,
              filename,
              prefix: await resolveClientUploadPrefix(collectionContext, {
                collectionSlug: body.collection,
                filename,
                req,
              }),
              req,
            })
            return { filename, signedReceipt, videoId, videoToken }
          }

          let videoId =
            body.videoId && verifyStreamVideoToken({ ...tokenInput, token: body.videoToken, videoId: body.videoId })
              ? body.videoId
              : undefined
          let videoData = null

          if (videoId) {
            try {
              videoData = await getStreamVideo({
                apiKey: collectionStreamOptions.apiKey,
                libraryId: collectionStreamOptions.libraryId,
                videoId,
              })
              const videoStatus = videoData.status

              if (isVideoInErrorState(videoStatus)) {
                videoId = undefined
                videoData = null
              } else if (isVideoProcessed(videoStatus)) {
                return jsonResponse({
                  type: 'uploaded',
                  libraryId: collectionStreamOptions.libraryId,
                  thumbnailTime: collectionStreamOptions.thumbnailTime,
                  title: videoData.title || body.filename,
                  ...(await withVideoToken(videoId)),
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
              apiKey: collectionStreamOptions.apiKey,
              libraryId: collectionStreamOptions.libraryId,
              thumbnailTime: collectionStreamOptions.thumbnailTime,
              title,
            })

            if (collectionStreamOptions.cleanup) {
              await createStreamVideoSession({
                libraryId: newVideo.videoLibraryId,
                payload: req.payload,
                videoId: newVideo.guid,
              })
            }

            videoId = newVideo.guid
          }

          const tusExpiresIn = collectionStreamOptions.tus.expiresIn
          const expirationTime = Math.floor(Date.now() / 1000) + tusExpiresIn
          const signature = generateStreamTusUploadSignature({
            apiKey: collectionStreamOptions.apiKey,
            expirationTime,
            libraryId: collectionStreamOptions.libraryId,
            videoId,
          })

          return jsonResponse({
            type: 'upload',
            authorizationExpire: expirationTime,
            authorizationSignature: signature,
            libraryId: collectionStreamOptions.libraryId,
            thumbnailTime: collectionStreamOptions.thumbnailTime,
            ...(await withVideoToken(videoId)),
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

          if (!streamOptionsByLibrary.has(VideoLibraryId)) {
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
            for (const collectionSlug of options.collections.keys()) {
              const collection = req.payload.collections[collectionSlug]?.config
              if (!collection) {
                continue
              }

              const collectionContext = createCollectionContext(options, collection)
              if (
                !collectionContext.streamOptions ||
                collectionContext.streamOptions.libraryId !== VideoLibraryId ||
                !collectionContext.streamOptions.mp4Fallback
              ) {
                continue
              }

              try {
                const docs = await req.payload.find({
                  collection: collectionSlug,
                  limit: 1,
                  overrideAccess: true,
                  where: {
                    'bunnyData.stream.videoId': {
                      equals: VideoGuid,
                    },
                  },
                })

                if (docs.docs.length > 0) {
                  const doc = docs.docs[0]

                  const resolutionsData = await getStreamVideoResolutions({
                    apiKey: collectionContext.streamOptions.apiKey,
                    libraryId: collectionContext.streamOptions.libraryId,
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
                        overrideAccess: true,
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
