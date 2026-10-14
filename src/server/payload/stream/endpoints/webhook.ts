import { createHmac, timingSafeEqual } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'

import type { Endpoint, TypeWithID } from 'payload'

import { getReadyResolutions, getWebhookVideoState, isMissingResolutions } from '@/server/bunny/stream.js'
import { readStoredVideo } from '@/server/payload/fields/bunnyGroupField.js'
import { streamWebhookOperation } from '@/server/payload/openapi.js'
import { createCollectionContext } from '@/server/payload/options/context.js'
import { checkStreamOriginalSize, writeStoredStream } from '@/server/payload/stream/storedStream.js'
import { jsonResponse } from '@/shared/http.js'
import type { NormalizedBunnyStorageOptions } from '@/shared/types/optionsNormalized.js'

const WEBHOOK_RETRY = {
  ATTEMPTS: 3,
  DELAY_MS: 1000,
} as const

const WEBHOOK_RETRY_STATUSES = new Set([3, 5])

type WebhookStreamOptions = NonNullable<ReturnType<typeof createCollectionContext>['streamOptions']>

export const getStreamWebhookEndpoint = (
  options: NormalizedBunnyStorageOptions,
  webhookSecrets: Map<number, string>,
): Endpoint => ({
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
