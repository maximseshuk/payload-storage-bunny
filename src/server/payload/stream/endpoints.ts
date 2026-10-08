import { createHmac, timingSafeEqual } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type { Endpoint, TypeWithID } from 'payload'
import { APIError, getAccessResults, isValidID, NotFound, UnauthorizedError } from 'payload'
import sanitize from 'sanitize-filename'

import {
  canUploadToVideo,
  createStreamVideo,
  getStreamVideo,
  getReadyResolutions,
  getWebhookVideoState,
  isMissingResolutions,
  isVideoInErrorState,
  isVideoProcessed,
} from '@/server/bunny/stream.js'
import { getSafeFileName } from '@/server/files.js'
import { readStoredVideo } from '@/server/payload/fields/bunnyGroupField.js'
import { streamStatusOperation, streamWebhookOperation, tusAuthOperation } from '@/server/payload/openapi.js'
import { isAdminUser } from '@/server/payload/options/access.js'
import { createCollectionContext } from '@/server/payload/options/context.js'
import { collectWebhookSecrets, hasAnyStreamTus } from '@/server/payload/options/inspect.js'
import { signClientUpload } from '@/server/payload/storage/clientUploads/receipt.js'
import {
  assertClientUploadFile,
  resolveClientUploadPrefix,
} from '@/server/payload/storage/clientUploads/uploadInstructions.js'
import { createStreamVideoSession } from '@/server/payload/stream/sessionsCollection.js'
import { fetchStreamVideoState, writeStoredStream } from '@/server/payload/stream/storedStream.js'
import {
  generateStreamTusUploadSignature,
  signStreamVideoToken,
  verifyStreamVideoToken,
} from '@/server/payload/stream/tusSignature.js'
import { jsonResponse } from '@/shared/http.js'
import { matchesMimeTypePattern } from '@/shared/mimeTypes.js'
import type { PluginStorageBunnyTFunction } from '@/shared/translations/index.js'
import type { StreamStatusResponse, StreamTusAuthRequest, StreamTusAuthResponse } from '@/shared/types/index.js'
import type { NormalizedBunnyStorageOptions } from '@/shared/types/optionsNormalized.js'

const MAX_HEAD_LENGTH = 8192

const STATUS_CACHE_TTL = {
  DEFAULT: 10_000,
  WEBHOOK: 60_000,
} as const

const WEBHOOK_RETRY = {
  ATTEMPTS: 3,
  DELAY_MS: 1000,
} as const

const WEBHOOK_RETRY_STATUSES = new Set([3, 5])

type WebhookStreamOptions = NonNullable<ReturnType<typeof createCollectionContext>['streamOptions']>

type StatusCacheEntry = {
  expiresAt: number
  state: Promise<StreamStatusResponse>
}

export const getStreamEndpoints = (options: NormalizedBunnyStorageOptions): Endpoint[] => {
  const webhookSecrets = collectWebhookSecrets(options)
  const statusCache = new Map<string, StatusCacheEntry>()

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

          const webhookState = getWebhookVideoState(Status)
          if (!webhookState) {
            return jsonResponse({ success: true })
          }

          const updateStoredVideo = async (
            collectionSlug: string,
            collectionStreamOptions: WebhookStreamOptions,
          ): Promise<null | Response> => {
            const doc = await req.payload.db.findOne<TypeWithID>({
              collection: collectionSlug,
              req,
              where: { 'bunnyData.stream.videoId': { equals: VideoGuid } },
            })
            const stored = readStoredVideo(doc)
            if (!doc || !stored?.videoId) {
              return null
            }

            const { apiKey, libraryId, mp4Fallback } = collectionStreamOptions
            const encoded = Status === 3
            let resolutions = stored.resolutions
            if (encoded && mp4Fallback) {
              resolutions =
                (await getReadyResolutions({
                  apiKey,
                  encoded,
                  libraryId,
                  logger: req.payload.logger,
                  mp4Fallback,
                  videoId: VideoGuid,
                })) ?? resolutions
            }

            const missingResolutions = isMissingResolutions({ encoded, mp4Fallback, resolutions })
            const state = missingResolutions ? 'processing' : webhookState
            const status = state === 'processing' && stored.status ? stored.status : state
            const statusChanged = status !== stored.status
            const resolutionsChanged = !isDeepStrictEqual(resolutions, stored.resolutions)

            if (statusChanged || resolutionsChanged) {
              await writeStoredStream({
                collection: collectionSlug,
                id: doc.id,
                req,
                stream: { resolutions, status, videoId: stored.videoId },
                whenStatus: resolutionsChanged ? undefined : (stored.status ?? null),
              })

              req.payload.logger.debug({
                msg: '[bunny:stream] webhook: updated video',
                resolutions: resolutions?.available,
                status,
                videoId: VideoGuid,
              })
            }

            if (missingResolutions) {
              req.payload.logger.debug({
                msg: '[bunny:stream] webhook: no MP4 resolutions yet, asking Bunny to send the webhook again',
                videoId: VideoGuid,
              })
              return jsonResponse({ error: 'Internal server error' }, 500)
            }

            return jsonResponse({ success: true })
          }

          const pending: [string, WebhookStreamOptions][] = []
          let failed = false
          for (const collectionSlug of options.collections.keys()) {
            const collection = req.payload.collections[collectionSlug]?.config
            if (!collection) {
              continue
            }

            const collectionStreamOptions = createCollectionContext(options, collection).streamOptions
            if (collectionStreamOptions?.libraryId !== VideoLibraryId) {
              continue
            }

            if (!collectionStreamOptions.status) {
              if (Status !== 3 || !collectionStreamOptions.mp4Fallback) {
                continue
              }

              try {
                const docs = await req.payload.find({
                  collection: collectionSlug,
                  limit: 1,
                  overrideAccess: true,
                  req,
                  where: {
                    'bunnyData.stream.videoId': {
                      equals: VideoGuid,
                    },
                  },
                })

                if (docs.docs.length > 0) {
                  const doc = docs.docs[0]

                  const resolutions = await getReadyResolutions({
                    apiKey: collectionStreamOptions.apiKey,
                    encoded: true,
                    libraryId: collectionStreamOptions.libraryId,
                    logger: req.payload.logger,
                    mp4Fallback: true,
                    videoId: VideoGuid,
                  })

                  if (!resolutions) {
                    req.payload.logger.debug({
                      msg: '[bunny:stream] webhook: no MP4 resolutions yet, asking Bunny to send the webhook again',
                      videoId: VideoGuid,
                    })
                    failed = true
                    continue
                  }

                  await writeStoredStream({
                    collection: collectionSlug,
                    id: doc.id,
                    req,
                    stream: { resolutions, videoId: VideoGuid },
                  })

                  req.payload.logger.debug({
                    msg: '[bunny:stream] webhook: updated video resolutions',
                    resolutions: resolutions.available,
                    videoId: VideoGuid,
                  })

                  return jsonResponse({ success: true })
                }
              } catch (err) {
                failed = true
                req.payload.logger.error({
                  err,
                  msg: '[bunny:stream] webhook: error processing video',
                  videoId: VideoGuid,
                })
              }
              continue
            }

            try {
              const response = await updateStoredVideo(collectionSlug, collectionStreamOptions)
              if (response) {
                return response
              }
              pending.push([collectionSlug, collectionStreamOptions])
            } catch (err) {
              failed = true
              req.payload.logger.error({
                err,
                msg: '[bunny:stream] webhook: error processing video',
                videoId: VideoGuid,
              })
            }
          }

          if (failed) {
            return jsonResponse({ error: 'Internal server error' }, 500)
          }

          if (WEBHOOK_RETRY_STATUSES.has(Status)) {
            for (let attempt = 0; attempt < WEBHOOK_RETRY.ATTEMPTS && pending.length > 0; attempt++) {
              await new Promise((resolve) => setTimeout(resolve, WEBHOOK_RETRY.DELAY_MS))
              for (const [collectionSlug, collectionStreamOptions] of pending) {
                try {
                  const response = await updateStoredVideo(collectionSlug, collectionStreamOptions)
                  if (response) {
                    return response
                  }
                } catch (err) {
                  req.payload.logger.error({
                    err,
                    msg: '[bunny:stream] webhook: error processing video',
                    videoId: VideoGuid,
                  })
                  return jsonResponse({ error: 'Internal server error' }, 500)
                }
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

  if ([...options.collections.values()].some((collection) => collection.stream?.status)) {
    endpoints.push({
      handler: async (req): Promise<Response> => {
        const reqT = req.t as unknown as PluginStorageBunnyTFunction

        try {
          if (!req.user) {
            throw new UnauthorizedError(req.t)
          }
          if (!(await isAdminUser(req))) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorAccessDenied'), 403, undefined, true)
          }

          const { collection: collectionSlug, id } = (req.routeParams ?? {}) as { collection?: string; id?: string }
          const collection =
            collectionSlug && options.collections.has(collectionSlug)
              ? req.payload.collections[collectionSlug]?.config
              : undefined
          if (!collectionSlug || !id || !collection) {
            throw new NotFound(req.t)
          }

          const collectionStreamOptions = createCollectionContext(options, collection).streamOptions
          const idType = req.payload.collections[collectionSlug]?.customIDType || req.payload.db.defaultIDType
          if (!collectionStreamOptions?.status || !isValidID(idType === 'number' ? Number(id) : id, idType)) {
            throw new NotFound(req.t)
          }

          await req.payload.findByID({
            id,
            collection: collectionSlug,
            depth: 0,
            overrideAccess: false,
            req,
            select: { id: true },
          })
          const doc = await req.payload.db.findOne<TypeWithID>({
            collection: collectionSlug,
            req,
            where: { id: { equals: id } },
          })
          const stored = readStoredVideo(doc)
          const videoId = stored?.videoId
          if (!doc || !videoId) {
            throw new NotFound(req.t)
          }

          if (stored.status === 'failed' || stored.status === 'ready') {
            return jsonResponse({
              resolutions: stored.resolutions ?? undefined,
              state: stored.status,
            } satisfies StreamStatusResponse)
          }

          const now = Date.now()
          for (const [key, entry] of statusCache) {
            if (entry.expiresAt <= now) {
              statusCache.delete(key)
            }
          }

          const { apiKey, libraryId } = collectionStreamOptions
          const cacheKey = `${libraryId}:${videoId}`
          let entry = statusCache.get(cacheKey)
          if (!entry) {
            const state = fetchStreamVideoState({ apiKey, libraryId, videoId }).then(
              async ({ encoded, state: fetched }): Promise<StreamStatusResponse> => {
                const { mp4Fallback } = collectionStreamOptions
                let resolutions = stored.resolutions
                let next = fetched
                if (fetched !== stored.status) {
                  try {
                    resolutions = await getReadyResolutions({
                      apiKey,
                      encoded,
                      libraryId,
                      logger: req.payload.logger,
                      mp4Fallback,
                      resolutions: stored.resolutions,
                      videoId,
                    }).catch(() => stored.resolutions)
                    if (isMissingResolutions({ encoded, mp4Fallback, resolutions })) {
                      next = 'processing'
                    }
                    if (next !== stored.status) {
                      await writeStoredStream({
                        collection: collectionSlug,
                        id: doc.id,
                        req,
                        stream: { resolutions, status: next, videoId },
                        whenStatus: stored.status ?? null,
                      })
                    }
                  } catch (err) {
                    req.payload.logger.error({ err, msg: '[bunny:stream] status: failed to store state', videoId })
                  }
                }
                return { resolutions: resolutions ?? undefined, state: next }
              },
            )
            const created = {
              expiresAt: now + (webhookSecrets.has(libraryId) ? STATUS_CACHE_TTL.WEBHOOK : STATUS_CACHE_TTL.DEFAULT),
              state,
            }
            statusCache.set(cacheKey, created)
            state.catch(() => {
              if (statusCache.get(cacheKey) === created) {
                statusCache.delete(cacheKey)
              }
            })
            entry = created
          }

          return jsonResponse(await entry.state)
        } catch (err) {
          if (err instanceof APIError) {
            throw err
          }

          req.payload.logger.error({ err, msg: '[bunny:stream] status: request failed' })
          throw new APIError(reqT('error:unknown'), 500, undefined, true)
        }
      },
      custom: { openapi: streamStatusOperation },
      method: 'get',
      path: '/storage-bunny/stream/status/:collection/:id',
    })
  }

  return endpoints
}
