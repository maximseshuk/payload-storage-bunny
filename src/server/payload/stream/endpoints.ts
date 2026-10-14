import { createHmac, timingSafeEqual } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type { Endpoint, PayloadRequest, TypeWithID } from 'payload'
import { APIError, isValidID, NotFound, UnauthorizedError } from 'payload'

import { isNotFound } from '@/server/bunny/client.js'
import {
  deleteStreamVideo,
  getReadyResolutions,
  getStreamTusUpload,
  getStreamVideo,
  getWebhookVideoState,
  isMissingResolutions,
  isVideoProcessed,
} from '@/server/bunny/stream.js'
import { readStoredVideo, readStreamFileVideoId } from '@/server/payload/fields/bunnyGroupField.js'
import {
  streamStatusOperation,
  streamThumbnailOperation,
  streamWebhookOperation,
  tusAuthOperation,
} from '@/server/payload/openapi.js'
import { isAdminUser } from '@/server/payload/options/access.js'
import { createCollectionContext } from '@/server/payload/options/context.js'
import { collectWebhookSecrets, hasAnyStreamTus } from '@/server/payload/options/inspect.js'
import { assertClientUploadFile } from '@/server/payload/storage/clientUploads/uploadInstructions.js'
import { getLibraryCollectionSlugs, isVideoReferenced } from '@/server/payload/stream/references.js'
import { streamThumbnailStaticHandler } from '@/server/payload/stream/serveThumbnail.js'
import {
  checkStreamOriginalSize,
  fetchStreamVideoState,
  writeStoredStream,
} from '@/server/payload/stream/storedStream.js'
import { signStreamVideoToken, verifyStreamVideoToken } from '@/server/payload/stream/tusSignature.js'
import {
  checkStreamTusUpload,
  createStreamTusUploadSession,
  getStreamTusClientHeaders,
  hasStreamTusAccess,
} from '@/server/payload/stream/tusUpload.js'
import { jsonResponse } from '@/shared/http.js'
import { matchesMimeTypePattern } from '@/shared/mimeTypes.js'
import type { PluginStorageBunnyTFunction } from '@/shared/translations/index.js'
import type {
  CollectionContext,
  StreamStatusResponse,
  StreamTusAuthRequest,
  StreamTusAuthResponse,
} from '@/shared/types/index.js'
import type { NormalizedBunnyStorageOptions, NormalizedStreamOptions } from '@/shared/types/optionsNormalized.js'

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

type ReadableVideo = {
  context: CollectionContext
  doc: TypeWithID
  stored: NonNullable<ReturnType<typeof readStoredVideo>>
  streamOptions: NormalizedStreamOptions
  videoId: string
}

const findReadableVideo = async (
  options: NormalizedBunnyStorageOptions,
  req: PayloadRequest,
  isServed: (context: CollectionContext) => boolean,
): Promise<ReadableVideo> => {
  const {
    collection: collectionSlug,
    id,
    videoId,
  } = (req.routeParams ?? {}) as { collection?: string; id?: string; videoId?: string }
  const collection =
    collectionSlug && options.collections.has(collectionSlug)
      ? req.payload.collections[collectionSlug]?.config
      : undefined
  if (!collectionSlug || !id || !videoId || !collection) {
    throw new NotFound(req.t)
  }

  const context = createCollectionContext(options, collection)
  const idType = req.payload.collections[collectionSlug]?.customIDType || req.payload.db.defaultIDType
  const { streamOptions } = context
  if (!streamOptions || !isServed(context) || !isValidID(idType === 'number' ? Number(id) : id, idType)) {
    throw new NotFound(req.t)
  }

  const read = (draft: boolean) =>
    req.payload.findByID({
      id,
      collection: collectionSlug,
      depth: 0,
      draft,
      overrideAccess: false,
      req,
      select: { bunnyData: true, filesize: true, mimeType: true },
      trash: true,
    })
  let doc = await read(false)
  if (readStreamFileVideoId(doc, streamOptions.mimeTypes) !== videoId) {
    doc = await read(true)
  }
  const stored = readStoredVideo(doc)
  if (!stored || readStreamFileVideoId(doc, streamOptions.mimeTypes) !== videoId) {
    throw new NotFound(req.t)
  }

  return { context, doc, stored, streamOptions, videoId }
}

const deleteReplacedStreamVideo = async ({
  collectionSlug,
  options,
  req,
  streamOptions: { apiKey, libraryId },
  videoId,
}: {
  collectionSlug: string
  options: NormalizedBunnyStorageOptions
  req: PayloadRequest
  streamOptions: NormalizedStreamOptions
  videoId: string
}): Promise<void> => {
  try {
    const collectionSlugs = getLibraryCollectionSlugs(options, collectionSlug, libraryId)
    if (!(await isVideoReferenced({ collectionSlugs, req, videoId }))) {
      await deleteStreamVideo({ apiKey, libraryId, videoId })
    }
  } catch (err) {
    req.payload.logger.warn({ err, msg: '[bunny:stream] tus-auth: failed to delete the replaced video', videoId })
  }
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

          const collection = options.collections.has(body.collection)
            ? req.payload.collections[body.collection]?.config
            : undefined
          if (!collection) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorAccessDenied'), 404, undefined, true)
          }

          const collectionContext = createCollectionContext(options, collection)
          const collectionStreamOptions = collectionContext.streamOptions

          if (!collectionStreamOptions || !collectionStreamOptions.tus) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorStreamOptionsMissing'), 400, undefined, true)
          }

          if (!(await hasStreamTusAccess({ data: body, req, streamOptions: collectionStreamOptions }))) {
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
          const withVideoToken = (videoId: string) => ({
            videoId,
            videoToken: signStreamVideoToken({ ...tokenInput, videoId }),
          })

          const { libraryId } = collectionStreamOptions
          const videoId =
            body.videoId && verifyStreamVideoToken({ ...tokenInput, token: body.videoToken, videoId: body.videoId })
              ? body.videoId
              : undefined

          if (videoId) {
            const video = await getStreamVideo({ apiKey: collectionStreamOptions.apiKey, libraryId, videoId }).catch(
              (err) => {
                if (isNotFound(err)) {
                  return undefined
                }
                throw err
              },
            )
            const upload =
              video && !isVideoProcessed(video.status)
                ? await checkStreamTusUpload({ streamOptions: collectionStreamOptions, video })
                : undefined
            if (video && (isVideoProcessed(video.status) || upload?.state === 'complete')) {
              return jsonResponse({
                type: 'uploaded',
                libraryId,
                title: video.title || body.filename,
                ...withVideoToken(videoId),
              } satisfies StreamTusAuthResponse)
            }
            const serverUpload = video && getStreamTusUpload(video)
            if (upload?.state === 'incomplete' && serverUpload?.length === body.filesize) {
              return jsonResponse({
                type: 'upload',
                ...getStreamTusClientHeaders(collectionStreamOptions, videoId),
                libraryId,
                uploadUrl: serverUpload.url,
                ...withVideoToken(videoId),
              } satisfies StreamTusAuthResponse)
            }
            if (serverUpload && !body.renew) {
              await deleteReplacedStreamVideo({
                collectionSlug: body.collection,
                options,
                req,
                streamOptions: collectionStreamOptions,
                videoId,
              })
            }
          }

          if (body.renew) {
            throw new APIError('This upload cannot be renewed. Start a new upload.', 409, undefined, true)
          }

          const title = (body.title || body.filename).trim()
          if (!title) {
            throw new APIError(reqT('@seshuk/payload-storage-bunny:errorTitleRequired'), 400, undefined, true)
          }

          const session = await createStreamTusUploadSession({
            filesize: body.filesize,
            filetype: body.filetype,
            req,
            streamOptions: collectionStreamOptions,
            title,
          })

          return jsonResponse({
            type: 'upload',
            expiresIn: session.expiresIn,
            headers: session.headers,
            libraryId,
            uploadUrl: session.uploadUrl,
            ...withVideoToken(session.videoId),
          } satisfies StreamTusAuthResponse)
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
              const written = await writeStoredStream({
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
              if (written && statusChanged && status === 'ready') {
                await checkStreamOriginalSize({
                  apiKey,
                  collection: collectionSlug,
                  doc,
                  libraryId,
                  logger: req.payload.logger,
                  videoId: VideoGuid,
                })
              }
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

                  const written = await writeStoredStream({
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
                  if (written && !isDeepStrictEqual(resolutions, readStoredVideo(doc)?.resolutions)) {
                    await checkStreamOriginalSize({
                      apiKey: collectionStreamOptions.apiKey,
                      collection: collectionSlug,
                      doc,
                      libraryId: collectionStreamOptions.libraryId,
                      logger: req.payload.logger,
                      videoId: VideoGuid,
                    })
                  }

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

          const {
            context,
            doc,
            stored,
            streamOptions: collectionStreamOptions,
            videoId,
          } = await findReadableVideo(options, req, ({ streamOptions }) => !!streamOptions?.status)
          const collectionSlug = context.collection.slug

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
                    if (
                      next !== stored.status &&
                      (await writeStoredStream({
                        collection: collectionSlug,
                        id: doc.id,
                        req,
                        stream: { resolutions, status: next, videoId },
                        whenStatus: stored.status ?? null,
                      })) &&
                      next === 'ready'
                    ) {
                      await checkStreamOriginalSize({
                        apiKey,
                        collection: collectionSlug,
                        doc,
                        libraryId,
                        logger: req.payload.logger,
                        videoId,
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
      path: '/storage-bunny/stream/status/:collection/:id/:videoId',
    })
  }

  if (
    [...options.collections.values()].some(
      (collection) => collection.stream && collection.thumbnail && !collection.disablePayloadAccessControl,
    )
  ) {
    endpoints.push({
      handler: async (req): Promise<Response> => {
        const reqT = req.t as unknown as PluginStorageBunnyTFunction

        try {
          const { file } = (req.routeParams ?? {}) as { file?: string }
          if (file !== 'thumbnail.jpg' && file !== 'preview.webp') {
            throw new NotFound(req.t)
          }

          const { context, streamOptions, videoId } = await findReadableVideo(
            options,
            req,
            ({ thumbnail, usePayloadAccessControl }) => !!thumbnail && usePayloadAccessControl,
          )

          return await streamThumbnailStaticHandler({
            collection: context.collection,
            req,
            signedUrls: context.signedUrls || false,
            streamOptions,
            thumbnailType: file,
            usePayloadAccessControl: true,
            videoId,
          })
        } catch (err) {
          if (err instanceof APIError) {
            throw err
          }

          req.payload.logger.error({ err, msg: '[bunny:stream] thumbnail: request failed' })
          throw new APIError(reqT('error:unknown'), 500, undefined, true)
        }
      },
      custom: { openapi: streamThumbnailOperation },
      method: 'get',
      path: '/storage-bunny/stream/thumbnail/:collection/:id/:videoId/:file',
    })
  }

  return endpoints
}
