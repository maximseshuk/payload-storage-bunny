import type { Endpoint } from 'payload'
import { APIError, UnauthorizedError } from 'payload'

import { getReadyResolutions, isMissingResolutions } from '@/server/bunny/stream.js'
import { streamStatusOperation } from '@/server/payload/openapi.js'
import { isAdminUser } from '@/server/payload/options/access.js'
import {
  checkStreamOriginalSize,
  fetchStreamVideoState,
  findStreamVersion,
  writeStoredStream,
  writeStoredVersionStream,
} from '@/server/payload/stream/storedStream.js'
import { jsonResponse } from '@/shared/http.js'
import type { PluginStorageBunnyTFunction } from '@/shared/translations/index.js'
import type { StreamStatusResponse } from '@/shared/types/index.js'
import type { NormalizedBunnyStorageOptions } from '@/shared/types/optionsNormalized.js'

import { findReadableVideo } from './findReadableVideo.js'

const STATUS_CACHE_TTL = {
  DEFAULT: 10_000,
  WEBHOOK: 60_000,
} as const

type StatusCacheEntry = {
  expiresAt: number
  state: Promise<StreamStatusResponse>
}

export const getStreamStatusEndpoint = (
  options: NormalizedBunnyStorageOptions,
  webhookSecrets: Map<number, string>,
): Endpoint => {
  const statusCache = new Map<string, StatusCacheEntry>()

  return {
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
          fromDraft,
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
                  if (next !== stored.status) {
                    const version = fromDraft
                      ? await findStreamVersion({ collection: collectionSlug, parent: doc.id, req, videoId })
                      : undefined
                    const write = {
                      collection: collectionSlug,
                      req,
                      stream: { resolutions, status: next, videoId },
                      whenStatus: stored.status ?? null,
                    }
                    const written = version
                      ? await writeStoredVersionStream({ ...write, id: version.id })
                      : !fromDraft && (await writeStoredStream({ ...write, id: doc.id }))
                    if (written && next === 'ready') {
                      await checkStreamOriginalSize({
                        apiKey,
                        collection: collectionSlug,
                        doc,
                        libraryId,
                        logger: req.payload.logger,
                        videoId,
                      })
                    }
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
  }
}
